/**
 * Gyanpunja Quiz - game service
 *
 * Owns the live competition state and enforces the control hierarchy:
 *   Admin (full control)  ->  Host (runs the live flow)  ->  House Leaders (answer)
 *
 * Question lifecycle:
 *   idle -> queued (Host picked it, hidden from houses)
 *        -> active (presented to a house / open floor, timer running)
 *        -> locked (time up or Host stopped it)
 *        -> evaluated (points awarded / deducted, answer revealed)
 *        -> idle (Host moves to the next question)
 */
const GameState = require('../models/GameState');
const Question = require('../models/Question');
const House = require('../models/House');
const ActivityLog = require('../models/ActivityLog');

let io = null;
let lockTimer = null;

const plain = (obj) => JSON.parse(JSON.stringify(obj));
const idOf = (x) => (x ? String(x._id || x) : null);
const isNum = (n) => n !== '' && n !== null && n !== undefined && Number.isFinite(Number(n));
const fail = (msg) => {
  throw new Error(msg);
};

/* ------------------------------------------------------------------ */
/* State loading + per-role views                                       */
/* ------------------------------------------------------------------ */

async function ensureState() {
  await GameState.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });
}

async function loadState() {
  return GameState.findOne({ key: 'main' })
    .populate({ path: 'currentQuestion', populate: { path: 'round' } })
    .populate('activeHouse', 'name color')
    .populate('submissions.house', 'name color')
    .populate('lastResult.house', 'name color');
}

const houseView = (h) => (h ? { _id: idOf(h), name: h.name, color: h.color } : null);

function baseView(s) {
  return {
    stage: s.stage,
    status: s.status,
    paused: s.paused,
    mode: s.mode,
    activeHouse: houseView(s.activeHouse),
    timerEndsAt: s.timerEndsAt,
    timerDuration: s.timerDuration,
    settings: s.settings,
    serverNow: Date.now(), // lets clients correct for clock skew
  };
}

const resultView = (s, answer) =>
  s.status === 'evaluated' && s.lastResult && s.lastResult.result
    ? {
        result: s.lastResult.result,
        points: s.lastResult.points || 0,
        house: houseView(s.lastResult.house),
        correctAnswer: answer,
      }
    : null;

/** Admin + Host: sees everything, including the reference answer. */
function staffView(gs) {
  const s = gs.toObject();
  const q = s.currentQuestion;
  return {
    ...baseView(s),
    question: q || null,
    questionQueue: (s.questionQueue || []).map(idOf),
    submissions: (s.submissions || []).map((x) => ({
      house: houseView(x.house),
      text: x.text,
      submittedAt: x.submittedAt,
    })),
    result: resultView(s, q ? q.correctAnswer : null),
  };
}

/**
 * Stage display (houseId === null) and House Leaders (houseId = their house).
 * The reference answer is never sent until the question has been evaluated.
 * A queued question is never sent to anyone but staff.
 */
function publicView(gs, houseId) {
  const s = gs.toObject();
  const q = s.currentQuestion;
  const isDisplay = houseId === null;
  const live = ['active', 'locked', 'evaluated'].includes(s.status);
  const eligible =
    s.mode === 'open' || (s.activeHouse && idOf(s.activeHouse) === houseId) || false;
  const visible = Boolean(q) && live && (isDisplay || eligible);
  const mine = houseId ? (s.submissions || []).find((x) => idOf(x.house) === houseId) : null;

  return {
    ...baseView(s),
    question: visible
      ? {
          _id: idOf(q),
          category: q.round?.name || q.category,
          questionText: q.questionText,
          difficulty: q.difficulty,
          imageUrl: q.imageUrl,
          audioUrl: q.audioUrl,
        }
      : null,
    canAnswer: !isDisplay && eligible && s.status === 'active' && !mine && !s.paused,
    mySubmission: mine ? { text: mine.text } : null,
    result: resultView(s, visible ? q.correctAnswer : null),
  };
}

/** Initial state for a freshly connected socket. */
async function stateFor(user) {
  const gs = await loadState();
  if (!user) return plain(publicView(gs, null));
  if (user.role === 'admin' || user.role === 'host') return plain(staffView(gs));
  return plain(publicView(gs, idOf(user.house)));
}

