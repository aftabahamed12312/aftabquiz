const router = require('express').Router();
const User = require('../models/User');
const House = require('../models/House');
const Tenant = require('../models/Tenant');
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
    if (!['admin', 'host', 'house_leader'].includes(role)) {
      return res.status(400).json({ message: 'Choose a valid quiz account role.' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    if (role === 'house_leader' && !house) {
      return res.status(400).json({ message: 'Choose a house for the house leader.' });
    }
    if (role === 'house_leader' && !(await House.exists({ _id: house }))) {
      return res.status(400).json({ message: 'Choose a house in this quiz.' });
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
    if (house !== undefined) {
      if (user.role === 'house_leader' && house && !(await House.exists({ _id: house }))) {
        return res.status(400).json({ message: 'Choose a house in this quiz.' });
      }
      user.house = user.role === 'house_leader' ? house || null : null;
    }
    if (active !== undefined) {
      if (String(user._id) === String(req.user._id) && !active) {
        return res.status(400).json({ message: 'You cannot deactivate your own account.' });
      }
      if (!active && await Tenant.exists({ _id: req.user.tenantId, admin: user._id })) {
        return res.status(400).json({ message: 'The quiz Admin account can only be deactivated by the Super Admin.' });
      }
      user.active = Boolean(active);
    }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      user.password = password; // hashed by the pre-save hook
      user.tokenVersion += 1;
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
    if (await Tenant.exists({ _id: req.user.tenantId, admin: req.params.id })) {
      return res.status(409).json({ message: 'The quiz Admin account is managed by the Super Admin and cannot be deleted here.' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
