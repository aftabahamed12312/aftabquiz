// Verifies that each role only ever receives what it is allowed to see (no database needed).
const Module = require('module');
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req.includes('/models/')) return {};
  return orig.call(this, req, ...a);
};
const path = require('path');
const g = require(path.join(__dirname, '..', 'services', 'game.js'));
const assert = require('assert');

const H1 = { _id: 'h1', name: 'Ruby', color: '#d00' };
const mk = (o) => ({ toObject: () => ({
  stage: 'R1', status: 'idle', paused: false, mode: 'house', activeHouse: null, timerEndsAt: null,
  timerDuration: 30, settings: {}, submissions: [], lastResult: {}, currentQuestion: null, ...o }) });
const Q = { _id: 'q1', category: 'Sci', questionText: 'Q?', correctAnswer: 'SECRET', difficulty: 'easy', imageUrl: '/uploads/q.png', audioUrl: '/uploads/q.mp3' };

// queued: nobody but staff sees the question
let gs = mk({ status: 'queued', currentQuestion: Q });
assert.equal(g.publicView(gs, 'h1').question, null);
assert.equal(g.publicView(gs, null).question, null);
assert.equal(g.staffView(gs).question.correctAnswer, 'SECRET');

// active for house h1: target house + display see it, other house does not; no answer leaks
gs = mk({ status: 'active', mode: 'house', activeHouse: H1, currentQuestion: Q, timerEndsAt: new Date(Date.now()+30000) });
let v = g.publicView(gs, 'h1');
assert.equal(v.question.questionText, 'Q?'); assert.equal(v.canAnswer, true);
assert.equal(v.question.imageUrl, '/uploads/q.png'); assert.equal(v.question.audioUrl, '/uploads/q.mp3');
assert.ok(!JSON.stringify(v).includes('SECRET'));
v = g.publicView(gs, 'h2'); assert.equal(v.question, null); assert.equal(v.canAnswer, false);
v = g.publicView(gs, null); assert.equal(v.question.questionText, 'Q?'); assert.equal(v.canAnswer, false);
assert.ok(!JSON.stringify(g.publicView(gs, null)).includes('SECRET'));

// already submitted -> cannot answer again
gs = mk({ status: 'active', mode: 'house', activeHouse: H1, currentQuestion: Q, submissions: [{ house: H1, text: 'x' }] });
v = g.publicView(gs, 'h1'); assert.equal(v.canAnswer, false); assert.equal(v.mySubmission.text, 'x');

// open floor: everyone sees + can answer
gs = mk({ status: 'active', mode: 'open', currentQuestion: Q });
assert.equal(g.publicView(gs, 'h2').canAnswer, true);
assert.equal(g.publicView(gs, 'h2').question.questionText, 'Q?');

// paused blocks answering
gs = mk({ status: 'active', mode: 'open', paused: true, currentQuestion: Q });
assert.equal(g.publicView(gs, 'h2').canAnswer, false);

// evaluated: answer revealed only to those who could see the question
gs = mk({ status: 'evaluated', mode: 'house', activeHouse: H1, currentQuestion: Q, lastResult: { result: 'correct', points: 10, house: H1 } });
assert.equal(g.publicView(gs, 'h1').result.correctAnswer, 'SECRET');
assert.equal(g.publicView(gs, null).result.correctAnswer, 'SECRET');
assert.equal(g.publicView(gs, 'h2').result.correctAnswer, null);
console.log('all view-filtering tests passed');