/** Push the latest state to every connected screen, each getting its own view. */
async function pushState() {
  if (!io) return;
  const gs = await loadState();
  io.to('staff').emit('state', plain(staffView(gs)));
  io.to('display').emit('state', plain(publicView(gs, null)));
  for (const room of io.sockets.adapter.rooms.keys()) {
    if (room.startsWith('house:')) {
      io.to(room).emit('state', plain(publicView(gs, room.slice(6))));
    }
  }
}

async function pushScores() {
  if (!io) return;
  const houses = await House.find().sort({ score: -1, name: 1 });
  io.emit('scores', plain(houses.map((h) => ({ _id: h._id, name: h.name, color: h.color, score: h.score }))));
}

async function scoresPayload() {
  const houses = await House.find().sort({ score: -1, name: 1 });
  return plain(houses.map((h) => ({ _id: h._id, name: h.name, color: h.color, score: h.score })));
}

async function log(actor, action, detail = '') {
  const entry = await ActivityLog.create({
    actor: actor ? actor.name : 'System',
    role: actor ? actor.role : 'system',
    action,
    detail,
  });
  if (io) io.to('admin').emit('log', plain(entry));
}

/* ------------------------------------------------------------------ */
/* Timer                                                                */
/* ------------------------------------------------------------------ */

function scheduleLock(endsAt) {
  clearTimeout(lockTimer);
  const ms = new Date(endsAt).getTime() - Date.now();
  lockTimer = setTimeout(lockIfExpired, Math.max(ms, 0) + 50);
}

async function lockIfExpired() {
  const res = await GameState.updateOne(
    { key: 'main', status: 'active', timerEndsAt: { $lte: new Date() } },
    { $set: { status: 'locked' } }
  );
  if (res.modifiedCount) await pushState();
}

/* ------------------------------------------------------------------ */
/* Actions (Host + Admin)                                               */
/* ------------------------------------------------------------------ */

async function getRaw() {
  await ensureState();
  return GameState.findOne({ key: 'main' });
}

function guardPaused(actor, gs) {
  if (gs.paused && actor.role !== 'admin') {
    fail('The competition is paused by the Admin.');
  }
}

async function queueQuestion(actor, { questionId }) {
  const gs = await getRaw();
  guardPaused(actor, gs);
  if (['active', 'locked'].includes(gs.status)) {
    fail('Finish the current question first (evaluate it, then go to the next one).');
  }
  const q = await Question.findById(questionId);
  if (!q) fail('Question not found.');
  if (!q.approved) fail('This question has not been approved by the Admin.');
  if (q.status === 'asked') fail('This question has already been asked.');

  // Release any question that was queued earlier
  if (gs.currentQuestion && gs.status === 'queued') {
    await Question.updateOne({ _id: gs.currentQuestion, status: 'queued' }, { status: 'unused' });
  }
  gs.questionQueue = (gs.questionQueue || []).filter((queuedId) => idOf(queuedId) !== idOf(q._id));

  q.status = 'queued';
  await q.save();

  gs.currentQuestion = q._id;
  gs.status = 'queued';
  gs.activeHouse = null;
  gs.submissions = [];
  gs.set('lastResult', undefined);
  await gs.save();

  await log(actor, 'question_queued', `[${q.category}] ${q.questionText}`);
  await pushState();
}

async function queueBatch(actor, { questionIds } = {}) {
  const gs = await getRaw();
  guardPaused(actor, gs);
  if (!Array.isArray(questionIds) || !questionIds.length) fail('Select at least one question to queue.');

  const pending = gs.questionQueue || [];
  const alreadyQueued = new Set([...pending.map(idOf), idOf(gs.currentQuestion)]);
  const ids = [...new Set(questionIds.map(String))].filter((id) => !alreadyQueued.has(id));
  if (!ids.length) fail('Those questions are already in the queue.');
  if (ids.length > 100) fail('Queue up to 100 questions at a time.');

  const available = await Question.find({ _id: { $in: ids }, approved: true, status: 'unused' });
  if (available.length !== ids.length) fail('Some selected questions are unavailable or already queued. Refresh the pool and try again.');
  const byId = new Map(available.map((question) => [idOf(question), question]));
  gs.questionQueue = [...pending, ...ids.map((id) => byId.get(id)._id)];

  if (!gs.currentQuestion && gs.status === 'idle') {
    await advanceQuestionQueue(gs);
  } else {
    await gs.save();
  }

  await log(actor, 'questions_queued', `${ids.length} questions added to the queue`);
  await pushState();
}

