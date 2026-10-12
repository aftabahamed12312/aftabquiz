const assert = require('assert');
const mongoose = require('mongoose');
const { runWithTenant, tenantScoped } = require('../middleware/tenantContext');

const schema = new mongoose.Schema({ value: String });
schema.plugin(tenantScoped);
const Probe = mongoose.model('TenantContextProbe', schema);
assert(schema.path('tenantId'), 'tenantScoped adds the tenantId schema path');

async function run() {
  const tenantId = '507f1f77bcf86cd799439011';
  let observedFilter;
  let observedUpdate;
  let observedPipeline;
  let observedDocuments;
  Probe.collection.find = (filter) => {
    observedFilter = filter;
    return { toArray: async () => [] };
  };
  Probe.collection.updateOne = async (filter, update) => {
    observedFilter = filter;
    observedUpdate = update;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };
  Probe.collection.aggregate = (pipeline) => {
    observedPipeline = pipeline;
    return { toArray: async () => [] };
  };
  Probe.collection.insertMany = async (documents) => {
    observedDocuments = documents;
    return { acknowledged: true, insertedCount: documents.length, insertedIds: {} };
  };

  await runWithTenant(tenantId, () => Probe.find({ value: 'quiz data' }).exec());
  assert.equal(String(observedFilter.tenantId), tenantId);

  await runWithTenant(tenantId, () =>
    Probe.updateOne({ value: 'old' }, { $set: { value: 'new' } }).exec()
  );
  assert.equal(String(observedFilter.tenantId), tenantId);
  assert.equal(String(observedUpdate.$set.tenantId), tenantId);

  await runWithTenant(tenantId, () => Probe.aggregate([{ $count: 'records' }]).exec());
  assert.equal(String(observedPipeline[0].$match.tenantId), tenantId);

  await runWithTenant(tenantId, () => Probe.insertMany([{ value: 'bulk record' }]));
  assert.equal(String(observedDocuments[0].tenantId), tenantId);

  const document = new Probe({ value: 'new record' });
  await runWithTenant(tenantId, () => document.validate());
  assert.equal(String(document.tenantId), tenantId);

  const foreignDocument = new Probe({ tenantId: '507f191e810c19729de860ea', value: 'foreign' });
  await assert.rejects(
    runWithTenant(tenantId, () => foreignDocument.validate()),
    /cannot be moved between quizzes/i
  );

  console.log('tenant query and write scoping tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
