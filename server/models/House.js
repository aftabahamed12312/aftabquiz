const mongoose = require('mongoose');

const houseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. Ruby, Sapphire
    color: { type: String, default: '#f4a712' }, // used on every screen for this house
    score: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('House', houseSchema);