async function advanceQuestionQueue(gs) {
  const remaining = [...(gs.questionQueue || [])];
  let nextQuestion = null;

  while (remaining.length && !nextQuestion) {
    const questionId = remaining.shift();
    nextQuestion = await Question.findOne({ _id: questionId, approved: true, status: 'unused' });
  }

  gs.questionQueue = remaining;
  gs.currentQuestion = nextQuestion ? nextQuestion._id : null;
  gs.status = nextQuestion ? 'queued' : 'idle';
  gs.activeHouse = null;
  gs.timerEndsAt = null;
  gs.submissions = [];
  gs.set('lastResult', undefined);

  if (nextQuestion) {
    nextQuestion.status = 'queued';
    await nextQuestion.save();
  }
  await gs.save();
}

/** Drop the current question (queued -> back to pool, or after evaluation -> idle). */
async function clearQuestion(actor) {
  const gs = await getRaw();
  if (gs.status === 'active') fail('A question is live. Lock it or evaluate it first.');
  if (gs.currentQuestion && gs.status === 'queued') {
    await Question.updateOne({ _id: gs.currentQuestion, status: 'queued' }, { status: 'unused' });
  }
  clearTimeout(lockTimer);
  await advanceQuestionQueue(gs);
  await log(actor, gs.currentQuestion ? 'question_queued' : 'question_cleared');
  await pushState();
}

async function present(actor, { mode = 'house', houseId, duration } = {}) {
  const gs = await getRaw();
  guardPaused(actor, gs);
  if (!gs.currentQuestion || !['queued', 'locked', 'evaluated'].includes(gs.status)) {
    fail('Queue a question first.');
  }
  if (!['house', 'open'].includes(mode)) fail('Unknown mode.');

  let house = null;
  if (mode === 'house') {
    if (!houseId) fail('Choose the house that will answer.');
    house = await House.findById(houseId);
    if (!house) fail('House not found.');
  }

  const secs = isNum(duration) ? Math.min(Math.max(Number(duration), 5), 600) : gs.settings.timer;

  gs.mode = mode;
  gs.activeHouse = house ? house._id : null;
  gs.status = 'active';
  gs.timerDuration = secs;
  gs.timerEndsAt = new Date(Date.now() + secs * 1000);
  gs.submissions = [];
  gs.set('lastResult', undefined);
  await gs.save();

  await Question.updateOne({ _id: gs.currentQuestion }, { status: 'asked', askedAt: new Date() });
  scheduleLock(gs.timerEndsAt);

  await log(actor, 'question_presented', house ? `To ${house.name} (${secs}s)` : `Open floor (${secs}s)`);
  await pushState();
}

async function lock(actor) {
  const gs = await getRaw();
  if (gs.status !== 'active') fail('There is no live question to lock.');
  clearTimeout(lockTimer);
  gs.status = 'locked';
  gs.timerEndsAt = new Date();
  await gs.save();
  await log(actor, 'question_locked');
  await pushState();
}

async function evaluate(actor, { result, houseId, points } = {}) {
  const gs = await getRaw();
  guardPaused(actor, gs);
  if (!['active', 'locked'].includes(gs.status)) fail('There is no question to evaluate.');
  if (!['correct', 'wrong', 'skip'].includes(result)) fail('Unknown result.');

  const q = await Question.findById(gs.currentQuestion);
  if (!q) fail('The current question no longer exists.');
  const targetHouseId = houseId || (gs.mode === 'house' ? gs.activeHouse : null);

  let delta = 0;
  if (result === 'correct') {
    if (!targetHouseId) fail('Choose which house answered correctly.');
    delta = isNum(points) ? Math.abs(Number(points)) : gs.settings.points[q.difficulty] || 0;
  } else if (result === 'wrong') {
    delta = -Math.abs(isNum(points) ? Number(points) : gs.settings.negativeMarking || 0);
    if (delta !== 0 && !targetHouseId) fail('Choose which house answered wrongly.');
  }

  let house = null;
  if (targetHouseId) {
    house = await House.findById(targetHouseId);
    if (!house) fail('House not found.');
    if (delta) await House.updateOne({ _id: house._id }, { $inc: { score: delta } });
  }

  clearTimeout(lockTimer);
  gs.status = 'evaluated';
  gs.timerEndsAt = new Date();
  gs.lastResult = { result, house: house ? house._id : null, points: delta };
  await gs.save();

  const who = house ? house.name : 'no house';
  await log(actor, 'answer_evaluated', `${result} - ${who}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`);
  await pushState();
  await pushScores();
}

