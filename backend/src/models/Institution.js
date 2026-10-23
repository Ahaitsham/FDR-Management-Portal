const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  aicteId: { type: String, required: true, unique: true }, // AICTE permanent ID
  type: { type: String, enum: ['ENGINEERING', 'POLYTECHNIC', 'MANAGEMENT', 'PHARMACY', 'OTHER'] },
  address: { line1: String, city: String, state: { type: String, index: true }, pincode: String },
  contactEmail: String,
  contactPhone: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Institution', institutionSchema);