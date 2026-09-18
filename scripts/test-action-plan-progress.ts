import assert from 'node:assert/strict';
import type { ActionPlan, Advisor } from '../src/types';
import { actionPlanProgress } from '../src/components/actionplans/actionPlanProgress';

const plan = { advisorId: 'a', advisorIds: ['a', 'b', 'c', 'd'], advisorMetrics: [
  { advisorId: 'a', sphInitial: 0.38, sphRetraining: 0.42, sphUpdated: 0.4, observations: '' },
  { advisorId: 'b', sphInitial: 0.42, sphRetraining: null, sphUpdated: 0.54, observations: '' },
  { advisorId: 'c', sphInitial: 0, sphRetraining: 0, sphUpdated: null, observations: '' },
] } as ActionPlan;
const advisors = [
  { id: 'a', status: 'ACTIVO' },
  { id: 'b', status: 'INACTIVO' },
  { id: 'c', status: 'EN_CAPACITACION' },
] as Advisor[];
const group = actionPlanProgress(plan, advisors);
assert.deepEqual(group.trend, [
  { stage: 'Inicial', sph: 0.27, count: 3 },
  { stage: 'Reentrenamiento', sph: 0.21, count: 2 },
  { stage: 'Actual', sph: 0.47, count: 2 },
]);
assert.deepEqual(group.status, { active: 2, ceased: 1, missing: 1 });
const individual = actionPlanProgress(plan, advisors, 'b');
assert.deepEqual(individual.trend.map(item => item.sph), [0.42, null, 0.54]);
assert.deepEqual(individual.status, { active: 0, ceased: 1, missing: 0 });
console.log('Avance PDA: promedios, datos faltantes, cero válido y filtro por asesor correctos.');
