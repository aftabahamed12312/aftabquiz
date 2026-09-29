import { useCountdown, useGame } from '../hooks/useGame';
import { Brand, Chip, HouseDot, Scoreboard, TimerRing } from '../components/ui';
import QuestionMedia from '../components/QuestionMedia';

/** Public, read-only stage screen for the projector. Never receives the answer before it is revealed. */
export default function Display() {
  const { state, scores, connected, offset } = useGame({ display: true });
  const left = useCountdown(state?.timerEndsAt, state?.status === 'active', offset);

  if (!state) return <div className="display splash-dark">Connecting…</div>;

  const q = state.question;
  const r = state.result;

  return (
    <div className="display">
      <header className="display-head">
        <Brand size="lg" />
        <div className="display-stage">
          {state.stage}
          {!connected && <span className="display-offline"> · reconnecting</span>}
        </div>
      </header>

      <main className="display-main">
        <section className="display-question">
          {state.paused ? (
            <div className="display-msg">
              <h1>The quiz is paused</h1>
              <p>We will continue in a moment.</p>
            </div>
          ) : q ? (
            <>
              <div className="row">
                <Chip kind="on-dark">{q.category}</Chip>
                <Chip kind={q.difficulty}>{q.difficulty}</Chip>
              </div>
              <p className="display-q-text">{q.questionText}</p>
              <QuestionMedia imageUrl={q.imageUrl} audioUrl={q.audioUrl} />

              <div className="display-foot">
                {state.mode === 'open' ? (
                  <span className="turn">Open to all houses</span>
                ) : (
                  state.activeHouse && (
                    <span className="turn">
                      <HouseDot color={state.activeHouse.color} />
                      {state.activeHouse.name} House
                    </span>
                  )
                )}
                {state.status === 'active' && <TimerRing left={left} total={state.timerDuration} size="xl" />}
                {state.status === 'locked' && <span className="turn turn-muted">Time is up</span>}
              </div>

              {r && (
                <div className={`display-result result-${r.result === 'correct' ? 'correct' : r.result === 'wrong' ? 'wrong' : 'skip'}`}>
                  <div>
                    {r.result === 'correct' && `${r.house?.name} House is correct`}
                    {r.result === 'wrong' && `${r.house ? `${r.house.name} House: not quite` : 'Not quite'}`}
                    {r.result === 'skip' && 'No points this time'}
                    {r.points !== 0 && <b> {r.points > 0 ? '+' : ''}{r.points}</b>}
                  </div>
                  {r.correctAnswer && <div className="display-answer">Answer: <b>{r.correctAnswer}</b></div>}
                </div>
              )}
            </>
          ) : (
            <div className="display-msg">
              <h1>Next question coming up</h1>
              <p>Watch the stage.</p>
            </div>
          )}
        </section>

        <aside className="display-board">
          <h2>Scoreboard</h2>
          <Scoreboard scores={scores} highlightId={state.activeHouse?._id} big />
        </aside>
      </main>
    </div>
  );
}
