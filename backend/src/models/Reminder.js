const mongoose = require('mongoose');
const { Schema } = mongoose;

const reminderSchema = new Schema({
  fdr:      { type: Schema.Types.ObjectId, ref: 'FDR', index: true },
  institution: { type: Schema.Types.ObjectId, ref: 'Institution' },
  daysBefore: { type: Number, enum: [60, 30, 15, 7, 1, 0] },
  scheduledFor: { type: Date, index: true },
  channel: { type: String, enum: ['EMAIL', 'SMS', 'IN_APP'] },
  status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'], default: 'PENDING', index: true },
  sentAt: Date,
  error: String
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);