import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/googleStorage.ts', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('async saveEvaluation'), source.indexOf('async loadEvaluations'));
assert.match(method, /values\.append/);
assert.match(method, /values\.update/);
assert.doesNotMatch(method, /this\.replace|values\.clear/);
assert.match(source, /if \(name === 'EVALUATIONS'\) throw/);
assert.match(source, /Limpieza de datos operativos deshabilitada/);
console.log('PASS: EVALUATIONS uses row append/update; full replacement and runtime clearing are blocked.');
