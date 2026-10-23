// controllers/user.controller.js

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Institution = require('../models/Institution');


const SELF_REGISTER_ROLES = ['INSTITUTION', 'AUDITOR'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const SALT_ROUNDS = 12; 
const ROLES = ['INSTITUTION', 'AUDITOR', 'ADMIN'];
const COOKIE_NAME = 'token';


const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000 
};


function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}


function makeTempPassword() {
  return crypto.randomBytes(9).toString('base64url');
}


function cleanUser(user) {
  const obj = user.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function makeAuditScope(scope) {
  scope = scope || {};

  let states = [];
  if (Array.isArray(scope.states)) {
    states = scope.states.map((s) => String(s).trim()).filter((s) => s !== '');
  }

  let institutions = [];
  if (Array.isArray(scope.institutions)) {
    institutions = scope.institutions.filter(isValidId);
  }

  return { states, institutions };
}



exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role, institution } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'name, email, password and role are required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (!SELF_REGISTER_ROLES.includes(role)) {
      return res.status(403).json({ message: 'You can only register as INSTITUTION or AUDITOR' });
    }

    if (role === 'INSTITUTION') {
      if (!isValidId(institution)) {
        return res.status(400).json({ message: 'A valid institution id is required' });
      }
      const institutionExists = await Institution.findById(institution);
      if (!institutionExists) {
        return res.status(404).json({ message: 'Institution not found' });
      }
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const userData = {
      name,
      email,
      phone,
      role,
      passwordHash,
      mustChangePassword: false 
    };

    if (role === 'INSTITUTION') userData.institution = institution;

    const user = await User.create(userData);

    return res.status(201).json({
      message: 'Registration successful. Please login.',
      user: cleanUser(user)
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('register error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({
      email: String(email).toLowerCase().trim()
    }).select('+passwordHash');

   
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordIsCorrect = await bcrypt.compare(password, user.passwordHash);
    if (!passwordIsCorrect) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);

    return res.json({
      message: 'Login successful',
      user: cleanUser(user),
      mustChangePassword: user.mustChangePassword
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/users/logout
exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ message: 'Logged out' });
};


exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, role, institution, auditScope, password } = req.body;

    // 1. Validate input
    if (!name || !email || !role) {
      return res.status(400).json({ message: 'name, email and role are required' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: 'role must be one of: ' + ROLES.join(', ') });
    }
    if (role === 'INSTITUTION' && !isValidId(institution)) {
      return res.status(400).json({ message: 'A valid institution id is required for INSTITUTION users' });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const plainPassword = password || makeTempPassword();
    const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

    const userData = {
      name,
      email,
      phone,
      role,
      passwordHash,
      mustChangePassword: true,
      createdBy: req.user._id 
    };

    if (role === 'INSTITUTION') userData.institution = institution;
    if (role === 'AUDITOR') userData.auditScope = makeAuditScope(auditScope);

    const user = await User.create(userData);

    const response = { message: 'User created', user: cleanUser(user) };
    if (!password) {
      response.temporaryPassword = plainPassword;
    }
    return res.status(201).json(response);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('createUser error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const filter = {};
    if (req.query.role) {
      if (!ROLES.includes(req.query.role)) {
        return res.status(400).json({ message: 'Invalid role filter' });
      }
      filter.role = req.query.role;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 }) 
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments(filter);

    return res.json({
      users: users.map(cleanUser),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('getUsers error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/users/:id
exports.getUserById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: cleanUser(user) });
  } catch (err) {
    console.error('getUserById error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.updateUser = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, phone, institution, auditScope, isEmailVerified } = req.body;

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (isEmailVerified !== undefined) user.isEmailVerified = Boolean(isEmailVerified);

    if (institution !== undefined) {
      if (user.role !== 'INSTITUTION') {
        return res.status(400).json({ message: 'Only INSTITUTION users have an institution' });
      }
      if (!isValidId(institution)) {
        return res.status(400).json({ message: 'Invalid institution id' });
      }
      user.institution = institution;
    }

    if (auditScope !== undefined) {
      if (user.role !== 'AUDITOR') {
        return res.status(400).json({ message: 'Only AUDITOR users have an audit scope' });
      }
      user.auditScope = makeAuditScope(auditScope);
    }

    await user.save();
    return res.json({ message: 'User updated', user: cleanUser(user) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('updateUser error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const tempPassword = makeTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    user.mustChangePassword = true;
    await user.save();

    return res.json({
      message: 'Password reset. Share the temporary password securely.',
      temporaryPassword: tempPassword
    });
  } catch (err) {
    console.error('resetUserPassword error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('institution');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ user: cleanUser(user) });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const { name, phone } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name !== undefined) {
      if (String(name).trim() === '') {
        return res.status(400).json({ message: 'name cannot be empty' });
      }
      user.name = name;
    }
    if (phone !== undefined) user.phone = phone;

    await user.save();
    return res.json({ message: 'Profile updated', user: cleanUser(user) });
  } catch (err) {
    console.error('updateMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const passwordIsCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordIsCorrect) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.mustChangePassword = false;
    await user.save();

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};