const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tenant', tenantSchema);
