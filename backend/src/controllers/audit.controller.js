const FDR = require('../models/FDR');
const User = require('../models/User');
const Reminder = require('../models/Reminder');
const AuditLog = require('../models/AuditLog');
const { validId } = require('../validators/fdr.validator');
const { getAuditorScopeFilter } = require('../utils/auditorScope');
const { assertTransition } = require('../utils/fdrStateMachine');
const { logAudit } = require('../utils/auditLogger');
const { cleanFdr } = require('../utils/fdrResponse');

const reasons = ['BLURRY_DOCUMENT', 'DATA_MISMATCH', 'FAKE_SUSPECTED', 'DUPLICATE', 'INCOMPLETE', 'OTHER'];

function error(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getReviewFdr(id, user) {
  if (!validId(id)) throw error('Invalid FDR id', 400);
  const fdr = await FDR.findOne({ _id: id, isDeleted: false }).populate('institution', 'name aicteId address').populate('submittedBy', 'name');
  if (!fdr) throw error('FDR not found', 404);
  if (user.role === 'AUDITOR') {
    const scope = await getAuditorScopeFilter(user);
    if (scope.institution && !scope.institution.$in.map(String).includes(String(fdr.institution._id))) throw error('FDR not found', 404);
  }
  return fdr;
}

function statusSnapshot(fdr) {
  return { status: fdr.status, expiryState: fdr.expiryState, assignedAuditor: fdr.assignedAuditor, verification: fdr.verification };
}

function pagination(query) {
  return { page: Math.max(Number.parseInt(query.page, 10) || 1, 1), limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100) };
}

async function makeReminders(fdr) {
  const now = new Date();
  const days = [60, 30, 15, 7, 1, 0];
  const documents = days.map(daysBefore => ({
    fdr: fdr._id,
    institution: fdr.institution._id || fdr.institution,
    daysBefore,
    scheduledFor: new Date(new Date(fdr.maturityDate).getTime() - daysBefore * 86400000),
    channel: 'IN_APP'
  })).filter(item => item.scheduledFor > now);
  if (documents.length) await Reminder.insertMany(documents, { ordered: false });
  const next = documents.sort((a, b) => a.scheduledFor - b.scheduledFor)[0];
  if (next) await FDR.updateOne({ _id: fdr._id, isDeleted: false }, { $set: { 'reminders.nextReminderAt': next.scheduledFor } });
}

