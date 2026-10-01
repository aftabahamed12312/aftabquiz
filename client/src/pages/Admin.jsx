import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { useCountdown, useGame } from '../hooks/useGame';
import { Chip, HouseDot, Scoreboard, StatusPill, TimerRing, Toast, TopBar, useToast } from '../components/ui';
import QuestionMedia from '../components/QuestionMedia';

const TABS = [
  ['overview', 'Overview'],
  ['questions', 'Question bank'],
  ['houses', 'Houses & scores'],
  ['users', 'People'],
  ['settings', 'Rules'],
  ['log', 'Activity'],
];

export default function Admin() {
  const { user, logout } = useAuth();
  const game = useGame();
  const { toast, notify } = useToast();
  const [tab, setTab] = useState('overview');

  const shared = { game, notify };

  return (
    <>
      <TopBar
        user={user}
        onLogout={logout}
        connected={game.connected}
        links={[
          { to: '/admin', label: 'Admin' },
          { to: '/host', label: 'Host console' },
          { to: '/display', label: 'Stage display', external: true },
        ]}
      />
      <main className="page">
        <div className="tabs" role="tablist" aria-label="Admin sections">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview {...shared} />}
        {tab === 'questions' && <QuestionsTab {...shared} />}
        {tab === 'houses' && <HousesTab {...shared} />}
        {tab === 'users' && <UsersTab {...shared} />}
        {tab === 'settings' && <SettingsTab {...shared} />}
        {tab === 'log' && <LogTab {...shared} />}
      </main>
      <Toast toast={toast} />
    </>
  );
}

