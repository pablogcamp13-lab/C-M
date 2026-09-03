import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
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
CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, status TEXT NOT NULL, products_json TEXT NOT NULL, description TEXT);
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
CREATE INDEX IF NOT EXISTS idx_advisors_campaign ON advisors(campaign_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_advisor_type ON evaluations(advisor_id, evaluation_type);`);
if (!(db.prepare('PRAGMA table_info(feedbacks)').all() as any[]).some(column => column.name === 'advisor_evidence_url')) db.exec('ALTER TABLE feedbacks ADD COLUMN advisor_evidence_url TEXT');
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some(column => column.name === 'must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1');

if (isProduction && !process.env.INITIAL_ADMIN_PASSWORD) throw new Error('INITIAL_ADMIN_PASSWORD es obligatoria en producción.');
const INITIAL_PASSWORD = '12345678';
const DEFAULT_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || INITIAL_PASSWORD;
const hashPassword = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const validPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const derived = scryptSync(password, salt, 64); return timingSafeEqual(derived, Buffer.from(hash, 'hex')); };
const publicUser = (row: any): User => ({ id: row.id, name: row.name, email: row.email, username: row.username || undefined, role: row.role, status: row.status, teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at, mustChangePassword: Boolean(row.must_change_password) });

function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM users').get().total as number;
  const now = new Date().toISOString();
  if (!count) db.prepare('INSERT INTO users (id,name,email,username,role,status,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?)').run('usr_admin', 'Administrador Principal', 'admin@consultoria3c.com', 'admin', 'ADMINISTRADOR', 'ACTIVO', now, hashPassword(DEFAULT_ADMIN_PASSWORD));
  db.prepare('INSERT OR IGNORE INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?)').run('camp_1', 'Campaña Comercial 3C', 'Operación Principal', 'ACTIVA', JSON.stringify(['Servicio Móvil', 'Portabilidad / Migraciones', 'BiPay Digital']), 'Campaña activa para evaluación de calidad y efectividad 3C.');
  if (!(db.prepare('SELECT COUNT(*) AS total FROM advisors').get().total as number)) {
    db.prepare('INSERT OR IGNORE INTO users (id,name,email,username,role,status,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?)').run('usr_sup_demo','Ana Ramírez','ana.ramirez@demo.local','ana.ramirez','SUPERVISOR','ACTIVO',now,hashPassword('demo1234'));
    db.prepare('INSERT OR IGNORE INTO users (id,name,email,username,role,status,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?)').run('usr_eval_demo','José López','jose.lopez@demo.local','jose.lopez','CONSULTOR','ACTIVO',now,hashPassword('demo1234'));
    db.prepare('INSERT OR IGNORE INTO teams (id,campaign_id,supervisor_id,name) VALUES (?,?,?,?)').run('team_demo','camp_1','usr_sup_demo','Equipo Migraciones Demo');
    const a1 = { id:'adv_demo_1', dni:'70000001', employeeCode:'A-10234', name:'María Fernanda López', campaignId:'camp_1', teamId:'team_demo', supervisorId:'usr_sup_demo', status:'ACTIVO', hireDate:'2025-01-15', quartile:'Q2', active:true };
    const a2 = { id:'adv_demo_2', dni:'70000002', employeeCode:'A-10987', name:'Juan Manuel Torres', campaignId:'camp_1', teamId:'team_demo', supervisorId:'usr_sup_demo', status:'ACTIVO', hireDate:'2024-08-10', quartile:'Q3', active:true };
    for (const a of [a1,a2]) db.prepare('INSERT OR IGNORE INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?)').run(a.id,a.dni,a.employeeCode,a.name,a.campaignId,a.teamId,a.supervisorId,JSON.stringify(a));
    const e1 = { id:'eval_demo_d3c', advisorId:a1.id, evaluatorId:'usr_eval_demo', supervisorId:'usr_sup_demo', teamId:'team_demo', campaignId:'camp_1', evaluationType:'D3C', date:'2026-08-31', time:'10:30', callId:'LLAM-71920', scoreTotal:82, primaryGap:'Proceso de migración', comments:'La asesora debe profundizar el proceso de migración.', recommendation:'Reforzar el proceso de migración.', items:[] };
    const e2 = { id:'eval_demo_quality', advisorId:a2.id, evaluatorId:'usr_eval_demo', supervisorId:'usr_sup_demo', teamId:'team_demo', campaignId:'camp_1', evaluationType:'QUALITY', date:'2026-08-30', time:'15:15', callId:'PUE-DEMO-002', scoreTotal:76, primaryGap:'Ofrecimiento y condiciones', comments:'Debe reforzar la validación de condiciones.', recommendation:'Reforzar la validación del cliente.', items:[] };
    for (const e of [e1,e2]) db.prepare('INSERT OR IGNORE INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)').run(e.id,e.advisorId,e.evaluatorId,e.evaluationType,`${e.date}T${e.time}:00`,JSON.stringify(e),now);
  }
}
seedDatabase();

function repository(): SharedRepository {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(publicUser);
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY name').all().map((r: any) => ({ id: r.id, name: r.name, client: r.client, status: r.status, products: JSON.parse(r.products_json), description: r.description || undefined }));
  const teams = db.prepare('SELECT * FROM teams ORDER BY name').all().map((r: any) => ({ id: r.id, campaignId: r.campaign_id, supervisorId: r.supervisor_id, name: r.name }));
  const advisors = db.prepare('SELECT data_json FROM advisors ORDER BY name').all().map((r: any) => JSON.parse(r.data_json));
  return { users, campaigns, teams, advisors };
}

function persistRepository(input: SharedRepository) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const source = input;
    for (const campaign of source.campaigns || []) db.prepare(`INSERT INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,client=excluded.client,status=excluded.status,products_json=excluded.products_json,description=excluded.description`).run(campaign.id, campaign.name, campaign.client, campaign.status, JSON.stringify(campaign.products || []), campaign.description || null);
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

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token && db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').get(token, new Date().toISOString());
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

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();

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
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(token, user.id, expiresAt, new Date().toISOString());
    return res.json({ token, user: publicUser(user), expiresAt });
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
  app.post('/api/auth/logout', requireAuth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token=?').run((req as any).token); res.status(204).end(); });
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
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'El asesor no puede modificar la dotación.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible migrar la dotación.' }); }
  });
  app.put('/api/shared-repository/sync', requireAuth, async (req, res) => {
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'El asesor no puede modificar la dotación.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible guardar la dotación.' }); }
  });
  app.post('/api/evaluations', requireAuth, async (req, res) => {
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'El asesor no puede crear evaluaciones.' });
    const evaluation = req.body;
    if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY', 'D3C'].includes(evaluation?.evaluationType)) return res.status(400).json({ error: 'Evaluación inválida.' });
    try {
      if (googleStorage.enabled) await googleStorage.saveEvaluation(evaluation);
      db.prepare(`INSERT INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, `${evaluation.date}T${evaluation.time || '00:00'}:00`, JSON.stringify(evaluation), evaluation.createdAt || new Date().toISOString());
      return res.status(201).json({ evaluation });
    } catch (error: any) { console.error('[google-storage] No fue posible guardar la evaluación.', error instanceof Error ? error.message : ''); return res.status(400).json({ error: error.message || 'No fue posible guardar la evaluación.' }); }
  });
  app.get('/api/feedbacks', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    const onlyOwn = (feedbacks: any[]) => user.role === 'ASESOR' ? feedbacks.filter(feedback => feedback.advisor_id === user.advisorId) : feedbacks;
    try { const remote = googleStorage.enabled ? await googleStorage.loadFeedbacks() : null; if (remote) return res.json({ feedbacks: onlyOwn(remote) }); }
    catch (error) { console.error('[google-storage] No fue posible leer feedbacks.', error instanceof Error ? error.message : ''); }
    res.json({ feedbacks: onlyOwn(db.prepare('SELECT * FROM feedbacks ORDER BY updated_at DESC').all() as any[]) });
  });
  app.post('/api/feedbacks', requireAuth, async (req, res) => {
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'Un asesor no puede crear feedbacks.' });
    const body = req.body || {}; const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(body.evaluation_id) as any;
    if (!evaluation) return res.status(400).json({ error: 'La evaluación origen no existe.' });
    const ev = JSON.parse(evaluation.payload_json); const now = new Date().toISOString(); const feedback = { feedback_id: `fb_${randomBytes(8).toString('hex')}`, evaluation_id: ev.id, advisor_id: ev.advisorId, supervisor_id: ev.supervisorId, evaluator_id: ev.evaluatorId, evaluation_type: ev.evaluationType, feedback_text: String(body.feedback_text || ''), advisor_response: null, advisor_evidence_url: null, supervisor_closure_comment: null, status: 'PENDIENTE', created_at: now, advisor_action_at: null, closed_at: null, updated_at: now };
    try { if (googleStorage.enabled) await googleStorage.saveFeedback(feedback); db.prepare('INSERT INTO feedbacks (feedback_id,evaluation_id,advisor_id,supervisor_id,evaluator_id,evaluation_type,feedback_text,advisor_evidence_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(feedback.feedback_id, feedback.evaluation_id, feedback.advisor_id, feedback.supervisor_id, feedback.evaluator_id, feedback.evaluation_type, feedback.feedback_text, feedback.advisor_evidence_url, feedback.status, now, now); res.status(201).json({ feedback }); }
    catch (error) { console.error('[google-storage] No fue posible guardar feedback.', error instanceof Error ? error.message : ''); res.status(400).json({ error: 'Esta evaluación ya tiene feedback o no fue posible sincronizarlo.' }); }
  });
  app.patch('/api/feedbacks/:id', requireAuth, async (req, res) => {
    const current = db.prepare('SELECT * FROM feedbacks WHERE feedback_id=?').get(req.params.id) as any; if (!current) return res.status(404).json({ error: 'Feedback no encontrado.' }); const body = req.body || {}; const status = body.status || current.status; const user = (req as any).authUser as User;
    if (user.role === 'ASESOR' && (user.advisorId !== current.advisor_id || !['VALIDADO_ASESOR', 'OBSERVADO_ASESOR'].includes(status))) return res.status(403).json({ error: 'No tienes permiso para cerrar o modificar este feedback.' });
    const valid = (current.status === 'PENDIENTE' && ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status)) || (['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(current.status) && status === 'CERRADO_SUPERVISOR') || status === current.status;
    if (!valid || (status === 'CERRADO_SUPERVISOR' && current.status === 'OBSERVADO_ASESOR' && !String(body.supervisor_closure_comment || current.supervisor_closure_comment || '').trim())) return res.status(400).json({ error: 'Transición de feedback no permitida o falta comentario de cierre.' });
    const now = new Date().toISOString(); const feedback = { ...current, status, advisor_response: body.advisor_response ?? current.advisor_response, advisor_evidence_url: body.advisor_evidence_url ?? current.advisor_evidence_url, supervisor_closure_comment: body.supervisor_closure_comment ?? current.supervisor_closure_comment, advisor_action_at: ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status) ? now : current.advisor_action_at, closed_at: status === 'CERRADO_SUPERVISOR' ? now : current.closed_at, updated_at: now };
    try { if (googleStorage.enabled) await googleStorage.saveFeedback(feedback); db.prepare('UPDATE feedbacks SET status=?, advisor_response=?, advisor_evidence_url=?, supervisor_closure_comment=?, advisor_action_at=?, closed_at=?, updated_at=? WHERE feedback_id=?').run(feedback.status, feedback.advisor_response, feedback.advisor_evidence_url, feedback.supervisor_closure_comment, feedback.advisor_action_at, feedback.closed_at, feedback.updated_at, req.params.id); res.json({ feedback }); }
    catch (error) { console.error('[google-storage] No fue posible actualizar feedback.', error instanceof Error ? error.message : ''); res.status(502).json({ error: 'No fue posible sincronizar el feedback.' }); }
  });
  app.get('/api/platform-state', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    const onlyOwn = (state: any) => {
      if (!state || user.role !== 'ASESOR' || !user.advisorId) return state;
      const mine = (items: any[] | undefined) => (items || []).filter(item => item.advisorId === user.advisorId);
      return { ...state, evaluations: mine(state.evaluations), actionPlans: mine(state.actionPlans), advisorInterventions: mine(state.advisorInterventions), operationalMeasurements: mine(state.operationalMeasurements), importHistory: [] };
    };
    try { const state = googleStorage.enabled ? await googleStorage.loadPlatformState() : null; if (state !== null) return res.json({ state: onlyOwn(state) }); }
    catch (error) { console.error('[google-storage] No fue posible leer el estado de plataforma.', error instanceof Error ? error.message : ''); }
    const row = db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global'); res.json({ state: row ? onlyOwn(JSON.parse(String(row.payload_json))) : null });
  });
  app.put('/api/platform-state', requireAuth, async (req, res) => {
    if ((req as any).authUser.role === 'ASESOR') return res.status(403).json({ error: 'El asesor no puede sobrescribir el estado global.' });
    const now = new Date().toISOString();
    try { if (googleStorage.enabled) { await googleStorage.savePlatformState(req.body); for (const evaluation of (req.body?.evaluations || [])) if (evaluation?.id && evaluation?.advisorId && evaluation?.evaluatorId && ['QUALITY','D3C'].includes(evaluation?.evaluationType)) await googleStorage.saveEvaluation(evaluation); } }
    catch (error) { console.error('[google-storage] No fue posible guardar el estado de plataforma.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible sincronizar el estado con Google Sheets.' }); }
    db.prepare(`INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run('global', JSON.stringify(req.body), now);
    for (const evaluation of (req.body?.evaluations || [])) { if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY','D3C'].includes(evaluation?.evaluationType)) continue; try { db.prepare(`INSERT OR IGNORE INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, `${evaluation.date}T${evaluation.time || '00:00'}:00`, JSON.stringify(evaluation), evaluation.createdAt || now); } catch {} }
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

  // Gemini 3C Audio & Call Analysis Endpoint
  app.post("/api/analyze-audio-3c", async (req, res) => {
    try {
      const {
        audioBase64,
        audioMimeType,
        audioFileName,
        audioDurationSeconds,
        advisorName,
        campaignName,
        productOffered,
        evaluationType,
        saleResult,
        criteriaScores, // Array of { name, dimension, level, finding, evidence }
        currentComments
      } = req.body;

      const ai = getGeminiClient();

      const criteriaContext = Array.isArray(criteriaScores)
        ? criteriaScores.map((c: any) => `- [${c.dimension || '3C'}] ${c.name || c.id}: Nivel ${c.level || 1} (${c.percentage || 0}%) | Hallazgo: ${c.finding || 'Sin especificar'} | Evidencia: ${c.evidence || 'N/A'}`).join('\n')
        : 'Criterios no proporcionados.';

      const systemPrompt = `Eres un Auditor Experto y Consultor Senior de Calidad Comercial especializado en la METODOLOGÍA 3C (Conectar, Clarificar, Convertir) para Contact Centers de Telecomunicaciones (Campañas Bitel Portabilidad/Migración y Billetera Digital BiPay).

Tu misión es analizar exhaustivamente la llamada o audio adjunto basándote en los 3 pilares y 9 criterios de la Metodología 3C:

PILAR 1: CONECTAR (C1)
1. Fluidez verbal: Ausencia de muletillas (ehh, este, o sea, verdad), vacíos, trabas o silencios incómodos.
2. Manejo de la voz: Modulación, ritmo, volumen controlado, entonación asertiva y cordial, pausas intencionales.
3. Seguridad comunicativa: Firmeza, orden estructurado de ideas, naturalidad sin sonar acartonado ni improvisado.

PILAR 2: CLARIFICAR (C2)
4. Dominio de información: Conocimiento exacto de planes (Plan Flash S/29.90, Planes Ilimitados S/39.90 a S/105.90), tarifas, gigas, minutos, BiPay (cashback/ahorro), condiciones y restricciones sin contradicciones.
5. Simplificación del mensaje: Explicación sencilla, estructurada paso a paso y sin tecnicismos complejos.
6. Traducción a beneficio (BiPay foco): Conversión de características a beneficios tangibles y utilidad cotidiana (ej: "Con BiPay pagas S/27.93 en vez de S/39.90, te devuelven S/11.97 para tus siguientes recargas").

PILAR 3: CONVERTIR (C3)
7. Argumentación comercial: Construcción de valor diferencial, comparativa de ahorro prepago vs postpago, generación de urgencia/interés.
8. Manejo de objeciones: Escuchar sin interrumpir, comprender la causa raíz (precio, desconfianza, cobertura), validar con empatía y reargumentar sólidamente.
9. Cierre comercial: Identificación de señales de compra, preguntas de cierre oportunas (doble alternativa, cierre presuntivo), propuesta clara del siguiente paso.

DEBES PROPORCIONAR:
1. Una descripción detallada y profesional de la llamada (contexto del cliente, tono de la interacción, dinámica y resultado).
2. Lista de Alertas Críticas 3C (ALTA, MEDIA o BAJA) con minuto aproximado si aplica, pilar 3C asociado, descripción del riesgo o mala práctica y recomendación correctiva.
3. Resumen por cada pilar 3C (Conectar, Clarificar, Convertir).
4. Conclusiones y retroalimentación sintetizada para el evaluador.`;

      const parts: any[] = [];

      // If audio file is provided
      if (audioBase64) {
        // Clean base64 header if present
        const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/mp3',
            data: cleanBase64
          }
        });
      }

      const promptText = `Analiza la siguiente llamada bajo la Metodología 3C:
- Asesor evaluado: ${advisorName || 'Asesor'}
- Campaña: ${campaignName || 'Portabilidad / Migraciones Bitel'}
- Plan/Producto ofrecido: ${productOffered || 'Plan Ilimitado S/ 39.90'}
- Tipo de evaluación: ${evaluationType || 'Diagnóstico Inicial'}
- Resultado reportado: ${saleResult || 'Por determinar'}
- Archivo de audio: ${audioFileName || 'Audio de llamada'} (${audioDurationSeconds || 300} seg)
- Observaciones previas del evaluador: ${currentComments || 'Ninguna'}

Evaluación preliminar de criterios 3C registrados:
${criteriaContext}

${audioBase64 ? 'Escucha y analiza directamente el audio de la llamada adjunto, transcribiendo mentalmente los momentos clave y detectando desviaciones metodológicas 3C.' : 'Realiza un diagnóstico analítico exhaustivo y formula la descripción de la llamada y alertas según la información comercial y calificaciones 3C.'}

Responde en formato JSON estricto con el esquema solicitado.`;

      parts.push({ text: promptText });

      // List of supported Gemini 3.x models in prioritized order
      const candidateModels = [
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite"
      ];

      let lastError: any = null;
      let parsedData: any = null;

      const generationConfig = {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            callDescription: {
              type: Type.STRING,
              description: "Descripción completa, profesional y detallada de la interacción, contexto del cliente, actitud del asesor y desarrollo de la llamada."
            },
            detectedSaleLikelihood: {
              type: Type.STRING,
              description: "Probabilidad o resultado comercial observado: ALTA, MEDIA, BAJA o NULA"
            },
            alerts: {
              type: Type.ARRAY,
              description: "Alertas y desviaciones detectadas en la llamada bajo la metodología 3C",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  severity: { 
                    type: Type.STRING,
                    description: "Nivel de severidad: ALTA, MEDIA, BAJA o INFO" 
                  },
                  title: { type: Type.STRING, description: "Título breve y claro de la alerta" },
                  pillar: { 
                    type: Type.STRING,
                    description: "Pilar 3C afectado: CONECTAR, CLARIFICAR o CONVERTIR" 
                  },
                  timestamp: { type: Type.STRING, description: "Minuto aproximado en el audio (ej: '01:24', '02:40')" },
                  description: { type: Type.STRING, description: "Detalle de lo ocurrido en la llamada" },
                  recommendation: { type: Type.STRING, description: "Acción correctiva inmediata para el asesor" }
                },
                required: ["id", "severity", "title", "pillar", "description", "recommendation"]
              }
            },
            methodologySummary: {
              type: Type.OBJECT,
              properties: {
                connectObservations: { type: Type.STRING, description: "Evaluación síntesis del pilar C1 Conectar (voz, fluidez, empatía)" },
                clarifyObservations: { type: Type.STRING, description: "Evaluación síntesis del pilar C2 Clarificar (dominio de planes, BiPay, claridad)" },
                convertObservations: { type: Type.STRING, description: "Evaluación síntesis del pilar C3 Convertir (argumentación de valor, objeciones y cierre)" }
              },
              required: ["connectObservations", "clarifyObservations", "convertObservations"]
            },
            suggestedConclusions: {
              type: Type.STRING,
              description: "Conclusiones ejecutivas redactadas para el evaluador o supervisor que sintetizan fortalezas y plan de acción."
            },
            keyMoments: {
              type: Type.ARRAY,
              description: "Momentos o hitos clave de la llamada",
              items: {
                type: Type.OBJECT,
                properties: {
                  minute: { type: Type.STRING },
                  description: { type: Type.STRING },
                  sentiment: { type: Type.STRING, description: "POSITIVO, NEUTRO o CRITICO" }
                },
                required: ["minute", "description", "sentiment"]
              }
            }
          },
          required: ["callDescription", "alerts", "methodologySummary", "suggestedConclusions"]
        }
      };

      for (const modelName of candidateModels) {
        // Try up to 2 attempts per model in case of temporary 503 spike
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`Attempting 3C analysis with model: ${modelName} (attempt ${attempt})`);
            const response = await ai.models.generateContent({
              model: modelName,
              contents: { parts },
              config: generationConfig
            });

            const rawJson = response.text ? response.text.trim() : "";
            if (rawJson) {
              parsedData = JSON.parse(rawJson);
              console.log(`Successfully generated 3C analysis using ${modelName}`);
              break;
            }
          } catch (err: any) {
            console.warn(`Model ${modelName} attempt ${attempt} failed:`, err?.message || err);
            lastError = err;
            
            // Check if error is 503 high demand or 429
            const errStr = String(err?.message || '');
            if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('429')) {
              // Wait 1.5s before retry
              await new Promise(r => setTimeout(r, 1500));
            } else {
              // Non-recoverable error for this model (e.g. 404), break to next model
              break;
            }
          }
        }

        if (parsedData) {
          break;
        }
      }

      if (!parsedData) {
        let cleanErrorMessage = "El servicio de IA se encuentra momentáneamente saturado. Por favor intenta de nuevo en unos momentos.";
        if (lastError?.message) {
          try {
            const errObj = JSON.parse(lastError.message);
            if (errObj?.error?.message) {
              cleanErrorMessage = errObj.error.message;
            }
          } catch {
            cleanErrorMessage = lastError.message;
          }
        }
        throw new Error(cleanErrorMessage);
      }

      return res.json({
        success: true,
        data: {
          ...parsedData,
          analyzedAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error("Error in /api/analyze-audio-3c:", error);
      let userMsg = error.message || "Error al procesar el análisis de la llamada con IA";
      try {
        const parsedErr = JSON.parse(userMsg);
        if (parsedErr?.error?.message) {
          userMsg = parsedErr.error.message;
        }
      } catch {}

      return res.status(500).json({
        success: false,
        error: userMsg
      });
    }
  });

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
