import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useCountdown, useGame } from '../hooks/useGame';
import { Brand, Chip, HouseDot, Scoreboard, TimerRing } from '../components/ui';
import QuestionMedia from '../components/QuestionMedia';

/** Public, read-only stage screen for the projector. Never receives the answer before it is revealed. */
export default function Display() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || '';
  const { state, scores, connected, offset, error } = useGame({ display: true, tenantSlug });
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [tenantListError, setTenantListError] = useState('');

  useEffect(() => {
    api.get('/tenants/public')
      .then(setTenants)
      .catch((fetchError) => setTenantListError(fetchError.message))
      .finally(() => setLoadingTenants(false));
  }, []);

  const selectedTenant = tenants.find((tenant) => tenant.slug === tenantSlug);
  const chooseTenant = (event) => {
    const slug = event.target.value;
    setSearchParams(slug ? { tenant: slug } : {});
  };
  const left = useCountdown(state?.timerEndsAt, state?.status === 'active', offset);

  if (loadingTenants) return <div className="display splash-dark">Loading quizzes…</div>;
  if (tenantListError) return <div className="display splash-dark">{tenantListError}</div>;
  if (!tenantSlug || (!selectedTenant && !loadingTenants)) {
    return (
      <div className="display display-chooser">
        <Brand size="lg" />
        <div className="card display-chooser-card">
          <h1>{tenantSlug ? 'Quiz not available' : 'Choose a quiz'}</h1>
          <p className="muted">{tenantSlug ? 'This quiz may be inactive or the display link may be incorrect.' : 'Select the quiz whose stage display you want to open.'}</p>
          <label className="field">
            <span>Quiz</span>
            <select value="" onChange={chooseTenant}>
              <option value="" disabled>Select a quiz</option>
              {tenants.map((tenant) => <option key={tenant._id} value={tenant.slug}>{tenant.title}</option>)}
            </select>
          </label>
        </div>
      </div>
    );
  }
  if (!state) {
    return <div className="display splash-dark">{error || `Connecting to ${selectedTenant.title}…`}</div>;
  }

  const q = state.question;
  const r = state.result;

  return (
    <div className="display">
      <header className="display-head">
        <Brand size="lg" />
        <div className="display-stage">
        {selectedTenant.title} · {state.stage}
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
