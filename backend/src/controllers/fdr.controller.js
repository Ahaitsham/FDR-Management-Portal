const FDR = require('../models/FDR');
const Institution = require('../models/Institution');
const Reminder = require('../models/Reminder');
const AuditLog = require('../models/AuditLog');
const { parseData, pickFdrData, validId } = require('../validators/fdr.validator');
const { getAuditorScopeFilter } = require('../utils/auditorScope');
const { assertTransition } = require('../utils/fdrStateMachine');
const { logAudit } = require('../utils/auditLogger');
const { buildObjectKey, uploadFile, downloadFile, deleteFile } = require('../utils/storage');
const { fileDetails } = require('../middlewares/upload.middleware');
const { cleanFdr } = require('../utils/fdrResponse');

function error(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanSnapshot(fdr) {
  return cleanFdr(fdr);
}

async function uploadedDocument(file, institutionId) {
  if (!file) return null;
  const details = fileDetails(file);
  const key = buildObjectKey({ institutionId, mimeType: details.mimeType });
  await uploadFile(key, details.buffer, details.mimeType);
  return {
    url: key,
    fileHash: details.fileHash,
    mimeType: details.mimeType,
    sizeBytes: details.sizeBytes
  };
}

function multipartData(req) {
  const unexpected = Object.keys(req.body || {}).find(key => key !== 'data');
  if (unexpected) throw error(`Unknown field: ${unexpected}`, 400);
  return parseData(req.body && req.body.data);
}

function validateDatesWithExisting(fdr, data) {
  const issueDate = data.issueDate || fdr.issueDate;
  const maturityDate = data.maturityDate || fdr.maturityDate;
  if (maturityDate <= issueDate) throw error('maturityDate must be after issueDate', 400);
}

async function ensureNoDuplicateDocument(hash, ignoreId) {
  if (!hash) return;
  const filter = { 'document.fileHash': hash, isDeleted: false };
  if (ignoreId) filter._id = { $ne: ignoreId };
  if (await FDR.exists(filter)) throw error('This document has already been uploaded', 409);
}

async function getScopedFdr(id, user, includeAccount) {
  if (!validId(id)) throw error('Invalid FDR id', 400);
  const query = FDR.findOne({ _id: id, isDeleted: false }).populate('institution', 'name aicteId address isActive').populate('submittedBy', 'name');
  if (includeAccount) query.select('+accountNo');
  const fdr = await query;
  if (!fdr) throw error('FDR not found', 404);
  if (user.role === 'INSTITUTION' && String(fdr.institution._id) !== String(user.institution)) throw error('FDR not found', 404);
  if (user.role === 'AUDITOR') {
    const scope = await getAuditorScopeFilter(user);
    if (fdr.status === 'DRAFT' || (scope.institution && !scope.institution.$in.map(String).includes(String(fdr.institution._id)))) throw error('FDR not found', 404);
  }
  return fdr;
}

function getListOptions(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const sortFields = ['createdAt', 'maturityDate', 'amount'];
  const sortBy = sortFields.includes(query.sort) ? query.sort : 'createdAt';
  const order = query.order === 'asc' ? 1 : -1;
  return { page, limit, sort: { [sortBy]: order } };
}

async function buildListFilter(req) {
  const filter = { isDeleted: false };
  const { status, expiryState, bank, institution, state, maturingWithinDays, q, assignedAuditor, dateFrom, dateTo } = req.query;
  if (typeof status === 'string') filter.status = status;
  if (typeof expiryState === 'string') filter.expiryState = expiryState;
  if (typeof bank === 'string' && bank.trim()) filter.$or = [{ 'bank.code': bank.trim().toUpperCase() }, { 'bank.name': new RegExp(bank.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  if (typeof q === 'string' && q.trim()) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$and = [{ $or: [{ fdrReferenceNo: new RegExp(escaped, 'i') }, { receiptNo: new RegExp(escaped, 'i') }, { depositorName: new RegExp(escaped, 'i') }] }];
  }
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      const date = new Date(dateFrom);
      if (Number.isNaN(date.getTime())) throw error('Invalid dateFrom', 400);
      filter.createdAt.$gte = date;
    }
    if (dateTo) {
      const date = new Date(dateTo);
      if (Number.isNaN(date.getTime())) throw error('Invalid dateTo', 400);
      filter.createdAt.$lte = date;
    }
  }
  if (maturingWithinDays !== undefined) {
    const days = Number(maturingWithinDays);
    if (!Number.isInteger(days) || days < 0) throw error('maturingWithinDays must be a positive integer', 400);
    filter.maturityDate = { $lte: new Date(Date.now() + days * 86400000), $gte: new Date() };
  }

  if (req.user.role === 'INSTITUTION') {
    filter.institution = req.user.institution;
  } else {
    if (institution !== undefined) {
      if (!validId(institution)) throw error('Invalid institution id', 400);
      filter.institution = institution;
    }
    if (assignedAuditor !== undefined) {
      if (!validId(assignedAuditor)) throw error('Invalid assignedAuditor id', 400);
      filter.assignedAuditor = assignedAuditor;
    }
    if (state !== undefined) {
      const institutions = await Institution.find({ 'address.state': String(state) }).select('_id').lean();
      filter.institution = { $in: institutions.map(item => item._id) };
    }
    if (req.user.role === 'AUDITOR') {
      const scope = await getAuditorScopeFilter(req.user);
      if (scope.institution) {
        if (filter.institution && filter.institution.$in) filter.institution.$in = filter.institution.$in.filter(id => scope.institution.$in.map(String).includes(String(id)));
        else if (filter.institution && !scope.institution.$in.map(String).includes(String(filter.institution))) filter.institution = { $in: [] };
        else filter.institution = scope.institution;
      }
      if (!filter.status) filter.status = { $ne: 'DRAFT' };
    }
  }
  return filter;
}

exports.createFdr = async (req, res) => {
  let newKey;
  try {
    if (!req.user.institution) throw error('Institution user has no institution', 400);
    const institution = await Institution.findById(req.user.institution);
    if (!institution || !institution.isActive) throw error('Institution is inactive', 403);
    const data = pickFdrData(multipartData(req), true);
    const details = fileDetails(req.file);
    if (!details) throw error('document is required', 400);
    await ensureNoDuplicateDocument(details.fileHash);
    const document = await uploadedDocument(req.file, institution._id);
    newKey = document.url;
    if (!document) throw error('document is required', 400);
    data.accountNoLast4 = String(data.accountNo).slice(-4);
    const fdr = await FDR.create({ ...data, document, institution: institution._id, submittedBy: req.user._id, status: 'SUBMITTED' });
    newKey = null;
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_SUBMIT', entityType: 'FDR', entityId: fdr._id, after: cleanSnapshot(fdr), req });
    return res.status(201).json({ message: 'FDR submitted', fdr: cleanSnapshot(fdr) });
  } catch (err) {
    if (newKey) await deleteFile(newKey);
    if (err.code === 11000) return res.status(409).json({ message: 'An FDR with this bank code and reference number already exists' });
    return res.status(err.status || (err.name === 'ValidationError' ? 400 : 500)).json({ message: err.status === 502 ? 'Document storage unavailable, please retry' : (err.message || 'Server error') });
  }
};

exports.getFdrs = async (req, res) => {
  try {
    const filter = await buildListFilter(req);
    const { page, limit, sort } = getListOptions(req.query);
    const [fdrs, total] = await Promise.all([
      FDR.find(filter).select('-accountNo').populate('institution', 'name aicteId').populate('submittedBy', 'name').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      FDR.countDocuments(filter)
    ]);
    return res.json({ fdrs: fdrs.map(cleanFdr), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const filter = await buildListFilter({ user: req.user, query: {} });
    const soon = new Date(Date.now() + 30 * 86400000);
    const [byStatus, byExpiry, corpus, maturing] = await Promise.all([
      FDR.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      FDR.aggregate([{ $match: filter }, { $group: { _id: '$expiryState', count: { $sum: 1 } } }]),
      FDR.aggregate([{ $match: { ...filter, status: 'APPROVED' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
      FDR.countDocuments({ ...filter, maturityDate: { $gte: new Date(), $lte: soon } })
    ]);
    const stats = { byStatus, byExpiryState: byExpiry, approvedCorpusAmount: corpus[0] ? corpus[0].amount : 0, maturingWithin30Days: maturing };
    if (req.user.role === 'ADMIN') {
      stats.byBank = await FDR.aggregate([{ $match: filter }, { $group: { _id: '$bank.code', count: { $sum: 1 } } }]);
      stats.byState = await FDR.aggregate([{ $match: filter }, { $lookup: { from: 'institutions', localField: 'institution', foreignField: '_id', as: 'institutionData' } }, { $unwind: '$institutionData' }, { $group: { _id: '$institutionData.address.state', count: { $sum: 1 } } }]);
    }
    if (req.user.role === 'AUDITOR') {
      stats.auditor = {
        pending: await FDR.countDocuments({ ...filter, status: 'SUBMITTED', assignedAuditor: null }),
        claimed: await FDR.countDocuments({ ...filter, status: 'UNDER_REVIEW', assignedAuditor: req.user._id }),
        reviewed: await FDR.countDocuments({ ...filter, 'verification.reviewedBy': req.user._id })
      };
    }
    return res.json({ stats });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.getFdrById = async (req, res) => {
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, false);
    return res.json({ fdr: cleanSnapshot(fdr) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, false);
    const document = await downloadFile(fdr.document.url);
    res.type(fdr.document.mimeType || document.contentType || 'application/octet-stream');
    res.set('Content-Disposition', 'inline');
    res.set('Cache-Control', 'private, no-store');
    return res.send(document.buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.updateFdr = async (req, res) => {
  let newKey;
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, true);
    if (req.user.role !== 'INSTITUTION') throw error('You do not have permission to do this', 403);
    if (!['DRAFT', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(fdr.status)) throw error('This FDR cannot be edited in its current status', 409);
    if (!fdr.institution.isActive) throw error('Institution is inactive', 403);
    const data = pickFdrData(multipartData(req), false);
    validateDatesWithExisting(fdr, data);
    const details = fileDetails(req.file);
    if (details) await ensureNoDuplicateDocument(details.fileHash, fdr._id);
    const document = details ? await uploadedDocument(req.file, fdr.institution._id) : null;
    if (document) newKey = document.url;
    if (data.accountNo) data.accountNoLast4 = String(data.accountNo).slice(-4);
    if (document) data.document = document;
    if (!Object.keys(data).length) throw error('No changes provided', 400);
    const before = cleanSnapshot(fdr);
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: fdr.status, isDeleted: false }, { $set: data }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    newKey = null;
    if (document) await deleteFile(fdr.document.url);
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_UPDATE', entityType: 'FDR', entityId: updated._id, before, after: cleanSnapshot(updated), req });
    return res.json({ message: 'FDR updated', fdr: cleanSnapshot(updated) });
  } catch (err) {
    if (newKey) await deleteFile(newKey);
    if (err.code === 11000) return res.status(409).json({ message: 'An FDR with this bank code and reference number already exists' });
    return res.status(err.status || (err.name === 'ValidationError' ? 400 : 500)).json({ message: err.status === 502 ? 'Document storage unavailable, please retry' : (err.message || 'Server error') });
  }
};

exports.resubmitFdr = async (req, res) => {
  let newKey;
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, true);
    if (req.user.role !== 'INSTITUTION') throw error('You do not have permission to do this', 403);
    if (!fdr.institution.isActive) throw error('Institution is inactive', 403);
    assertTransition(fdr.status, 'SUBMITTED');
    const data = pickFdrData(multipartData(req), false);
    validateDatesWithExisting(fdr, data);
    const details = fileDetails(req.file);
    if (details) await ensureNoDuplicateDocument(details.fileHash, fdr._id);
    const document = details ? await uploadedDocument(req.file, fdr.institution._id) : null;
    if (document) newKey = document.url;
    if (data.accountNo) data.accountNoLast4 = String(data.accountNo).slice(-4);
    if (document) data.document = document;
    const before = cleanSnapshot(fdr);
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, status: fdr.status, isDeleted: false, institution: req.user.institution }, { $set: { ...data, status: 'SUBMITTED', assignedAuditor: null, verification: {} } }, { new: true, runValidators: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    newKey = null;
    if (document) await deleteFile(fdr.document.url);
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_RESUBMIT', entityType: 'FDR', entityId: updated._id, before, after: cleanSnapshot(updated), req });
    return res.json({ message: 'FDR resubmitted', fdr: cleanSnapshot(updated) });
  } catch (err) {
    if (newKey) await deleteFile(newKey);
    if (err.code === 11000) return res.status(409).json({ message: 'An FDR with this bank code and reference number already exists' });
    return res.status(err.status || (err.name === 'ValidationError' ? 400 : 500)).json({ message: err.status === 502 ? 'Document storage unavailable, please retry' : (err.message || 'Server error') });
  }
};

exports.renewFdr = async (req, res) => {
  let newKey;
  try {
    const oldFdr = await getScopedFdr(req.params.id, req.user, false);
    if (req.user.role === 'INSTITUTION' && String(oldFdr.institution._id) !== String(req.user.institution)) throw error('FDR not found', 404);
    if (!oldFdr.institution.isActive) throw error('Institution is inactive', 403);
    if (oldFdr.status !== 'APPROVED' || !['ACTIVE', 'EXPIRING_SOON', 'MATURED'].includes(oldFdr.expiryState)) throw error('This FDR cannot be renewed', 409);
    if (oldFdr.renewal && oldFdr.renewal.renewedTo) {
      const existing = await FDR.findOne({ _id: oldFdr.renewal.renewedTo, isDeleted: false, status: { $ne: 'REJECTED' } });
      if (existing) throw error('This FDR already has an active renewal', 409);
    }
    const data = pickFdrData(multipartData(req), true);
    const details = fileDetails(req.file);
    if (!details) throw error('document is required', 400);
    await ensureNoDuplicateDocument(details.fileHash);
    const document = await uploadedDocument(req.file, oldFdr.institution._id);
    newKey = document.url;
    data.accountNoLast4 = String(data.accountNo).slice(-4);
    const fdr = await FDR.create({ ...data, document, institution: oldFdr.institution._id, submittedBy: req.user._id, status: 'SUBMITTED', renewal: { isRenewal: true, renewedFrom: oldFdr._id } });
    newKey = null;
    await FDR.updateOne({ _id: oldFdr._id, isDeleted: false }, { $set: { 'renewal.renewedTo': fdr._id } });
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_RENEW', entityType: 'FDR', entityId: fdr._id, before: { renewedFrom: oldFdr._id }, after: cleanSnapshot(fdr), req });
    return res.status(201).json({ message: 'Renewal FDR submitted', fdr: cleanSnapshot(fdr) });
  } catch (err) {
    if (newKey) await deleteFile(newKey);
    if (err.code === 11000) return res.status(409).json({ message: 'An FDR with this bank code and reference number already exists' });
    return res.status(err.status || (err.name === 'ValidationError' ? 400 : 500)).json({ message: err.status === 502 ? 'Document storage unavailable, please retry' : (err.message || 'Server error') });
  }
};

exports.deleteFdr = async (req, res) => {
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, false);
    if (req.user.role === 'INSTITUTION' && fdr.status === 'APPROVED') throw error('Approved FDRs cannot be deleted', 409);
    const filter = { _id: fdr._id, isDeleted: false };
    if (req.user.role === 'INSTITUTION') filter.institution = req.user.institution;
    const updated = await FDR.findOneAndUpdate(filter, { $set: { isDeleted: true } }, { new: true });
    if (!updated) throw error('FDR was changed by another request', 409);
    await Reminder.updateMany({ fdr: fdr._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } });
    // Keep the private object so a soft-deleted FDR remains recoverable audit evidence.
    await logAudit({ actor: req.user._id, actorRole: req.user.role, action: 'FDR_DELETE', entityType: 'FDR', entityId: fdr._id, before: cleanSnapshot(fdr), after: { isDeleted: true }, req });
    return res.json({ message: 'FDR deleted' });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

exports.getAuditHistory = async (req, res) => {
  try {
    const fdr = await getScopedFdr(req.params.id, req.user, false);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const [logs, total] = await Promise.all([
      AuditLog.find({ entityType: 'FDR', entityId: fdr._id }).populate('actor', 'name role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments({ entityType: 'FDR', entityId: fdr._id })
    ]);
    if (req.user.role === 'INSTITUTION') logs.forEach(item => { delete item.ip; delete item.userAgent; });
    return res.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