exports.getQueue = async (req, res) => {
  try {
    const filter = { isDeleted: false, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } };
    if (typeof req.query.status === 'string' && ['SUBMITTED', 'UNDER_REVIEW'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.mine === 'true') filter.assignedAuditor = req.user._id;
    if (req.query.unassigned === 'true') filter.assignedAuditor = null;
    if (req.query.institution !== undefined) {
      if (!validId(req.query.institution)) throw error('Invalid institution id', 400);
      filter.institution = req.query.institution;
    }
    if (typeof req.query.bank === 'string') filter['bank.code'] = req.query.bank.trim().toUpperCase();
    if (typeof req.query.state === 'string') {
      const Institution = require('../models/Institution');
      const institutions = await Institution.find({ 'address.state': req.query.state }).select('_id').lean();
      filter.institution = { $in: institutions.map(item => item._id) };
    }
    if (req.user.role === 'AUDITOR') {
      const scope = await getAuditorScopeFilter(req.user);
      if (scope.institution) {
        if (filter.institution && filter.institution.$in) filter.institution.$in = filter.institution.$in.filter(id => scope.institution.$in.map(String).includes(String(id)));
        else if (filter.institution && !scope.institution.$in.map(String).includes(String(filter.institution))) filter.institution = { $in: [] };
        else filter.institution = scope.institution;
      }
    }
    const { page, limit } = pagination(req.query);
    const [fdrs, total] = await Promise.all([
      FDR.find(filter).select('-accountNo').populate('institution', 'name aicteId').populate('submittedBy', 'name').populate('assignedAuditor', 'name email').sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      FDR.countDocuments(filter)
    ]);
    return res.json({ fdrs: fdrs.map(cleanFdr), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.claimFdr = async (req, res) => {
  try {
    const fdr = await getReviewFdr(req.params.id, req.user);
    assertTransition(fdr.status, 'UNDER_REVIEW');
    if (fdr.assignedAuditor) throw error('FDR is already assigned', 409);
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: 'SUBMITTED', assignedAuditor: null, isDeleted: false }, { $set: { status: 'UNDER_REVIEW', assignedAuditor: req.user._id } }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was already claimed', 409);
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_CLAIM', entityType: 'FDR', entityId: updated._id, before: statusSnapshot(fdr), after: statusSnapshot(updated), req });
    return res.json({ message: 'FDR claimed', fdr: cleanFdr(updated) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.assignFdr = async (req, res) => {
  try {
    const fdr = await getReviewFdr(req.params.id, req.user);
    if (!validId(req.body.auditorId)) throw error('Invalid auditorId', 400);
    const auditor = await User.findOne({ _id: req.body.auditorId, role: 'AUDITOR' });
    if (!auditor) throw error('Auditor not found', 404);
    const targetScope = await getAuditorScopeFilter(auditor);
    if (targetScope.institution && !targetScope.institution.$in.map(String).includes(String(fdr.institution._id))) throw error('Auditor is outside this FDR scope', 400);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(fdr.status)) throw error('FDR is not in the review queue', 409);
    const update = { assignedAuditor: auditor._id };
    if (fdr.status === 'SUBMITTED') update.status = 'UNDER_REVIEW';
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: fdr.status, isDeleted: false }, { $set: update }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_ASSIGN', entityType: 'FDR', entityId: updated._id, before: statusSnapshot(fdr), after: statusSnapshot(updated), req });
    return res.json({ message: 'FDR assigned', fdr: cleanFdr(updated) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

async function ensureReviewer(fdr, user) {
  if (user.role === 'ADMIN') return;
  if (!fdr.assignedAuditor || String(fdr.assignedAuditor) !== String(user._id)) throw error('This FDR is assigned to another auditor', 403);
}

exports.approveFdr = async (req, res) => {
  try {
    const fdr = await getReviewFdr(req.params.id, req.user);
    await ensureReviewer(fdr, req.user);
    const checklist = req.body.checklist;
    const checklistKeys = ['bankVerified', 'amountMatches', 'datesValid', 'documentClear'];
    if (!checklist || checklistKeys.some(key => checklist[key] !== true)) throw error('All checklist items must be true', 400);
    assertTransition(fdr.status, 'APPROVED', req.user.role === 'ADMIN');
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: fdr.status, isDeleted: false }, { $set: { status: 'APPROVED', 'verification.reviewedBy': req.user._id, 'verification.reviewedAt': new Date(), 'verification.remarks': typeof req.body.remarks === 'string' ? req.body.remarks : '', 'verification.checklist': checklist } }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    await makeReminders(updated);
    if (updated.renewal && updated.renewal.isRenewal && updated.renewal.renewedFrom) {
      await FDR.updateOne({ _id: updated.renewal.renewedFrom, isDeleted: false }, { $set: { expiryState: 'RENEWED', closureReason: 'RENEWED', closedAt: new Date(), 'renewal.renewedAt': new Date() } });
      await Reminder.updateMany({ fdr: updated.renewal.renewedFrom, status: 'PENDING' }, { $set: { status: 'CANCELLED' } });
    }
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_APPROVE', entityType: 'FDR', entityId: updated._id, before: statusSnapshot(fdr), after: statusSnapshot(updated), req });
    return res.json({ message: 'FDR approved', fdr: cleanFdr(updated) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

async function reviewWithDecision(req, res, status, action) {
  try {
    const fdr = await getReviewFdr(req.params.id, req.user);
    await ensureReviewer(fdr, req.user);
    if (!reasons.includes(req.body.rejectionReason)) throw error('Invalid rejectionReason', 400);
    if (typeof req.body.remarks !== 'string' || req.body.remarks.trim().length < 10) throw error('remarks must be at least 10 characters', 400);
    assertTransition(fdr.status, status, req.user.role === 'ADMIN');
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: fdr.status, isDeleted: false }, { $set: { status, 'verification.reviewedBy': req.user._id, 'verification.reviewedAt': new Date(), 'verification.remarks': req.body.remarks.trim(), 'verification.rejectionReason': req.body.rejectionReason } }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action, entityType: 'FDR', entityId: updated._id, before: statusSnapshot(fdr), after: statusSnapshot(updated), req });
    return res.json({ message: status === 'REJECTED' ? 'FDR rejected' : 'Resubmission requested', fdr: cleanFdr(updated) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
}

exports.rejectFdr = (req, res) => reviewWithDecision(req, res, 'REJECTED', 'FDR_REJECT');
exports.requestResubmission = (req, res) => reviewWithDecision(req, res, 'RESUBMISSION_REQUIRED', 'FDR_REQUEST_RESUBMISSION');

exports.getLogs = async (req, res) => {
  try {
    const filter = {};
    ['actor', 'entityId'].forEach(key => { if (req.query[key] !== undefined) { if (!validId(req.query[key])) throw error(`Invalid ${key}`, 400); filter[key] = req.query[key]; } });
    ['action', 'entityType'].forEach(key => { if (typeof req.query[key] === 'string') filter[key] = req.query[key]; });
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
      if (Object.values(filter.createdAt).some(date => Number.isNaN(date.getTime()))) throw error('Invalid date filter', 400);
    }
    const { page, limit } = pagination(req.query);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).populate('actor', 'name role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter)
    ]);
    return res.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
