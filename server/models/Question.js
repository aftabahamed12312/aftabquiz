const mongoose = require('mongoose');

// Direct-answer questions (no options). The answer is only a reference for Host/Admin.
const questionSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', default: null },
    questionText: { type: String, required: true, trim: true },
    correctAnswer: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true, default: '' },
    audioUrl: { type: String, trim: true, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    // unused -> queued (Host picked it) -> asked (presented live)
    status: { type: String, enum: ['unused', 'queued', 'asked'], default: 'unused' },
    // Only approved questions can ever reach the Host's pool
    approved: { type: Boolean, default: true },
    askedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
