const router = require('express').Router();
const House = require('../models/House');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');

const isNum = (n) => n !== '' && n !== null && n !== undefined && Number.isFinite(Number(n));

router.use(auth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await House.find().sort({ score: -1, name: 1 }));
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, color } = req.body;
    const house = await House.create({ name, ...(color ? { color } : {}) });
    await game.log(req.user, 'house_created', house.name);
    await game.pushScores();
    res.status(201).json(house);
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const update = {};
    if (req.body.name) update.name = req.body.name;
    if (req.body.color) update.color = req.body.color;
    const house = await House.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!house) return res.status(404).json({ message: 'House not found.' });
    await game.pushScores();
    await game.pushState();
    res.json(house);
  })
);

// Score override. Body: { adjustment: +/-number }  OR  { setTo: number }, optional { reason }
router.patch(
  '/:id/score',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { adjustment, setTo, reason } = req.body;
    let house;
    let detail;
    if (isNum(setTo)) {
      house = await House.findByIdAndUpdate(req.params.id, { score: Number(setTo) }, { new: true });
      detail = `set to ${Number(setTo)}`;
    } else if (isNum(adjustment)) {
      house = await House.findByIdAndUpdate(req.params.id, { $inc: { score: Number(adjustment) } }, { new: true });
      detail = `${Number(adjustment) > 0 ? '+' : ''}${Number(adjustment)}`;
    } else {
      return res.status(400).json({ message: 'Send a numeric "adjustment" or "setTo".' });
    }
    if (!house) return res.status(404).json({ message: 'House not found.' });
    await game.log(req.user, 'score_override', `${house.name}: ${detail}${reason ? ` (${reason})` : ''}`);
    await game.pushScores();
    res.json(house);
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const state = await game.loadState();
    if (state && state.activeHouse && String(state.activeHouse._id) === req.params.id) {
      return res.status(409).json({ message: 'This house is answering right now.' });
    }
    const house = await House.findByIdAndDelete(req.params.id);
    if (house) {
      await User.updateMany({ house: house._id }, { house: null });
      await game.log(req.user, 'house_deleted', house.name);
    }
    await game.pushScores();
    res.json({ ok: true });
  })
);

module.exports = router;
