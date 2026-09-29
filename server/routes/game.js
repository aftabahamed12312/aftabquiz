const router = require('express').Router();
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');

router.use(auth);

router.get(
  '/state',
  asyncHandler(async (req, res) => res.json(await game.stateFor(req.user)))
);

// ---- Admin only ----
router.patch(
  '/settings',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await game.updateSettings(req.user, req.body);
    res.json(await game.stateFor(req.user));
  })
);

// Kill-switch: pause / resume the whole competition
router.post(
  '/pause',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await game.setPaused(req.user, req.body.paused);
    res.json(await game.stateFor(req.user));
  })
);

// Reset live state. Optionally also zero the scores and/or return all questions to the pool.
router.post(
  '/reset',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await game.resetGame(req.user, { scores: Boolean(req.body.scores), questions: Boolean(req.body.questions) });
    res.json(await game.stateFor(req.user));
  })
);

router.get(
  '/logs',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await ActivityLog.find().sort({ createdAt: -1 }).limit(100));
  })
);

module.exports = router;
