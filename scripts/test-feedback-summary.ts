import assert from 'node:assert/strict';
import { evaluationSummary } from '../src/components/feedback/evaluationSummary';
import type { Evaluation } from '../src/types';

const evaluation = {
  callDescription: 'El cliente consultó por cobertura.\nSe verificó su zona.',
  comments: '',
  items: [{ criterionId: 'tc_mov_22', attribute: 'Escucha activa', finding: 'No profundizó en la necesidad.' }],
  qualityForm: { fields: { '33': '02:15: faltó informar las condiciones.' }, comments: { '22': 'No profundizó en la necesidad.', '23': 'No ofreció Movistar Total.' } },
} as unknown as Evaluation;
const summary = evaluationSummary(evaluation);
assert.match(summary.description, /Se verificó su zona/);
assert.equal(summary.comments, '');
assert.deepEqual(summary.findings.map(item => item.text), ['No profundizó en la necesidad.', 'No ofreció Movistar Total.', '02:15: faltó informar las condiciones.']);
console.log('Resumen de evaluación: descripción y comentarios por criterio OK');
