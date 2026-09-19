import assert from 'node:assert/strict';
import type { ActionPlan, Advisor } from '../src/types';
import { actionPlanProgress } from '../src/components/actionplans/actionPlanProgress';
import { applySharedMetricDate, inheritedMetricDates, sharedMetricDate } from '../src/components/actionplans/actionPlanMetricDates';

const plan = { advisorId: 'a', advisorIds: ['a', 'b', 'c', 'd'], advisorMetrics: [
  { advisorId: 'a', sphInitial: 0.38, sphInitialDate: '2026-09-01', sphRetraining: 0.42, sphRetrainingDate: '2026-09-10', sphUpdated: 0.4, sphUpdatedDate: '2026-09-18', observations: 'Reforzar cierre comercial.' },
  { advisorId: 'b', sphInitial: 0.42, sphInitialDate: '2026-09-03', sphRetraining: null, sphUpdated: 0.54, sphUpdatedDate: '2026-09-19', observations: 'Mejoró después del seguimiento.' },
  { advisorId: 'c', sphInitial: 0, sphRetraining: 0, sphUpdated: null, observations: '' },
] } as ActionPlan;
const advisors = [
  { id: 'a', status: 'ACTIVO' },
  { id: 'b', status: 'INACTIVO' },
  { id: 'c', status: 'EN_CAPACITACION' },
] as Advisor[];
const group = actionPlanProgress(plan, advisors);
assert.deepEqual(group.trend, [
  { stage: 'Inicial', sph: 0.27, count: 3, dateFrom: '2026-09-01', dateTo: '2026-09-03', datedCount: 2 },
  { stage: 'Reentrenamiento', sph: 0.21, count: 2, dateFrom: '2026-09-10', dateTo: '2026-09-10', datedCount: 1 },
  { stage: 'Actual', sph: 0.47, count: 2, dateFrom: '2026-09-18', dateTo: '2026-09-19', datedCount: 2 },
]);
assert.deepEqual(group.status, { active: 2, ceased: 1, missing: 1 });
assert.deepEqual(group.observations.map(item => item.text), ['Reforzar cierre comercial.', 'Mejoró después del seguimiento.', 'Sin observación registrada.', 'Sin observación registrada.']);
const individual = actionPlanProgress(plan, advisors, 'b');
assert.deepEqual(individual.trend.map(item => item.sph), [0.42, null, 0.54]);
assert.deepEqual(individual.trend.map(item => item.dateFrom), ['2026-09-03', null, '2026-09-19']);
assert.deepEqual(individual.status, { active: 0, ceased: 1, missing: 0 });
assert.deepEqual(individual.observations, [{ advisorId: 'b', advisorName: 'Asesor sin registro', text: 'Mejoró después del seguimiento.' }]);
const unified = applySharedMetricDate(plan.advisorMetrics!, 'sphInitialDate', '2026-09-05');
assert.equal(unified.every(row => row.sphInitialDate === '2026-09-05'), true);
assert.equal(sharedMetricDate(unified, 'sphInitialDate'), '2026-09-05');
assert.equal(inheritedMetricDates(unified).sphInitialDate, '2026-09-05');
assert.equal(sharedMetricDate(plan.advisorMetrics!, 'sphInitialDate'), '', 'Legacy plans with different dates require choosing one shared date');
console.log('Avance PDA: promedios, datos faltantes, cero válido y filtro por asesor correctos.');
