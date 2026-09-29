const router = require('express').Router();
const Round = require('../models/Round');
const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');

router.use(auth, requireRole('admin'));

// Bring existing category-based question banks into the managed-round list.
async function syncLegacyRounds() {
  if (await Round.countDocuments()) return;
  const categories = await Question.distinct('category');
  for (const category of categories) {
    const nameKey = String(category).trim().toLowerCase();
    let round = await Round.findOne({ nameKey });
    if (!round) {
      const order = await Round.countDocuments();
      round = await Round.create({ name: String(category).trim(), nameKey, order });
    }
    await Question.updateMany({ category, round: { $exists: false } }, { $set: { round: round._id } });
    await Question.updateMany({ category, round: null }, { $set: { round: round._id } });
  }
}

router.get('/', asyncHandler(async (req, res) => {
  await syncLegacyRounds();
  res.json(await Round.find().sort({ order: 1, createdAt: 1 }));
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Round name is required.' });
  const order = await Round.countDocuments();
  const round = await Round.create({ name, nameKey: name.toLowerCase(), order });
  await game.log(req.user, 'round_created', name);
  res.status(201).json(round);
}));

router.patch('/reorder', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const rounds = await Round.find({ _id: { $in: ids } });
  if (rounds.length !== ids.length || new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'Provide every round exactly once to reorder them.' });
  }
  await Promise.all(ids.map((id, order) => Round.updateOne({ _id: id }, { $set: { order } })));
  res.json(await Round.find().sort({ order: 1, createdAt: 1 }));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Round name is required.' });
  const round = await Round.findByIdAndUpdate(
    req.params.id,
    { $set: { name, nameKey: name.toLowerCase() } },
    { new: true, runValidators: true }
  );
  if (!round) return res.status(404).json({ message: 'Round not found.' });
  await Question.updateMany({ round: round._id }, { $set: { category: round.name } });
  await game.log(req.user, 'round_renamed', round.name);
  await game.pushState();
  res.json(round);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const round = await Round.findByIdAndDelete(req.params.id);
  if (!round) return res.status(404).json({ message: 'Round not found.' });
  await Question.updateMany({ round: round._id }, { $unset: { round: 1 } });
  await game.log(req.user, 'round_deleted', round.name);
  await game.pushState();
  res.json({ ok: true });
}));

module.exports = router;
