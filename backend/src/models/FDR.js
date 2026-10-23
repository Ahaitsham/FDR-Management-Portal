// models/FDR.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const fdrSchema = new Schema({
  // ---- Identity (from the receipt) ----
  fdrReferenceNo: { type: String, required: true, trim: true, set: value => String(value).trim().toUpperCase() },   // DEMO-SBI-001024
  receiptNo:      { type: String, required: true, trim: true },
  bank: {
    name:   { type: String, required: true, index: true },        // "State Bank of India"
    code:   { type: String, required: true, trim: true, uppercase: true }, // "SBI" – use an enum/lookup table in prod
    branch: { type: String, required: true }                       // "Kharghar, Navi Mumbai"
  },

  // ---- Depositor details ----
  institution:   { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  depositorName: { type: String, required: true },
  customerId:    { type: String, required: true },
  accountNo:     { type: String, required: true, select: false }, // sensitive: hide by default
  accountNoLast4:{ type: String },                                // for display

  // ---- Financials ----
  amount:        { type: Number, required: true, min: 1 },        // store in rupees as Number (or paise as integer)
  amountInWords: { type: String },
  interestRate:  { type: Number, required: true, min: 0 },        // 6.75
  tenure: {
    value: { type: Number, required: true },
    unit:  { type: String, enum: ['DAYS', 'MONTHS', 'YEARS'], default: 'YEARS' }
  },
  issueDate:     { type: Date, required: true },
  maturityDate:  { type: Date, required: true, index: true },
  maturityAmount:{ type: Number },                                // optional, computed

  // ---- Uploaded document ----
  document: {
    url:       { type: String, required: true },                  // S3 / Cloudinary / GridFS path
    fileHash:  { type: String, index: true },                     // SHA-256, detects duplicate uploads
    mimeType:  String,
    sizeBytes: Number
  },

  // ---- OCR / auto-extracted data (if you do OCR) ----
  extraction: {
    source:     { type: String, enum: ['MANUAL', 'OCR'], default: 'MANUAL' },
    confidence: Number,
    rawText:    { type: String, select: false },
    mismatches: [String]                                          // fields where OCR != user-entered
  },

  // ---- Verification workflow ----
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'],
    default: 'SUBMITTED',
    index: true
  },
  verification: {
    reviewedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:      Date,
    remarks:         String,
    rejectionReason: { type: String, enum: ['BLURRY_DOCUMENT', 'DATA_MISMATCH', 'FAKE_SUSPECTED',
                                            'DUPLICATE', 'INCOMPLETE', 'OTHER'] },
    checklist: {                                                  // auditor ticks these
      bankVerified: Boolean,
      amountMatches: Boolean,
      datesValid: Boolean,
      documentClear: Boolean
    }
  },
  assignedAuditor: { type: Schema.Types.ObjectId, ref: 'User', index: true },

  // ---- Lifecycle: expiry & renewal ----
  expiryState: {
    type: String,
    enum: ['ACTIVE', 'EXPIRING_SOON', 'MATURED', 'RENEWED', 'CLOSED'],
    default: 'ACTIVE',
    index: true
  },
  renewal: {
    renewedFrom: { type: Schema.Types.ObjectId, ref: 'FDR' },    // previous FDR
    renewedTo:   { type: Schema.Types.ObjectId, ref: 'FDR' },    // new FDR
    renewedAt:   Date,
    isRenewal:   { type: Boolean, default: false }
  },
  closedAt: Date,
  closureReason: { type: String, enum: ['MATURED_PAYOUT', 'PREMATURE_CLOSURE', 'RENEWED', 'OTHER'] },

  // ---- Reminder tracking (denormalised, fast dashboard queries) ----
  reminders: {
    sent: [{
      daysBefore: Number,                                         // 60, 30, 15, 7, 1
      sentAt: Date,
      channel: { type: String, enum: ['EMAIL', 'SMS', 'IN_APP'] }
    }],
    nextReminderAt: { type: Date, index: true },
    muted: { type: Boolean, default: false }
  },

  // ---- Meta ----
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isDeleted:   { type: Boolean, default: false }                  // soft delete; never hard-delete financial records
}, { timestamps: true });

// ---- Indexes ----
// Same bank + FDR number must never repeat (stops duplicate submissions)
fdrSchema.index({ 'bank.code': 1, fdrReferenceNo: 1 }, { unique: true });
fdrSchema.index({ institution: 1, status: 1 });
fdrSchema.index({ status: 1, createdAt: -1 });                    // auditor queue
fdrSchema.index({ expiryState: 1, maturityDate: 1 });             // cron jobs

// ---- Virtuals ----
fdrSchema.virtual('daysToMaturity').get(function () {
  return Math.ceil((this.maturityDate - Date.now()) / 86400000);
});

// ---- Validation ----
fdrSchema.pre('validate', function (next) {
  if (this.maturityDate <= this.issueDate) {
    return next(new Error('Maturity date must be after issue date'));
  }
  next();
});

module.exports = mongoose.model('FDR', fdrSchema);
