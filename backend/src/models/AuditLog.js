const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditLogSchema = new Schema({
  actor:    { type: Schema.Types.ObjectId, ref: 'User', index: true },
  actorRole: String,
  action:   { type: String, enum: ['LOGIN', 'FDR_CREATE', 'FDR_SUBMIT', 'FDR_APPROVE', 'FDR_REJECT',
                                   'FDR_RENEW', 'USER_CREATE', 'USER_DEACTIVATE', 'REMINDER_SENT'], index: true },
  entityType: String,               // 'FDR', 'USER'
  entityId:   { type: Schema.Types.ObjectId, index: true },
  before: Schema.Types.Mixed,
  after:  Schema.Types.Mixed,
  ip: String,
  userAgent: String
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('Auditlog', Schema);