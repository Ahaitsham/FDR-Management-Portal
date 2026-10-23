const AuditLog = require('../models/AuditLog');

// Logging must not undo a completed business action.
async function logAudit({ actor, actorRole, action, entityType, entityId, before, after, req }) {
  try {
    await AuditLog.create({
      actor: actor || null,
      actorRole: actorRole || 'SYSTEM',
      action,
      entityType,
      entityId,
      before,
      after,
      ip: req ? req.ip : undefined,
      userAgent: req ? req.get('user-agent') : undefined
    });
  } catch (err) {
    console.error('audit log error:', err.message);
  }
}

module.exports = { logAudit };
