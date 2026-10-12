const router = require('express').Router();
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, auth } = require('../middleware/auth');

const publicUser = (u, tenant = null) => ({
  _id: u._id,
  name: u.name,
  username: u.username,
  role: u.role,
  house: u.house,
  tenant: tenant ? { _id: tenant._id, title: tenant.title, slug: tenant.slug } : null,
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Enter your username and password.' });
    }
    const user = await User.findOne({ username: String(username).toLowerCase().trim() }).select('+password');
    if (!user || !user.active || !(await user.comparePassword(String(password)))) {
      return res.status(401).json({ message: 'Username or password is incorrect.' });
    }
    let tenant = null;
    if (user.role !== 'super_admin') {
      tenant = await Tenant.findOne({ _id: user.tenantId, active: true }).select('_id title slug');
      if (!tenant) return res.status(401).json({ message: 'This quiz is currently inactive.' });
    }
    res.json({ token: signToken(user), user: publicUser(user, tenant) });
  })
);

router.get('/me', auth, asyncHandler(async (req, res) => {
  const tenant = req.user.tenantId
    ? await Tenant.findById(req.user.tenantId).select('_id title slug')
    : null;
  res.json({ user: publicUser(req.user, tenant) });
}));

module.exports = router;
