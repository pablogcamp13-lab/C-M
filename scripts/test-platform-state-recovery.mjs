import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { mergeEvaluationSources, readPlatformStateRows } from '../server/platformStateRecovery.ts';

const history = Array.from({ length: 70 }, (_, i) => ({ id: 'evaluation_' + i, scoreTotal: i }));
const merged = mergeEvaluationSources([{ ...history[0], scoreTotal: 99 }], history);
assert.equal(merged.length, 70, 'A small remote result must not hide the local history');
assert.equal(merged[0].scoreTotal, 99, 'The authoritative source wins by ID');
assert.equal(mergeEvaluationSources([{ id: 'a', callId: 'same' }, { id: 'b', callId: 'same' }]).length, 2);
const payload = JSON.stringify({ evaluations: history });
const rows = [
  { id: 'global_0000', payload_json: payload.slice(0, 100), updated_at: 'one' },
  { id: 'global_0001', payload_json: payload.slice(100), updated_at: 'one' }
];
assert.equal(readPlatformStateRows([...rows].reverse()).evaluations.length, 70);
assert.throws(() => readPlatformStateRows([rows[0]]), 'Truncated JSON cannot turn into an empty state');
assert.throws(() => readPlatformStateRows([rows[1]]), 'A missing first chunk must be reported');
assert.throws(() => readPlatformStateRows([rows[0], { ...rows[1], updated_at: 'two' }]));
assert.throws(() => readPlatformStateRows([rows[0], rows[0], rows[1]]));
assert.equal(readPlatformStateRows([{ id: 'global', payload_json: payload }]).evaluations.length, 70);
assert.equal(readPlatformStateRows([]), null);
assert.throws(() => mergeEvaluationSources([{}]));
console.log('OK: merge of 70 historical evaluations, identity preservation, legacy format and corrupt-chunk protection.');

// Exercise the actual GET route with isolated sources, without starting the server.
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("  app.get('/api/platform-state'"), server.indexOf("  app.put('/api/platform-state'"));
let handler;
const source = { loadPlatformState: async () => ({ evaluations: history.slice(1, 3) }), loadEvaluations: async () => history.slice(0, 1), enabled: true };
const db = { prepare(sql) {
  assert.ok(sql.startsWith('SELECT'), 'Reading history must not mutate the database');
  return { get: () => ({ payload_json: JSON.stringify({ evaluations: history.slice(3, 10) }) }), all: () => history.slice(10).map(e => ({ payload_json: JSON.stringify(e) })) };
} };
const compiled = ts.transpileModule(route, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('app', 'requireAuth', 'readRepository', 'googleStorage', 'db', 'mergeEvaluationSources', 'correctMigracionesQualityEvaluation', 'console', 'lastCompletePlatformState', compiled)(
  { get: (_path, _auth, callback) => { handler = callback; } }, () => {}, async () => ({ advisors: [], campaigns: [] }),
  source, db, mergeEvaluationSources, evaluation => evaluation, { log() {}, error() {}, warn() {} }, null
);
function response() { return { statusCode: 200, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } }; }
let res = response();
await handler({ authUser: { id: 'admin', role: 'ADMINISTRADOR' } }, res);
assert.equal(res.body.state.evaluations.length, 70, 'GET must consolidate all four stores');
source.loadPlatformState = async () => { throw new Error('Incomplete chunks'); };
res = response();
await handler({ authUser: { id: 'admin', role: 'ADMINISTRADOR' } }, res);
assert.equal(res.statusCode, 200, 'A transient remote failure must return the last complete state, never an empty dashboard');
assert.equal(res.body.state.evaluations.length, 70);
assert.equal(res.body.source, 'LAST_COMPLETE_CACHE');
console.log('OK: actual GET route consolidates stores and falls back only to the last complete state.');
