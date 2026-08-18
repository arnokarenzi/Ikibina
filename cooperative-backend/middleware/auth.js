// middleware/auth.js
const jwt = require('jsonwebtoken');

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access denied. Authentication token missing.' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Forbidden: Action requires one of the following roles: ${allowedRoles.join(', ')}`
        });
      }

      next();
    } catch (error) {
      // Return 401 instead of 403 so frontend Axios interceptor can catch and refresh
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  };
}

module.exports = { requireRole };
