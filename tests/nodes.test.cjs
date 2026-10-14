const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
function load(file, name) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../nodes', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({ NodeConnectionTypes: { Main: 'main' }, NodeOperationError: class extends Error { constructor(_node, message) { super(message); } } }), Date, Set, encodeURIComponent });
  return new exports[name]();
}
const action = load('NutaanCommerce/NutaanCommerce.node.ts', 'NutaanCommerce');
const trigger = load('NutaanCommerceTrigger/NutaanCommerceTrigger.node.ts', 'NutaanCommerceTrigger');
const base = { getNode: () => ({}), getInputData: () => [{ json: {} }], continueOnFail: () => false };
test('contact is disabled until explicitly authorized, with no HTTP request', async () => {
  let calls = 0;
  await assert.rejects(action.execute.call({ ...base, getNodeParameter: name => ({ operation: 'contactCod', store: 'alpha', verificationId: 'x', confirmed: false }[name]), helpers: { httpRequestWithAuthentication: async () => { calls++; } } }));
  assert.equal(calls, 0);
});
test('contact sends only supported body fields and preserves revision', async () => {
  let request;
  const result = await action.execute.call({ ...base, getNodeParameter: name => ({ operation: 'contactCod', store: 'alpha', verificationId: '123', confirmed: true, revision: 7, channel: 'email' }[name]), helpers: { httpRequestWithAuthentication: async function (credential, options) { assert.equal(credential, 'nutaanCommerceApi'); request = options; return { actionId: 'test' }; } } });
  assert.equal(request.method, 'POST'); assert.equal(request.body.revision, 7); assert.equal(request.body.confirmed, true);
  assert.deepEqual(Object.keys(request.body).sort(), ['channel', 'confirmed', 'revision']); assert.equal(result[0][0].json.actionId, 'test');
});
test('provider errors never expose credentials or request headers', async () => {
  const result = await action.execute.call({ ...base, continueOnFail: () => true, getNodeParameter: () => 'listStores', helpers: { httpRequestWithAuthentication: async () => { throw new Error('secret-api-key'); } } });
  assert(!JSON.stringify(result).includes('secret-api-key'));
});
test('first production poll starts from activation without historical backfill', async () => {
  const state = {}; let calls = 0;
  const result = await trigger.poll.call({ getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async () => { calls++; } } });
  assert.equal(result, null); assert.equal(calls, 0); assert.equal(state.store, 'alpha'); assert(state.since);
});
test('poll follows pagination and emits a duplicate event only once', async () => {
  const state = { store: 'alpha', since: '2026-10-14T00:00:00Z', seen: [] }; let calls = 0;
  const context = { getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async (_credential, options) => { calls++; return calls === 1 ? { data: [{ id: 'one' }], nextCursor: 'next' } : { data: [{ id: 'one' }, { id: 'two' }], nextCursor: null }; } } };
  const result = await trigger.poll.call(context);
  assert.equal(calls, 2); assert.equal(result[0].length, 2);
  context.helpers.httpRequestWithAuthentication = async () => ({ data: [{ id: 'one' }], nextCursor: null });
  assert.equal(await trigger.poll.call(context), null);
});
test('failed later page leaves the checkpoint unchanged', async () => {
  const state = { store: 'alpha', since: '2026-10-14T00:00:00Z', seen: [] }; const before = JSON.stringify(state); let calls = 0;
  await assert.rejects(trigger.poll.call({ getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async () => { if (++calls === 2) throw new Error('timeout'); return { data: [{ id: 'one' }], nextCursor: 'next' }; } } }));
  assert.equal(JSON.stringify(state), before);
});
