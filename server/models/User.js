const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { tenantScoped } = require('../middleware/tenantContext');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['super_admin', 'admin', 'host', 'house_leader'], required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    tokenVersion: { type: Number, default: 0 },
    // Only used by house leaders
    house: { type: mongoose.Schema.Types.ObjectId, ref: 'House', default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.plugin(tenantScoped);

userSchema.pre('validate', function () {
  if (this.role !== 'super_admin' && !this.tenantId) {
    this.invalidate('tenantId', 'Tenant is required for quiz accounts.');
  }
  if (this.role === 'super_admin' && this.tenantId) {
    this.invalidate('tenantId', 'Super Admin accounts cannot belong to a quiz.');
  }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
