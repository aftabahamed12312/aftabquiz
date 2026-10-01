/**
 * Socket.io layer.
 *
 * Rooms:  staff (admin + host) | admin | display | house:<houseId>
 * Every state change is pushed through services/game.js, which sends each room
 * its own filtered view (house leaders never receive the reference answer).
 *
 * Client -> server events (all support an ack callback: { ok, error }):
 *   host:queue     { questionId }                    admin, host
 *   host:clear     {}                                admin, host
 *   host:present   { mode, houseId, duration }       admin, host
 *   host:lock      {}                                admin, host
 *   host:evaluate  { result, houseId?, points? }     admin, host
 *   house:submit   { text }                          house_leader
 * Server -> client events:  state, scores, log (admin only)
 */
const { verifyToken } = require('../middleware/auth');
const game = require('../services/game');

module.exports = function registerSockets(io) {
  // Authenticate: JWT for staff/house leaders, or { display: true } for the read-only stage screen.
  io.use(async (socket, next) => {
    const { token, display } = socket.handshake.auth || {};
    if (token) {
      try {
        socket.data.user = await verifyToken(token);
        return next();
      } catch {
        return next(new Error('Unauthorized'));
      }
    }
    if (display) return next();
    next(new Error('Unauthorized'));
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user || null;

    if (!user) socket.join('display');
    else if (user.role === 'admin') socket.join(['staff', 'admin']);
    else if (user.role === 'host') socket.join('staff');
    else if (user.role === 'house_leader' && user.house) socket.join(`house:${user.house}`);

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
          await handler(payload || {});
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
};
