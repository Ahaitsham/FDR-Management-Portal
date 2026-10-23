const mongoose = require('mongoose');

const allowedFields = ['fdrReferenceNo', 'receiptNo', 'bank', 'depositorName', 'customerId', 'accountNo', 'amount', 'amountInWords', 'interestRate', 'tenure', 'issueDate', 'maturityDate'];
const tenureUnits = ['DAYS', 'MONTHS', 'YEARS'];

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function parseData(value) {
  if (!value) return {};
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || Array.isArray(data) || typeof data !== 'object') invalid('data must be a JSON object');
    return data;
  } catch (err) {
    if (err.status) throw err;
    invalid('data must be valid JSON');
  }
}

function pickFdrData(body, required) {
  const unknown = Object.keys(body).filter(key => !allowedFields.includes(key));
  if (unknown.length) invalid(`Unknown field: ${unknown[0]}`);

  const data = {};
  allowedFields.forEach(key => {
    if (body[key] !== undefined) data[key] = body[key];
  });

  if (data.bank !== undefined) {
    if (!data.bank || typeof data.bank !== 'object' || Array.isArray(data.bank)) invalid('bank must be an object');
    const bankKeys = Object.keys(data.bank);
    if (bankKeys.some(key => !['name', 'code', 'branch'].includes(key))) invalid('Invalid bank field');
    ['name', 'code', 'branch'].forEach(key => {
      if (data.bank[key] !== undefined) data.bank[key] = String(data.bank[key]).trim();
    });
  }
  if (data.tenure !== undefined) {
    if (!data.tenure || typeof data.tenure !== 'object' || Array.isArray(data.tenure)) invalid('tenure must be an object');
    if (!Number.isInteger(Number(data.tenure.value)) || Number(data.tenure.value) <= 0) invalid('tenure.value must be a positive integer');
    data.tenure.value = Number(data.tenure.value);
    data.tenure.unit = String(data.tenure.unit || '').toUpperCase();
    if (!tenureUnits.includes(data.tenure.unit)) invalid('Invalid tenure.unit');
  }
  if (data.amount !== undefined && (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0)) invalid('amount must be greater than 0');
  if (data.amount !== undefined) data.amount = Number(data.amount);
  if (data.interestRate !== undefined && (!Number.isFinite(Number(data.interestRate)) || Number(data.interestRate) < 0 || Number(data.interestRate) > 15)) invalid('interestRate must be between 0 and 15');
  if (data.interestRate !== undefined) data.interestRate = Number(data.interestRate);
  if (data.accountNo !== undefined && !/^\d{9,18}$/.test(String(data.accountNo))) invalid('accountNo must contain 9 to 18 digits');

  ['issueDate', 'maturityDate'].forEach(key => {
    if (data[key] !== undefined) {
      const value = new Date(data[key]);
      if (Number.isNaN(value.getTime())) invalid(`Invalid ${key}`);
      data[key] = value;
    }
  });
  if (data.issueDate && data.issueDate > new Date()) invalid('issueDate cannot be in the future');
  if (data.issueDate && data.maturityDate && data.maturityDate <= data.issueDate) invalid('maturityDate must be after issueDate');

  if (required) {
    const needed = ['fdrReferenceNo', 'receiptNo', 'bank', 'depositorName', 'customerId', 'accountNo', 'amount', 'interestRate', 'tenure', 'issueDate', 'maturityDate'];
    needed.forEach(key => {
      if (data[key] === undefined || data[key] === '') invalid(`${key} is required`);
    });
    ['name', 'code', 'branch'].forEach(key => {
      if (!data.bank[key]) invalid(`bank.${key} is required`);
    });
  }
  return data;
}

function validId(id) {
  return mongoose.isValidObjectId(id);
}

module.exports = { parseData, pickFdrData, validId, tenureUnits };
