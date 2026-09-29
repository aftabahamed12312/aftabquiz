const router = require('express').Router();
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, auth } = require('../middleware/auth');

const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  username: u.username,
  role: u.role,
  house: u.house,
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
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
