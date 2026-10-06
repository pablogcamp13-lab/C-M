import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const temp = await mkdtemp(join(tmpdir(), 'cm-advisor-edit-'));
const port = 4900 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const password = 'Advisor-edit-test-2026';
const app = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env, NODE_ENV: 'production', PORT: String(port), SQLITE_PATH: join(temp, 'test.sqlite'),
    INITIAL_ADMIN_PASSWORD: password, REQUIRE_SUPABASE: 'false', SUPABASE_DATABASE_URL: '',
    SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', ALLOW_GOOGLE_SHEETS_FALLBACK: 'false',
    GOOGLE_SHEET_ID: '', GOOGLE_DRIVE_FOLDER_ID: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    GOOGLE_REFRESH_TOKEN: '', GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '', GMAIL_REFRESH_TOKEN: ''
  },
  stdio: 'ignore'
});

const api = async (path, token, method = 'GET', body) => {
  const response = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
};

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch {}
    if (ready) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(ready, 'El servidor de prueba no inició.');
  const login = await api('/api/auth/login', null, 'POST', { identity: 'admin', password });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const initial = (await api('/api/shared-repository', token)).body.repository;
  const operation = initial.operations.find(item => item.status === 'ACTIVA' && !item.legacy);
  assert.ok(operation, 'Falta una operación activa para la prueba.');
  const advisors = [1, 2].map(number => ({
    id: `advisor_edit_test_${number}`, dni: `9900010${number}`, employeeCode: `EDIT-${number}`,
    name: `Asesora de prueba ${number}`, campaignId: operation.campaignId, operationId: operation.id,
    supervisorId: 'usr_admin', status: 'ACTIVO', active: true
  }));
  const synced = await api('/api/shared-repository/sync', token, 'PUT', { ...initial, advisors: [...initial.advisors, ...advisors] });
  assert.equal(synced.status, 200, JSON.stringify(synced.body));
  const evaluation = {
    id: 'evaluation_advisor_edit_test', advisorId: advisors[0].id, evaluatorId: 'usr_admin',
    evaluationType: 'D3C', date: '2026-10-06', time: '17:20', callId: 'audio-original.wav',
    technicalScore: 80, items: []
  };
  const created = await api('/api/evaluations', token, 'POST', evaluation);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const feedback = await api('/api/feedbacks', token, 'POST', { evaluation_id: evaluation.id, feedback_text: 'Retroalimentación pendiente.' });
  assert.equal(feedback.status, 201, JSON.stringify(feedback.body));
  const edited = await api(`/api/admin/evaluations/${evaluation.id}`, token, 'PATCH', { advisorId: advisors[1].id });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.evaluation.advisorId, advisors[1].id);
  assert.equal(edited.body.evaluation.callId, evaluation.callId, 'El audio conserva su identificación.');
  assert.equal(edited.body.evaluation.technicalScore, 80, 'La nota no cambia por reasignar asesora.');
  const reloaded = await api('/api/platform-state', token);
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.body.state.evaluations.find(item => item.id === evaluation.id)?.advisorId, advisors[1].id);
  const feedbacks = await api('/api/feedbacks', token);
  assert.equal(feedbacks.status, 200);
  assert.equal(feedbacks.body.feedbacks.find(item => item.evaluation_id === evaluation.id)?.advisor_id, advisors[1].id);
  console.log('Edición de asesora: API, persistencia, feedback pendiente y lectura posterior verificados.');
} finally {
  app.kill();
  await new Promise(done => setTimeout(done, 400));
  const safeTemp = resolve(temp);
  if (dirname(safeTemp) === resolve(tmpdir()) && basename(safeTemp).startsWith('cm-advisor-edit-')) {
    await rm(safeTemp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}