/* ------------------------------------------------------------------ */
/* House Leader                                                         */
/* ------------------------------------------------------------------ */

async function submitAnswer(user, { text } = {}) {
  if (!user.house) fail('Your account is not linked to a house.');
  const answer = String(text || '').trim().slice(0, 500);
  if (!answer) fail('Type an answer before submitting.');

  const gs = await getRaw();
  if (gs.paused) fail('The competition is paused.');
  if (gs.status !== 'active' || !gs.timerEndsAt || gs.timerEndsAt.getTime() <= Date.now()) {
    fail('Time is up. Answers are locked.');
  }
  if (gs.mode === 'house' && idOf(gs.activeHouse) !== idOf(user.house)) {
    fail('This question is not for your house.');
  }

  // Atomic: only accepts one answer per house, and only while the timer is running.
  const res = await GameState.updateOne(
    {
      key: 'main',
      status: 'active',
      timerEndsAt: { $gt: new Date() },
      'submissions.house': { $ne: user.house },
    },
    { $push: { submissions: { house: user.house, text: answer, submittedAt: new Date() } } }
  );
  if (!res.modifiedCount) fail('Your answer was already submitted, or time is up.');

  await log(user, 'answer_submitted', answer);
  await pushState();
}

/* ------------------------------------------------------------------ */
/* Admin actions                                                        */
/* ------------------------------------------------------------------ */

async function setPaused(actor, paused) {
  const gs = await getRaw();
  gs.paused = Boolean(paused);
  // Pausing during a live question freezes it (Host can re-present it after resuming).
  if (gs.paused && gs.status === 'active') {
    clearTimeout(lockTimer);
    gs.status = 'locked';
    gs.timerEndsAt = new Date();
  }
  await gs.save();
  await log(actor, gs.paused ? 'competition_paused' : 'competition_resumed');
  await pushState();
}

async function updateSettings(actor, body = {}) {
  const gs = await getRaw();
  if (typeof body.stage === 'string' && body.stage.trim()) gs.stage = body.stage.trim().slice(0, 40);
  if (isNum(body.timer)) gs.settings.timer = Math.min(Math.max(Number(body.timer), 5), 600);
  if (isNum(body.negativeMarking)) gs.settings.negativeMarking = Math.max(Number(body.negativeMarking), 0);
  for (const level of ['easy', 'medium', 'hard']) {
    if (body.points && isNum(body.points[level])) gs.settings.points[level] = Math.max(Number(body.points[level]), 0);
  }
  await gs.save();
  await log(actor, 'settings_updated', `Stage: ${gs.stage}`);
  await pushState();
}

async function resetGame(actor, { scores = false, questions = false } = {}) {
  const gs = await getRaw();
  clearTimeout(lockTimer);
  gs.status = 'idle';
  gs.paused = false;
  gs.mode = 'house';
  gs.currentQuestion = null;
  gs.questionQueue = [];
  gs.activeHouse = null;
  gs.timerEndsAt = null;
  gs.submissions = [];
  gs.set('lastResult', undefined);
  await gs.save();

  // A queued question always goes back to the pool
  await Question.updateMany({ status: 'queued' }, { status: 'unused' });
  if (questions) await Question.updateMany({}, { status: 'unused', askedAt: null });
  if (scores) await House.updateMany({}, { score: 0 });

  await log(actor, 'game_reset', `scores: ${scores ? 'reset' : 'kept'}, questions: ${questions ? 'reset' : 'kept'}`);
  await pushState();
  await pushScores();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

async function init(ioServer) {
  io = ioServer;
  await ensureState();
  // Recover the timer if the server restarted mid-question
  const gs = await GameState.findOne({ key: 'main' });
  if (gs.status === 'active' && gs.timerEndsAt) scheduleLock(gs.timerEndsAt);
}

module.exports = {
  init,
  stateFor,
  scoresPayload,
  pushState,
  pushScores,
  log,
  queueQuestion,
  queueBatch,
  clearQuestion,
  present,
  lock,
  evaluate,
  submitAnswer,
  setPaused,
  updateSettings,
  resetGame,
  loadState,
  staffView,
  publicView,
  plain,
};
