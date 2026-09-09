import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'cm-campaign-monitor-'));
const port = 3421;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    SQLITE_PATH: join(directory, 'test.sqlite'),
    INITIAL_ADMIN_PASSWORD: 'Admin-test-2026',
    GOOGLE_SHEET_ID: '', GOOGLE_DRIVE_FOLDER_ID: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REFRESH_TOKEN: '',
    GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '', GMAIL_REFRESH_TOKEN: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

const request = async (path, { token, body, ...options } = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
};
const login = async (identity, password) => {
  const result = await request('/api/auth/login', { method: 'POST', body: { identity, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data.token;
};

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const admin = await login('admin', 'Admin-test-2026');
  const initial = (await request('/api/shared-repository', { token: admin })).data.repository;
  const operation = initial.operations.find(item => item.status === 'ACTIVA' && !item.legacy && initial.campaigns.find(campaign => campaign.id === item.campaignId)?.name === 'Migra');
  assert.ok(operation, 'Debe existir la operación Migra de prueba.');
  const monitor = { id: 'usr_monitor_test', name: 'Monitor Prueba', email: 'monitor@test.local', username: 'monitor.test', role: 'MONITOR', status: 'ACTIVO', createdAt: new Date().toISOString(), password: 'Monitor-test-2026' };
  const advisor = { id: 'adv_monitor_test', dni: '79999991', employeeCode: 'MT1', name: 'Asesor Monitor', campaignId: operation.campaignId, operationId: operation.id, teamId: '', supervisorId: 'usr_admin', status: 'ACTIVO', hireDate: '2026-09-01', active: true };
  const staleSnapshot = { ...initial, users: [...initial.users, monitor], advisors: [...initial.advisors, advisor] };
  assert.equal((await request('/api/shared-repository/sync', { method: 'PUT', token: admin, body: staleSnapshot })).response.status, 200);

  const monitorToken = await login('monitor.test', 'Monitor-test-2026');
  const incomplete = await request('/api/evaluations', { method: 'POST', token: monitorToken, body: { id: 'eval_incomplete_test', advisorId: advisor.id, evaluationType: 'D3C', date: '2026-09-09', time: '10:29', callId: 'CALL-INCOMPLETE', items: [], sale: false } });
  assert.equal(incomplete.response.status, 400, 'Una evaluación sin criterios ni puntaje no debe guardarse.');
  const saved = await request('/api/evaluations', { method: 'POST', token: monitorToken, body: { id: 'eval_monitor_test', advisorId: advisor.id, evaluationType: 'D3C', date: '2026-09-09', time: '10:30', callId: 'CALL-MONITOR', recordingCode: 'REC-MONITOR', type: 'MONITOREO_REGULAR', items: [{ id: 'item_test', criterionId: 'D', dimension: 'DOMINIO_PRODUCTO', compliance: 'CUMPLE', percentage: 100, level: 4 }], sale: false, comments: 'Prueba de monitor', createdAt: new Date().toISOString() } });
  assert.equal(saved.response.status, 201, JSON.stringify(saved.data));
  assert.equal(saved.data.evaluation.evaluatorId, monitor.id, 'El backend debe imponer la identidad del monitor autenticado.');
  const monitorDelete = await request('/api/evaluations/eval_monitor_test', { method: 'DELETE', token: monitorToken });
  assert.equal(monitorDelete.response.status, 403, 'Un monitor no debe poder eliminar evaluaciones.');
  const linkedFeedback = await request('/api/feedbacks', { method: 'POST', token: admin, body: { evaluation_id: 'eval_monitor_test', feedback_text: 'Feedback que debe eliminarse con su evaluación.' } });
  assert.equal(linkedFeedback.response.status, 201, JSON.stringify(linkedFeedback.data));
  const monitorEdit = await request('/api/admin/evaluations/eval_monitor_test', { method: 'PATCH', token: monitorToken, body: { comments: 'Intento no autorizado' } });
  assert.equal(monitorEdit.response.status, 403, 'Un monitor no debe editar evaluaciones finalizadas.');
  const edited = await request('/api/admin/evaluations/eval_monitor_test', { method: 'PATCH', token: admin, body: { comments: 'Corrección administrativa verificada', callId: 'CALL-MONITOR-EDITADA', items: [{ id: 'item_test', criterionId: 'D', dimension: 'DOMINIO_PRODUCTO', compliance: 'NO_CUMPLE', percentage: 0, level: 1, finding: 'Hallazgo corregido', evidence: '', recommendedAction: 'Reforzar conocimiento.' }] } });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.evaluation.id, 'eval_monitor_test', 'La edición debe conservar el ID y los vínculos históricos.');
  assert.equal(edited.data.evaluation.scoreTotal, 0, 'El servidor debe recalcular el puntaje editado.');
  assert.equal(edited.data.evaluation.audit.at(-1).action, 'EDITED', 'La edición debe dejar auditoría.');
  assert.equal((await request('/api/feedbacks', { token: admin })).data.feedbacks.some(item => item.evaluation_id === 'eval_monitor_test'), true, 'Editar no debe eliminar el feedback asociado.');

  const removed = await request(`/api/admin/campaigns/${operation.campaignId}?companyId=${encodeURIComponent(operation.companyId)}`, { method: 'DELETE', token: admin });
  assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.repository.operations.find(item => item.id === operation.id)?.status, 'INACTIVA');

  // Simula una pestaña vieja intentando volver a guardar el catálogo anterior.
  assert.equal((await request('/api/shared-repository/sync', { method: 'PUT', token: admin, body: staleSnapshot })).response.status, 200);
  const finalRepository = (await request('/api/shared-repository', { token: admin })).data.repository;
  assert.equal(finalRepository.operations.find(item => item.id === operation.id)?.status, 'INACTIVA');
  assert.notEqual(finalRepository.advisors.find(item => item.id === advisor.id)?.operationId, operation.id);

  // Simula los datos dejados por una versión anterior: existe el traslado de
  // baja a LEGACY, pero una sincronización vieja reactivó la operación.
  const recoveryOperation = finalRepository.operations.find(item => item.status === 'ACTIVA' && !item.legacy && item.id !== operation.id);
  assert.ok(recoveryOperation);
  const recoveryAdvisor = { ...advisor, id: 'adv_retirement_recovery', dni: '79999992', name: 'Asesor Recuperación', campaignId: recoveryOperation.campaignId, operationId: recoveryOperation.id };
  await request('/api/shared-repository/sync', { method: 'PUT', token: admin, body: { ...finalRepository, advisors: [...finalRepository.advisors, recoveryAdvisor] } });
  const beforeRecovery = (await request('/api/shared-repository', { token: admin })).data.repository;
  const activeAssignment = beforeRecovery.operationAssignments.find(item => item.advisorId === recoveryAdvisor.id && item.active);
  assert.ok(activeAssignment);
  const historicalMarker = { id: 'assignment_historical_retirement', advisorId: recoveryAdvisor.id, operationId: `op_legacy_${recoveryOperation.campaignId}`, role: 'ASESOR', operationalStatus: 'PRODUCCION', startDate: '2026-09-08', endDate: '2026-09-08', active: false, source: 'MANUAL', observation: 'Campaña retirada de la empresa; se preserva el registro histórico.' };
  const recovered = (await request('/api/shared-repository/sync', { method: 'PUT', token: admin, body: { ...beforeRecovery, operationAssignments: [...beforeRecovery.operationAssignments.filter(item => item.id !== historicalMarker.id), historicalMarker, activeAssignment] } })).data.repository;
  assert.equal(recovered.operations.find(item => item.id === recoveryOperation.id)?.status, 'INACTIVA');
  assert.notEqual(recovered.advisors.find(item => item.id === recoveryAdvisor.id)?.operationId, recoveryOperation.id);
  const platformBeforeDelete = await request('/api/platform-state', { token: admin });
  assert.equal((await request('/api/platform-state', { method: 'PUT', token: admin, body: platformBeforeDelete.data.state })).response.status, 200);
  const deleted = await request('/api/evaluations/eval_monitor_test', { method: 'DELETE', token: admin });
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.data));
  const platformAfterDelete = await request('/api/platform-state', { token: admin });
  assert.equal(platformAfterDelete.response.status, 200, JSON.stringify(platformAfterDelete.data));
  assert.equal(platformAfterDelete.data.state.evaluations.some(item => item.id === 'eval_monitor_test'), false, 'La evaluación eliminada no debe reaparecer desde APP_STATE ni SQLite.');
  const feedbackAfterDelete = await request('/api/feedbacks', { token: admin });
  assert.equal(feedbackAfterDelete.data.feedbacks.some(item => item.evaluation_id === 'eval_monitor_test'), false, 'El feedback dependiente no debe quedar huérfano.');
  assert.equal((await request('/api/evaluations/eval_monitor_test', { method: 'DELETE', token: admin })).response.status, 404);
  console.log('Integridad de campañas, edición administrativa y eliminación persistente: 24 verificaciones correctas.');
} finally {
  child.kill();
  await new Promise(resolve => setTimeout(resolve, 250));
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
