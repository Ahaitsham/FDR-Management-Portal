const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditLogSchema = new Schema({
  actor:    { type: Schema.Types.ObjectId, ref: 'User', index: true },
  actorRole: String,
  action:   { type: String, enum: ['LOGIN', 'FDR_CREATE', 'FDR_SUBMIT', 'FDR_APPROVE', 'FDR_REJECT',
                                   'FDR_RENEW', 'USER_CREATE', 'USER_DEACTIVATE', 'REMINDER_SENT',
                                   'FDR_UPDATE', 'FDR_RESUBMIT', 'FDR_DELETE', 'FDR_CLAIM', 'FDR_ASSIGN',
                                   'FDR_REQUEST_RESUBMISSION', 'FDR_EXPIRY_UPDATED'], index: true },
  entityType: String,               // 'FDR', 'USER'
  entityId:   { type: Schema.Types.ObjectId, index: true },
  before: Schema.Types.Mixed,
  after:  Schema.Types.Mixed,
  ip: String,
  userAgent: String
}, { timestamps: { createdAt: true, updatedAt: false } });

// Audit records are append-only.
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('Audit logs cannot be changed or deleted'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
