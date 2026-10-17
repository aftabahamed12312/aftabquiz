import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const POLL_INTERVAL = 2000;
const HIDDEN_POLL_INTERVAL = 10000;

/**
 * Refreshes the persisted game snapshot and sends actions through the REST API.
 * The server filters `state` by role before returning it.
 */
export function useGame({ display = false, tenantSlug = '' } = {}) {
  const { logout } = useAuth();
  const [state, setState] = useState(null);
  const [scores, setScores] = useState([]);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const path = display
      ? `/game/public/${encodeURIComponent(tenantSlug)}/snapshot`
      : '/game/snapshot';
    const snapshot = await api.get(path);
    setOffset((snapshot.state.serverNow || Date.now()) - Date.now());
    setState(snapshot.state);
    setScores(snapshot.scores);
    setConnected(true);
    setError('');
    return snapshot;
  }, [display, tenantSlug]);

  useEffect(() => {
    setState(null);
    setScores([]);
    setError('');
    if (display && !tenantSlug) {
      setConnected(false);
      return undefined;
    }

    let stopped = false;
    let timer;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(poll, HIDDEN_POLL_INTERVAL);
        return;
      }

      try {
        await refresh();
      } catch (fetchError) {
        if (!stopped) {
          setConnected(false);
          setError(fetchError.message || 'Unable to connect to the quiz.');
          if (fetchError.status === 401 && !display) {
            logout();
            return;
          }
        }
      }

      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL);
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [display, logout, refresh, tenantSlug]);

  const emit = useCallback(async (event, payload = {}) => {
    const result = await api.post('/game/actions', { event, payload });
    try {
      await refresh();
    } catch (fetchError) {
      setConnected(false);
      setError(fetchError.message || 'Unable to refresh the quiz.');
      if (fetchError.status === 401 && !display) logout();
    }
    return result;
  }, [display, logout, refresh]);

  return { state, scores, connected, offset, error, emit };
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
