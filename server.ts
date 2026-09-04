import express from "express";
import path from "path";
import { googleStorage } from "./server/googleStorage";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Advisor, Campaign, Team, User } from "./src/types";
// @ts-ignore node:sqlite está disponible en Node 22.5+; el proyecto conserva
// @types/node 22 para el resto del código existente.
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production' || process.argv[1]?.includes('dist/server.cjs');

type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[] };
const sqlitePath = process.env.SQLITE_PATH || join(process.cwd(), 'data', 'contact-center.sqlite');
mkdirSync(path.dirname(sqlitePath), { recursive: true });
const db = new DatabaseSync(sqlitePath);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, username TEXT UNIQUE, role TEXT NOT NULL, status TEXT NOT NULL, team_id TEXT, advisor_id TEXT UNIQUE, avatar TEXT, created_at TEXT NOT NULL, password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, status TEXT NOT NULL, products_json TEXT NOT NULL, description TEXT, quality_guidelines_json TEXT NOT NULL DEFAULT '[]', quality_criterion_weights_json TEXT, quality_critical_errors_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), supervisor_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS advisors (id TEXT PRIMARY KEY, dni TEXT NOT NULL UNIQUE, employee_code TEXT NOT NULL, name TEXT NOT NULL, campaign_id TEXT NOT NULL REFERENCES campaigns(id), team_id TEXT, supervisor_id TEXT, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evaluations (id TEXT PRIMARY KEY, advisor_id TEXT NOT NULL REFERENCES advisors(id), evaluator_id TEXT NOT NULL REFERENCES users(id), evaluation_type TEXT NOT NULL CHECK(evaluation_type IN ('QUALITY', 'D3C')), evaluated_at TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quality_criteria (id TEXT PRIMARY KEY, criterion_code TEXT NOT NULL, attribute_code TEXT NOT NULL, weight REAL NOT NULL, is_critical INTEGER NOT NULL DEFAULT 0, applicable_rules_json TEXT NOT NULL, definition_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS critical_errors (id TEXT PRIMARY KEY, error_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL, focus TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedbacks (feedback_id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL UNIQUE REFERENCES evaluations(id), advisor_id TEXT NOT NULL REFERENCES advisors(id), supervisor_id TEXT NOT NULL REFERENCES users(id), evaluator_id TEXT NOT NULL REFERENCES users(id), evaluation_type TEXT NOT NULL CHECK(evaluation_type IN ('QUALITY','D3C')), feedback_text TEXT NOT NULL DEFAULT '', advisor_response TEXT, supervisor_closure_comment TEXT, status TEXT NOT NULL CHECK(status IN ('PENDIENTE','VALIDADO_ASESOR','OBSERVADO_ASESOR','CERRADO_SUPERVISOR')), created_at TEXT NOT NULL, advisor_action_at TEXT, closed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS development_capsules (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('BORRADOR','PUBLICADA','ARCHIVADA')), data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS development_assignments (id TEXT PRIMARY KEY, capsule_id TEXT NOT NULL REFERENCES development_capsules(id), advisor_id TEXT NOT NULL REFERENCES advisors(id), status TEXT NOT NULL CHECK(status IN ('PENDIENTE','EN_CURSO','COMPLETADA','VENCIDA')), data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(capsule_id,advisor_id));
CREATE TABLE IF NOT EXISTS quality_alerts (id TEXT PRIMARY KEY, status TEXT NOT NULL, advisor_id TEXT NOT NULL, supervisor_id TEXT NOT NULL, campaign_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calibrations (id TEXT PRIMARY KEY, status TEXT NOT NULL, evaluation_id TEXT NOT NULL, campaign_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_advisors_campaign ON advisors(campaign_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_advisor_type ON evaluations(advisor_id, evaluation_type);
CREATE INDEX IF NOT EXISTS idx_quality_alerts_supervisor ON quality_alerts(supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_calibrations_status ON calibrations(status);`);
if (!(db.prepare('PRAGMA table_info(feedbacks)').all() as any[]).some(column => column.name === 'advisor_evidence_url')) db.exec('ALTER TABLE feedbacks ADD COLUMN advisor_evidence_url TEXT');
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some(column => column.name === 'must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1');
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_guidelines_json')) db.exec("ALTER TABLE campaigns ADD COLUMN quality_guidelines_json TEXT NOT NULL DEFAULT '[]'");
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_criterion_weights_json')) db.exec('ALTER TABLE campaigns ADD COLUMN quality_criterion_weights_json TEXT');
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_critical_errors_json')) db.exec("ALTER TABLE campaigns ADD COLUMN quality_critical_errors_json TEXT NOT NULL DEFAULT '[]'");

if (isProduction && !process.env.INITIAL_ADMIN_PASSWORD) throw new Error('INITIAL_ADMIN_PASSWORD es obligatoria en producción.');
const INITIAL_PASSWORD = '12345678';
const DEFAULT_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || INITIAL_PASSWORD;
const hashPassword = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const validPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const derived = scryptSync(password, salt, 64); return timingSafeEqual(derived, Buffer.from(hash, 'hex')); };
const publicUser = (row: any): User => ({ id: row.id, name: row.name, email: row.email, username: row.username || undefined, role: row.role, status: row.status, teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at, mustChangePassword: Boolean(row.must_change_password) });
const evaluationIdentity = (item: any) => [item?.advisorId, item?.evaluationType, item?.date, item?.time, item?.callId || item?.recordingCode || item?.id].join('|');
const uniqueEvaluations = (items: any[] = []) => { const seen = new Set<string>(); return items.filter(item => { const key=evaluationIdentity(item); if(seen.has(key)) return false; seen.add(key); return true; }); };
const normalizePlatformState = (state: any) => state ? { ...state, evaluations: uniqueEvaluations(state.evaluations || []) } : state;

async function cleanupEvaluationDuplicates() {
  const rows = db.prepare('SELECT id,payload_json FROM evaluations ORDER BY created_at DESC').all() as any[];
  const seen = new Set<string>(); const duplicateIds: string[] = [];
  for (const row of rows) {
    try { const key=evaluationIdentity(JSON.parse(row.payload_json)); if(seen.has(key)) duplicateIds.push(row.id); else seen.add(key); } catch {}
  }
  if (duplicateIds.length) {
    const remove=db.prepare('DELETE FROM evaluations WHERE id=?'); db.exec('BEGIN IMMEDIATE'); try { duplicateIds.forEach(id=>remove.run(id)); db.exec('COMMIT'); } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  const stateRow=db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
  let stateRemoved=0;
  if(stateRow?.payload_json){const state=JSON.parse(stateRow.payload_json);const before=state.evaluations?.length||0;const normalized=normalizePlatformState(state);stateRemoved=before-(normalized.evaluations?.length||0);if(stateRemoved)db.prepare('UPDATE app_state SET payload_json=?,updated_at=? WHERE id=?').run(JSON.stringify(normalized),new Date().toISOString(),'global');}
  let remoteRemoved=0;
  if(googleStorage.enabled){remoteRemoved=await googleStorage.deduplicateEvaluations();const remoteState=await googleStorage.loadPlatformState();if(remoteState){const normalized=normalizePlatformState(remoteState);if((normalized.evaluations?.length||0)!==(remoteState.evaluations?.length||0))await googleStorage.savePlatformState(normalized);}}
  const total=duplicateIds.length+stateRemoved+remoteRemoved;if(total)console.log(`[evaluations] Duplicados exactos eliminados: ${total}.`);
}

function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM users').get().total as number;
  const now = new Date().toISOString();
  if (!count) db.prepare('INSERT INTO users (id,name,email,username,role,status,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?)').run('usr_admin', 'Administrador Principal', 'admin@consultoria3c.com', 'admin', 'ADMINISTRADOR', 'ACTIVO', now, hashPassword(DEFAULT_ADMIN_PASSWORD));
  db.prepare('INSERT OR IGNORE INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?)').run('camp_1', 'Migraciones Bitel', 'Bitel', 'ACTIVA', JSON.stringify(['Migraciones']), 'Campaña de evaluación de Calidad para Migraciones Bitel.');
}
seedDatabase();

function repository(): SharedRepository {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(publicUser);
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY name').all().map((r: any) => ({ id: r.id, name: r.name, client: r.client, status: r.status, products: JSON.parse(r.products_json), description: r.description || undefined, qualityGuidelines: JSON.parse(r.quality_guidelines_json || '[]'), qualityCriterionWeights: JSON.parse(r.quality_criterion_weights_json || 'null') || undefined, qualityCriticalErrors: JSON.parse(r.quality_critical_errors_json || '[]') }));
  const teams = db.prepare('SELECT * FROM teams ORDER BY name').all().map((r: any) => ({ id: r.id, campaignId: r.campaign_id, supervisorId: r.supervisor_id, name: r.name }));
  const advisors = db.prepare('SELECT data_json FROM advisors ORDER BY name').all().map((r: any) => JSON.parse(r.data_json));
  return { users, campaigns, teams, advisors };
}

function persistRepository(input: SharedRepository) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const source = input;
    for (const campaign of source.campaigns || []) db.prepare(`INSERT INTO campaigns (id,name,client,status,products_json,description,quality_guidelines_json,quality_criterion_weights_json,quality_critical_errors_json) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,client=excluded.client,status=excluded.status,products_json=excluded.products_json,description=excluded.description,quality_guidelines_json=excluded.quality_guidelines_json,quality_criterion_weights_json=excluded.quality_criterion_weights_json,quality_critical_errors_json=excluded.quality_critical_errors_json`).run(campaign.id, campaign.name, campaign.client, campaign.status, JSON.stringify(campaign.products || []), campaign.description || null, JSON.stringify(campaign.qualityGuidelines || []), JSON.stringify(campaign.qualityCriterionWeights || null), JSON.stringify(campaign.qualityCriticalErrors || []));
    for (const user of source.users || []) {
      const existing = db.prepare('SELECT password_hash,must_change_password FROM users WHERE id=?').get(user.id);
      db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,avatar=excluded.avatar`).run(user.id, user.name, user.email, user.username || null, user.role, user.status, user.teamId || null, user.advisorId || null, user.avatar || null, user.createdAt || now, existing?.password_hash || hashPassword(user.password || INITIAL_PASSWORD), existing ? existing.must_change_password : 1);
    }
    for (const team of source.teams || []) db.prepare(`INSERT INTO teams (id,campaign_id,supervisor_id,name) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET campaign_id=excluded.campaign_id,supervisor_id=excluded.supervisor_id,name=excluded.name`).run(team.id, team.campaignId, team.supervisorId, team.name);
    for (const advisor of source.advisors || []) db.prepare(`INSERT INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET dni=excluded.dni,employee_code=excluded.employee_code,name=excluded.name,campaign_id=excluded.campaign_id,team_id=excluded.team_id,supervisor_id=excluded.supervisor_id,data_json=excluded.data_json`).run(advisor.id, advisor.dni, advisor.employeeCode || '', advisor.name, advisor.campaignId, advisor.teamId || null, advisor.supervisorId || null, JSON.stringify(advisor));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return repository();
}

function passwordHashes() {
  return new Map((db.prepare('SELECT id,password_hash FROM users').all() as any[]).map(row => [row.id, row.password_hash]));
}

async function readRepository() {
  if (!googleStorage.enabled) return repository();
  try {
    const remote = await googleStorage.loadRepository();
    if (remote && (remote.users.length || remote.campaigns.length || remote.teams.length || remote.advisors.length)) { persistRepository(remote); return remote; }
    const local = repository();
    await googleStorage.saveRepository(local, passwordHashes());
    console.log('[google-storage] Google Sheets inicializado con la persistencia local existente.');
    return local;
  } catch (error) {
    console.error('[google-storage] No fue posible leer Sheets; se usa la caché local.', error instanceof Error ? error.message : '');
    return repository();
  }
}

async function saveRepository(input: SharedRepository) {
  const persisted = persistRepository(input);
  if (googleStorage.enabled) {
    try { await googleStorage.saveRepository(persisted, passwordHashes()); }
    catch (error) { console.error('[google-storage] No fue posible guardar la dotación en Sheets.', error instanceof Error ? error.message : ''); throw new Error('No fue posible sincronizar la información con Google Sheets.'); }
  }
  return persisted;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  let session = token && db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  if (!session && token && googleStorage.enabled) {
    try {
      const remoteSession = await googleStorage.loadSession(token);
      if (remoteSession?.user_id) {
        await syncAuthUsersFromGoogle();
        const user = db.prepare('SELECT * FROM users WHERE id=? AND status=?').get(remoteSession.user_id, 'ACTIVO') as any;
        if (user) {
          db.prepare('INSERT OR REPLACE INTO sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(token, user.id, '9999-12-31T23:59:59.999Z', remoteSession.created_at || new Date().toISOString());
          session = { ...user, token, user_id: user.id };
        }
      }
    } catch (error) { console.error('[google-storage] No fue posible restaurar la sesión.', error instanceof Error ? error.message : ''); }
  }
  if (!session) return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  (req as any).authUser = publicUser(session); (req as any).token = token; next();
}

let lastGoogleAuthSync = 0;
const advisorDnisForAuth = new Map<string, string>();
const advisorUsersByDni = new Map<string, string>();
async function syncAuthUsersFromGoogle() {
  if (!googleStorage.enabled || Date.now() - lastGoogleAuthSync < 60_000) return;
  const users = await googleStorage.loadUsersForAuthentication();
  if (!users?.length) return;
  const upsert = db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash,must_change_password)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,avatar=excluded.avatar,created_at=excluded.created_at,password_hash=excluded.password_hash,must_change_password=excluded.must_change_password`);
  db.exec('BEGIN IMMEDIATE');
  const repaired: Array<{ id: string; passwordHash: string }> = [];
  try {
    for (const user of users) {
      const passwordHash = user.passwordHash || hashPassword(INITIAL_PASSWORD);
      upsert.run(user.id, user.name, user.email, user.username || null, user.role, user.status, user.teamId || null, user.advisorId || null, user.avatar || null, user.createdAt, passwordHash, user.passwordHash ? (user.mustChangePassword ? 1 : 0) : 1);
      if (!user.passwordHash) repaired.push({ id: user.id, passwordHash });
      if (user.advisorId && user.advisorDni) { advisorDnisForAuth.set(user.advisorId, user.advisorDni); advisorUsersByDni.set(user.advisorDni, user.id); }
    }
    db.exec('COMMIT'); lastGoogleAuthSync = Date.now();
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  for (const user of repaired) await googleStorage.updateUserPasswordHash(user.id, user.passwordHash, true);
}

async function startServer() {
  const app = express();
  try { await cleanupEvaluationDuplicates(); } catch (error) { console.error('[evaluations] No fue posible completar la limpieza de duplicados.', error instanceof Error ? error.message : ''); }

  // Increase payload size for base64 audio files
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.post('/api/auth/login', async (req, res) => {
    const { identity, password } = req.body || {};
    if (!identity || !password) return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    try { await syncAuthUsersFromGoogle(); }
    catch (error) { console.error('[google-storage] No fue posible sincronizar cuentas para el acceso.', error instanceof Error ? error.message : ''); }
    const identityText = String(identity).trim(); const passwordText = String(password);
    let user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) OR lower(username)=lower(?)').get(identityText, identityText) as any;
    if (!user && advisorUsersByDni.has(identityText)) user = db.prepare('SELECT * FROM users WHERE id=?').get(advisorUsersByDni.get(identityText)) as any;
    const validInitialPassword = Boolean(user?.must_change_password) && passwordText === INITIAL_PASSWORD;
    if (!user || user.status !== 'ACTIVO' || (!validPassword(passwordText, String(user.password_hash)) && !validInitialPassword)) return res.status(401).json({ error: 'Credenciales inválidas.' });
    if (validInitialPassword && !validPassword(passwordText, String(user.password_hash))) {
      const passwordHash = hashPassword(passwordText); db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
      try { if (googleStorage.enabled) await googleStorage.updateUserPasswordHash(user.id, passwordHash, true); } catch (error) { console.error('[google-storage] No fue posible actualizar la clave inicial.', error instanceof Error ? error.message : ''); }
      user = { ...user, password_hash: passwordHash };
    }
    const token = randomBytes(32).toString('hex');
    const createdAt = new Date().toISOString(); const expiresAt = '9999-12-31T23:59:59.999Z';
    db.prepare('INSERT INTO sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(token, user.id, expiresAt, createdAt);
    try { if (googleStorage.enabled) await googleStorage.saveSession(token, user.id, createdAt); }
    catch (error) { console.error('[google-storage] No fue posible persistir la sesión.', error instanceof Error ? error.message : ''); }
    return res.json({ token, user: publicUser(user) });
  });
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: (req as any).authUser }));
  app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { password } = req.body || {}; if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    const user = (req as any).authUser as User; const passwordHash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(passwordHash, user.id);
    try { if (googleStorage.enabled) await googleStorage.updateUserPasswordHash(user.id, passwordHash, false); }
    catch (error) { console.error('[google-storage] No fue posible guardar la contraseña.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible sincronizar la contraseña.' }); }
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
  });
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const token = (req as any).token; db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    try { if (googleStorage.enabled) await googleStorage.deleteSession(token); }
    catch (error) { console.error('[google-storage] No fue posible eliminar la sesión persistente.', error instanceof Error ? error.message : ''); }
    res.status(204).end();
  });
  const requireAdmin = (req: express.Request, res: express.Response) => (req as any).authUser?.role === 'ADMINISTRADOR' || res.status(403).json({ error: 'Acceso restringido a administración.' });
  app.post('/api/admin/users', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const body = req.body || {}; const name = String(body.name || '').trim(); const email = String(body.email || '').trim().toLowerCase();
    const validRoles = ['ADMINISTRADOR','CONSULTOR','SUPERVISOR','FORMADOR','GERENCIA','ASESOR']; const role = validRoles.includes(body.role) ? body.role : 'ASESOR'; const status = body.status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';
    if (!name || !email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    if (db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email)) return res.status(409).json({ error: 'El correo ya está registrado.' });
    const base = String(body.username || name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim().replace(/[\s.]+/g, '.').replace(/^\.|\.$/g, '') || `usuario.${Date.now()}`;
    let username = base; let suffix = 1; while (db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(username)) username = `${base}.${++suffix}`;
    const id = `usr_${randomBytes(8).toString('hex')}`; const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,created_at,password_hash,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,1)').run(id,name,email,username,role,status,body.teamId||null,body.advisorId||null,createdAt,hashPassword(INITIAL_PASSWORD));
    try { if (googleStorage.enabled) await googleStorage.saveRepository(repository(), passwordHashes()); }
    catch (error) { db.prepare('DELETE FROM users WHERE id=?').run(id); console.error('[google-storage] No fue posible crear el usuario.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible guardar el usuario en Google Sheets.' }); }
    return res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) });
  });
  app.patch('/api/admin/users/:id', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as any; if (!current) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const body = req.body || {}; const next = { name: String(body.name ?? current.name).trim(), email: String(body.email ?? current.email).trim(), username: String((body.username ?? current.username) || '').trim() || null, role: body.role ?? current.role, status: body.status ?? current.status, teamId: body.teamId ?? current.team_id, advisorId: body.advisorId ?? current.advisor_id };
    if (!next.name || !next.email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    try { db.prepare('UPDATE users SET name=?,email=?,username=?,role=?,status=?,team_id=?,advisor_id=? WHERE id=?').run(next.name, next.email, next.username, next.role, next.status, next.teamId || null, next.advisorId || null, current.id); if (googleStorage.enabled) await googleStorage.saveRepository(repository(), passwordHashes()); return res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(current.id)) }); }
    catch { return res.status(400).json({ error: 'No fue posible actualizar el usuario.' }); }
  });
  app.post('/api/admin/users/:id/reset-password', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as any; if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const passwordHash = hashPassword(INITIAL_PASSWORD); db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(passwordHash, user.id);
    try { if (googleStorage.enabled) await googleStorage.updateUserPasswordHash(user.id, passwordHash, true); return res.json({ ok: true }); }
    catch { return res.status(502).json({ error: 'No fue posible sincronizar el reseteo.' }); }
  });
  app.delete('/api/admin/users/:id', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const actor = (req as any).authUser as User; if (actor.id === req.params.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as any; if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.prepare('DELETE FROM users WHERE id=?').run(user.id);
    try { if (googleStorage.enabled) await googleStorage.saveRepository(repository(), passwordHashes()); return res.status(204).end(); }
    catch { return res.status(502).json({ error: 'No fue posible sincronizar la eliminación.' }); }
  });

  app.get('/api/shared-repository', requireAuth, async (req, res) => {
    const source = await readRepository(); const user = (req as any).authUser as User;
    if (user.role === 'SUPERVISOR') {
      const advisors = source.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId));
      const campaignIds = new Set(advisors.map(item => item.campaignId)); const teamIds = new Set(advisors.map(item => item.teamId).filter(Boolean));
      return res.json({ repository: { advisors, campaigns: source.campaigns.filter(item => campaignIds.has(item.id)), teams: source.teams.filter(item => teamIds.has(item.id)), users: source.users.filter(item => item.id === user.id || item.advisorId && advisors.some(advisor => advisor.id === item.advisorId)) } });
    }
    if (user.role !== 'ASESOR' || !user.advisorId) return res.json({ repository: source });
    const advisor = source.advisors.filter(item => item.id === user.advisorId);
    const advisorCampaignIds = new Set(advisor.map(item => item.campaignId));
    const advisorTeamIds = new Set(advisor.map(item => item.teamId).filter(Boolean));
    const supervisorIds = new Set(advisor.map(item => item.supervisorId).filter(Boolean));
    return res.json({ repository: {
      advisors: advisor,
      campaigns: source.campaigns.filter(item => advisorCampaignIds.has(item.id)),
      teams: source.teams.filter(item => advisorTeamIds.has(item.id)),
      users: source.users.filter(item => item.id === user.id || supervisorIds.has(item.id))
    } });
  });
  app.post('/api/shared-repository/migrate', requireAuth, async (req, res) => {
    if (!['ADMINISTRADOR','CONSULTOR'].includes((req as any).authUser.role)) return res.status(403).json({ error: 'No tienes permiso para modificar la dotación.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible migrar la dotación.' }); }
  });
  app.put('/api/shared-repository/sync', requireAuth, async (req, res) => {
    if (!['ADMINISTRADOR','CONSULTOR'].includes((req as any).authUser.role)) return res.status(403).json({ error: 'No tienes permiso para modificar la dotación.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible guardar la dotación.' }); }
  });
  app.post('/api/evaluations', requireAuth, async (req, res) => {
    if (!['ADMINISTRADOR','CONSULTOR'].includes((req as any).authUser.role)) return res.status(403).json({ error: 'Solo Calidad o Administración puede crear evaluaciones.' });
    const evaluation = req.body;
    if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY', 'D3C'].includes(evaluation?.evaluationType)) return res.status(400).json({ error: 'Evaluación inválida.' });
    const evaluatedAt = `${evaluation.date}T${evaluation.time || '00:00'}:00`;
    try {
      if (googleStorage.enabled) await readRepository();
      const localDuplicate = (db.prepare('SELECT payload_json FROM evaluations WHERE advisor_id=? AND evaluation_type=? AND evaluated_at=?').all(evaluation.advisorId,evaluation.evaluationType,evaluatedAt) as any[]).flatMap(row=>{try{return [JSON.parse(row.payload_json)];}catch{return [];}}).find(item=>evaluationIdentity(item)===evaluationIdentity(evaluation));
      if (localDuplicate) return res.status(200).json({ evaluation: localDuplicate, deduplicated: true });
      if (googleStorage.enabled) {
        const remoteDuplicate = (await googleStorage.loadEvaluations()).find(item=>evaluationIdentity(item)===evaluationIdentity(evaluation));
        if (remoteDuplicate) return res.status(200).json({ evaluation: remoteDuplicate, deduplicated: true });
        await googleStorage.saveEvaluation(evaluation);
      }
      try {
        db.prepare(`INSERT INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, evaluatedAt, JSON.stringify(evaluation), evaluation.createdAt || new Date().toISOString());
      } catch (cacheError) {
        if (!googleStorage.enabled) throw cacheError;
        console.error('[evaluations] La evaluación se guardó remotamente, pero no pudo actualizarse la caché local.', cacheError instanceof Error ? cacheError.message : '');
      }
      return res.status(201).json({ evaluation });
    } catch (error: any) { console.error('[google-storage] No fue posible guardar la evaluación.', error instanceof Error ? error.message : ''); return res.status(400).json({ error: error.message || 'No fue posible guardar la evaluación.' }); }
  });
  app.get('/api/feedbacks', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    const onlyOwn = (feedbacks: any[]) => user.role === 'ASESOR' ? feedbacks.filter(feedback => feedback.advisor_id === user.advisorId) : user.role === 'SUPERVISOR' ? feedbacks.filter(feedback => feedback.supervisor_id === user.id) : feedbacks;
    try { const remote = googleStorage.enabled ? await googleStorage.loadFeedbacks() : null; if (remote) return res.json({ feedbacks: onlyOwn(remote) }); }
    catch (error) { console.error('[google-storage] No fue posible leer feedbacks.', error instanceof Error ? error.message : ''); }
    res.json({ feedbacks: onlyOwn(db.prepare('SELECT * FROM feedbacks ORDER BY updated_at DESC').all() as any[]) });
  });
  app.post('/api/feedbacks', requireAuth, async (req, res) => {
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'Un asesor no puede crear feedbacks.' });
    const body = req.body || {}; const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(body.evaluation_id) as any;
    let ev = evaluation ? JSON.parse(evaluation.payload_json) : null;
    if (!ev && googleStorage.enabled) {
      try { ev = (await googleStorage.loadPlatformState())?.evaluations?.find((item: any) => item.id === body.evaluation_id); }
      catch (error) { console.error('[google-storage] No fue posible recuperar la evaluación origen.', error instanceof Error ? error.message : ''); }
    }
    if (!ev) return res.status(400).json({ error: 'La evaluación origen no existe.' });
    const now = new Date().toISOString(); const feedback = { feedback_id: `fb_${randomBytes(8).toString('hex')}`, evaluation_id: ev.id, advisor_id: ev.advisorId, supervisor_id: ev.supervisorId, evaluator_id: ev.evaluatorId, evaluation_type: ev.evaluationType, feedback_text: String(body.feedback_text || ''), advisor_response: null, advisor_evidence_url: null, supervisor_closure_comment: null, status: 'PENDIENTE', created_at: now, advisor_action_at: null, closed_at: null, updated_at: now };
    try {
      if (googleStorage.enabled) {
        const existing = (await googleStorage.loadFeedbacks()).find((item: any) => item.evaluation_id === ev.id);
        if (existing) return res.status(409).json({ error: 'Esta evaluación ya tiene feedback.' });
        await googleStorage.saveFeedback(feedback);
      }
      try { db.prepare('INSERT INTO feedbacks (feedback_id,evaluation_id,advisor_id,supervisor_id,evaluator_id,evaluation_type,feedback_text,advisor_evidence_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(feedback.feedback_id, feedback.evaluation_id, feedback.advisor_id, feedback.supervisor_id, feedback.evaluator_id, feedback.evaluation_type, feedback.feedback_text, feedback.advisor_evidence_url, feedback.status, now, now); } catch (localError) { if (!googleStorage.enabled) throw localError; }
      res.status(201).json({ feedback });
    }
    catch (error) { console.error('[google-storage] No fue posible guardar feedback.', error instanceof Error ? error.message : ''); res.status(400).json({ error: 'Esta evaluación ya tiene feedback o no fue posible sincronizarlo.' }); }
  });
  app.patch('/api/feedbacks/:id', requireAuth, async (req, res) => {
    let current = db.prepare('SELECT * FROM feedbacks WHERE feedback_id=?').get(req.params.id) as any;
    if (!current && googleStorage.enabled) {
      try { current = (await googleStorage.loadFeedbacks()).find((feedback: any) => feedback.feedback_id === req.params.id); }
      catch (error) { console.error('[google-storage] No fue posible recuperar el feedback.', error instanceof Error ? error.message : ''); }
    }
    if (!current) return res.status(404).json({ error: 'Feedback no encontrado.' });
    const body = req.body || {}; const status = body.status || current.status; const user = (req as any).authUser as User;
    if (user.role === 'ASESOR' && (user.advisorId !== current.advisor_id || !['VALIDADO_ASESOR', 'OBSERVADO_ASESOR'].includes(status))) return res.status(403).json({ error: 'No tienes permiso para cerrar o modificar este feedback.' });
    if (user.role === 'SUPERVISOR' && current.supervisor_id !== user.id) return res.status(403).json({ error: 'Este feedback no pertenece a tu equipo.' });
    const valid = (current.status === 'PENDIENTE' && ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status)) || (['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(current.status) && status === 'CERRADO_SUPERVISOR') || status === current.status;
    if (!valid || (status === 'CERRADO_SUPERVISOR' && current.status === 'OBSERVADO_ASESOR' && !String(body.supervisor_closure_comment || current.supervisor_closure_comment || '').trim())) return res.status(400).json({ error: 'Transición de feedback no permitida o falta comentario de cierre.' });
    const now = new Date().toISOString(); const feedback = { ...current, status, advisor_response: body.advisor_response ?? current.advisor_response, advisor_evidence_url: body.advisor_evidence_url ?? current.advisor_evidence_url, supervisor_closure_comment: body.supervisor_closure_comment ?? current.supervisor_closure_comment, advisor_action_at: ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status) ? now : current.advisor_action_at, closed_at: status === 'CERRADO_SUPERVISOR' ? now : current.closed_at, updated_at: now };
    try {
      if (googleStorage.enabled) await googleStorage.saveFeedback(feedback);
      db.prepare('UPDATE feedbacks SET status=?, advisor_response=?, advisor_evidence_url=?, supervisor_closure_comment=?, advisor_action_at=?, closed_at=?, updated_at=? WHERE feedback_id=?').run(feedback.status, feedback.advisor_response, feedback.advisor_evidence_url, feedback.supervisor_closure_comment, feedback.advisor_action_at, feedback.closed_at, feedback.updated_at, req.params.id);
      res.json({ feedback });
    }
    catch (error) { console.error('[google-storage] No fue posible actualizar feedback.', error instanceof Error ? error.message : ''); res.status(502).json({ error: 'No fue posible sincronizar el feedback.' }); }
  });
  app.get('/api/platform-state', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; const directory = await readRepository();
    const onlyOwn = (state: any) => {
      if (!state || !['ASESOR','SUPERVISOR'].includes(user.role)) return state;
      const advisorIds = user.role === 'ASESOR' && user.advisorId ? new Set([user.advisorId]) : new Set(directory.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId)).map(item => item.id));
      const mine = (items: any[] | undefined) => (items || []).filter(item => advisorIds.has(item.advisorId));
      const visibleEvaluations = mine(state.evaluations).filter((item: any) => !item.validationStatus || ['VALIDADO','AJUSTADO_VALIDADO'].includes(item.validationStatus));
      return { ...state, evaluations: visibleEvaluations, actionPlans: mine(state.actionPlans), advisorInterventions: mine(state.advisorInterventions), operationalMeasurements: mine(state.operationalMeasurements), importHistory: [] };
    };
    try {
      if (googleStorage.enabled) {
        const [state, storedEvaluations] = await Promise.all([googleStorage.loadPlatformState(), googleStorage.loadEvaluations()]);
        const consolidated = normalizePlatformState({ ...(state || {}), evaluations: uniqueEvaluations([...(storedEvaluations || []), ...(state?.evaluations || [])]) });
        return res.json({ state: onlyOwn(consolidated) });
      }
    }
    catch (error) { console.error('[google-storage] No fue posible leer el estado de plataforma.', error instanceof Error ? error.message : ''); }
    const row = db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
    const state = row ? JSON.parse(String(row.payload_json)) : {};
    const storedEvaluations = (db.prepare('SELECT payload_json FROM evaluations ORDER BY created_at DESC').all() as any[]).flatMap(item => { try { return [JSON.parse(item.payload_json)]; } catch { return []; } });
    res.json({ state: onlyOwn(normalizePlatformState({ ...state, evaluations: uniqueEvaluations([...storedEvaluations, ...(state.evaluations || [])]) })) });
  });
  app.put('/api/platform-state', requireAuth, async (req, res) => {
    if (['ASESOR','SUPERVISOR'].includes((req as any).authUser.role)) return res.status(403).json({ error: 'Este rol no puede sobrescribir el estado global.' });
    const now = new Date().toISOString();
    const normalizedState = normalizePlatformState(req.body);
    try { if (googleStorage.enabled) { await googleStorage.savePlatformState(normalizedState); for (const evaluation of (normalizedState?.evaluations || [])) if (evaluation?.id && evaluation?.advisorId && evaluation?.evaluatorId && ['QUALITY','D3C'].includes(evaluation?.evaluationType)) await googleStorage.saveEvaluation(evaluation); } }
    catch (error) { console.error('[google-storage] No fue posible guardar el estado de plataforma.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible sincronizar el estado con Google Sheets.' }); }
    db.prepare(`INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run('global', JSON.stringify(normalizedState), now);
    for (const evaluation of (normalizedState?.evaluations || [])) { if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY','D3C'].includes(evaluation?.evaluationType)) continue; try { db.prepare(`INSERT OR IGNORE INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, `${evaluation.date}T${evaluation.time || '00:00'}:00`, JSON.stringify(evaluation), evaluation.createdAt || now); } catch {} }
    res.json({ ok: true });
  });

  app.post('/api/files/upload', requireAuth, async (req, res) => {
    const { name, mimeType, base64 } = req.body || {};
    if (!name || !base64) return res.status(400).json({ error: 'Archivo inválido.' });
    const normalizedMimeType = /\.(mp3|mpeg|mpg)$/i.test(String(name)) ? 'audio/mpeg' : String(mimeType || 'application/octet-stream');
    try { const file = await googleStorage.uploadFile({ name: String(name), mimeType: normalizedMimeType, base64: String(base64) }); res.status(201).json({ file: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, url: `/api/files/${file.id}/content` } }); }
    catch (error) { console.error('[google-storage] No fue posible subir archivo a Drive.', error instanceof Error ? error.message : ''); res.status(502).json({ error: 'No fue posible subir el archivo a Google Drive.' }); }
  });
  app.get('/api/files/:id/content', requireAuth, async (req, res) => {
    try {
      const file = await googleStorage.fileMetadata(req.params.id);
      const stream = await googleStorage.downloadFile(req.params.id);
      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${String(file.name || 'archivo').replace(/[\\\r\n"]/g, '_')}"`,
        'Cache-Control': 'private, max-age=3600'
      });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      console.error('[google-storage] No fue posible descargar archivo de Drive.', error instanceof Error ? error.message : '');
      if (!res.headersSent) res.status(404).json({ error: 'Archivo no encontrado.' });
    }
  });
  app.get('/api/files/:id', requireAuth, async (req, res) => { try { res.json({ file: await googleStorage.fileMetadata(req.params.id) }); } catch { res.status(404).json({ error: 'Archivo no encontrado.' }); } });
  app.delete('/api/files/:id', requireAuth, async (req, res) => { try { await googleStorage.deleteFile(req.params.id); res.status(204).end(); } catch { res.status(404).json({ error: 'Archivo no encontrado.' }); } });

  const qualityManagers = new Set(['ADMINISTRADOR', 'CONSULTOR']);
  const alertRows = () => (db.prepare('SELECT data_json FROM quality_alerts ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const calibrationRows = () => (db.prepare('SELECT data_json FROM calibrations ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const persistAlert = (item: any) => db.prepare(`INSERT INTO quality_alerts (id,status,advisor_id,supervisor_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,advisor_id=excluded.advisor_id,supervisor_id=excluded.supervisor_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.advisorId,item.supervisorId,item.campaignId,JSON.stringify(item),item.publishedAt,item.updatedAt);
  const persistCalibration = (item: any) => db.prepare(`INSERT INTO calibrations (id,status,evaluation_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,evaluation_id=excluded.evaluation_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.evaluationId,item.campaignId,JSON.stringify(item),item.createdAt,item.updatedAt);

  app.get('/api/quality-alerts', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; let alerts = alertRows();
    try { const remote = googleStorage.enabled ? await googleStorage.loadQualityAlerts() : []; if (remote.length) { alerts = remote; remote.forEach(persistAlert); } } catch {}
    if (user.role === 'ASESOR') alerts = alerts.filter(item => item.advisorId === user.advisorId);
    if (user.role === 'SUPERVISOR') alerts = alerts.filter(item => item.supervisorId === user.id);
    res.json({ alerts });
  });
  app.post('/api/quality-alerts', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (!qualityManagers.has(user.role)) return res.status(403).json({ error:'Solo Calidad o Administración puede publicar alertas.' });
    const body = req.body || {}; if (!body.title || !body.advisorId || !body.supervisorId || !body.campaignId || !body.validUntil) return res.status(400).json({ error:'Completa los datos obligatorios.' });
    const now = new Date().toISOString(); const alert = { id:`alert_${randomBytes(8).toString('hex')}`,title:String(body.title),audioUrl:body.audioUrl || undefined,contactNumber:String(body.contactNumber || ''),detail:String(body.detail || ''),advisorId:body.advisorId,supervisorId:body.supervisorId,campaignId:body.campaignId,validUntil:body.validUntil,criticality:['BAJA','MEDIA','ALTA','CRITICA'].includes(body.criticality)?body.criticality:'MEDIA',status:'NUEVA',publishedAt:now,createdBy:user.id,updatedAt:now };
    try { persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert); res.status(201).json({ alert }); } catch { res.status(502).json({ error:'No fue posible guardar la alerta.' }); }
  });
  app.patch('/api/quality-alerts/:id', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; let items = alertRows(); try { const remote = googleStorage.enabled ? await googleStorage.loadQualityAlerts() : []; if (remote.length) items=remote; } catch {}
    const current = items.find(item => item.id === req.params.id); if (!current) return res.status(404).json({ error:'Alerta no encontrada.' });
    const isAssigned = user.role === 'SUPERVISOR' && current.supervisorId === user.id; if (!isAssigned && !qualityManagers.has(user.role)) return res.status(403).json({ error:'No puedes gestionar esta alerta.' });
    const body=req.body||{}; const now=new Date().toISOString(); const nextStatus=body.status || current.status;
    if (isAssigned && !['PENDIENTE_GESTION','GESTIONADA'].includes(nextStatus)) return res.status(403).json({ error:'El supervisor solo puede gestionar la alerta.' });
    if (nextStatus === 'GESTIONADA' && (!body.feedbackPerformed || !String(body.managementDetail || '').trim())) return res.status(400).json({ error:'Registra el feedback y el detalle de gestión.' });
    const managedAt=nextStatus==='GESTIONADA'?(current.managedAt||now):current.managedAt; const alert={...current,...body,status:nextStatus,managedAt,closedAt:nextStatus==='CERRADA'?now:current.closedAt,elapsedMinutes:managedAt?Math.max(0,Math.round((new Date(managedAt).getTime()-new Date(current.publishedAt).getTime())/60000)):current.elapsedMinutes,updatedAt:now};
    try { persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert); res.json({ alert }); } catch { res.status(502).json({ error:'No fue posible actualizar la alerta.' }); }
  });

  app.get('/api/calibrations', requireAuth, async (req, res) => {
    const user=(req as any).authUser as User; if (user.role === 'ASESOR') return res.json({ calibrations:[] }); let rows=calibrationRows();
    try { const remote=googleStorage.enabled?await googleStorage.loadCalibrations():[]; if(remote.length){rows=remote;remote.forEach(persistCalibration);} } catch {}
    const today = new Date().toISOString().slice(0,10); rows = rows.map(item => {
      if (!item.dueAt || item.dueAt >= today || item.status === 'COMPLETADA') return item;
      const participants = (item.participants || []).map((participant:any) => participant.status === 'PENDIENTE' ? { ...participant, status:'VENCIDA' } : participant);
      const expired = { ...item, participants, status:'VENCIDA', updatedAt:new Date().toISOString() }; persistCalibration(expired); return expired;
    });
    if(user.role==='SUPERVISOR') rows=rows.filter(item=>item.participants?.some((participant:any)=>participant.supervisorId===user.id)).map(item=>{const {officialAnswers,...safe}=item;return safe;});
    res.json({ calibrations:rows });
  });
  app.post('/api/calibrations', requireAuth, async (req, res) => {
    const user=(req as any).authUser as User; if(!qualityManagers.has(user.role))return res.status(403).json({error:'Solo Calidad o Administración puede crear calibraciones.'}); const body=req.body||{}; const evaluation=body.evaluation;
    if(!evaluation?.id||evaluation.evaluationType!=='QUALITY'||!Array.isArray(body.supervisorIds)||!body.supervisorIds.length)return res.status(400).json({error:'Selecciona una evaluación de Calidad y al menos un supervisor.'});
    const now=new Date().toISOString(); const officialAnswers=Object.fromEntries((evaluation.items||[]).filter((item:any)=>item.compliance).map((item:any)=>[item.criterionId,item.compliance])); const attributeLabels=Object.fromEntries((evaluation.items||[]).map((item:any)=>[item.criterionId,item.qualityGuideline?.name||item.attribute||item.criterionId]));
    const caseSnapshot={callId:evaluation.callId,date:evaluation.date,product:evaluation.product,audioUrl:evaluation.audioUrl,audioFileName:evaluation.audioFileName,audioDurationSeconds:evaluation.audioDurationSeconds};const calibration={id:`cal_${randomBytes(8).toString('hex')}`,evaluationId:evaluation.id,campaignId:evaluation.campaignId,title:String(body.title||`Calibración ${evaluation.callId}`),dueAt:body.dueAt,status:'PENDIENTE',participants:[...new Set(body.supervisorIds)].map(supervisorId=>({supervisorId,status:'PENDIENTE'})),officialAnswers,attributeLabels,caseSnapshot,createdBy:user.id,createdAt:now,updatedAt:now};
    try{persistCalibration(calibration);if(googleStorage.enabled)await googleStorage.saveCalibration(calibration);res.status(201).json({calibration});}catch{res.status(502).json({error:'No fue posible crear la calibración.'});}
  });
  app.patch('/api/calibrations/:id/respond', requireAuth, async (req,res)=>{
    const user=(req as any).authUser as User;if(user.role!=='SUPERVISOR')return res.status(403).json({error:'Solo un supervisor invitado puede responder.'});let rows=calibrationRows();try{const remote=googleStorage.enabled?await googleStorage.loadCalibrations():[];if(remote.length)rows=remote;}catch{} const current=rows.find(item=>item.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});const participant=current.participants?.find((item:any)=>item.supervisorId===user.id);if(!participant)return res.status(403).json({error:'No tienes invitación para esta calibración.'});
    if(participant.status==='VENCIDA')return res.status(400).json({error:'La invitación está vencida.'});const answers=req.body?.answers||{};const keys=Object.keys(current.officialAnswers||{}).filter(key=>answers[key]);if(!keys.length)return res.status(400).json({error:'Responde al menos un atributo.'});const agreement=Math.round(keys.filter(key=>answers[key]===current.officialAnswers[key]).length/keys.length*100);const now=new Date().toISOString();const participants=current.participants.map((item:any)=>item.supervisorId===user.id?{...item,status:'RESPONDIDA',answers,agreement,submittedAt:now}:item);const calibration={...current,participants,status:participants.every((item:any)=>item.status==='RESPONDIDA')?'COMPLETADA':'EN_CURSO',updatedAt:now};
    try{persistCalibration(calibration);if(googleStorage.enabled)await googleStorage.saveCalibration(calibration);const {officialAnswers,...safe}=calibration;res.json({calibration:safe});}catch{res.status(502).json({error:'No fue posible guardar la calibración.'});}
  });

  const developmentAdmin = (req: express.Request, res: express.Response) => (req as any).authUser?.role === 'ADMINISTRADOR' || res.status(403).json({ error: 'Acceso restringido a administración.' });
  const capsuleRows = () => (db.prepare('SELECT data_json FROM development_capsules ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const assignmentRows = () => (db.prepare('SELECT data_json FROM development_assignments ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const syncDevelopment = async () => { if (googleStorage.enabled) await googleStorage.saveDevelopment(capsuleRows(), assignmentRows()); };
  let developmentHydration: Promise<void> | null = null;
  const hydrateDevelopment = async () => {
    if (!googleStorage.enabled) return;
    if (developmentHydration) return developmentHydration;
    developmentHydration = (async () => {
      await readRepository();
      const remote = await googleStorage.loadDevelopment();
      if (!remote.capsules.length && !remote.assignments.length) return;
      const insertCapsule = db.prepare(`INSERT INTO development_capsules (id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data_json=excluded.data_json,updated_at=excluded.updated_at`);
      const insertAssignment = db.prepare(`INSERT INTO development_assignments (id,capsule_id,advisor_id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data_json=excluded.data_json,updated_at=excluded.updated_at`);
      for (const item of remote.capsules) insertCapsule.run(item.id, item.status, JSON.stringify(item), item.createdAt, item.updatedAt);
      for (const item of remote.assignments) {
        try { insertAssignment.run(item.id, item.capsuleId, item.advisorId, item.status, JSON.stringify(item), item.assignedAt, item.updatedAt); }
        catch (error) { console.error('[development] No fue posible hidratar una asignación.', item.id, error instanceof Error ? error.message : ''); }
      }
    })();
    try { await developmentHydration; }
    finally { developmentHydration = null; }
  };
  app.get('/api/development/capsules', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (!['ADMINISTRADOR','ASESOR'].includes(user.role)) return res.status(403).json({ error:'Acceso denegado.' }); try{await hydrateDevelopment();}catch(error){console.error('[google-storage] No fue posible cargar desarrollo.',error instanceof Error?error.message:'');} const capsules = capsuleRows();
    if (user.role !== 'ASESOR') return res.json({ capsules });
    const ids = new Set(assignmentRows().filter(item => item.advisorId === user.advisorId).map(item => item.capsuleId));
    return res.json({ capsules: capsules.filter(item => item.status === 'PUBLICADA' && ids.has(item.id)) });
  });
  app.get('/api/development/capsules/:id/forum', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    if (!['ADMINISTRADOR', 'ASESOR'].includes(user.role)) return res.status(403).json({ error: 'Acceso denegado.' });
    try { await hydrateDevelopment(); } catch {}
    const capsuleRow = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any;
    if (!capsuleRow) return res.status(404).json({ error: 'Cápsula no encontrada.' });
    const capsule = JSON.parse(capsuleRow.data_json);
    if (capsule.evaluation?.type !== 'FORO') return res.status(400).json({ error: 'Esta cápsula no contiene un foro.' });
    const assignments = assignmentRows().filter(item => item.capsuleId === req.params.id);
    if (user.role === 'ASESOR' && (!user.advisorId || !assignments.some(item => item.advisorId === user.advisorId))) return res.status(403).json({ error: 'No tienes esta cápsula asignada.' });
    const advisorName = db.prepare('SELECT name FROM advisors WHERE id=?');
    const posts = assignments.flatMap(item => {
      const saved = Array.isArray(item.forumPosts) ? item.forumPosts : [];
      const legacy = !saved.length && item.forumPost ? [{ id: `legacy_${item.id}`, advisorId: item.advisorId, text: item.forumPost, createdAt: item.updatedAt || item.assignedAt }] : [];
      return [...saved, ...legacy].map(post => ({ ...post, advisorName: (advisorName.get(post.advisorId || item.advisorId) as any)?.name || 'Asesor' }));
    }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return res.json({ posts });
  });
  app.post('/api/development/capsules', requireAuth, async (req, res) => {
    if (developmentAdmin(req, res) !== true) return; const now = new Date().toISOString(); const body = req.body || {};
    const capsule = { ...body, id: `cap_${randomBytes(8).toString('hex')}`, status: 'BORRADOR', createdAt: now, updatedAt: now };
    if (!capsule.title || !capsule.content?.type || !['FORMULARIO','FORO'].includes(capsule.evaluation?.type)) return res.status(400).json({ error: 'Datos de cápsula incompletos.' });
    db.prepare('INSERT INTO development_capsules (id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(capsule.id, capsule.status, JSON.stringify(capsule), now, now); await syncDevelopment(); return res.status(201).json({ capsule });
  });
  app.patch('/api/development/capsules/:id', requireAuth, async (req, res) => {
    if (developmentAdmin(req, res) !== true) return; const row = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any; if (!row) return res.status(404).json({ error: 'Cápsula no encontrada.' });
    const now = new Date().toISOString(); const capsule = { ...JSON.parse(row.data_json), ...req.body, id: req.params.id, updatedAt: now };
    db.prepare('UPDATE development_capsules SET status=?,data_json=?,updated_at=? WHERE id=?').run(capsule.status, JSON.stringify(capsule), now, capsule.id); await syncDevelopment(); return res.json({ capsule });
  });
  app.post('/api/development/capsules/:id/duplicate', requireAuth, async (req, res) => {
    if (developmentAdmin(req, res) !== true) return; const row = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any; if (!row) return res.status(404).json({ error: 'Cápsula no encontrada.' });
    const now = new Date().toISOString(); const capsule = { ...JSON.parse(row.data_json), id: `cap_${randomBytes(8).toString('hex')}`, title: `${JSON.parse(row.data_json).title} · Copia`, status: 'BORRADOR', createdAt: now, updatedAt: now };
    db.prepare('INSERT INTO development_capsules (id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(capsule.id, capsule.status, JSON.stringify(capsule), now, now); await syncDevelopment(); return res.status(201).json({ capsule });
  });
  app.delete('/api/development/capsules/:id', requireAuth, async (req, res) => { if (developmentAdmin(req, res) !== true) return; db.prepare('DELETE FROM development_assignments WHERE capsule_id=?').run(req.params.id); db.prepare('DELETE FROM development_capsules WHERE id=?').run(req.params.id); await syncDevelopment(); return res.status(204).end(); });
  app.get('/api/development/assignments', requireAuth, async (req, res) => { const user = (req as any).authUser as User; if(!['ADMINISTRADOR','ASESOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});try{await hydrateDevelopment();}catch{} const assignments = assignmentRows().map(item=>item.dueAt&&new Date(item.dueAt)<new Date()&&!['COMPLETADA','VENCIDA'].includes(item.status)?{...item,status:'VENCIDA'}:item); return res.json({ assignments: user.role === 'ASESOR' ? assignments.filter(item => item.advisorId === user.advisorId) : assignments }); });
  app.post('/api/development/assignments', requireAuth, async (req, res) => {
    if (developmentAdmin(req, res) !== true) return; const body = req.body || {}; const capsule = db.prepare('SELECT id FROM development_capsules WHERE id=? AND status=?').get(body.capsuleId, 'PUBLICADA'); if (!capsule) return res.status(400).json({ error: 'La cápsula debe estar publicada.' });
    const directory = await readRepository();
    const advisorIds = new Set<string>(Array.isArray(body.advisorIds) ? body.advisorIds : []); if (body.campaignId) directory.advisors.filter(advisor => advisor.campaignId === body.campaignId && advisor.active !== false && advisor.status !== 'INACTIVO').forEach(advisor => advisorIds.add(advisor.id)); if(body.groupId)directory.advisors.filter(advisor => advisor.teamId === body.groupId && advisor.active !== false && advisor.status !== 'INACTIVO').forEach(advisor=>advisorIds.add(advisor.id)); const now = new Date().toISOString(); const created: any[] = [];
    for (const advisorId of advisorIds) { const assignment = { id: `asg_${randomBytes(8).toString('hex')}`, capsuleId: body.capsuleId, advisorId, campaignId: body.campaignId || null, groupId: body.groupId || null, origin: body.origin || 'Manual', originId: body.originId || null, gap: body.gap || '', assignedAt: now, dueAt: body.dueAt || null, status: 'PENDIENTE', progress: 0, result: null, attempts: 0, duration: 0, forumPost: null, evidence: null, updatedAt: now }; try { db.prepare('INSERT INTO development_assignments (id,capsule_id,advisor_id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(assignment.id, assignment.capsuleId, advisorId, assignment.status, JSON.stringify(assignment), now, now); created.push(assignment); } catch {} }
    await syncDevelopment(); return res.status(201).json({ assignments: created });
  });
  app.patch('/api/development/assignments/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT data_json FROM development_assignments WHERE id=?').get(req.params.id) as any; if (!row) return res.status(404).json({ error: 'Asignación no encontrada.' }); const current = JSON.parse(row.data_json); const user = (req as any).authUser as User;
    if (user.role === 'ASESOR' && user.advisorId !== current.advisorId) return res.status(403).json({ error: 'No puedes modificar esta asignación.' }); if (user.role !== 'ASESOR' && user.role !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Acceso denegado.' });
    let changes: Record<string, unknown> = req.body || {};
    if (user.role === 'ASESOR') {
      changes = {};
      if (req.body?.contentViewed) Object.assign(changes, { contentViewed: true, status: current.status === 'COMPLETADA' ? current.status : 'EN_CURSO', progress: Math.max(current.progress || 0, 50) });
      if (Number.isFinite(Number(req.body?.duration))) changes.duration = Math.max(0, Number(req.body.duration));
      if (typeof req.body?.evidence === 'string') changes.evidence = req.body.evidence.slice(0, 2000);
      if (typeof req.body?.answer === 'string') {
        const capsuleRow = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(current.capsuleId) as any;
        if (!capsuleRow) return res.status(404).json({ error: 'Cápsula no encontrada.' });
        const capsule = JSON.parse(capsuleRow.data_json); const evaluation = capsule.evaluation || {}; const answer = req.body.answer.trim(); const attempts = (current.attempts || 0) + 1;
        if (evaluation.type === 'FORMULARIO' && evaluation.attempts && attempts > evaluation.attempts) return res.status(400).json({ error: 'No quedan intentos disponibles.' });
        if (evaluation.type === 'FORO' && answer.length < Number(evaluation.minChars || 1)) return res.status(400).json({ error: `La respuesta debe tener al menos ${Number(evaluation.minChars || 1)} caracteres.` });
        const normalize = (value: string) => value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean).sort().join('|');
        const result = evaluation.type === 'FORMULARIO' && evaluation.correctAnswer ? (normalize(answer) === normalize(evaluation.correctAnswer) ? Number(evaluation.score || 100) : 0) : 100;
        const completed = evaluation.type === 'FORO' ? (evaluation.requiredResponse === false || answer.length >= Number(evaluation.minChars || 1)) : result >= Number(evaluation.minimumScore || 0);
        const forumPosts = evaluation.type === 'FORO' ? [...(Array.isArray(current.forumPosts) ? current.forumPosts : []), { id: `post_${randomBytes(8).toString('hex')}`, advisorId: current.advisorId, text: answer, createdAt: new Date().toISOString() }] : current.forumPosts;
        Object.assign(changes, { status: completed ? 'COMPLETADA' : 'EN_CURSO', progress: completed ? 100 : 60, result, attempts, forumPost: evaluation.type === 'FORO' ? answer : current.forumPost, forumPosts, contentViewed: true });
      }
    }
    const updatedAt = new Date().toISOString(); const assignment = { ...current, ...changes, id: current.id, advisorId: current.advisorId, capsuleId: current.capsuleId, updatedAt };
    db.prepare('UPDATE development_assignments SET status=?,data_json=?,updated_at=? WHERE id=?').run(assignment.status, JSON.stringify(assignment), updatedAt, assignment.id); await syncDevelopment(); return res.json({ assignment });
  });

  // Health checks independientes de autenticación, datos y servicios externos.
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // Vite middleware setup
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { setHeaders: (res, filePath) => res.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable') }));
    app.get("*", (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const listen = (port: number, attempts = 0) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Server 3C running on http://0.0.0.0:${port}`);
    });
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && !process.env.PORT && attempts < 10) {
        console.warn(`Puerto ${port} ocupado; intentando ${port + 1}.`);
        listen(port + 1, attempts + 1);
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
  };
  listen(PORT);
}

startServer();
