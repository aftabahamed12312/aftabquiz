const mongoose = require('mongoose');
const { tenantScoped } = require('../middleware/tenantContext');

const houseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. Ruby, Sapphire
    color: { type: String, default: '#f4a712' }, // used on every screen for this house
    score: { type: Number, default: 0 },
  },
  { timestamps: true }
);

houseSchema.plugin(tenantScoped);
houseSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('House', houseSchema);
