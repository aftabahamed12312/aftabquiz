const router = require('express').Router();
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');
const Tenant = require('../models/Tenant');
const { runWithTenant } = require('../middleware/tenantContext');

const actions = {
  'host:queue': { roles: ['admin', 'host'], run: (user, payload) => game.queueQuestion(user, payload) },
  'host:queueBatch': { roles: ['admin', 'host'], run: (user, payload) => game.queueBatch(user, payload) },
  'host:clear': { roles: ['admin', 'host'], run: (user) => game.clearQuestion(user) },
  'host:present': { roles: ['admin', 'host'], run: (user, payload) => game.present(user, payload) },
  'host:lock': { roles: ['admin', 'host'], run: (user) => game.lock(user) },
  'host:evaluate': { roles: ['admin', 'host'], run: (user, payload) => game.evaluate(user, payload) },
  'house:submit': { roles: ['house_leader'], run: (user, payload) => game.submitAnswer(user, payload) },
};

router.get(
  '/public/:slug/snapshot',
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findOne({ slug: req.params.slug, active: true }).select('_id').lean();
    if (!tenant) return res.status(404).json({ message: 'This quiz is unavailable.' });
    const snapshot = await runWithTenant(tenant._id, async () => ({
      state: await game.stateFor(null),
      scores: await game.scoresPayload(),
    }));
    res.json(snapshot);
  })
);

router.use(auth);

router.get(
  '/snapshot',
  asyncHandler(async (req, res) => {
    res.json({
      state: await game.stateFor(req.user),
      scores: await game.scoresPayload(),
    });
  })
);

router.get(
  '/state',
  asyncHandler(async (req, res) => res.json(await game.stateFor(req.user)))
);

router.post(
  '/actions',
  asyncHandler(async (req, res) => {
    const event = typeof req.body?.event === 'string' ? req.body.event : '';
    const action = Object.prototype.hasOwnProperty.call(actions, event) ? actions[event] : null;
    if (!action) return res.status(400).json({ message: 'Unknown game action.' });
    if (!action.roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to do that.' });
    }
    const payload = req.body.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
      ? req.body.payload
      : {};
    await action.run(req.user, payload);
    res.json({ ok: true });
  })
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
