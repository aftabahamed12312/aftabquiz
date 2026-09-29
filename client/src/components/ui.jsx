import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

/* Brand: four house-coloured dots around a small lamp flame ("punja" = a cluster) */
export function Brand({ size = 'md' }) {
  return (
    <div className={`brand brand-${size}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="14" cy="14" r="9" fill="#d1345b" />
        <circle cx="27" cy="14" r="9" fill="#2f6fdb" />
        <circle cx="14" cy="27" r="9" fill="#1f9d6b" />
        <circle cx="27" cy="27" r="9" fill="#e39b12" />
        <circle cx="20.5" cy="20.5" r="5" fill="#fff7dd" />
      </svg>
      <span>Gyanpunja Quiz</span>
    </div>
  );
}

export function TopBar({ user, onLogout, connected, links = [] }) {
  return (
    <header className="topbar">
      <Brand />
      <nav className="topnav" aria-label="Main">
        {links.map((l) =>
          l.external ? (
            <a key={l.to} href={l.to} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ) : (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          )
        )}
      </nav>
      <div className="topbar-right">
        <span className={`conn ${connected ? 'on' : ''}`}>
          <i aria-hidden="true" />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
        <span className="who">{user.name}</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

const STATUS_LABEL = {
  idle: 'Waiting',
  queued: 'Question ready',
  active: 'Live',
  locked: 'Time up',
  evaluated: 'Answered',
};

export function StatusPill({ status, paused }) {
  if (paused) return <span className="pill pill-paused">Paused</span>;
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

/** Dark or white text, whichever is readable on a house colour. */
export function inkOn(hex) {
  const h = (hex || '#f4a712').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#241c5a' : '#fff';
}

export const Chip = ({ kind, children }) => <span className={`chip ${kind ? `chip-${kind}` : ''}`}>{children}</span>;

export const HouseDot = ({ color }) => <span className="hdot" style={{ background: color }} aria-hidden="true" />;

/* The countdown ring: drains in marigold, turns rose in the last five seconds */
export function TimerRing({ left, total, size = 'md' }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, left / total) : 0;
  const urgent = left > 0 && left <= 5;
  return (
    <svg
      className={`ring ring-${size} ${urgent ? 'urgent' : ''} ${left === 0 ? 'done' : ''}`}
      viewBox="0 0 120 120"
      role="timer"
      aria-label={`${left} seconds left`}
    >
      <circle className="ring-track" cx="60" cy="60" r={r} />
      <circle
        className="ring-bar"
        cx="60"
        cy="60"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central">
        {left}
      </text>
    </svg>
  );
}

export function Scoreboard({ scores, highlightId, big = false }) {
  if (!scores.length) return <p className="empty">No houses yet. The Admin can add them.</p>;
  const max = Math.max(1, ...scores.map((s) => s.score));
  return (
    <ol className={`board ${big ? 'board-big' : ''}`}>
      {scores.map((h, i) => (
        <li key={h._id} className={h._id === highlightId ? 'mine' : ''}>
          <span className="board-rank">{i + 1}</span>
          <span className="board-name">{h.name}</span>
          <span className="board-score">{h.score}</span>
          <span className="board-bar">
            <i style={{ width: `${Math.max(2, (Math.max(0, h.score) / max) * 100)}%`, background: h.color }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const notify = useCallback((msg, type = 'ok') => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), 3800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, notify };
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.msg}
    </div>
  );
}

export function ResultBanner({ result, mineHouseId }) {
  if (!result) return null;
  const who = result.house ? `${result.house.name} House` : 'No house';
  const mine = mineHouseId && result.house && result.house._id === mineHouseId;
  let kind = 'skip';
  let title = 'No points this time';
  if (result.result === 'correct') {
    kind = 'correct';
    title = `${mine ? 'Your house' : who} answered correctly`;
  } else if (result.result === 'wrong') {
    kind = 'wrong';
    title = `${mine ? 'Your house' : who} did not get it`;
  }
  return (
    <div className={`result result-${kind}`}>
      <div>
        <strong>{title}</strong>
        {result.points !== 0 && (
          <span className="result-pts">
            {result.points > 0 ? '+' : ''}
            {result.points} points
          </span>
        )}
      </div>
      {result.correctAnswer && (
        <div className="result-answer">
          Answer: <b>{result.correctAnswer}</b>
        </div>
      )}
    </div>
  );
}
