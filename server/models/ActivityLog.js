const mongoose = require('mongoose');
const { tenantScoped } = require('../middleware/tenantContext');

const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: String, required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    detail: { type: String, default: '' },
  },
  { timestamps: true }
);

activityLogSchema.plugin(tenantScoped);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
