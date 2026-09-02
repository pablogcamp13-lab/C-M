import 'dotenv/config';
import { copyFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import XLSX from 'xlsx';
import { googleStorage } from '../server/googleStorage';
import type { Advisor, Campaign, User } from '../src/types';

const filePath = process.env.ROSTER_FILE;
if (!filePath) throw new Error('Define ROSTER_FILE con la ruta del Excel de dotación.');

const dateValue = (value: unknown) => value instanceof Date && !Number.isNaN(value.getTime())
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : '';
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const hash = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const id = (prefix: string, value: string) => `${prefix}_${slug(value).replaceAll('.', '_')}`;

const workbook = XLSX.readFile(filePath, { cellDates: true });
const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: null, raw: true });
const rows = raw.filter(row => String(row.DNI || '').trim() && String(row.ASESORES || '').trim());
if (!rows.length) throw new Error('El archivo no contiene asesores válidos.');

const now = new Date().toISOString();
const campaign: Campaign = { id: 'camp_bitel', name: 'Bitel', client: 'Bitel', status: 'ACTIVA', products: [], description: 'Dotación operativa Bitel.' };
const supervisorNames = [...new Set(rows.map(row => String(row.SUPERVISOR || '').trim()).filter(Boolean))];
const supervisors: User[] = supervisorNames.map(name => ({ id: id('usr_sup', name), name, username: slug(name), email: `${slug(name)}@bitel.local`, role: 'SUPERVISOR', status: 'ACTIVO', createdAt: now }));
const teams = supervisors.map(supervisor => ({ id: id('team_bitel', supervisor.name), campaignId: campaign.id, supervisorId: supervisor.id, name: `Equipo Bitel · ${supervisor.name}` }));
const advisors = rows.map((row, index) => {
  const dni = String(row.DNI).trim(); const name = String(row.ASESORES).trim().replace(/\s+/g, ' '); const supervisorName = String(row.SUPERVISOR || '').trim();
  const supervisor = supervisors.find(item => item.name === supervisorName)!; const team = teams.find(item => item.supervisorId === supervisor.id)!;
  const hireDate = dateValue(row['F. INGRESO']); const campaignStartDate = dateValue(row['F. CAMPAÑA']); const terminationDate = dateValue(row['F. CESE']);
  const managementFactor = Number(row.GESTION); const sph = Number(row.SPH);
  return {
    id: `adv_bitel_${dni}`, dni, employeeCode: `BITEL-${dni.slice(-4)}`, name, campaignId: campaign.id, teamId: team.id, supervisorId: supervisor.id, supervisor: supervisor.name,
    schedule: String(row.HORARIO || ''), shift: managementFactor >= 1 ? 'COMPLETO' : 'MANANA', status: terminationDate ? 'INACTIVO' : 'ACTIVO', active: !terminationDate,
    hireDate, hireDatePending: !hireDate, campaignStartDate, campaignStartDatePending: !campaignStartDate, terminationDate: terminationDate || undefined,
    importedTenureLabel: String(row.ANTIGÜEDAD || '').trim(), hasOperationalBaseline: true, baselineConnectionTime: 'Pendiente', baselineConnectionMinutes: 0,
    baselineSph: Number.isFinite(sph) ? sph : 0, baselineDate: '2026-08-31', baselinePeriod: 'Agosto 2026', managementFactor, index
  };
}) as Advisor[];
const advisorUsers: User[] = advisors.map(advisor => ({ id: `usr_${advisor.id}`, name: advisor.name, username: slug(advisor.name), email: `${slug(advisor.name)}@asesores3c.com`, role: 'ASESOR', status: 'ACTIVO', advisorId: advisor.id, createdAt: now, password: '12345678', mustChangePassword: true }));
const measurements = advisors.map(advisor => ({ id: `opm_aug_2026_${advisor.dni}`, advisorId: advisor.id, dni: advisor.dni, measurementDate: '2026-08-31', periodName: 'Agosto 2026', campaignId: campaign.id, campaignName: campaign.name, connectionTime: 'Pendiente', connectionMinutes: 0, sph: advisor.baselineSph, managementFactor: (advisor as any).managementFactor, source: 'CARGA_EXCEL', comments: 'Dotación Bitel · Agosto 2026', createdAt: now }));

