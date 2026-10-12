const mongoose = require('mongoose');
const { tenantScoped } = require('../middleware/tenantContext');

const roundSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true, lowercase: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

roundSchema.plugin(tenantScoped);
roundSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model('Round', roundSchema);
