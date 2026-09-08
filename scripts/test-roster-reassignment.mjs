import assert from 'node:assert/strict';
import { buildReassignmentPlan } from './reassign-roster-operation.mjs';

const at = '2026-09-08T17:30:00.000Z';
const rows = Array.from({ length: 40 }, (_, index) => ({ rowNumber: index + 2, dni: String(70000000 + index), firstName: `Persona ${index}`, lastName: 'Prueba', fullName: '', supervisorName: 'Administrador Principal', quartile: 'Q2', campaignName: 'Retenciones Bitel', companyName: 'TECHCENTER' }));
const current = {
  companies: [{ id: 'company_techcenter', name: 'TECHCENTER', status: 'ACTIVA', createdAt: at }],
  campaigns: [{ id: 'campaign_old', name: 'RETENCIÓN IN', client: 'Bitel', status: 'ACTIVA', products: [] }, { id: 'campaign_ret', name: 'Retenciones Bitel', client: 'Bitel', status: 'ACTIVA', products: [] }],
  operations: [{ id: 'operation_old', companyId: 'company_legacy', campaignId: 'campaign_old', name: 'LEGACY / RETENCIÓN IN', status: 'ACTIVA', legacy: true }, { id: 'operation_ret', companyId: 'company_techcenter', campaignId: 'campaign_ret', name: 'TECHCENTER / Retenciones Bitel', status: 'ACTIVA', legacy: false }],
  users: [{ id: 'usr_admin', name: 'Administrador Principal', email: 'admin@test.local', role: 'ADMINISTRADOR', status: 'ACTIVO', createdAt: at }],
  teams: [{ id: 'team_old', campaignId: 'campaign_old', supervisorId: 'usr_admin', name: 'Equipo anterior' }],
  advisors: rows.map((row, index) => ({ id: `advisor_${index}`, dni: row.dni, employeeCode: `ADV-${index}`, name: `${row.firstName} ${row.lastName}`, campaignId: index === 0 ? 'campaign_ret' : 'campaign_old', operationId: index === 0 ? 'operation_ret' : 'operation_old', teamId: 'team_old', supervisorId: 'usr_admin', status: 'ACTIVO', active: true, hireDate: '2026-01-01' })),
  operationSupervisors: [],
  operationAssignments: rows.map((row, index) => ({ id: `assignment_${index}`, advisorId: `advisor_${index}`, operationId: index === 0 ? 'operation_ret' : 'operation_old', teamId: 'team_old', supervisorId: 'usr_admin', role: 'ASESOR', operationalStatus: 'PRODUCCION', startDate: '2026-01-01', active: true, source: 'MIGRACION' })),
  staffingMovements: []
};

const plan = buildReassignmentPlan(current, rows, 'TECHCENTER', 'Retenciones Bitel', at);
assert.equal(plan.summary.rows, 40);
assert.equal(plan.summary.reassigned, 39);
assert.equal(plan.summary.alreadyAssigned, 1);
assert.ok(plan.repository.advisors.every(advisor => advisor.operationId === 'operation_ret' && advisor.campaignId === 'campaign_ret'));
for (const advisor of plan.repository.advisors) {
  const active = plan.repository.operationAssignments.filter(item => item.advisorId === advisor.id && item.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].operationId, 'operation_ret');
}
assert.equal(plan.repository.staffingMovements.length, 40);
assert.ok(plan.repository.operationSupervisors.some(link => link.operationId === 'operation_ret' && link.supervisorId === 'usr_admin' && link.active));
assert.equal(current.advisors[1].operationId, 'operation_old', 'El plan no muta el respaldo de entrada');
const repeated = buildReassignmentPlan(plan.repository, rows, 'TECHCENTER', 'Retenciones Bitel', at);
assert.equal(repeated.summary.reassigned, 0);
assert.equal(repeated.summary.alreadyAssigned, 40);
assert.equal(repeated.summary.assignmentsCreated, 0);
assert.equal(repeated.repository.staffingMovements.length, 40, 'Repetir la reparación no duplica movimientos');
console.log('Reasignación idempotente: 40 personas, una asignación activa por persona y trazabilidad preservada.');
