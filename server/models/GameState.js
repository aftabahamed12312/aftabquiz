const mongoose = require('mongoose');

const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, default: null });

// Singleton document (key = 'main') holding the live state of the competition.
const gameStateSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  stage: { type: String, default: 'Warm-up' },
  // idle -> queued -> active -> (locked) -> evaluated
  status: { type: String, enum: ['idle', 'queued', 'active', 'locked', 'evaluated'], default: 'idle' },
  paused: { type: Boolean, default: false }, // Admin kill-switch
  mode: { type: String, enum: ['house', 'open'], default: 'house' },
  currentQuestion: ref('Question'),
  questionQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  activeHouse: ref('House'),
  timerDuration: { type: Number, default: 30 },
  timerEndsAt: { type: Date, default: null },
  submissions: [
    {
      house: ref('House'),
      text: String,
      submittedAt: { type: Date, default: Date.now },
      _id: false,
    },
  ],
  lastResult: {
    result: String, // correct | wrong | skip
    house: ref('House'),
    points: Number,
  },
  settings: {
    timer: { type: Number, default: 30 },
    negativeMarking: { type: Number, default: 0 },
    points: {
      easy: { type: Number, default: 10 },
      medium: { type: Number, default: 20 },
      hard: { type: Number, default: 30 },
    },
  },
});

module.exports = mongoose.model('GameState', gameStateSchema);