const sqlitePath = process.env.SQLITE_PATH || join(process.cwd(), 'data', 'contact-center.sqlite');
copyFileSync(sqlitePath, `${sqlitePath}.before-roster-${Date.now()}`);
const db = new DatabaseSync(sqlitePath);
const admin = db.prepare("SELECT * FROM users WHERE role='ADMINISTRADOR' ORDER BY created_at LIMIT 1").get() as any;
if (!admin) throw new Error('No se encontró una cuenta administradora para conservar.');
const configRow = db.prepare("SELECT payload_json FROM app_state WHERE id='global'").get() as any;
const previousState = configRow?.payload_json ? JSON.parse(configRow.payload_json) : {};
const state = { evaluations: [], actionPlans: [], interventions: [], advisorInterventions: [], operationalMeasurements: measurements, importHistory: [{ id: `imp_bitel_aug_2026`, date: now, fileName: 'Dotacion bitel.xlsx', fileSize: 0, user: admin.name, campaign: campaign.name, period: 'Agosto 2026', cutoffDate: '2026-08-31', isBaseline: true, rowsDetected: rows.length, rowsReady: rows.length, rowsWarnings: 0, rowsErrors: raw.length - rows.length, newAdvisorsCount: rows.length, updatedAdvisorsCount: 0, operationalMeasurementsCount: rows.length }], config: previousState.config };
const repository = { users: [{ id: admin.id, name: admin.name, email: admin.email, username: admin.username || undefined, role: admin.role as User['role'], status: admin.status as User['status'], teamId: admin.team_id || undefined, advisorId: admin.advisor_id || undefined, avatar: admin.avatar || undefined, createdAt: admin.created_at }, ...supervisors, ...advisorUsers], campaigns: [campaign], teams, advisors };

if (googleStorage.enabled) {
  await googleStorage.clearRuntimeData();
  const hashes = new Map<string, string>([[admin.id, admin.password_hash], ...supervisors.map(supervisor => [supervisor.id, hash('12345678')] as [string, string]), ...advisorUsers.map(user => [user.id, hash(user.password!)] as [string, string])]);
  await googleStorage.saveRepository(repository, hashes);
  await googleStorage.savePlatformState(state);
}

db.exec('BEGIN IMMEDIATE');
try {
  db.exec('DELETE FROM feedbacks; DELETE FROM evaluations; DELETE FROM sessions; DELETE FROM advisors; DELETE FROM teams; DELETE FROM campaigns; DELETE FROM users; DELETE FROM app_state;');
  db.prepare('INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(admin.id, admin.name, admin.email, admin.username, admin.role, admin.status, admin.team_id, admin.advisor_id, admin.avatar, admin.created_at, admin.password_hash);
  for (const user of supervisors) db.prepare('INSERT INTO users (id,name,email,username,role,status,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?)').run(user.id, user.name, user.email, user.username, user.role, user.status, user.createdAt, hash('12345678'));
  for (const user of advisorUsers) db.prepare('INSERT INTO users (id,name,email,username,role,status,advisor_id,created_at,password_hash) VALUES (?,?,?,?,?,?,?,?,?)').run(user.id, user.name, user.email, user.username, user.role, user.status, user.advisorId, user.createdAt, hash(user.password!));
  db.prepare('INSERT INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?)').run(campaign.id, campaign.name, campaign.client, campaign.status, JSON.stringify(campaign.products), campaign.description);
  for (const team of teams) db.prepare('INSERT INTO teams (id,campaign_id,supervisor_id,name) VALUES (?,?,?,?)').run(team.id, team.campaignId, team.supervisorId, team.name);
  for (const advisor of advisors) db.prepare('INSERT INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?)').run(advisor.id, advisor.dni, advisor.employeeCode, advisor.name, advisor.campaignId, advisor.teamId, advisor.supervisorId, JSON.stringify(advisor));
  db.prepare('INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?)').run('global', JSON.stringify(state), now);
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
console.log(`Dotación reemplazada: ${advisors.length} asesores, ${supervisors.length} supervisores y ${measurements.length} mediciones SPH.`);
