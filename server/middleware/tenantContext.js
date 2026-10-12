const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const storage = new AsyncLocalStorage();

function currentTenantId() {
  return storage.getStore() || null;
}

function runWithTenant(tenantId, callback) {
  return storage.run(tenantId ? String(tenantId) : null, callback);
}

function tenantScoped(schema) {
  if (!schema.path('tenantId')) {
    schema.add({ tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' } });
  }

  const scopeQuery = function () {
    const tenantId = currentTenantId();
    if (!tenantId) return;
    this.where({ tenantId });

    const update = this.getUpdate();
    if (update) {
      if (update.$set) update.$set.tenantId = tenantId;
      else if (Object.keys(update).some((key) => key.startsWith('$'))) update.$set = { ...(update.$set || {}), tenantId };
      else update.tenantId = tenantId;
      this.setUpdate(update);
    }
  };

  for (const operation of [
    'find',
    'findOne',
    'countDocuments',
    'distinct',
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
    'replaceOne',
  ]) {
    schema.pre(operation, scopeQuery);
  }

  schema.pre('aggregate', function () {
    const tenantId = currentTenantId();
    if (tenantId) this.pipeline().unshift({ $match: { tenantId } });
  });

  schema.pre('validate', function () {
    const tenantId = currentTenantId();
    if (tenantId) {
      if (this.tenantId && String(this.tenantId) !== tenantId) {
        this.invalidate('tenantId', 'A record cannot be moved between quizzes.');
      } else {
        this.tenantId = tenantId;
      }
    }
  });

  schema.pre('insertMany', function (next, documents) {
    const tenantId = currentTenantId();
    if (tenantId) documents.forEach((document) => { document.tenantId = tenantId; });
    next();
  });
}

module.exports = { currentTenantId, runWithTenant, tenantScoped };
