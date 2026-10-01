import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { useCountdown, useGame } from '../hooks/useGame';
import { Chip, HouseDot, ResultBanner, Scoreboard, StatusPill, TimerRing, Toast, TopBar, useToast } from '../components/ui';
import QuestionMedia from '../components/QuestionMedia';

export default function Host() {
  const { user, logout } = useAuth();
  const { state, scores, connected, offset, emit } = useGame();
  const { toast, notify } = useToast();

  const [questions, setQuestions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('available');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [targetHouse, setTargetHouse] = useState('');
  const [openFloor, setOpenFloor] = useState(false);
  const [duration, setDuration] = useState('');
  const [awardHouse, setAwardHouse] = useState('');
  const [points, setPoints] = useState('');
  const [busy, setBusy] = useState(false);

  // Stable, alphabetical order so the rotation of houses never jumps around with the scores
  const houses = useMemo(() => [...scores].sort((a, b) => a.name.localeCompare(b.name)), [scores]);

  const status = state?.status;
  const qid = state?.question?._id;
  const timeLeft = useCountdown(state?.timerEndsAt, status === 'active', offset);

  // Refresh the pool whenever the live question or its status changes
  useEffect(() => {
    api.get('/questions').then(setQuestions).catch((e) => notify(e.message, 'error'));
  }, [status, qid, notify]);

  useEffect(() => {
    if (!targetHouse && houses.length) setTargetHouse(houses[0]._id);
  }, [houses, targetHouse]);

  useEffect(() => {
    setAwardHouse('');
    setPoints('');
  }, [qid, state?.mode]);

  const categories = useMemo(() => ['all', ...new Set(questions.map((q) => q.round?.name || q.category))], [questions]);
  const pool = questions.filter((q) => {
    const okStatus =
      statusFilter === 'all' || (statusFilter === 'available' ? q.status !== 'asked' : q.status === statusFilter);
    const okCat = category === 'all' || (q.round?.name || q.category) === category;
    const okSearch = !search || `#${q.questionNumber} ${q.questionNumber} ${q.questionText} ${q.category}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okCat && okSearch;
  });

  if (!state) return <div className="splash">Connecting to the quiz…</div>;

  const q = state.question;
  const s = state.settings;
  const paused = state.paused;
  const controlsLocked = paused && user.role !== 'admin';
  const canPresent = Boolean(q) && ['queued', 'locked', 'evaluated'].includes(status);
  const canEvaluate = ['active', 'locked'].includes(status);
  const poolLocked = ['active', 'locked'].includes(status) || controlsLocked;
  const targetName = houses.find((h) => h._id === targetHouse)?.name;
  const winPoints = q ? (points !== '' ? Math.abs(Number(points)) : s.points[q.difficulty]) : 0;
  const penalty = points !== '' ? Math.abs(Number(points)) : s.negativeMarking;
  const needsAward = state.mode === 'open' && !awardHouse;

  const act = async (event, payload, okMsg) => {
    setBusy(true);
    try {
      await emit(event, payload);
      if (okMsg) notify(okMsg);
      return true;
    } catch (e) {
      notify(e.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const queue = (item) => act('host:queue', { questionId: item._id }, 'Question queued');
  const returnToPool = () => act('host:clear', {}, 'Question returned to the pool');
  const present = () =>
    act(
      'host:present',
      openFloor
        ? { mode: 'open', duration: duration || undefined }
        : { mode: 'house', houseId: targetHouse, duration: duration || undefined },
      'Question is live'
    );
  const lockNow = () => act('host:lock', {}, 'Answers locked');
  const evaluate = (result) =>
    act('host:evaluate', {
      result,
      houseId: state.mode === 'open' ? awardHouse || undefined : undefined,
      points: points === '' ? undefined : Number(points),
    });
  const next = async () => {
    const ok = await act('host:clear', {});
    if (ok && houses.length) {
      const i = houses.findIndex((h) => h._id === targetHouse);
      setTargetHouse(houses[(i + 1) % houses.length]._id); // rotate to the next house
    }
  };

  return (
    <>
      <TopBar
        user={user}
        onLogout={logout}
        connected={connected}
        links={[
          ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
          { to: '/host', label: 'Host console' },
          { to: '/display', label: 'Stage display', external: true },
        ]}
      />

      <main className="page">
        {paused && (
          <div className="banner banner-warn" role="status">
            The Admin has paused the competition.{' '}
            {controlsLocked ? 'Your controls are locked until it resumes.' : 'You can still act as Admin.'}
          </div>
        )}

        <div className="cols">
          {/* ---------- Left: what is on stage ---------- */}
          <section className="stage-panel">
            <div className="row-between">
              <div>
                <h1 className="stage-title">{state.stage}</h1>
                <StatusPill status={status} paused={paused} />
              </div>
              {status === 'active' && <TimerRing left={timeLeft} total={state.timerDuration} />}
            </div>

            {!q ? (
              <div className="stage-empty">
                <p>Nothing is queued.</p>
                <p className="muted-on-dark">Pick a question from the pool and choose Queue.</p>
              </div>
            ) : (
              <>
                <div className="stage-q">
                  <div className="row">
                    <Chip kind="on-dark">{q.round?.name || q.category}</Chip>
                    <Chip kind={q.difficulty}>{q.difficulty}</Chip>
                    <span className="muted-on-dark">{s.points[q.difficulty]} points</span>
                  </div>
                  <p className="stage-q-text">{q.questionText}</p>
                  <QuestionMedia imageUrl={q.imageUrl} audioUrl={q.audioUrl} />
                  <div className="ref-answer">
                    <span>Reference answer (only you and the Admin see this)</span>
                    <strong>{q.correctAnswer}</strong>
                  </div>
                </div>

                {state.submissions.length > 0 && (
                  <div className="subs">
                    <h3>Answers typed by houses</h3>
                    {state.submissions.map((sub, i) => (
                      <div key={i} className="sub">
                        <HouseDot color={sub.house?.color} />
                        <b>{sub.house?.name}</b>
                        <span>{sub.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {state.result && <ResultBanner result={state.result} />}

                {/* Present / pass the question */}
                {canPresent && (
                  <div className="ctl">
                    <h3>{status === 'queued' ? 'Who answers?' : 'Pass it on?'}</h3>
                    <div className="chips" role="radiogroup" aria-label="Target house">
                      {houses.map((h) => (
                        <button
                          key={h._id}
                          role="radio"
                          aria-checked={!openFloor && targetHouse === h._id}
                          className={`hchip ${!openFloor && targetHouse === h._id ? 'on' : ''}`}
                          disabled={openFloor}
                          onClick={() => setTargetHouse(h._id)}
                        >
                          <HouseDot color={h.color} />
                          {h.name}
                        </button>
                      ))}
                    </div>
                    <div className="row">
                      <label className="check on-dark">
                        <input type="checkbox" checked={openFloor} onChange={(e) => setOpenFloor(e.target.checked)} />
                        Open floor (all houses can answer)
                      </label>
                      <label className="inline on-dark">
                        Timer (s)
                        <input
                          type="number"
                          min="5"
                          max="600"
                          value={duration}
                          placeholder={String(s.timer)}
                          onChange={(e) => setDuration(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="row">
                      <button
                        className="btn btn-lamp btn-lg"
                        disabled={busy || controlsLocked || (!openFloor && !targetHouse)}
                        onClick={present}
                      >
                        {openFloor
                          ? 'Open the floor to all houses'
                          : `${status === 'queued' ? 'Present to' : 'Pass to'} ${targetName || '…'} House`}
                      </button>
                      {status === 'queued' && (
                        <button className="btn btn-ghost-dark" disabled={busy || controlsLocked} onClick={returnToPool}>
                          Return to pool
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Live: lock + evaluate */}
                {canEvaluate && (
                  <div className="ctl">
                    <div className="row-between">
                      <h3>Judge the answer</h3>
                      {status === 'active' && (
                        <button className="btn btn-ghost-dark btn-sm" disabled={busy} onClick={lockNow}>
                          Lock answers now
                        </button>
                      )}
                    </div>

                    {state.mode === 'open' ? (
                      <>
                        <p className="muted-on-dark">Open floor. Choose the house that answered.</p>
                        <div className="chips" role="radiogroup" aria-label="House that answered">
                          {houses.map((h) => (
                            <button
                              key={h._id}
                              role="radio"
                              aria-checked={awardHouse === h._id}
                              className={`hchip ${awardHouse === h._id ? 'on' : ''}`}
                              onClick={() => setAwardHouse(h._id)}
                            >
                              <HouseDot color={h.color} />
                              {h.name}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="muted-on-dark">
                        Answering: <b className="on-dark">{state.activeHouse?.name} House</b>
                      </p>
                    )}

                    <label className="inline on-dark">
                      Points override
                      <input
                        type="number"
                        min="0"
                        value={points}
                        placeholder="Default"
                        onChange={(e) => setPoints(e.target.value)}
                      />
                    </label>

                    <div className="row">
                      <button
                        className="btn btn-ok btn-lg"
                        disabled={busy || controlsLocked || needsAward}
                        onClick={() => evaluate('correct')}
                      >
                        Correct +{winPoints}
                      </button>
                      <button
                        className="btn btn-bad btn-lg"
                        disabled={busy || controlsLocked || (penalty > 0 && needsAward)}
                        onClick={() => evaluate('wrong')}
                      >
                        Wrong {penalty > 0 ? `−${penalty}` : '(no penalty)'}
                      </button>
                      <button className="btn btn-ghost-dark btn-lg" disabled={busy || controlsLocked} onClick={() => evaluate('skip')}>
                        No answer
                      </button>
                    </div>
                  </div>
                )}

                {status === 'evaluated' && (
                  <div className="ctl">
                    <button className="btn btn-lamp btn-lg" disabled={busy || controlsLocked} onClick={next}>
                      Next question
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ---------- Right: scores + pool ---------- */}
          <div className="stack-lg">
            <section className="card">
              <h2 className="card-title">Scoreboard</h2>
              <Scoreboard scores={scores} highlightId={state.activeHouse?._id} />
            </section>

            <section className="card">
              <h2 className="card-title">Question pool</h2>
              <div className="filters">
                <input
                  type="search"
                  placeholder="Search questions"
                  aria-label="Search questions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === 'all' ? 'All categories' : c}
                    </option>
                  ))}
                </select>
                <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="available">Not yet asked</option>
                  <option value="asked">Already asked</option>
                  <option value="all">All</option>
                </select>
              </div>

              <div className="pool">
                {pool.length === 0 ? (
                  <p className="empty">No questions match. Change the filters, or ask the Admin to add more.</p>
                ) : (
                  pool.map((item) => (
                    <div key={item._id} className={`pool-item ${item.status}`}>
                      <div className="pool-meta">
                        <Chip>#{item.questionNumber}</Chip>
                        <Chip>{item.category}</Chip>
                        <Chip kind={item.difficulty}>{item.difficulty}</Chip>
                        {item.status === 'queued' && <Chip kind="queued">Queued</Chip>}
                        {item.status === 'asked' && <Chip kind="asked">Asked</Chip>}
                      </div>
                      <p>{item.questionText}</p>
                      <button
                        className="btn btn-ink btn-sm"
                        disabled={busy || poolLocked || item.status !== 'unused'}
                        onClick={() => queue(item)}
                      >
                        {item.status === 'queued' ? 'On stage' : 'Queue'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      <Toast toast={toast} />
    </>
  );
}
