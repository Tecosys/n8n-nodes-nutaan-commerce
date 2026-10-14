const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
function loadModule(filename) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'n8n-workflow' ? ({ NodeConnectionTypes: { Main: 'main' }, NodeOperationError: class extends Error { constructor(_node, message) { super(message); } } }) : loadModule(path.resolve(path.dirname(filename), name) + '.ts'), Date, Set, URL, encodeURIComponent });
  return exports;
}
function load(file, name) {
  return new (loadModule(path.join(__dirname, '../nodes', file))[name])();
}
const action = load('NutaanCommerce/NutaanCommerce.node.ts', 'NutaanCommerce');
const trigger = load('NutaanCommerceTrigger/NutaanCommerceTrigger.node.ts', 'NutaanCommerceTrigger');
const base = { getCredentials: async () => ({}), getNode: () => ({}), getInputData: () => [{ json: {} }], continueOnFail: () => false };
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
  const result = await trigger.poll.call({ getCredentials: async () => ({}), getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async () => { calls++; } } });
  assert.equal(result, null); assert.equal(calls, 0); assert.equal(state.store, 'alpha'); assert(state.since);
});
test('poll follows pagination and emits a duplicate event only once', async () => {
  const state = { store: 'alpha', since: '2026-10-14T00:00:00Z', seen: [] }; let calls = 0;
  const context = { ...base, getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async (_credential, options) => { calls++; return calls === 1 ? { data: [{ id: 'one' }], nextCursor: 'next' } : { data: [{ id: 'one' }, { id: 'two' }], nextCursor: null }; } } };
  const result = await trigger.poll.call(context);
  assert.equal(calls, 2); assert.equal(result[0].length, 2);
  context.helpers.httpRequestWithAuthentication = async () => ({ data: [{ id: 'one' }], nextCursor: null });
  assert.equal(await trigger.poll.call(context), null);
});
test('failed later page leaves the checkpoint unchanged', async () => {
  const state = { store: 'alpha', since: '2026-10-14T00:00:00Z', seen: [] }; const before = JSON.stringify(state); let calls = 0;
  await assert.rejects(trigger.poll.call({ ...base, getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', getNode: () => ({}), helpers: { httpRequestWithAuthentication: async () => { if (++calls === 2) throw new Error('timeout'); return { data: [{ id: 'one' }], nextCursor: 'next' }; } } }));
  assert.equal(JSON.stringify(state), before);
});

test('action uses the configured staging API and disables redirects', async () => {
  let request;
  await action.execute.call({ ...base, getCredentials: async () => ({ baseUrl: 'https://staging.example.test/api/commerce/integrations/v1/' }),
    getNodeParameter: () => 'listStores', helpers: { httpRequestWithAuthentication: async (_credential, options) => { request = options; return { stores: [] }; } } });
  assert.equal(request.url, 'https://staging.example.test/api/commerce/integrations/v1/stores');
  assert.equal(request.disableFollowRedirect, true);
});
test('credential authentication validates the host/path before attaching the key', async () => {
  const credential = load('../credentials/NutaanCommerceApi.credentials.ts', 'NutaanCommerceApi');
  const valid = { apiKey: 'dummy', baseUrl: 'https://staging.example.test/api/commerce/integrations/v1' };
  const options = await credential.authenticate(valid, { url: valid.baseUrl + '/me', method: 'GET' });
  assert.equal(options.headers['X-Nutaan-Commerce-Key'], 'dummy'); assert.equal(options.disableFollowRedirect, true);
  for (const baseUrl of ['http://example.test/api/commerce/integrations/v1', 'https://user:password@example.test/api/commerce/integrations/v1', 'https://example.test/other', 'https://example.test/api/commerce/integrations/v1?key=x']) {
    await assert.rejects(credential.authenticate({ ...valid, baseUrl }, { url: '/me' }));
  }
  await assert.rejects(credential.authenticate(valid, { url: 'https://other.example.test/api/commerce/integrations/v1/me' }));
});
test('backlog resumes the saved cursor across polls and preserves the batch start watermark', async () => {
  const state = { store: 'alpha', since: '2026-10-01T00:00:00Z', seen: [] };
  const requests = [];
  const context = { ...base, getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger',
    helpers: { httpRequestWithAuthentication: async (_credential, options) => {
      requests.push(options.qs); const page = options.qs.cursor ? Number(options.qs.cursor) : 0;
      return { data: [{ id: 'event-' + page }], nextCursor: page < 11 ? String(page + 1) : null };
    } } };
  assert.equal((await trigger.poll.call(context))[0].length, 10);
  assert.equal(state.cursor, '10'); assert.equal(state.since, '2026-10-01T00:00:00Z');
  const batchStartedAt = state.batchStartedAt;
  assert.equal((await trigger.poll.call(context))[0].length, 2);
  assert.equal(requests[10].cursor, '10'); assert.equal(requests[10].since, '2026-10-01T00:00:00Z');
  assert.equal(state.cursor, null); assert.equal(state.batchSince, null);
  assert.equal(state.since, new Date(new Date(batchStartedAt).getTime() - 60000).toISOString());
});
test('failed resumed chunk retains the previous cursor and all checkpoints', async () => {
  const state = { store: 'alpha', since: '2026-10-01T00:00:00Z', cursor: '10', batchSince: '2026-10-01T00:00:00Z', batchStartedAt: '2026-10-14T00:00:00Z', seen: ['old'] };
  const before = JSON.stringify(state); let calls = 0;
  await assert.rejects(trigger.poll.call({ ...base, getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger',
    helpers: { httpRequestWithAuthentication: async () => { if (++calls === 2) throw new Error('timeout'); return { data: [{ id: 'new' }], nextCursor: '11' }; } } }));
  assert.equal(JSON.stringify(state), before);
});
test('changing environment discards the old cursor without historical backfill', async () => {
  const state = { store: 'alpha', since: 'old', cursor: '10', seen: ['old'] }; let calls = 0;
  const result = await trigger.poll.call({ ...base, getCredentials: async () => ({ baseUrl: 'https://staging.example.test/api/commerce/integrations/v1' }),
    getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'trigger', helpers: { httpRequestWithAuthentication: async () => { calls++; } } });
  assert.equal(result, null); assert.equal(calls, 0); assert.equal(state.cursor, null); assert.equal(state.seen.length, 0);
});
test('manual samples do not mutate production polling state', async () => {
  const state = { store: 'alpha', since: '2026-10-01T00:00:00Z', cursor: '10', seen: ['old'] }; const before = JSON.stringify(state);
  await trigger.poll.call({ ...base, getNodeParameter: () => 'alpha', getWorkflowStaticData: () => state, getMode: () => 'manual',
    helpers: { httpRequestWithAuthentication: async (_credential, options) => { assert.equal(options.qs.cursor, undefined); return { data: [{ id: 'old' }], nextCursor: null }; } } });
  assert.equal(JSON.stringify(state), before);
});
