const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  phone: { type: String },
  passwordHash: { type: String, required: true, select: false },

  role: {
    type: String,
    enum: ['INSTITUTION', 'AUDITOR', 'ADMIN'],
    required: true,
    index: true
  },

  // Only for INSTITUTION users
  institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution' },

  // Only for AUDITOR
  auditScope: {
    states: [String],
    institutions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Institution' }]
  },

  isEmailVerified: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: true },


  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // admin who created it
}, { timestamps: true });

// An institution user must belong to an institution
userSchema.pre('validate', function () {
  if (this.role === 'INSTITUTION' && !this.institution) {
    return next(new Error('Institution users must have an institution'));
  }

});

module.exports = mongoose.model('User', userSchema);