/* ================================================================== */
/* Overview: live monitor, kill-switch, reset                           */
/* ================================================================== */
function Overview({ game, notify }) {
  const { state, scores, offset } = game;
  const [counts, setCounts] = useState(null);
  const [resetScores, setResetScores] = useState(false);
  const [resetQuestions, setResetQuestions] = useState(false);
  const left = useCountdown(state?.timerEndsAt, state?.status === 'active', offset);

  const status = state?.status;
  const qid = state?.question?._id;
  useEffect(() => {
    api
      .get('/questions')
      .then((list) =>
        setCounts({
          total: list.length,
          unused: list.filter((q) => q.status === 'unused').length,
          queued: list.filter((q) => q.status === 'queued').length,
          asked: list.filter((q) => q.status === 'asked').length,
          held: list.filter((q) => !q.approved).length,
        })
      )
      .catch(() => {});
  }, [status, qid]);

  if (!state) return <p className="empty">Connecting…</p>;

  const togglePause = async () => {
    try {
      await api.post('/game/pause', { paused: !state.paused });
      notify(state.paused ? 'Competition resumed' : 'Competition paused');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const reset = async () => {
    const what = [
      'the live question and timer',
      resetScores && 'all house scores',
      resetQuestions && 'the asked/unasked status of every question',
    ].filter(Boolean);
    if (!window.confirm(`This will reset ${what.join(', ')}. Continue?`)) return;
    try {
      await api.post('/game/reset', { scores: resetScores, questions: resetQuestions });
      notify('Competition reset');
      setResetScores(false);
      setResetQuestions(false);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const q = state.question;

  return (
    <div className="cols">
      <div className="stack-lg">
        <section className="card">
          <div className="row-between">
            <div>
              <h2 className="card-title">{state.stage}</h2>
              <StatusPill status={state.status} paused={state.paused} />
            </div>
            {state.status === 'active' && <TimerRing left={left} total={state.timerDuration} />}
          </div>

          {q ? (
            <div className="monitor">
              <div className="row">
                <Chip>{q.category}</Chip>
                <Chip kind={q.difficulty}>{q.difficulty}</Chip>
                {state.activeHouse && (
                  <span className="turn-inline">
                    <HouseDot color={state.activeHouse.color} /> {state.activeHouse.name}
                  </span>
                )}
                {state.mode === 'open' && ['active', 'locked', 'evaluated'].includes(state.status) && <Chip>Open floor</Chip>}
              </div>
              <p className="monitor-q">{q.questionText}</p>
              <QuestionMedia imageUrl={q.imageUrl} audioUrl={q.audioUrl} />
              <p className="muted">
                Answer: <b>{q.correctAnswer}</b>
              </p>
              {state.submissions.map((s, i) => (
                <p key={i} className="sub">
                  <HouseDot color={s.house?.color} /> <b>{s.house?.name}</b> <span>{s.text}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="empty">No question on stage right now.</p>
          )}

          <div className="row">
            <button className={`btn ${state.paused ? 'btn-ok' : 'btn-bad'}`} onClick={togglePause}>
              {state.paused ? 'Resume competition' : 'Pause competition'}
            </button>
            <Link className="btn btn-ink" to="/host">
              Open host console
            </Link>
          </div>
          <p className="hint">
            Pausing locks a live question and stops the Host and house leaders from acting. You keep full control while paused.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Reset the competition</h2>
          <p className="hint">Always clears the live question and timer. Choose what else to reset.</p>
          <label className="check">
            <input type="checkbox" checked={resetScores} onChange={(e) => setResetScores(e.target.checked)} />
            Set every house score back to 0
          </label>
          <label className="check">
            <input type="checkbox" checked={resetQuestions} onChange={(e) => setResetQuestions(e.target.checked)} />
            Return every asked question to the pool
          </label>
          <div className="row">
            <button className="btn btn-bad" onClick={reset}>
              Reset competition
            </button>
          </div>
        </section>
      </div>

      <div className="stack-lg">
        <section className="card">
          <h2 className="card-title">Scoreboard</h2>
          <Scoreboard scores={scores} highlightId={state.activeHouse?._id} />
        </section>

        <section className="card">
          <h2 className="card-title">Question bank</h2>
          {counts ? (
            <dl className="stats">
              <div><dt>Total</dt><dd>{counts.total}</dd></div>
              <div><dt>Not yet asked</dt><dd>{counts.unused}</dd></div>
              <div><dt>Queued</dt><dd>{counts.queued}</dd></div>
              <div><dt>Asked</dt><dd>{counts.asked}</dd></div>
              <div><dt>Held back</dt><dd>{counts.held}</dd></div>
            </dl>
          ) : (
            <p className="empty">Loading…</p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Question bank                                                        */
/* ================================================================== */
const EMPTY_Q = { category: '', roundId: '', questionText: '', correctAnswer: '', difficulty: 'medium', imageUrl: '', audioUrl: '', approved: true };

function QuestionsTab({ game, notify }) {
  const [list, setList] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [form, setForm] = useState(EMPTY_Q);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [importText, setImportText] = useState('');

  const status = game.state?.status;
  const qid = game.state?.question?._id;

  const load = useCallback(() => {
    api.get('/questions').then(setList).catch((e) => notify(e.message, 'error'));
  }, [notify]);
  useEffect(load, [load, status, qid]);
  const loadRounds = useCallback(() => {
    api.get('/rounds').then((data) => {
      setRounds(data);
      load();
    }).catch((e) => notify(e.message, 'error'));
  }, [load, notify]);
  useEffect(loadRounds, [loadRounds]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const uploadMedia = async (key, file) => {
    if (!file) return;
    try {
      const { url } = await api.upload('/questions/media', file);
      setForm((current) => ({ ...current, [key]: url }));
      notify('Media uploaded');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/questions/${editingId}`, form);
        notify('Question updated');
      } else {
        await api.post('/questions', form);
        notify('Question added to the bank');
      }
      setForm(EMPTY_Q);
      setEditingId(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const edit = (q) => {
    setEditingId(q._id);
    setForm({
      category: q.category,
      roundId: q.round?._id || '',
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
      imageUrl: q.imageUrl || '',
      audioUrl: q.audioUrl || '',
      approved: q.approved,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (q) => {
    if (!window.confirm('Delete this question permanently?')) return;
    try {
      await api.del(`/questions/${q._id}`);
      notify('Question deleted');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const toggleApprove = async (q) => {
    try {
      await api.patch(`/questions/${q._id}/approve`, { approved: !q.approved });
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const runImport = async () => {
    try {
      const parsed = JSON.parse(importText);
      const questions = Array.isArray(parsed) ? parsed : parsed.questions;
      const res = await api.post('/questions/bulk', { questions });
      notify(`Imported ${res.count} questions`);
      setImportText('');
      load();
    } catch (err) {
      notify(err instanceof SyntaxError ? 'That is not valid JSON.' : err.message, 'error');
    }
  };

  const shown = list.filter(
    (q) =>
      (statusFilter === 'all' || (statusFilter === 'held' ? !q.approved : q.status === statusFilter)) &&
      (!search || `#${q.questionNumber} ${q.questionNumber} ${q.questionText} ${q.round?.name || q.category} ${q.correctAnswer}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="stack-lg">
      <RoundsManager rounds={rounds} reload={loadRounds} notify={notify} />
      <div className="cols cols-even">
        <section className="card">
          <h2 className="card-title">{editingId ? 'Edit question' : 'Add a question'}</h2>
          <form className="stack" onSubmit={save}>
            <label className="field">
              <span>Round</span>
              <select value={form.roundId} onChange={set('roundId')} required>
                <option value="">Choose a round</option>
                {rounds.map((round) => <option key={round._id} value={round._id}>{round.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Question</span>
              <textarea rows={3} value={form.questionText} onChange={set('questionText')} required />
            </label>
            <label className="field">
              <span>Reference answer</span>
              <input value={form.correctAnswer} onChange={set('correctAnswer')} required />
            </label>
            <label className="field">
              <span>Image URL or upload (15 MB max)</span>
              <input type="text" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://… or /uploads/…" />
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => uploadMedia('imageUrl', e.target.files?.[0])} />
            </label>
            <label className="field">
              <span>Audio URL or upload (15 MB max)</span>
              <input type="text" value={form.audioUrl} onChange={set('audioUrl')} placeholder="https://… or /uploads/…" />
              <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/aac" onChange={(e) => uploadMedia('audioUrl', e.target.files?.[0])} />
            </label>
            <QuestionMedia imageUrl={form.imageUrl} audioUrl={form.audioUrl} />
            <div className="row">
              <label className="field grow">
                <span>Difficulty</span>
                <select value={form.difficulty} onChange={set('difficulty')}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="check grow">
                <input type="checkbox" checked={form.approved} onChange={set('approved')} />
                Approved for the Host
              </label>
            </div>
            <div className="row">
              <button className="btn btn-lamp" disabled={!rounds.length}>{editingId ? 'Save changes' : 'Add question'}</button>
              {editingId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_Q);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">Import many at once</h2>
          <p className="hint">
            Paste a JSON list. Each item needs <code>category</code>, <code>questionText</code>, <code>correctAnswer</code> and optionally <code>difficulty</code>.
          </p>
          <textarea
            className="code"
            rows={8}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'[\n  { "category": "Science", "questionText": "…", "correctAnswer": "…", "difficulty": "easy" }\n]'}
            aria-label="Questions JSON"
          />
          <div className="row">
            <button className="btn btn-ink" disabled={!importText.trim()} onClick={runImport}>
              Import questions
            </button>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="row-between">
          <h2 className="card-title">All questions ({shown.length})</h2>
          <div className="filters">
            <input type="search" placeholder="Search" aria-label="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="unused">Not yet asked</option>
              <option value="queued">Queued</option>
              <option value="asked">Asked</option>
              <option value="held">Held back</option>
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Question</th>
                <th>Answer</th>
                <th>Level</th>
                <th>Status</th>
                <th>
                  <span className="sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q._id}>
                  <td>#{q.questionNumber}</td>
                  <td>{q.round?.name || q.category}</td>
                  <td className="wide">
                    {q.questionText}
                    <QuestionMedia imageUrl={q.imageUrl} audioUrl={q.audioUrl} compact />
                  </td>
                  <td>
                    <b>{q.correctAnswer}</b>
                  </td>
                  <td>
                    <Chip kind={q.difficulty}>{q.difficulty}</Chip>
                  </td>
                  <td>
                    <Chip kind={q.status}>{q.status === 'unused' ? 'not asked' : q.status}</Chip>
                    {!q.approved && <Chip kind="held">held back</Chip>}
                  </td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleApprove(q)}>
                      {q.approved ? 'Hold back' : 'Approve'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(q)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => remove(q)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">No questions found.</p>}
        </div>
      </section>
    </div>
  );
}

function RoundsManager({ rounds, reload, notify }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editingId) await api.patch(`/rounds/${editingId}`, { name });
      else await api.post('/rounds', { name });
      setName('');
      setEditingId(null);
      reload();
      notify(editingId ? 'Round renamed' : 'Round added');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= rounds.length) return;
    const reordered = [...rounds];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await api.patch('/rounds/reorder', { ids: reordered.map((round) => round._id) });
      reload();
    } catch (err) {
      reload();
      notify(err.message, 'error');
    }
  };

  const remove = async (round) => {
    if (!window.confirm(`Delete round “${round.name}”? Questions in it will remain in the bank without a round.`)) return;
    try {
      await api.del(`/rounds/${round._id}`);
      reload();
      notify('Round deleted');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <section className="card">
      <h2 className="card-title">Manage rounds</h2>
      <p className="hint">Add, rename, or reorder rounds. The order here controls their order in the Host question pool.</p>
      <form className="row end" onSubmit={save}>
        <label className="field grow">
          <span>{editingId ? 'Rename round' : 'New round name'}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <button className="btn btn-lamp">{editingId ? 'Save name' : 'Add round'}</button>
        {editingId && <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setName(''); }}>Cancel</button>}
      </form>
      {!rounds.length ? <p className="empty">No rounds yet.</p> : (
        <ol className="round-list">
          {rounds.map((round, index) => (
            <li key={round._id}>
              <b>{index + 1}.</b><span className="grow">{round.name}</span>
              <button className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${round.name} up`}>↑</button>
              <button className="btn btn-ghost btn-sm" disabled={index === rounds.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${round.name} down`}>↓</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(round._id); setName(round.name); }}>Rename</button>
              <button className="btn btn-ghost btn-sm danger" onClick={() => remove(round)}>Delete</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ================================================================== */
/* Houses & score overrides                                             */
/* ================================================================== */
function HousesTab({ game, notify }) {
  const { scores } = game;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2f6fdb');

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/houses', { name, color });
      notify(`${name} House added`);
      setName('');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <h2 className="card-title">Add a house</h2>
        <form className="row end" onSubmit={add}>
          <label className="field grow">
            <span>House name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Colour</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button className="btn btn-lamp">Add house</button>
        </form>
      </section>

      {scores.length === 0 && <p className="empty">No houses yet. Add the first one above.</p>}
      <div className="house-grid">
        {scores.map((h) => (
          <HouseRow key={h._id} house={h} notify={notify} />
        ))}
      </div>
    </div>
  );
}

function HouseRow({ house, notify }) {
  const [name, setName] = useState(house.name);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => setName(house.name), [house.name]);

  const call = async (fn, msg) => {
    try {
      await fn();
      if (msg) notify(msg);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const adjust = (n, why) => call(() => api.patch(`/houses/${house._id}/score`, { adjustment: n, reason: why }), `${house.name}: ${n > 0 ? '+' : ''}${n}`);
  const setTo = () =>
    call(async () => {
      await api.patch(`/houses/${house._id}/score`, { setTo: Number(amount), reason });
      setAmount('');
      setReason('');
    }, `${house.name} score set to ${amount}`);
  const apply = () =>
    call(async () => {
      await api.patch(`/houses/${house._id}/score`, { adjustment: Number(amount), reason });
      setAmount('');
      setReason('');
    }, `${house.name} score changed by ${amount}`);
  const rename = () => name.trim() && name !== house.name && call(() => api.patch(`/houses/${house._id}`, { name }), 'House renamed');
  const recolor = (c) => call(() => api.patch(`/houses/${house._id}`, { color: c }));
  const remove = () => {
    if (!window.confirm(`Delete ${house.name} House? Its leaders will be unlinked.`)) return;
    call(() => api.del(`/houses/${house._id}`), 'House deleted');
  };

  return (
    <article className="house-card" style={{ '--house': house.color }}>
      <div className="house-card-top">
        <input type="color" aria-label={`${house.name} colour`} value={house.color} onChange={(e) => recolor(e.target.value)} />
        <input className="name-edit" aria-label="House name" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
        <div className="house-card-score">{house.score}</div>
      </div>

      <div className="quick" role="group" aria-label={`Quick score changes for ${house.name}`}>
        {[-10, -5, 5, 10, 20].map((n) => (
          <button key={n} className={`btn btn-sm ${n < 0 ? 'btn-ghost danger' : 'btn-ghost'}`} onClick={() => adjust(n)}>
            {n > 0 ? `+${n}` : n}
          </button>
        ))}
      </div>

      <div className="row end">
        <label className="field grow">
          <span>Points</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. -15" />
        </label>
        <label className="field grow2">
          <span>Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Dispute ruling" />
        </label>
      </div>
      <div className="row">
        <button className="btn btn-ink btn-sm" disabled={amount === ''} onClick={apply}>
          Add or deduct
        </button>
        <button className="btn btn-ghost btn-sm" disabled={amount === ''} onClick={setTo}>
          Set score to this
        </button>
        <button className="btn btn-ghost btn-sm danger push" aria-label={`Delete ${house.name} House`} onClick={remove}>
          Delete
        </button>
      </div>
    </article>
  );
}

/* ================================================================== */
/* People                                                               */
/* ================================================================== */
const ROLE_LABEL = { admin: 'Admin', host: 'Host', house_leader: 'House leader' };

function UsersTab({ game, notify }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'house_leader', house: '' });
  const houses = game.scores;

  const load = useCallback(() => {
    api.get('/users').then(setUsers).catch((e) => notify(e.message, 'error'));
  }, [notify]);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { ...form, house: form.role === 'house_leader' ? form.house : undefined });
      notify(`Account created for ${form.name}`);
      setForm({ name: '', username: '', password: '', role: 'house_leader', house: '' });
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const patch = async (u, body, msg) => {
    try {
      await api.patch(`/users/${u._id}`, body);
      if (msg) notify(msg);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const resetPassword = (u) => {
    const pw = window.prompt(`New password for ${u.username} (at least 6 characters):`);
    if (pw) patch(u, { password: pw }, 'Password changed');
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete the account for ${u.name}?`)) return;
    try {
      await api.del(`/users/${u._id}`);
      notify('Account deleted');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <h2 className="card-title">Create an account</h2>
        <form className="grid-form" onSubmit={create}>
          <label className="field">
            <span>Full name</span>
            <input value={form.name} onChange={set('name')} required />
          </label>
          <label className="field">
            <span>Username</span>
            <input value={form.username} onChange={set('username')} autoComplete="off" required />
          </label>
          <label className="field">
            <span>Password (6+ characters)</span>
            <input type="text" value={form.password} onChange={set('password')} autoComplete="off" required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={set('role')}>
              <option value="house_leader">House leader</option>
              <option value="host">Host</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {form.role === 'house_leader' && (
            <label className="field">
              <span>House</span>
              <select value={form.house} onChange={set('house')} required>
                <option value="">Choose a house</option>
                {houses.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row end">
            <button className="btn btn-lamp">Create account</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">Everyone ({users.length})</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>House</th>
                <th>Status</th>
                <th>
                  <span className="sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td>{u.username}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>
                    {u.house ? (
                      <span className="turn-inline">
                        <HouseDot color={u.house.color} /> {u.house.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Chip kind={u.active ? 'unused' : 'held'}>{u.active ? 'active' : 'deactivated'}</Chip>
                  </td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(u)}>
                      Change password
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => patch(u, { active: !u.active }, u.active ? 'Account deactivated' : 'Account activated')}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => remove(u)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Rules / settings                                                     */
/* ================================================================== */
function SettingsTab({ game, notify }) {
  const { state } = game;
  const [f, setF] = useState(null);
  const [rounds, setRounds] = useState([]);

  useEffect(() => {
    api.get('/rounds').then(setRounds).catch((e) => notify(e.message, 'error'));
  }, [notify]);

  useEffect(() => {
    if (state && !f) {
      setF({
        stage: state.stage,
        timer: state.settings.timer,
        negativeMarking: state.settings.negativeMarking,
        easy: state.settings.points.easy,
        medium: state.settings.points.medium,
        hard: state.settings.points.hard,
      });
    }
  }, [state, f]);

  if (!f) return <p className="empty">Loading…</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/game/settings', {
        stage: f.stage,
        timer: f.timer,
        negativeMarking: f.negativeMarking,
        points: { easy: f.easy, medium: f.medium, hard: f.hard },
      });
      notify('Rules saved');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <form className="cols cols-even" onSubmit={save}>
      <section className="card stack">
        <h2 className="card-title">Current round</h2>
        <label className="field">
          <span>Round name shown on every screen</span>
          <select value={f.stage} onChange={set('stage')} required>
            {!rounds.some((round) => round.name === f.stage) && <option value={f.stage}>{f.stage} (current)</option>}
            {rounds.map((round) => <option key={round._id} value={round.name}>{round.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Default answer time (seconds)</span>
          <input type="number" min="5" max="600" value={f.timer} onChange={set('timer')} />
        </label>
      </section>

      <section className="card stack">
        <h2 className="card-title">Scoring</h2>
        <div className="row">
          {['easy', 'medium', 'hard'].map((d) => (
            <label key={d} className="field grow">
              <span>{d[0].toUpperCase() + d.slice(1)} points</span>
              <input type="number" min="0" value={f[d]} onChange={set(d)} />
            </label>
          ))}
        </div>
        <label className="field">
          <span>Points lost for a wrong answer</span>
          <input type="number" min="0" value={f.negativeMarking} onChange={set('negativeMarking')} />
        </label>
        <p className="hint">Set to 0 for no negative marking. The Host can still override points on any single question.</p>
        <div className="row">
          <button className="btn btn-lamp">Save rules</button>
        </div>
      </section>
    </form>
  );
}

/* ================================================================== */
/* Activity log (live)                                                  */
/* ================================================================== */
function LogTab({ game, notify }) {
  const { socket } = game;
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/game/logs').then(setLogs).catch((e) => notify(e.message, 'error'));
  }, [notify]);

  useEffect(() => {
    if (!socket) return undefined;
    const onLog = (entry) => setLogs((l) => [entry, ...l].slice(0, 100));
    socket.on('log', onLog);
    return () => socket.off('log', onLog);
  }, [socket]);

  const label = (a) => a.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  return (
    <section className="card">
      <h2 className="card-title">Live activity</h2>
      {logs.length === 0 ? (
        <p className="empty">Nothing has happened yet.</p>
      ) : (
        <ul className="log">
          {logs.map((l) => (
            <li key={l._id}>
              <time>{new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              <span className="log-who">
                {l.actor} <small>{ROLE_LABEL[l.role] || l.role}</small>
              </span>
              <span className="log-what">
                <b>{label(l.action)}</b> {l.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
