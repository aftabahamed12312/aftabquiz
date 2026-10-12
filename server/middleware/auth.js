const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { runWithTenant } = require('./tenantContext');

const signToken = (user) =>
  jwt.sign({ id: user._id, version: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '12h' });

// Used by both REST and Socket.io
async function verifyToken(token) {
  const { id, version = 0 } = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(id);
  if (!user || !user.active || Number(version) !== Number(user.tokenVersion || 0)) throw new Error('Unauthorized');
  if (user.role !== 'super_admin') {
    if (!user.tenantId) throw new Error('Unauthorized');
    const tenant = await Tenant.findOne({ _id: user.tenantId, active: true });
    if (!tenant) throw new Error('Unauthorized');
  }
  return user;
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please log in first.' });
  try {
    req.user = await verifyToken(token);
    runWithTenant(req.user.tenantId, next);
  } catch (err) {
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError', 'CastError'].includes(err.name) || err.message === 'Unauthorized') {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }
    next(err);
  }
}

const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: 'You do not have permission to do that.' });

module.exports = { signToken, verifyToken, auth, requireRole };
