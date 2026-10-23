
const jwt = require('jsonwebtoken');
const User = require('../models/User');


exports.authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        message: 'Not logged in. Please login again',
        success: false
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        message: 'User no longer exists',
        success: false
      });
    }

    req.user = user; 
    next();          
  } catch (error) {
  
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired. Please login again',
        success: false
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token. Please login again',
        success: false
      });
    }

    console.error('Middleware error:', error);
    return res.status(500).json({
      message: 'Something went wrong',
      success: false
    });
  }
};


exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to do this',
        success: false
      });
    }
    next();
  };
};