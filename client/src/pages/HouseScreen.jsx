import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useCountdown, useGame } from '../hooks/useGame';
import { Brand, Chip, ResultBanner, Scoreboard, StatusPill, TimerRing, Toast, inkOn, useToast } from '../components/ui';
import QuestionMedia from '../components/QuestionMedia';

export default function HouseScreen() {
  const { user, logout } = useAuth();
  const { state, scores, connected, offset, emit } = useGame();
  const { toast, notify } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const status = state?.status;
  const qid = state?.question?._id;
  const left = useCountdown(state?.timerEndsAt, status === 'active', offset);

  // A new question always starts with an empty answer box
  useEffect(() => setText(''), [qid, status === 'active' && state?.activeHouse?._id]);

  const myHouseId = user.house ? String(user.house) : null;
  const myHouse = scores.find((h) => h._id === myHouseId);

  if (!state) return <div className="splash">Connecting to the quiz…</div>;

  const q = state.question;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await emit('house:submit', { text });
      notify('Answer submitted');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  let placeholder = 'Waiting for the Host to open the floor…';
  if (state.canAnswer) placeholder = 'Type your house’s answer';
  else if (state.mySubmission) placeholder = 'Answer submitted';
  else if (status === 'locked' || status === 'evaluated') placeholder = 'Answers are locked';

  return (
    <div className="house-screen" style={{ '--house': myHouse?.color || '#f4a712', '--house-ink': inkOn(myHouse?.color) }}>
      <header className="house-head">
        <Brand />
        <div className="topbar-right">
          <span className={`conn on-dark ${connected ? 'on' : ''}`}>
            <i aria-hidden="true" />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
          <button className="btn btn-ghost-dark btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="house-banner">
        <div>
          <p className="house-label">You are answering for</p>
          <h1>{myHouse ? `${myHouse.name} House` : user.name}</h1>
        </div>
        <div className="house-score">
          <span>{myHouse?.score ?? 0}</span>
          points
        </div>
      </div>

      <main className="house-main">
        {state.paused && <div className="banner banner-warn">The competition is paused. Please wait for the Admin.</div>}

        <section className="house-question">
          <div className="row-between">
            <StatusPill status={status} paused={state.paused} />
            {status === 'active' && q && <TimerRing left={left} total={state.timerDuration} size="lg" />}
          </div>

          {q ? (
            <>
              <div className="row">
                <Chip kind="on-dark">{q.category}</Chip>
                <Chip kind={q.difficulty}>{q.difficulty}</Chip>
              </div>
              <p className="house-q-text">{q.questionText}</p>
              <QuestionMedia imageUrl={q.imageUrl} audioUrl={q.audioUrl} />
            </>
          ) : status === 'active' || status === 'locked' ? (
            <p className="house-wait">
              {state.activeHouse
                ? `The question is live for ${state.activeHouse.name} House. Get ready for your turn.`
                : 'A question is live.'}
            </p>
          ) : (
            <p className="house-wait">
              {status === 'queued' ? 'The Host is getting the next question ready.' : 'Waiting for the next question.'}
            </p>
          )}

          <form onSubmit={submit} className="answer-form">
            <textarea
              rows={3}
              maxLength={500}
              value={state.mySubmission ? state.mySubmission.text : text}
              placeholder={placeholder}
              disabled={!state.canAnswer}
              onChange={(e) => setText(e.target.value)}
              aria-label="Your answer"
            />
            <button className="btn btn-lamp btn-lg" disabled={!state.canAnswer || busy || !text.trim()}>
              {busy ? 'Sending…' : 'Submit answer'}
            </button>
          </form>

          <ResultBanner result={state.result} mineHouseId={myHouseId} />
        </section>

        <section className="house-board">
          <h2>Scoreboard</h2>
          <Scoreboard scores={scores} highlightId={myHouseId} />
        </section>
      </main>
      <Toast toast={toast} />
    </div>
  );
}
