// server/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Add user from payload
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Auth error:', error);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      res.status(401).json({ message: 'Not authorized' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Role ${req.user.role} is not authorized to access this resource` 
      });
    }
    next();
  };
};

module.exports = { protect, authorize };