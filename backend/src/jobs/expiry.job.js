const cron = require('node-cron');
const FDR = require('../models/FDR');
const Reminder = require('../models/Reminder');
const { logAudit } = require('../utils/auditLogger');
const { cronEnabled, cronSchedule } = require('../config');

let task;

// Runs expiry changes and in-app reminders once; exported for manual testing too.
async function runOnce() {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);

  const expiring = await FDR.find({ isDeleted: false, status: 'APPROVED', expiryState: 'ACTIVE', maturityDate: { $gte: now, $lte: soon } });
  for (const fdr of expiring) {
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, isDeleted: false, expiryState: 'ACTIVE' }, { $set: { expiryState: 'EXPIRING_SOON' } }, { new: true });
    if (updated) await logAudit({ action: 'FDR_EXPIRY_UPDATED', entityType: 'FDR', entityId: updated._id, before: { expiryState: 'ACTIVE' }, after: { expiryState: 'EXPIRING_SOON' } });
  }

  const matured = await FDR.find({ isDeleted: false, expiryState: { $in: ['ACTIVE', 'EXPIRING_SOON'] }, maturityDate: { $lt: now } });
  for (const fdr of matured) {
    const updated = await FDR.findOneAndUpdate({ _id: fdr._id, isDeleted: false, expiryState: { $in: ['ACTIVE', 'EXPIRING_SOON'] } }, { $set: { expiryState: 'MATURED' } }, { new: true });
    if (updated) await logAudit({ action: 'FDR_EXPIRY_UPDATED', entityType: 'FDR', entityId: updated._id, before: { expiryState: fdr.expiryState }, after: { expiryState: 'MATURED' } });
  }

  const due = await Reminder.find({ status: 'PENDING', scheduledFor: { $lte: now } });
  for (const reminder of due) {
    const sent = await Reminder.findOneAndUpdate({ _id: reminder._id, status: 'PENDING' }, { $set: { status: 'SENT', channel: 'IN_APP', sentAt: now } }, { new: true });
    if (!sent) continue;
    const fdr = await FDR.findOneAndUpdate({ _id: sent.fdr, isDeleted: false }, { $push: { 'reminders.sent': { daysBefore: sent.daysBefore, sentAt: now, channel: 'IN_APP' } } }, { new: true });
    if (!fdr) continue;
    const next = await Reminder.findOne({ fdr: fdr._id, status: 'PENDING' }).sort({ scheduledFor: 1 });
    await FDR.updateOne({ _id: fdr._id, isDeleted: false }, { $set: { 'reminders.nextReminderAt': next ? next.scheduledFor : null } });
    await logAudit({ action: 'REMINDER_SENT', entityType: 'FDR', entityId: fdr._id, after: { daysBefore: sent.daysBefore, channel: 'IN_APP' } });
  }
}

function startExpiryJob() {
  if (!cronEnabled || task) return;
  task = cron.schedule(cronSchedule, () => {
    runOnce().catch(err => console.error('expiry job error:', err.message));
  });
  console.log(`Expiry scheduler started: ${cronSchedule}`);
}

module.exports = { startExpiryJob, runOnce };
