import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../api';
import { useAuth } from '../AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

/**
 * Connects to the live game.
 * - Staff / house leaders authenticate with their token.
 * - The stage display passes { display: true } and only receives public data.
 * `state` is already filtered by the server for this role.
 */
export function useGame({ display = false } = {}) {
  const { logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [scores, setScores] = useState([]);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0); // server clock minus local clock (ms)

  useEffect(() => {
    const opts = { auth: display ? { display: true } : { token: getToken() } };
    const s = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      if (err.message === 'Unauthorized' && !display) {
        s.disconnect();
        logout();
      }
    });
    s.on('state', (st) => {
      setOffset(st.serverNow - Date.now());
      setState(st);
    });
    s.on('scores', setScores);

    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [display, logout]);

  /** Send a game event and wait for the server's ack. Rejects with a readable message. */
  const emit = useCallback(
    (event, payload = {}) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Not connected yet.'));
        socket.timeout(8000).emit(event, payload, (err, res) => {
          if (err) return reject(new Error('The server did not respond. Check your connection.'));
          if (res && res.ok) return resolve(res);
          reject(new Error((res && res.error) || 'Something went wrong.'));
        });
      }),
    [socket]
  );

  return { socket, state, scores, connected, offset, emit };
}

/** Whole seconds left until `endsAt`, corrected for server clock offset. */
export function useCountdown(endsAt, running, offset = 0) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt || !running) {
      setLeft(0);
      return undefined;
    }
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((new Date(endsAt).getTime() - (Date.now() + offset)) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, running, offset]);
  return left;
}
