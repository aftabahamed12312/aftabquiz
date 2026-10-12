/**
 * Socket.io layer. Every connection belongs to one tenant room tree:
 * tenant:<id>, tenant:<id>:staff, tenant:<id>:admin,
 * tenant:<id>:display, and tenant:<id>:house:<houseId>.
 */
const Tenant = require('../models/Tenant');
const { verifyToken } = require('../middleware/auth');
const { runWithTenant } = require('../middleware/tenantContext');
const game = require('../services/game');

module.exports = function registerSockets(io) {
  io.use(async (socket, next) => {
    const { token, display, tenant: slug } = socket.handshake.auth || {};
    if (token) {
      try {
        const user = await verifyToken(token);
        if (user.role === 'super_admin') return next(new Error('Unauthorized'));
        socket.data.user = user;
        socket.data.tenantId = String(user.tenantId);
        return next();
      } catch (err) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError', 'CastError'].includes(err.name) || err.message === 'Unauthorized') {
          return next(new Error('Unauthorized'));
        }
        return next(err);
      }
    }
    if (display && typeof slug === 'string' && slug) {
      try {
        const tenant = await Tenant.findOne({ slug, active: true }).select('_id');
        if (!tenant) return next(new Error('Quiz is unavailable.'));
        socket.data.tenantId = String(tenant._id);
        return next();
      } catch (err) {
        return next(err);
      }
    }
    next(new Error('Unauthorized'));
  });

  io.on('connection', (socket) => {
    const user = socket.data.user || null;
    const tenantId = socket.data.tenantId;
    const prefix = `tenant:${tenantId}`;

    runWithTenant(tenantId, async () => {
      if (!(await Tenant.exists({ _id: tenantId, active: true }))) {
        socket.disconnect(true);
        return;
      }
      socket.join(prefix);
      if (!user) socket.join(`${prefix}:display`);
      else if (user.role === 'admin') socket.join([`${prefix}:staff`, `${prefix}:admin`]);
      else if (user.role === 'host') socket.join(`${prefix}:staff`);
      else if (user.role === 'house_leader' && user.house) {
        socket.join(`${prefix}:house:${user.house}`);
      }

      try {
        socket.emit('state', await game.stateFor(user));
        socket.emit('scores', await game.scoresPayload());
      } catch (err) {
        console.error('Initial state error:', err.message);
      }

      const on = (event, roles, handler) =>
        socket.on(event, async (payload, ack) => {
          if (typeof payload === 'function') {
            ack = payload;
            payload = {};
          }
          const reply = typeof ack === 'function' ? ack : () => {};
          try {
            if (!user || !roles.includes(user.role)) throw new Error('You do not have permission to do that.');
            const activeTenant = await Tenant.exists({ _id: tenantId, active: true });
            if (!activeTenant) {
              socket.disconnect(true);
              throw new Error('This quiz is currently inactive.');
            }
            await runWithTenant(tenantId, () => handler(payload || {}));
            reply({ ok: true });
          } catch (err) {
            reply({ ok: false, error: err.message });
          }
        });

      const staff = ['admin', 'host'];
      on('host:queue', staff, (p) => game.queueQuestion(user, p));
      on('host:queueBatch', staff, (p) => game.queueBatch(user, p));
      on('host:clear', staff, () => game.clearQuestion(user));
      on('host:present', staff, (p) => game.present(user, p));
      on('host:lock', staff, () => game.lock(user));
      on('host:evaluate', staff, (p) => game.evaluate(user, p));
      on('house:submit', ['house_leader'], (p) => game.submitAnswer(user, p));
    });
  });
};
