const router = require('express').Router();
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');

router.use(auth, requireRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await User.find().populate('house', 'name color').sort({ role: 1, name: 1 }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, username, password, role, house } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    if (role === 'house_leader' && !house) {
      return res.status(400).json({ message: 'Choose a house for the house leader.' });
    }
    const user = await User.create({ name, username, password, role, house: role === 'house_leader' ? house : null });
    await game.log(req.user, 'user_created', `${user.username} (${user.role})`);
    res.status(201).json({ _id: user._id, name: user.name, username: user.username, role: user.role, house: user.house });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const { name, password, house, active } = req.body;
    if (name) user.name = name;
    if (house !== undefined) user.house = user.role === 'house_leader' ? house || null : null;
    if (active !== undefined) {
      if (String(user._id) === String(req.user._id) && !active) {
        return res.status(400).json({ message: 'You cannot deactivate your own account.' });
      }
      user.active = Boolean(active);
    }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      user.password = password; // hashed by the pre-save hook
    }
    await user.save();
    res.json({ _id: user._id, name: user.name, username: user.username, role: user.role, house: user.house, active: user.active });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
