import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/googleStorage.ts', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('async saveEvaluation'), source.indexOf('async loadEvaluations'));
assert.match(method, /values\.append/);
assert.match(method, /values\.update/);
assert.doesNotMatch(method, /this\.replace|values\.clear/);
assert.match(source, /if \(name === 'EVALUATIONS'\) throw/);
assert.match(source, /async deleteEvaluation\(id: string\)/);
assert.match(source, /clearRowsByValue\('EVALUATIONS', 'A', id\)/);
assert.match(source, /clearRowsByValue\('FEEDBACKS', 'B', id\)/);
assert.match(source, /Limpieza de datos operativos deshabilitada/);
console.log('PASS: EVALUATIONS uses row-level create, update and delete; full replacement remains blocked.');
