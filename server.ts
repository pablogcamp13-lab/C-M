import express from "express";
import { mergeEvaluationSources } from "./server/platformStateRecovery";
import path from "path";
import { googleStorage } from "./server/googleStorage";
import { emailService } from "./server/emailService";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Advisor, Campaign, Company, Operation, Team, User } from "./src/types";
// @ts-ignore node:sqlite está disponible en Node 22.5+; el proyecto conserva
// @types/node 22 para el resto del código existente.
import { DatabaseSync } from "node:sqlite";
import * as XLSX from 'xlsx';

const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production' || process.argv[1]?.includes('dist/server.cjs');

type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[]; companies?:Company[]; operations?:Operation[] };
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
CREATE TABLE IF NOT EXISTS evaluation_commitments (evaluation_id TEXT PRIMARY KEY REFERENCES evaluations(id), advisor_id TEXT NOT NULL REFERENCES advisors(id), commitment TEXT NOT NULL, commitment_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS development_capsules (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('BORRADOR','PUBLICADA','ARCHIVADA')), data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS development_assignments (id TEXT PRIMARY KEY, capsule_id TEXT NOT NULL REFERENCES development_capsules(id), advisor_id TEXT NOT NULL REFERENCES advisors(id), status TEXT NOT NULL CHECK(status IN ('PENDIENTE','EN_CURSO','COMPLETADA','VENCIDA')), data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(capsule_id,advisor_id));
CREATE TABLE IF NOT EXISTS quality_alerts (id TEXT PRIMARY KEY, status TEXT NOT NULL, advisor_id TEXT NOT NULL, supervisor_id TEXT NOT NULL, campaign_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calibrations (id TEXT PRIMARY KEY, status TEXT NOT NULL, evaluation_id TEXT NOT NULL, campaign_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), campaign_id TEXT NOT NULL REFERENCES campaigns(id), name TEXT NOT NULL, status TEXT NOT NULL, legacy INTEGER NOT NULL DEFAULT 0, UNIQUE(company_id,campaign_id));
CREATE TABLE IF NOT EXISTS operation_assignments (id TEXT PRIMARY KEY, advisor_id TEXT NOT NULL REFERENCES advisors(id), operation_id TEXT NOT NULL REFERENCES operations(id), team_id TEXT, supervisor_id TEXT, role TEXT NOT NULL, operational_status TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, active INTEGER NOT NULL, source TEXT NOT NULL, actor_id TEXT, observation TEXT);
CREATE TABLE IF NOT EXISTS staffing_plans (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES operations(id), period TEXT NOT NULL, target_headcount INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(operation_id,period));
CREATE TABLE IF NOT EXISTS staffing_movements (id TEXT PRIMARY KEY, advisor_id TEXT NOT NULL REFERENCES advisors(id), assignment_id TEXT, type TEXT NOT NULL, occurred_at TEXT NOT NULL, origin TEXT, destination TEXT, actor_id TEXT, observation TEXT);
CREATE INDEX IF NOT EXISTS idx_advisors_campaign ON advisors(campaign_id);
CREATE INDEX IF NOT EXISTS idx_operations_company_campaign ON operations(company_id,campaign_id);
CREATE INDEX IF NOT EXISTS idx_assignments_operation_active ON operation_assignments(operation_id,active);
CREATE INDEX IF NOT EXISTS idx_assignments_advisor_active ON operation_assignments(advisor_id,active);
CREATE INDEX IF NOT EXISTS idx_movements_advisor_occurred ON staffing_movements(advisor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_advisor_type ON evaluations(advisor_id, evaluation_type);
CREATE INDEX IF NOT EXISTS idx_quality_alerts_supervisor ON quality_alerts(supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_calibrations_status ON calibrations(status);`);
if (!(db.prepare('PRAGMA table_info(feedbacks)').all() as any[]).some(column => column.name === 'advisor_evidence_url')) db.exec('ALTER TABLE feedbacks ADD COLUMN advisor_evidence_url TEXT');
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some(column => column.name === 'must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1');
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_guidelines_json')) db.exec("ALTER TABLE campaigns ADD COLUMN quality_guidelines_json TEXT NOT NULL DEFAULT '[]'");
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_criterion_weights_json')) db.exec('ALTER TABLE campaigns ADD COLUMN quality_criterion_weights_json TEXT');
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'quality_critical_errors_json')) db.exec("ALTER TABLE campaigns ADD COLUMN quality_critical_errors_json TEXT NOT NULL DEFAULT '[]'");
if (!(db.prepare('PRAGMA table_info(campaigns)').all() as any[]).some(column => column.name === 'background_image')) db.exec('ALTER TABLE campaigns ADD COLUMN background_image TEXT');

if (isProduction && !process.env.INITIAL_ADMIN_PASSWORD) throw new Error('INITIAL_ADMIN_PASSWORD es obligatoria en producción.');
const INITIAL_PASSWORD = '12345678';
const DEFAULT_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || INITIAL_PASSWORD;
const hashPassword = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const validPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const derived = scryptSync(password, salt, 64); return timingSafeEqual(derived, Buffer.from(hash, 'hex')); };
const publicUser = (row: any): User => ({ id: row.id, name: row.name, email: row.email, username: row.username || undefined, role: row.role, status: row.status, teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at, mustChangePassword: Boolean(row.must_change_password) });
const evaluationIdentity = (item: any) => [item?.advisorId, item?.evaluationType, item?.date, item?.time, item?.callId || item?.recordingCode || item?.id].join('|');
const uniqueEvaluations = (items: any[] = []) => { const seen = new Set<string>(); return items.filter(item => { const key=evaluationIdentity(item); if(seen.has(key)) return false; seen.add(key); return true; }); };
const normalizedValidationStatus = (item: any) => item?.validationStatus === 'AUTOMATIC_PENDING' || item?.validationStatus === 'PENDIENTE_AUTOMATICO' ? 'AUTOMATIC_PENDING' : 'VALIDATED';
const normalizePlatformState = (state: any) => state ? { ...state, evaluations: uniqueEvaluations(state.evaluations || []) } : state;
const isMigracionesBitel = (campaign?: Campaign) => /(?:migraciones.*bitel|bitel.*migraciones)/i.test(campaign?.name || '');
const correctMigracionesQualityEvaluation = (evaluation: any, campaigns: Campaign[]) => {
  if (evaluation?.evaluationType !== 'QUALITY' || !isMigracionesBitel(campaigns.find(item => item.id === evaluation.campaignId))) return evaluation;
  const weights = campaigns.find(item => item.id === evaluation.campaignId)?.qualityCriterionWeights || { C1: .30, C2: .30, C3: .30, C4: .10 };
  const dimensions: Record<string,string> = { C1:'CONECTAR', C2:'CLARIFICAR', C3:'CONVERTIR', C4:'CONECTAR_C4' };
  const groups = Object.entries(dimensions).map(([criterion,dimension]) => {
    const rows = (evaluation.items || []).filter((item:any) => item.dimension === dimension && ['CUMPLE','NO_CUMPLE'].includes(item.compliance));
    const denominator = rows.reduce((sum:number,item:any) => sum + Number(item.attributeWeight || item.qualityGuideline?.weight || 1), 0);
    const achieved = rows.filter((item:any) => item.compliance === 'CUMPLE').reduce((sum:number,item:any) => sum + Number(item.attributeWeight || item.qualityGuideline?.weight || 1), 0);
    return { criterion, score: denominator ? achieved / denominator * 100 : null, weight: Number((weights as any)[criterion] || 0) };
  });
  const activeWeight = groups.reduce((sum,item) => sum + (item.score === null ? 0 : item.weight), 0);
  const recalculated = activeWeight ? Math.round(groups.reduce((sum,item) => sum + (item.score === null ? 0 : item.score * item.weight), 0) / activeWeight) : Number(evaluation.technicalScore ?? evaluation.scoreTotal ?? 0);
  const criticalItem = (evaluation.items || []).find((item:any) => item.compliance === 'NO_CUMPLE' && (item.qualityGuideline?.critical || String(item.classification || '').startsWith('CRITICO_')));
  const criticalFailure = Boolean(evaluation.qualityCriticalErrorIds?.length || criticalItem);
  const failedByScore = recalculated < 75;
  return { ...evaluation, technicalScore: recalculated, scoreTotal: criticalFailure ? 0 : recalculated, qualityResult: criticalFailure || failedByScore ? 'REPROBADA' : 'APROBADA', criticalReason: criticalFailure ? (evaluation.criticalReason || evaluation.qualityCriticalErrorSnapshot?.[0]?.name || 'Error crítico') : failedByScore ? 'Puntaje menor al mínimo aprobatorio de 75%' : undefined };
};

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

/** Migración aditiva: preserva campañas/IDs legacy y crea operaciones únicas por empresa. */
function seedOrganization() {
  const now=new Date().toISOString();
  const companies=[['company_techcenter','TECHCENTER'],['company_talent_up','TALENT UP'],['company_konectados','KONECTADOS']] as const;
  for(const [id,name] of companies) db.prepare('INSERT OR IGNORE INTO companies (id,name,status,created_at) VALUES (?,?,?,?)').run(id,name,'ACTIVA',now);
  const matrix:{companyId:string;name:string}[]=[
    {companyId:'company_techcenter',name:'Migraciones Bitel'},{companyId:'company_techcenter',name:'Retenciones Bitel'},{companyId:'company_techcenter',name:'Portabilidad Bitel'},
    {companyId:'company_talent_up',name:'Migra'},{companyId:'company_talent_up',name:'Migraciones Bitel'},{companyId:'company_talent_up',name:'Portabilidad Bitel'},{companyId:'company_talent_up',name:'WIN'},{companyId:'company_talent_up',name:'Carsa'},{companyId:'company_talent_up',name:'Prosegur'},
    {companyId:'company_konectados',name:'Migraciones Bitel'},{companyId:'company_konectados',name:'Portabilidad Bitel'}];
  for(const row of matrix){let campaign=db.prepare('SELECT id FROM campaigns WHERE lower(name)=lower(?)').get(row.name) as any;if(!campaign){const id=`service_${row.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}`;db.prepare('INSERT OR IGNORE INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?)').run(id,row.name,'Bitel','ACTIVA','[]','Servicio normalizado para operación multiempresa.');campaign=db.prepare('SELECT id FROM campaigns WHERE id=?').get(id) as any;}const operationId=`op_${row.companyId.replace('company_','')}_${campaign.id.replace(/^service_|^camp_/,'')}`;db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,0)').run(operationId,row.companyId,campaign.id,`${companies.find(item=>item[0]===row.companyId)?.[1]} / ${row.name}`,'ACTIVA');}
  const legacyCompany='company_legacy';db.prepare('INSERT OR IGNORE INTO companies (id,name,status,created_at) VALUES (?,?,?,?)').run(legacyCompany,'LEGACY','INACTIVA',now);
  for(const c of db.prepare('SELECT id,name FROM campaigns').all() as any[]) db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,1)').run(`op_legacy_${c.id}`,legacyCompany,c.id,`LEGACY / ${c.name}`,'ACTIVA');
}
seedOrganization();
function migrateLegacyAssignments() {
  const now=new Date().toISOString();
  for(const row of db.prepare('SELECT id,data_json FROM advisors').all() as any[]){const advisor=JSON.parse(row.data_json);const operationId=advisor.operationId||`op_legacy_${advisor.campaignId}`;if(!db.prepare('SELECT 1 FROM operations WHERE id=?').get(operationId))continue;const id=`assignment_legacy_${advisor.id}`;db.prepare('INSERT OR IGNORE INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,active,source,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,advisor.id,operationId,advisor.teamId||null,advisor.supervisorId||null,'ASESOR',advisor.status==='INACTIVO'?'BAJA':advisor.status==='EN_CAPACITACION'?'CAPACITACION':'PRODUCCION',advisor.hireDate||now.slice(0,10),advisor.status==='ACTIVO'&&advisor.active!==false?1:0,'MIGRACION','Contexto histórico no inferible: asignado a operación LEGACY.');}
}
migrateLegacyAssignments();

function repository(): SharedRepository {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(publicUser);
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY name').all().map((r: any) => ({ id: r.id, name: r.name, client: r.client, status: r.status, products: JSON.parse(r.products_json), description: r.description || undefined, backgroundImage: r.background_image || undefined, qualityGuidelines: JSON.parse(r.quality_guidelines_json || '[]'), qualityCriterionWeights: JSON.parse(r.quality_criterion_weights_json || 'null') || undefined, qualityCriticalErrors: JSON.parse(r.quality_critical_errors_json || '[]') }));
  const companies=db.prepare('SELECT id,name,status,created_at FROM companies ORDER BY name').all().map((r:any)=>({id:r.id,name:r.name,status:r.status,createdAt:r.created_at}));
  const operations=db.prepare('SELECT id,company_id,campaign_id,name,status,legacy FROM operations ORDER BY name').all().map((r:any)=>({id:r.id,companyId:r.company_id,campaignId:r.campaign_id,name:r.name,status:r.status,legacy:Boolean(r.legacy)}));
  const teams = db.prepare('SELECT * FROM teams ORDER BY name').all().map((r: any) => ({ id: r.id, campaignId: r.campaign_id, operationId:`op_legacy_${r.campaign_id}`, supervisorId: r.supervisor_id, name: r.name }));
  const advisors = db.prepare('SELECT data_json FROM advisors ORDER BY name').all().map((r: any) => { const advisor=JSON.parse(r.data_json);return {...advisor,operationId:advisor.operationId||`op_legacy_${advisor.campaignId}`}; });
  return { users, campaigns, teams, advisors, companies, operations };
}

function persistRepository(input: SharedRepository) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const source = input;
    for (const company of source.companies || []) db.prepare('INSERT INTO companies (id,name,status,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status').run(company.id,company.name,company.status,company.createdAt||now);
    for (const campaign of source.campaigns || []) db.prepare(`INSERT INTO campaigns (id,name,client,status,products_json,description,background_image,quality_guidelines_json,quality_criterion_weights_json,quality_critical_errors_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,client=excluded.client,status=excluded.status,products_json=excluded.products_json,description=excluded.description,background_image=excluded.background_image,quality_guidelines_json=excluded.quality_guidelines_json,quality_criterion_weights_json=excluded.quality_criterion_weights_json,quality_critical_errors_json=excluded.quality_critical_errors_json`).run(campaign.id, campaign.name, campaign.client, campaign.status, JSON.stringify(campaign.products || []), campaign.description || null, campaign.backgroundImage || null, JSON.stringify(campaign.qualityGuidelines || []), JSON.stringify(campaign.qualityCriterionWeights || null), JSON.stringify(campaign.qualityCriticalErrors || []));
    // Las campañas históricas llegan desde Sheets sin empresa/operación. Se crea su
    // operación LEGACY antes de validar asesores para conservar toda la dotación.
    db.prepare('INSERT OR IGNORE INTO companies (id,name,status,created_at) VALUES (?,?,?,?)').run('company_legacy','LEGACY','INACTIVA',now);
    for (const campaign of source.campaigns || []) db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,1)').run(`op_legacy_${campaign.id}`,'company_legacy',campaign.id,`LEGACY / ${campaign.name}`,'ACTIVA');
    for (const operation of source.operations || []) db.prepare('INSERT INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,campaign_id=excluded.campaign_id,name=excluded.name,status=excluded.status').run(operation.id,operation.companyId,operation.campaignId,operation.name,operation.status,operation.legacy?1:0);
    for (const user of source.users || []) {
      const existing = db.prepare('SELECT password_hash,must_change_password FROM users WHERE id=?').get(user.id);
      db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,avatar=excluded.avatar`).run(user.id, user.name, user.email, user.username || null, user.role, user.status, user.teamId || null, user.advisorId || null, user.avatar || null, user.createdAt || now, existing?.password_hash || hashPassword(user.password || INITIAL_PASSWORD), existing ? existing.must_change_password : 1);
    }
    for (const team of source.teams || []) {
      const validCampaign=db.prepare('SELECT 1 FROM campaigns WHERE id=?').get(team.campaignId);
      const validSupervisor=db.prepare('SELECT 1 FROM users WHERE id=?').get(team.supervisorId);
      if(validCampaign&&validSupervisor) db.prepare(`INSERT INTO teams (id,campaign_id,supervisor_id,name) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET campaign_id=excluded.campaign_id,supervisor_id=excluded.supervisor_id,name=excluded.name`).run(team.id, team.campaignId, team.supervisorId, team.name);
    }
    for (const advisor of source.advisors || []) {
      if(!db.prepare('SELECT 1 FROM campaigns WHERE id=?').get(advisor.campaignId)) {
        const campaignName=advisor.sourceCampaignName||`Campaña histórica ${advisor.campaignId}`;
        db.prepare('INSERT INTO campaigns (id,name,client,status,products_json,description) VALUES (?,?,?,?,?,?)').run(advisor.campaignId,campaignName,campaignName,'ACTIVA','[]','Campaña preservada desde dotación histórica.');
      }
      db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,1)').run(`op_legacy_${advisor.campaignId}`,'company_legacy',advisor.campaignId,`LEGACY / ${advisor.sourceCampaignName||advisor.campaignId}`,'ACTIVA');
      const previousRow=db.prepare('SELECT data_json FROM advisors WHERE id=?').get(advisor.id) as any;
      const previous=previousRow ? JSON.parse(previousRow.data_json) : null;
      const requestedOperationId=advisor.operationId || previous?.operationId || `op_legacy_${advisor.campaignId}`;
      const requestedOperation=db.prepare('SELECT * FROM operations WHERE id=? AND campaign_id=? AND status=?').get(requestedOperationId,advisor.campaignId,'ACTIVA') as any;
      const operation=requestedOperation || db.prepare('SELECT * FROM operations WHERE company_id=? AND campaign_id=? AND status=?').get('company_legacy',advisor.campaignId,'ACTIVA') as any;
      const operationId=operation?.id;
      if(!operation) throw new Error(`No se pudo preservar la campaña de ${advisor.name}.`);
      db.prepare(`INSERT INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET dni=excluded.dni,employee_code=excluded.employee_code,name=excluded.name,campaign_id=excluded.campaign_id,team_id=excluded.team_id,supervisor_id=excluded.supervisor_id,data_json=excluded.data_json`).run(advisor.id, advisor.dni, advisor.employeeCode || '', advisor.name, advisor.campaignId, advisor.teamId || null, advisor.supervisorId || null, JSON.stringify({...advisor,operationId}));
      const changed=!previous || previous.operationId!==operationId || previous.supervisorId!==advisor.supervisorId || previous.teamId!==advisor.teamId;
      if(changed){
        db.prepare('UPDATE operation_assignments SET active=0,end_date=? WHERE advisor_id=? AND active=1').run(now.slice(0,10),advisor.id);
        const assignmentId=`assignment_${advisor.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        db.prepare('INSERT INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,active,source,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(assignmentId,advisor.id,operationId,advisor.teamId||null,advisor.supervisorId||null,'ASESOR',advisor.status==='INACTIVO'?'BAJA':'PRODUCCION',now.slice(0,10),1,previous?'MANUAL':'MIGRACION',null,previous?'Cambio organizacional de Dotación':'Asignación inicial');
        db.prepare('INSERT INTO staffing_movements (id,advisor_id,assignment_id,type,occurred_at,origin,destination,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?)').run(`movement_${advisor.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,advisor.id,assignmentId,previous?'CAMBIO_ASIGNACION':'ALTA',now,previous?JSON.stringify({operationId:previous.operationId||`op_legacy_${previous.campaignId}`,supervisorId:previous.supervisorId||null}):null,JSON.stringify({operationId,supervisorId:advisor.supervisorId||null}),null,previous?'Before / after registrado automáticamente':'Alta inicial');
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  migrateLegacyAssignments();
  return repository();
}

function passwordHashes() {
  return new Map((db.prepare('SELECT id,password_hash FROM users').all() as any[]).map(row => [row.id, row.password_hash]));
}

async function readRepository() {
  if (!googleStorage.enabled) return repository();
  try {
    const remote = await googleStorage.loadRepository();
    if (remote && (remote.users.length || remote.campaigns.length || remote.teams.length || remote.advisors.length)) {
      try { persistRepository(remote); return repository(); }
      catch (cacheError) {
        console.error('[google-storage] La caché local no pudo actualizarse; se entrega la dotación remota.', cacheError instanceof Error ? cacheError.message : '');
        const local=repository(),legacyOperations=remote.campaigns.map(campaign=>({id:`op_legacy_${campaign.id}`,companyId:'company_legacy',campaignId:campaign.id,name:`LEGACY / ${campaign.name}`,status:'ACTIVA' as const,legacy:true}));
        return {...remote,companies:local.companies,operations:[...(local.operations||[]),...legacyOperations.filter(operation=>!(local.operations||[]).some(item=>item.id===operation.id))]};
      }
    }
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
async function syncAuthUsersFromGoogle(force = false) {
  if (!googleStorage.enabled || (!force && Date.now() - lastGoogleAuthSync < 60_000)) return;
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
    const findUser = () => {
      let match = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) OR lower(username)=lower(?)').get(identityText, identityText) as any;
      if (!match && advisorUsersByDni.has(identityText)) match = db.prepare('SELECT * FROM users WHERE id=?').get(advisorUsersByDni.get(identityText)) as any;
      return match;
    };
    let user = findUser();
    if ((!user || !validPassword(passwordText, String(user.password_hash))) && googleStorage.enabled) {
      try { await syncAuthUsersFromGoogle(true); user = findUser(); }
      catch (error) { console.error('[google-storage] No fue posible refrescar la cuenta para el acceso.', error instanceof Error ? error.message : ''); }
    }
    if (!user || user.status !== 'ACTIVO' || !validPassword(passwordText, String(user.password_hash))) return res.status(401).json({ error: 'Credenciales inválidas.' });
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
    try { if (googleStorage.enabled) await googleStorage.updateUserPasswordHash(user.id, passwordHash, false); }
    catch (error) { console.error('[google-storage] No fue posible guardar la contraseña.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible guardar la contraseña en el repositorio central. Revisa la autorización de Google Sheets.' }); }
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(passwordHash, user.id);
    lastGoogleAuthSync = Date.now();
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
  });
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const token = (req as any).token; db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    try { if (googleStorage.enabled) await googleStorage.deleteSession(token); }
    catch (error) { console.error('[google-storage] No fue posible eliminar la sesión persistente.', error instanceof Error ? error.message : ''); }
    res.status(204).end();
  });
  const requireAdmin = (req: express.Request, res: express.Response) => (req as any).authUser?.role === 'ADMINISTRADOR' || res.status(403).json({ error: 'Acceso restringido a administración.' });
  app.post('/api/admin/email/test', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const recipient = String(req.body?.recipient || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return res.status(400).json({ error: 'Correo de prueba inválido.' });
    if (!emailService.enabled) return res.status(503).json({ error: 'El servicio de correo no está configurado.' });
    try {
      await emailService.sendEvaluationNotification({ recipient, advisorName: 'Prueba de notificación', campaignName: 'Migraciones Bitel', date: new Date().toLocaleDateString('es-PE'), result: 'Prueba técnica', evaluatorName: 'Calidad y Mejora Continua', evaluationId: 'prueba-correo' });
      return res.json({ ok: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido de Gmail.';
      console.error('[email] Falló el correo de prueba.', detail);
      return res.status(502).json({ error: 'Gmail rechazó el correo de prueba.', detail });
    }
  });
  app.post('/api/admin/users', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const body = req.body || {}; const name = String(body.name || '').trim(); const email = String(body.email || '').trim().toLowerCase();
    const validRoles = ['ADMINISTRADOR','CONSULTOR','MONITOR','SUPERVISOR','FORMADOR','GERENCIA','ASESOR']; const role = validRoles.includes(body.role) ? body.role : 'ASESOR'; const status = body.status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';
    if (!name || !email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    if (role === 'SUPERVISOR' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El supervisor debe tener un correo válido.' });
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
    const body = req.body || {}; const validRoles = ['ADMINISTRADOR','CONSULTOR','MONITOR','SUPERVISOR','FORMADOR','GERENCIA','ASESOR']; const next = { name: String(body.name ?? current.name).trim(), email: String(body.email ?? current.email).trim(), username: String((body.username ?? current.username) || '').trim() || null, role: validRoles.includes(body.role) ? body.role : current.role, status: body.status ?? current.status, teamId: body.teamId ?? current.team_id, advisorId: body.advisorId ?? current.advisor_id };
    if (!next.name || !next.email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    if (next.role === 'SUPERVISOR' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return res.status(400).json({ error: 'El supervisor debe tener un correo válido.' });
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
    if (user.role === 'MONITOR') {
      const advisors = source.advisors.filter(item => item.active !== false && item.status === 'ACTIVO');
      const campaignIds = new Set(advisors.map(item => item.campaignId));
      const operationIds=new Set(advisors.map(item=>item.operationId||`op_legacy_${item.campaignId}`)), operations=(source.operations||[]).filter(item=>operationIds.has(item.id)), companyIds=new Set(operations.map(item=>item.companyId));
      return res.json({ repository: { advisors, campaigns: source.campaigns.filter(item => item.status === 'ACTIVA' && campaignIds.has(item.id)), companies:(source.companies||[]).filter(item=>companyIds.has(item.id)), operations, teams: source.teams.filter(item => campaignIds.has(item.campaignId)), users: source.users.filter(item => item.id === user.id || item.role === 'SUPERVISOR') } });
    }
    if (user.role === 'SUPERVISOR') {
      const advisors = source.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId));
      const campaignIds = new Set(advisors.map(item => item.campaignId)); const teamIds = new Set(advisors.map(item => item.teamId).filter(Boolean));
      const operationIds=new Set(advisors.map(item=>item.operationId||`op_legacy_${item.campaignId}`)), operations=(source.operations||[]).filter(item=>operationIds.has(item.id)), companyIds=new Set(operations.map(item=>item.companyId));
      return res.json({ repository: { advisors, campaigns: source.campaigns.filter(item => campaignIds.has(item.id)), companies:(source.companies||[]).filter(item=>companyIds.has(item.id)), operations, teams: source.teams.filter(item => teamIds.has(item.id)), users: source.users.filter(item => item.id === user.id || item.advisorId && advisors.some(advisor => advisor.id === item.advisorId)) } });
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
      users: source.users.filter(item => item.id === user.id || supervisorIds.has(item.id)), companies:(source.companies||[]).filter(item=>(source.operations||[]).some(operation=>operation.companyId===item.id&&advisorCampaignIds.has(operation.campaignId))), operations:(source.operations||[]).filter(operation=>advisorCampaignIds.has(operation.campaignId))
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
  app.delete('/api/admin/campaigns/:id', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    try {
      const campaignId=req.params.id,companyId=String(req.query.companyId||'');
      const now=new Date().toISOString(),today=now.slice(0,10);
      db.exec('BEGIN IMMEDIATE');
      try {
        const selectedOperations=companyId
          ? db.prepare('SELECT id FROM operations WHERE campaign_id=? AND company_id=? AND legacy=0 AND status=?').all(campaignId,companyId,'ACTIVA') as any[]
          : db.prepare('SELECT id FROM operations WHERE campaign_id=? AND legacy=0 AND status=?').all(campaignId,'ACTIVA') as any[];
        if(companyId&&!selectedOperations.length){db.exec('ROLLBACK');return res.status(404).json({error:'La campaña no está activa para esta empresa.'});}
        db.prepare('INSERT OR IGNORE INTO companies (id,name,status,created_at) VALUES (?,?,?,?)').run('company_legacy','LEGACY','INACTIVA',now);
        const campaign=db.prepare('SELECT name FROM campaigns WHERE id=?').get(campaignId) as any;
        if(!campaign){db.exec('ROLLBACK');return res.status(404).json({error:'Campaña no encontrada.'});}
        const legacyOperationId=`op_legacy_${campaignId}`;
        db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,1)').run(legacyOperationId,'company_legacy',campaignId,`LEGACY / ${campaign.name}`,'ACTIVA');
        const selectedIds=new Set(selectedOperations.map(operation=>operation.id));
        for(const row of db.prepare('SELECT id,data_json FROM advisors WHERE campaign_id=?').all(campaignId) as any[]){
          const advisor=JSON.parse(row.data_json),currentOperation=advisor.operationId||legacyOperationId;
          if(!selectedIds.has(currentOperation))continue;
          db.prepare('UPDATE advisors SET data_json=? WHERE id=?').run(JSON.stringify({...advisor,operationId:legacyOperationId}),row.id);
          db.prepare('UPDATE operation_assignments SET active=0,end_date=? WHERE advisor_id=? AND active=1').run(today,row.id);
          db.prepare('INSERT INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,active,source,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(`assignment_${row.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,row.id,legacyOperationId,advisor.teamId||null,advisor.supervisorId||null,'ASESOR',advisor.status==='INACTIVO'?'BAJA':'PRODUCCION',today,1,'MANUAL','Campaña retirada de la empresa; se preserva el registro histórico.');
        }
        for(const operation of selectedOperations)db.prepare('UPDATE operations SET status=? WHERE id=?').run('INACTIVA',operation.id);
        const active=(db.prepare('SELECT COUNT(*) total FROM operations WHERE campaign_id=? AND legacy=0 AND status=?').get(campaignId,'ACTIVA') as any).total;
        if(!active)db.prepare('UPDATE campaigns SET status=? WHERE id=?').run('INACTIVA',campaignId);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if (googleStorage.enabled) await googleStorage.saveRepository(repository(), passwordHashes());
      res.status(204).end();
    } catch (error: any) { res.status(400).json({ error: error.message || 'No se pudo eliminar la campaña.' }); }
  });
  app.post('/api/evaluations', requireAuth, async (req, res) => {
    const authUser = (req as any).authUser as User;
    if (!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(authUser.role)) return res.status(403).json({ error: 'Solo Calidad, Monitor o Administración puede crear evaluaciones.' });
    let evaluation = req.body;
    if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY', 'D3C'].includes(evaluation?.evaluationType)) return res.status(400).json({ error: 'Evaluación inválida.' });
    const evaluatedAt = `${evaluation.date}T${evaluation.time || '00:00'}:00`;
    try {
      const directory = googleStorage.enabled ? await readRepository() : repository();
      const advisor = directory.advisors.find(item => item.id === evaluation.advisorId);
      if (!advisor || advisor.active === false || advisor.status !== 'ACTIVO') return res.status(400).json({ error: 'El asesor no está habilitado para evaluación.' });
      if (authUser.role === 'MONITOR') evaluation = { ...evaluation, evaluatorId: authUser.id, evaluatorName: authUser.name };
      const operation=directory.operations?.find(item=>item.id===(advisor.operationId||`op_legacy_${advisor.campaignId}`));
      evaluation = { ...evaluation, campaignId:advisor.campaignId, teamId:advisor.teamId, supervisorId:advisor.supervisorId, operationId:operation?.id||`op_legacy_${advisor.campaignId}`, companyId:operation?.companyId||'company_legacy', supervisorAtEvaluation:evaluation.supervisorId||advisor.supervisorId, validationStatus: 'VALIDATED' };
      evaluation = correctMigracionesQualityEvaluation(evaluation, directory.campaigns);
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
      let notificationSent = false;
      try {
        const advisor = directory.advisors.find(item => item.id === evaluation.advisorId);
        const advisorRecipient = directory.users.find(item => item.advisorId === evaluation.advisorId && item.status === 'ACTIVO');
        const supervisorRecipient = directory.users.find(item => item.id === (advisor?.supervisorId || evaluation.supervisorId) && item.role === 'SUPERVISOR' && item.status === 'ACTIVO');
        const campaign = directory.campaigns.find(item => item.id === evaluation.campaignId);
        const evaluator = directory.users.find(item => item.id === evaluation.evaluatorId);
        const score = evaluation.technicalScore ?? evaluation.scoreTotal;
        const result = [evaluation.qualityResult, score == null ? null : `${score}%`].filter(Boolean).join(' · ') || 'Registrado';
        const recipients = [...new Set([advisorRecipient?.email, supervisorRecipient?.email].filter(Boolean))] as string[];
        if (advisor && recipients.length) notificationSent = (await Promise.all(recipients.map(recipient => emailService.sendEvaluationNotification({ recipient, advisorName: advisor.name, campaignName: campaign?.name || 'Sin campaña', date: evaluation.date, result, evaluatorName: evaluator?.name || 'Monitor de Calidad', evaluationId: evaluation.id })))).every(Boolean);
      } catch (mailError) {
        console.error('[email] La evaluación se guardó, pero no fue posible enviar la notificación.', mailError instanceof Error ? mailError.message : '');
      }
      return res.status(201).json({ evaluation, notificationSent });
    } catch (error: any) { console.error('[google-storage] No fue posible guardar la evaluación.', error instanceof Error ? error.message : ''); return res.status(400).json({ error: error.message || 'No fue posible guardar la evaluación.' }); }
  });
  // Dotación: el historial se entrega sólo al alcance del rol. Los cambios se
  // registran al persistir la asignación activa; evaluaciones nunca se tocan.
  app.get('/api/staffing/:advisorId/history', requireAuth, (req, res) => {
    const actor=(req as any).authUser as User; const advisor=db.prepare('SELECT supervisor_id FROM advisors WHERE id=?').get(req.params.advisorId) as any;
    if(!advisor) return res.status(404).json({error:'Colaborador no encontrado.'});
    if(!['ADMINISTRADOR','CONSULTOR','MONITOR','FORMADOR'].includes(actor.role) && !(actor.role==='SUPERVISOR' && advisor.supervisor_id===actor.id)) return res.status(403).json({error:'No tienes acceso al historial de este colaborador.'});
    const rows=db.prepare('SELECT * FROM staffing_movements WHERE advisor_id=? ORDER BY occurred_at DESC').all(req.params.advisorId) as any[];
    return res.json({movements:rows.map(row=>({...row,origin:row.origin?JSON.parse(row.origin):null,destination:row.destination?JSON.parse(row.destination):null}))});
  });
  const loadEvaluationById = async (id: string) => {
    const local = db.prepare('SELECT payload_json FROM evaluations WHERE id=?').get(id) as any;
    if (local?.payload_json) try { return JSON.parse(local.payload_json); } catch {}
    if (googleStorage.enabled) return (await googleStorage.loadEvaluations()).find((item: any) => item.id === id) || null;
    return null;
  };
  const adminRoles = new Set(['ADMINISTRADOR','CONSULTOR']);
  const adminEvaluationRows = async () => { let rows=(db.prepare('SELECT payload_json FROM evaluations ORDER BY evaluated_at DESC').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.payload_json)]}catch{return[]}});if(googleStorage.enabled)try{rows=uniqueEvaluations([...(await googleStorage.loadEvaluations()),...rows]);}catch{}return rows; };
  const adminFilteredEvaluations = async (query:any) => { const directory=await readRepository(),campaignId=String(query.campaignId||''),supervisorId=String(query.supervisorId||''),advisorName=String(query.advisorName||'').trim().toLocaleLowerCase(),feedbackStatus=String(query.feedbackStatus||''),validationStatus=String(query.validationStatus||'');let feedbacks=(db.prepare('SELECT * FROM feedbacks').all() as any[]);if(googleStorage.enabled)try{feedbacks=await googleStorage.loadFeedbacks();}catch{}const feedbackByEvaluation=new Map(feedbacks.map(item=>[item.evaluation_id,item]));const rows=(await adminEvaluationRows()).filter(item=>{const advisor=directory.advisors.find(a=>a.id===item.advisorId),fb=feedbackByEvaluation.get(item.id),fbState=fb&&['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(fb.status)?'FIRMADO':'PENDIENTE';return(!campaignId||item.campaignId===campaignId)&&(!supervisorId||item.supervisorId===supervisorId||advisor?.supervisorId===supervisorId)&&(!advisorName||advisor?.name.toLocaleLowerCase().includes(advisorName))&&(!feedbackStatus||fbState===feedbackStatus)&&(!validationStatus||normalizedValidationStatus(item)===validationStatus);});return{rows,feedbacks,directory,feedbackByEvaluation}; };
  app.get('/api/admin/dashboard',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!adminRoles.has(user.role))return res.status(403).json({error:'Acceso restringido a Calidad y Administración.'});const {rows,feedbacks,directory}=await adminFilteredEvaluations(req.query);const valid=rows.filter(item=>normalizedValidationStatus(item)==='VALIDATED'),average=(items:any[])=>items.length?Math.round(items.reduce((sum,item)=>sum+Number(item.technicalScore??item.scoreTotal??0),0)/items.length):null;const by=(key:(item:any)=>string)=>Object.entries(valid.reduce((out:any,item)=>{const id=key(item);(out[id]??=[]).push(item);return out;},{})).map(([id,items]:any)=>({id,name:directory.campaigns.find(c=>c.id===id)?.name||directory.users.find(u=>u.id===id)?.name||'Sin asignar',average:average(items),count:items.length}));const signed=feedbacks.filter(item=>['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(item.status)).length;res.json({metrics:{feedbackDone:signed,feedbackPending:Math.max(0,feedbacks.length-signed),automaticPending:rows.filter(item=>normalizedValidationStatus(item)==='AUTOMATIC_PENDING').length},byCampaign:by(item=>item.campaignId),bySupervisor:by(item=>item.supervisorId),evaluations:rows.map(item=>({...item,feedbackStatus:(()=>{const fb=feedbacks.find(f=>f.evaluation_id===item.id);return fb&&['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(fb.status)?'FIRMADO':'PENDIENTE';})()}))});});
  app.patch('/api/admin/evaluations/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!adminRoles.has(user.role))return res.status(403).json({error:'Acceso restringido.'});const current=await loadEvaluationById(req.params.id);if(!current)return res.status(404).json({error:'Evaluación no encontrada.'});const body=req.body||{},now=new Date().toISOString(),items=Array.isArray(body.items)?body.items:current.items;const invalidNa=items.some((item:any)=>item.compliance==='NO_APLICA'&&!item.qualityGuideline?.applicableRules?.length);if(invalidNa)return res.status(400).json({error:'NO_APLICA requiere una regla explícita en el atributo.'});const validationStatus=body.validate||body.validationStatus==='VALIDATED'?'VALIDATED':current.validationStatus;const next=correctMigracionesQualityEvaluation({...current,...Object.fromEntries(['comments','items','qualityCriticalErrorIds','qualityCriticalErrorSnapshot','primaryGap','secondaryGap','strongestPillar','recommendation'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]])),validationStatus,origin:current.origin||'AUTOMATIC',validatedBy:validationStatus==='VALIDATED'?user.id:current.validatedBy,validatedAt:validationStatus==='VALIDATED'?now:current.validatedAt,updatedAt:now,audit:[...(current.audit||[]),{action:body.validate?'VALIDATED':'EDITED',userId:user.id,at:now}],...(body.adjustments?{saOriginal:current.saOriginal||{items:current.items,technicalScore:current.technicalScore,scoreTotal:current.scoreTotal}}:{})},(await readRepository()).campaigns);db.prepare('UPDATE evaluations SET payload_json=? WHERE id=?').run(JSON.stringify(next),next.id);if(googleStorage.enabled)await googleStorage.saveEvaluation(next);res.json({evaluation:next});});
  const canReadEvaluation = (user: User, evaluation: any) => user.role === 'ASESOR'
    ? user.advisorId === evaluation.advisorId
    : user.role === 'SUPERVISOR'
      ? user.id === evaluation.supervisorId || Boolean(user.teamId && user.teamId === evaluation.teamId)
      : user.role === 'MONITOR' ? user.id === evaluation.evaluatorId : ['ADMINISTRADOR','CONSULTOR'].includes(user.role);
  app.get('/api/evaluations/:id/agent-detail', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; const evaluation = await loadEvaluationById(req.params.id);
    if (!evaluation || !canReadEvaluation(user, evaluation) || (user.role === 'ASESOR' && normalizedValidationStatus(evaluation) !== 'VALIDATED')) return res.status(404).json({ error:'Evaluación no encontrada.' });
    let feedback = db.prepare('SELECT * FROM feedbacks WHERE evaluation_id=?').get(evaluation.id) as any;
    if (!feedback && googleStorage.enabled) try { feedback = (await googleStorage.loadFeedbacks()).find((item: any) => item.evaluation_id === evaluation.id); } catch {}
    const savedCommitment = db.prepare('SELECT * FROM evaluation_commitments WHERE evaluation_id=?').get(evaluation.id) as any;
    const commitment = savedCommitment ? { text:savedCommitment.commitment, date:savedCommitment.commitment_date, updatedAt:savedCommitment.updated_at } : evaluation.agentCommitment ? { text:evaluation.agentCommitment, date:evaluation.agentCommitmentDate, updatedAt:evaluation.agentCommitmentUpdatedAt } : null;
    return res.json({ evaluation, feedback: feedback || null, commitment, signature: feedback?.status === 'VALIDADO_ASESOR' || feedback?.status === 'CERRADO_SUPERVISOR' ? { status:'SIGNED', signedAt:feedback.advisor_action_at } : null });
  });
  app.patch('/api/evaluations/:id/commitment', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (user.role !== 'ASESOR' || !user.advisorId) return res.status(403).json({ error:'Solo el asesor puede registrar su compromiso.' });
    const evaluation = await loadEvaluationById(req.params.id); if (!evaluation || evaluation.advisorId !== user.advisorId || normalizedValidationStatus(evaluation) !== 'VALIDATED') return res.status(404).json({ error:'Evaluación no encontrada.' });
    const commitment = String(req.body?.commitment || '').trim(); const commitmentDate = String(req.body?.commitmentDate || '');
    if (commitment.length < 3 || commitment.length > 2000 || !/^\d{4}-\d{2}-\d{2}$/.test(commitmentDate) || Number.isNaN(Date.parse(`${commitmentDate}T00:00:00Z`))) return res.status(400).json({ error:'Registra un compromiso válido y su fecha.' });
    const now = new Date().toISOString(); const updated = { ...evaluation, agentCommitment:commitment, agentCommitmentDate:commitmentDate, agentCommitmentUpdatedAt:now };
    db.prepare(`INSERT INTO evaluation_commitments (evaluation_id,advisor_id,commitment,commitment_date,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(evaluation_id) DO UPDATE SET commitment=excluded.commitment,commitment_date=excluded.commitment_date,updated_at=excluded.updated_at`).run(evaluation.id,user.advisorId,commitment,commitmentDate,now,now);
    db.prepare('UPDATE evaluations SET payload_json=? WHERE id=?').run(JSON.stringify(updated),evaluation.id);
    if (googleStorage.enabled) await googleStorage.saveEvaluation(updated);
    return res.json({ commitment:{ text:commitment, date:commitmentDate, updatedAt:now } });
  });
  app.get('/api/evaluations/:id/audio', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; const evaluation = await loadEvaluationById(req.params.id);
    if (!evaluation || !canReadEvaluation(user,evaluation) || (user.role === 'ASESOR' && normalizedValidationStatus(evaluation) !== 'VALIDATED')) return res.status(404).json({ error:'Audio no encontrado.' });
    const fileId = String(evaluation.audioUrl || '').match(/\/api\/files\/([^/]+)\/content/)?.[1]; if (!fileId) return res.status(404).json({ error:'Audio no encontrado.' });
    try { const file=await googleStorage.fileMetadata(fileId),stream=await googleStorage.downloadFile(fileId);res.set({'Content-Type':file.mimeType||'audio/mpeg','Content-Disposition':`inline; filename="${String(file.name||'audio.mp3').replace(/[\\\r\n"]/g,'_')}"`,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});stream.on('error',()=>res.destroy());stream.pipe(res); } catch { if(!res.headersSent)res.status(404).json({error:'Audio no encontrado.'}); }
  });
  app.get('/api/feedbacks', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    const onlyOwn = (feedbacks: any[]) => user.role === 'ASESOR' ? feedbacks.filter(feedback => feedback.advisor_id === user.advisorId) : user.role === 'SUPERVISOR' ? feedbacks.filter(feedback => feedback.supervisor_id === user.id) : user.role === 'MONITOR' ? feedbacks.filter(feedback => feedback.evaluator_id === user.id) : feedbacks;
    try { const remote = googleStorage.enabled ? await googleStorage.loadFeedbacks() : null; if (remote) return res.json({ feedbacks: onlyOwn(remote) }); }
    catch (error) { console.error('[google-storage] No fue posible leer feedbacks.', error instanceof Error ? error.message : ''); }
    res.json({ feedbacks: onlyOwn(db.prepare('SELECT * FROM feedbacks ORDER BY updated_at DESC').all() as any[]) });
  });
  app.post('/api/feedbacks', requireAuth, async (req, res) => {
    const authUser = (req as any).authUser as User;
    if (authUser.role === 'ASESOR') return res.status(403).json({ error: 'Un asesor no puede crear feedbacks.' });
    const body = req.body || {}; const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(body.evaluation_id) as any;
    let ev = evaluation ? JSON.parse(evaluation.payload_json) : null;
    if (!ev && googleStorage.enabled) {
      try { ev = (await googleStorage.loadPlatformState())?.evaluations?.find((item: any) => item.id === body.evaluation_id); }
      catch (error) { console.error('[google-storage] No fue posible recuperar la evaluación origen.', error instanceof Error ? error.message : ''); }
    }
    if (!ev) return res.status(400).json({ error: 'La evaluación origen no existe.' });
    if (authUser.role === 'MONITOR' && ev.evaluatorId !== authUser.id) return res.status(403).json({ error: 'Solo puedes crear feedback de evaluaciones propias.' });
    const now = new Date().toISOString(); const feedback = { feedback_id: `fb_${randomBytes(8).toString('hex')}`, evaluation_id: ev.id, advisor_id: ev.advisorId, supervisor_id: ev.supervisorId, evaluator_id: ev.evaluatorId, evaluation_type: ev.evaluationType, feedback_text: String(body.feedback_text || ''), advisor_response: null, advisor_evidence_url: null, supervisor_closure_comment: null, status: 'PENDIENTE', created_at: now, advisor_action_at: null, closed_at: null, updated_at: now };
    try {
      if (googleStorage.enabled) {
        const existing = (await googleStorage.loadFeedbacks()).find((item: any) => item.evaluation_id === ev.id);
        if (existing) return res.status(409).json({ error: 'Esta evaluación ya tiene feedback.' });
        await googleStorage.saveFeedback(feedback);
      }
      try { db.prepare('INSERT INTO feedbacks (feedback_id,evaluation_id,advisor_id,supervisor_id,evaluator_id,evaluation_type,feedback_text,advisor_evidence_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(feedback.feedback_id, feedback.evaluation_id, feedback.advisor_id, feedback.supervisor_id, feedback.evaluator_id, feedback.evaluation_type, feedback.feedback_text, feedback.advisor_evidence_url, feedback.status, now, now); } catch (localError) { if (!googleStorage.enabled) throw localError; }
      try {
        const directory = googleStorage.enabled ? await readRepository() : repository();
        const advisor = directory.advisors.find(item => item.id === feedback.advisor_id);
        const supervisor = directory.users.find(item => item.id === (advisor?.supervisorId || feedback.supervisor_id) && item.role === 'SUPERVISOR' && item.status === 'ACTIVO');
        const campaign = directory.campaigns.find(item => item.id === advisor?.campaignId);
        if (advisor && supervisor?.email) await emailService.sendSupervisorNotification({ recipient: supervisor.email, subject: `Calidad y Mejora Continua: Nuevo Feedback | ${advisor.name} - ${campaign?.name || 'Sin campaña'}`, title: 'Nuevo feedback registrado', description: 'Hay un nuevo feedback asociado a una evaluación de un asesor de tu dotación.', advisorName: advisor.name, campaignName: campaign?.name || 'Sin campaña', actionLabel: 'Ver feedback', path: `/?section=feedback&feedbackId=${encodeURIComponent(feedback.feedback_id)}` });
      } catch (mailError) { console.error('[email] El feedback se guardó, pero no se notificó al supervisor.', mailError instanceof Error ? mailError.message : ''); }
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
    if (user.role === 'MONITOR' && current.evaluator_id !== user.id) return res.status(403).json({ error: 'Este feedback pertenece a otro monitor.' });
    if (user.role === 'MONITOR' && status !== current.status) return res.status(403).json({ error: 'El cambio de estado corresponde al asesor o supervisor.' });
    const valid = (current.status === 'PENDIENTE' && ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status)) || (['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(current.status) && status === 'CERRADO_SUPERVISOR') || status === current.status;
    if (!valid || (status === 'CERRADO_SUPERVISOR' && current.status === 'OBSERVADO_ASESOR' && !String(body.supervisor_closure_comment || current.supervisor_closure_comment || '').trim())) return res.status(400).json({ error: 'Transición de feedback no permitida o falta comentario de cierre.' });
    const now = new Date().toISOString(); const canEditText = user.role === 'ADMINISTRADOR' || (user.role === 'MONITOR' && current.status === 'PENDIENTE'); const feedback = { ...current, status, feedback_text: canEditText ? String(body.feedback_text ?? current.feedback_text).trim() : current.feedback_text, advisor_response: user.role === 'ASESOR' ? body.advisor_response ?? current.advisor_response : current.advisor_response, advisor_evidence_url: user.role === 'ASESOR' ? body.advisor_evidence_url ?? current.advisor_evidence_url : current.advisor_evidence_url, supervisor_closure_comment: user.role === 'SUPERVISOR' || user.role === 'ADMINISTRADOR' ? body.supervisor_closure_comment ?? current.supervisor_closure_comment : current.supervisor_closure_comment, advisor_action_at: current.status === 'PENDIENTE' && ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(status) ? now : current.advisor_action_at, closed_at: current.status !== 'CERRADO_SUPERVISOR' && status === 'CERRADO_SUPERVISOR' ? now : current.closed_at, updated_at: now };
    if (!feedback.feedback_text) return res.status(400).json({ error: 'El contenido del feedback no puede quedar vacío.' });
    try {
      if (googleStorage.enabled) await googleStorage.saveFeedback(feedback);
      db.prepare('UPDATE feedbacks SET status=?, feedback_text=?, advisor_response=?, advisor_evidence_url=?, supervisor_closure_comment=?, advisor_action_at=?, closed_at=?, updated_at=? WHERE feedback_id=?').run(feedback.status, feedback.feedback_text, feedback.advisor_response, feedback.advisor_evidence_url, feedback.supervisor_closure_comment, feedback.advisor_action_at, feedback.closed_at, feedback.updated_at, req.params.id);
      if (user.role === 'ASESOR' && ['VALIDADO_ASESOR','OBSERVADO_ASESOR'].includes(feedback.status)) try {
        const directory = googleStorage.enabled ? await readRepository() : repository();
        const advisor = directory.advisors.find(item => item.id === feedback.advisor_id);
        const supervisor = directory.users.find(item => item.id === (advisor?.supervisorId || feedback.supervisor_id) && item.role === 'SUPERVISOR' && item.status === 'ACTIVO');
        const campaign = directory.campaigns.find(item => item.id === advisor?.campaignId);
        if (advisor && supervisor?.email) await emailService.sendSupervisorNotification({ recipient: supervisor.email, subject: `Calidad y Mejora Continua: Feedback ${feedback.status === 'OBSERVADO_ASESOR' ? 'observado' : 'validado'} | ${advisor.name}`, title: `Feedback ${feedback.status === 'OBSERVADO_ASESOR' ? 'observado' : 'validado'} por el asesor`, description: 'El asesor registró una respuesta sobre el feedback de su evaluación.', advisorName: advisor.name, campaignName: campaign?.name || 'Sin campaña', actionLabel: 'Revisar feedback', path: `/?section=feedback&feedbackId=${encodeURIComponent(feedback.feedback_id)}` });
      } catch (mailError) { console.error('[email] El feedback se actualizó, pero no se notificó al supervisor.', mailError instanceof Error ? mailError.message : ''); }
      res.json({ feedback });
    }
    catch (error) { console.error('[google-storage] No fue posible actualizar feedback.', error instanceof Error ? error.message : ''); res.status(502).json({ error: 'No fue posible sincronizar el feedback.' }); }
  });
  app.get('/api/platform-state', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = (req as any).authUser as User; const directory = await readRepository();
    const onlyOwn = (state: any) => {
      if (!state) return state;
      if (user.role === 'MONITOR') return { ...state, evaluations: (state.evaluations || []).filter((item: any) => item.evaluatorId === user.id), actionPlans: [], advisorInterventions: [], operationalMeasurements: [], importHistory: [] };
      if (!['ASESOR','SUPERVISOR'].includes(user.role)) return state;
      const advisorIds = user.role === 'ASESOR' && user.advisorId ? new Set([user.advisorId]) : new Set(directory.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId)).map(item => item.id));
      const mine = (items: any[] | undefined) => (items || []).filter(item => advisorIds.has(item.advisorId));
      const visibleEvaluations = mine(state.evaluations).filter((item: any) => normalizedValidationStatus(item) === 'VALIDATED');
      return { ...state, evaluations: visibleEvaluations, actionPlans: mine(state.actionPlans), advisorInterventions: mine(state.advisorInterventions), operationalMeasurements: mine(state.operationalMeasurements), importHistory: [] };
    };
    try {
      if (googleStorage.enabled) {
        const [state, storedEvaluations] = await Promise.all([googleStorage.loadPlatformState(), googleStorage.loadEvaluations()]);
        const localRow = db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
        const localState = localRow ? JSON.parse(localRow.payload_json) : {};
        const localEvaluations = (db.prepare('SELECT payload_json FROM evaluations').all() as any[]).map(row => JSON.parse(row.payload_json));
        const consolidated = { ...localState, ...(state || {}), evaluations: mergeEvaluationSources(storedEvaluations || [], state?.evaluations || [], localEvaluations, localState.evaluations || []) };
        const corrected = { ...consolidated, evaluations: consolidated.evaluations.map((evaluation:any) => correctMigracionesQualityEvaluation(evaluation, directory.campaigns)) };
        const evaluationTypes=corrected.evaluations.reduce((totals:any,item:any)=>{const type=item.evaluationType||'SIN_TIPO';totals[type]=(totals[type]||0)+1;return totals;},{});
        console.log(`[platform-state] fuente=Sheets evaluaciones=${corrected.evaluations.length} tipos=${JSON.stringify(evaluationTypes)} asesores=${directory.advisors.length}`);
        console.log('[platform-state] fuentes=' + JSON.stringify({ sheetsEvaluations: storedEvaluations.length, sheetsState: state?.evaluations?.length || 0, sqliteEvaluations: localEvaluations.length, sqliteState: localState.evaluations?.length || 0, total: corrected.evaluations.length }));
        return res.json({ state: onlyOwn(corrected) });
      }
    }
    catch (error) {
      console.error('[google-storage] No fue posible leer el estado de plataforma.', error instanceof Error ? error.message : '');
      return res.status(502).json({ error: 'No se pudo cargar el historial completo. Se detuvo la sincronización para proteger los registros. Reintenta la carga.' });
    }
    const row = db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
    const state = row ? JSON.parse(String(row.payload_json)) : {};
    const storedEvaluations = (db.prepare('SELECT payload_json FROM evaluations ORDER BY created_at DESC').all() as any[]).flatMap(item => { try { return [JSON.parse(item.payload_json)]; } catch { return []; } });
    const consolidated = normalizePlatformState({ ...state, evaluations: uniqueEvaluations([...storedEvaluations, ...(state.evaluations || [])]) });
    const corrected = { ...consolidated, evaluations: consolidated.evaluations.map((evaluation:any) => correctMigracionesQualityEvaluation(evaluation, directory.campaigns)) };
    const updateEvaluationCache = db.prepare('UPDATE evaluations SET payload_json=? WHERE id=?');
    corrected.evaluations.forEach((evaluation:any) => updateEvaluationCache.run(JSON.stringify(evaluation), evaluation.id));
    if (row) db.prepare('UPDATE app_state SET payload_json=?,updated_at=? WHERE id=?').run(JSON.stringify(corrected), new Date().toISOString(), 'global');
    res.json({ state: onlyOwn(corrected) });
  });
  app.put('/api/platform-state', requireAuth, async (req, res) => {
    if (['ASESOR','SUPERVISOR','MONITOR'].includes((req as any).authUser.role)) return res.status(403).json({ error: 'Este rol no puede sobrescribir el estado global.' });
    const now = new Date().toISOString();
    const normalizedState = normalizePlatformState(req.body);
    try { if (googleStorage.enabled) await googleStorage.savePlatformState(normalizedState); }
    catch (error) { console.error('[google-storage] No fue posible guardar el estado de plataforma.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible sincronizar el estado con Google Sheets.' }); }
    db.prepare(`INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run('global', JSON.stringify(normalizedState), now);
    for (const evaluation of (normalizedState?.evaluations || [])) { if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY','D3C'].includes(evaluation?.evaluationType)) continue; try { db.prepare(`INSERT OR IGNORE INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, `${evaluation.date}T${evaluation.time || '00:00'}:00`, JSON.stringify(evaluation), evaluation.createdAt || now); } catch {} }
    res.json({ ok: true });
  });

  app.post('/api/files/upload', requireAuth, async (req, res) => {
    const { name, mimeType, base64 } = req.body || {};
    if (!name || !base64) return res.status(400).json({ error: 'Archivo inválido.' });
    const normalizedMimeType = /\.(mp3|mpeg|mpg)$/i.test(String(name)) ? 'audio/mpeg' : String(mimeType || 'application/octet-stream');
    const bytes=Math.floor(String(base64).replace(/^data:[^,]*,/,'').length*3/4); if(bytes>35*1024*1024)return res.status(400).json({error:'El archivo supera el límite de 35 MB.'});
    if(!/^(audio\/|image\/)/.test(normalizedMimeType))return res.status(400).json({error:'Solo se permiten audios o imágenes.'});
    try { const file = await googleStorage.uploadFile({ name: String(name), mimeType: normalizedMimeType, base64: String(base64) }); res.status(201).json({ file: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, url: `/api/files/${file.id}/content` } }); }
    catch (error) { console.error('[google-storage] No fue posible subir archivo a Drive.', error instanceof Error ? error.message : ''); res.status(502).json({ error: 'No fue posible subir el archivo a Google Drive.' }); }
  });
  app.get('/api/files/:id/content', requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser as User;
      if (user.role === 'ASESOR') {
        const pathPart = `/api/files/${req.params.id}/content`;
        let evaluations = (db.prepare('SELECT payload_json FROM evaluations').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.payload_json)];}catch{return[];}});
        let feedbacks = db.prepare('SELECT advisor_id,advisor_evidence_url FROM feedbacks').all() as any[];
        if (googleStorage.enabled) { try { evaluations=uniqueEvaluations([...(await googleStorage.loadEvaluations()),...evaluations]);feedbacks=[...(await googleStorage.loadFeedbacks()),...feedbacks]; } catch {} }
        const directory=await readRepository();const advisor=directory.advisors.find(a=>a.id===user.advisorId);const alerts=(db.prepare('SELECT data_json FROM quality_alerts').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.data_json)]}catch{return[]}});const today=new Date().toISOString().slice(0,10);
        const allowed = evaluations.some(item=>item.advisorId===user.advisorId&&normalizedValidationStatus(item)==='VALIDATED'&&String(item.audioUrl||'').includes(pathPart)) || feedbacks.some(item=>item.advisor_id===user.advisorId&&String(item.advisor_evidence_url||'').includes(pathPart)) || alerts.some(item=>advisor&&item.campaignId===advisor.campaignId&&item.status!=='CERRADA'&&String(item.validUntil||'')>=today&&String(item.audioUrl||'').includes(pathPart));
        if (!allowed) return res.status(404).json({ error:'Archivo no encontrado.' });
      }
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
  app.get('/api/files/:id', requireAuth, async (req, res) => { if((req as any).authUser.role==='ASESOR')return res.status(403).json({error:'Acceso denegado.'});try { res.json({ file: await googleStorage.fileMetadata(req.params.id) }); } catch { res.status(404).json({ error: 'Archivo no encontrado.' }); } });
  app.delete('/api/files/:id', requireAuth, async (req, res) => { if(!['ADMINISTRADOR','CONSULTOR'].includes((req as any).authUser.role))return res.status(403).json({error:'Acceso denegado.'});try { await googleStorage.deleteFile(req.params.id); res.status(204).end(); } catch { res.status(404).json({ error: 'Archivo no encontrado.' }); } });

  const qualityManagers = new Set(['ADMINISTRADOR', 'CONSULTOR']);
  const alertRows = () => (db.prepare('SELECT data_json FROM quality_alerts ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const calibrationRows = () => (db.prepare('SELECT data_json FROM calibrations ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const persistAlert = (item: any) => db.prepare(`INSERT INTO quality_alerts (id,status,advisor_id,supervisor_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,advisor_id=excluded.advisor_id,supervisor_id=excluded.supervisor_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.advisorId,item.supervisorId,item.campaignId,JSON.stringify(item),item.publishedAt,item.updatedAt);
  const persistCalibration = (item: any) => db.prepare(`INSERT INTO calibrations (id,status,evaluation_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,evaluation_id=excluded.evaluation_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.evaluationId,item.campaignId,JSON.stringify(item),item.createdAt,item.updatedAt);

  const isAlertActive = (item:any) => item.status !== 'CERRADA' && String(item.validUntil || '') >= new Date().toISOString().slice(0,10);
  const normalizeAlert = (item:any) => ({ ...item, supervisorIds:[...new Set((item.supervisorIds?.length ? item.supervisorIds : [item.supervisorId]).filter(Boolean))], supervisorResponses:item.supervisorResponses || [] });
  const loadAlerts = async () => { let items=alertRows(); try { const remote=googleStorage.enabled?await googleStorage.loadQualityAlerts():[]; if(remote.length){items=remote;remote.forEach(persistAlert);} } catch {} return items.map(normalizeAlert); };
  const teamAdvisorIds = (user:User, directory:SharedRepository) => new Set(directory.advisors.filter(item=>item.supervisorId===user.id || (!!user.teamId&&item.teamId===user.teamId)).map(item=>item.id));
  const visibleAlerts = (items:any[], user:User, directory:SharedRepository) => {
    if (qualityManagers.has(user.role)) return items;
    if (user.role === 'SUPERVISOR') { const team=teamAdvisorIds(user,directory), campaigns=new Set(directory.advisors.filter(a=>team.has(a.id)).map(a=>a.campaignId)); return items.filter(item=>item.supervisorIds.includes(user.id)||team.has(item.advisorId)||campaigns.has(item.campaignId)); }
    if (user.role === 'ASESOR') { const advisor=directory.advisors.find(a=>a.id===user.advisorId); return items.filter(item=>isAlertActive(item)&&!!advisor&&item.campaignId===advisor.campaignId).map(({ supervisorResponses,managementDetail,evidenceUrl,feedbackPerformed,managedAt,elapsedMinutes,...safe })=>safe); }
    return [];
  };
  const loadVisibleEvaluations = async () => { let rows=(db.prepare('SELECT payload_json FROM evaluations').all() as any[]).flatMap(r=>{try{return[JSON.parse(r.payload_json)]}catch{return[]}}); if(googleStorage.enabled)try{rows=uniqueEvaluations([...(await googleStorage.loadEvaluations()),...rows]);}catch{} return rows; };
  app.get('/api/supervisor/dashboard', requireAuth, async (req,res) => {
    const user=(req as any).authUser as User; if(user.role!=='SUPERVISOR')return res.status(403).json({error:'Acceso restringido al supervisor.'});
    const directory=await readRepository(), team=teamAdvisorIds(user,directory), name=String(req.query.advisor||'').trim().toLocaleLowerCase(), state=String(req.query.feedbackStatus||'').toUpperCase();
    const teamAdvisors=directory.advisors.filter(a=>team.has(a.id)&&(!name||a.name.toLocaleLowerCase().includes(name)));
    const evaluations=(await loadVisibleEvaluations()).filter(e=>team.has(e.advisorId)&&normalizedValidationStatus(e)==='VALIDATED');
    let feedbacks=(db.prepare('SELECT * FROM feedbacks').all() as any[]); if(googleStorage.enabled)try{feedbacks=await googleStorage.loadFeedbacks();}catch{}
    feedbacks=feedbacks.filter(f=>team.has(f.advisor_id)); const feedbackByAdvisor=new Map<string,any>(); feedbacks.forEach(f=>{const old=feedbackByAdvisor.get(f.advisor_id);if(!old||String(f.updated_at)>String(old.updated_at))feedbackByAdvisor.set(f.advisor_id,f);});
    const rows=teamAdvisors.map(advisor=>{const own=evaluations.filter(e=>e.advisorId===advisor.id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));const score=own.length?Math.round(own.reduce((s,e)=>s+Number(e.technicalScore??e.scoreTotal??0),0)/own.length):null;const feedback=feedbackByAdvisor.get(advisor.id);const feedbackState=feedback&&['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(feedback.status)?'FIRMADO':'PENDIENTE';return{advisor,score,lastEvaluation:own[0]?.date||null,feedbackState,evaluationCount:own.length};}).filter(row=>!state||row.feedbackState===state).sort((a,b)=>(b.score??-1)-(a.score??-1));
    const allScores=rows.filter(r=>r.score!==null).map(r=>Number(r.score)); const signed=feedbacks.filter(f=>['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(f.status)).length;
    const commitments=(db.prepare('SELECT * FROM evaluation_commitments').all() as any[]).filter(c=>team.has(c.advisor_id)).map(c=>({advisorId:c.advisor_id,text:c.commitment,date:c.commitment_date,status:String(c.completed_date||'')?'CUMPLIDO':c.commitment_date<new Date().toISOString().slice(0,10)?'VENCIDO':'EN_CURSO'}));
    const alerts=visibleAlerts(await loadAlerts(),user,directory).filter(isAlertActive);
    res.json({metrics:{teamAverage:allScores.length?Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length):null,feedbackSignedPercent:feedbacks.length?Math.round(signed/feedbacks.length*100):0,feedbackPending:Math.max(0,feedbacks.length-signed),activeAlerts:alerts.length},advisors:rows,commitments,ranking:rows.filter(r=>r.score!==null).map(({advisor,score})=>({advisorId:advisor.id,name:advisor.name,score}))});
  });
  app.get('/api/supervisor/advisors/:id/evaluations', requireAuth, async (req,res) => { const user=(req as any).authUser as User;if(user.role!=='SUPERVISOR')return res.status(403).json({error:'Acceso denegado.'});const directory=await readRepository();if(!teamAdvisorIds(user,directory).has(req.params.id))return res.status(404).json({error:'Asesor no encontrado.'});const evaluations=(await loadVisibleEvaluations()).filter(e=>e.advisorId===req.params.id&&normalizedValidationStatus(e)==='VALIDATED').sort((a,b)=>String(b.date).localeCompare(String(a.date)));res.json({evaluations}); });
  app.get('/api/quality-alerts', requireAuth, async (req, res) => {
    const user=(req as any).authUser as User; const directory=await readRepository(); if(user.role==='MONITOR')return res.status(403).json({error:'Acceso denegado.'}); res.json({alerts:visibleAlerts(await loadAlerts(),user,directory)});
  });
  app.post('/api/quality-alerts', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (!qualityManagers.has(user.role)) return res.status(403).json({ error:'Solo Calidad o Administración puede publicar alertas.' });
    const body = req.body || {}, directory=await readRepository(); if (!body.title || !body.advisorId || !body.campaignId || !body.validUntil || !String(body.detail||'').trim()) return res.status(400).json({ error:'Completa los datos obligatorios.' });
    const advisor=directory.advisors.find(a=>a.id===body.advisorId); if(!advisor||advisor.campaignId!==body.campaignId)return res.status(400).json({error:'El asesor y la campaña no coinciden.'}); const supervisorIds=[...new Set((Array.isArray(body.supervisorIds)?body.supervisorIds:[body.supervisorId||advisor.supervisorId]).filter(Boolean))];if(!supervisorIds.length||supervisorIds.some(id=>!directory.users.some(u=>u.id===id&&u.role==='SUPERVISOR'&&u.status==='ACTIVO')))return res.status(400).json({error:'Selecciona supervisores activos.'});
    const now = new Date().toISOString(); const alert = { id:`alert_${randomBytes(8).toString('hex')}`,title:String(body.title).trim(),audioUrl:body.audioUrl || undefined,contactNumber:String(body.contactNumber || ''),detail:String(body.detail).trim(),advisorId:body.advisorId,supervisorId:supervisorIds[0],supervisorIds,supervisorResponses:[],campaignId:body.campaignId,validUntil:body.validUntil,criticality:['BAJA','MEDIA','ALTA','CRITICA'].includes(body.criticality)?body.criticality:'MEDIA',status:'NUEVA',publishedAt:now,createdBy:user.id,updatedAt:now };
    try {
      persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert);
      try {
        const advisor = directory.advisors.find(item => item.id === alert.advisorId);
        const supervisor = directory.users.find(item => item.id === alert.supervisorId && item.role === 'SUPERVISOR' && item.status === 'ACTIVO');
        const campaign = directory.campaigns.find(item => item.id === alert.campaignId);
        if (advisor && supervisor?.email) await emailService.sendSupervisorNotification({ recipient: supervisor.email, subject: `Calidad y Mejora Continua: Nueva Alerta | ${advisor.name} - ${campaign?.name || 'Sin campaña'}`, title: 'Nueva alerta de calidad', description: `${alert.title}. Criticidad: ${alert.criticality}.`, advisorName: advisor.name, campaignName: campaign?.name || 'Sin campaña', actionLabel: 'Ver alerta', path: `/?section=quality_alerts&alertId=${encodeURIComponent(alert.id)}` });
      } catch (mailError) { console.error('[email] La alerta se guardó, pero no se notificó al supervisor.', mailError instanceof Error ? mailError.message : ''); }
      res.status(201).json({ alert });
    } catch { res.status(502).json({ error:'No fue posible guardar la alerta.' }); }
  });
  app.patch('/api/quality-alerts/:id', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; let items = await loadAlerts();
    const current = items.find(item => item.id === req.params.id); if (!current) return res.status(404).json({ error:'Alerta no encontrada.' });
    const isAssigned = user.role === 'SUPERVISOR' && current.supervisorIds.includes(user.id); if (!isAssigned && !qualityManagers.has(user.role)) return res.status(403).json({ error:'No puedes gestionar esta alerta.' });
    const body=req.body||{}; const now=new Date().toISOString(); const nextStatus=body.status || current.status;
    if (isAssigned && !['PENDIENTE_GESTION','GESTIONADA'].includes(nextStatus)) return res.status(403).json({ error:'El supervisor solo puede gestionar la alerta.' });
    if (nextStatus === 'GESTIONADA' && (!body.feedbackPerformed || !String(body.managementDetail || '').trim())) return res.status(400).json({ error:'Registra el feedback y el detalle de gestión.' });
    const editable=['title','audioUrl','contactNumber','detail','advisorId','campaignId','validUntil','criticality']; if(qualityManagers.has(user.role)){const changes=Object.fromEntries(editable.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));const alert={...current,...changes,status:nextStatus,closedAt:nextStatus==='CERRADA'?now:current.closedAt,updatedAt:now};try{persistAlert(alert);if(googleStorage.enabled)await googleStorage.saveQualityAlert(alert);return res.json({alert});}catch{return res.status(502).json({error:'No fue posible actualizar la alerta.'});}}
    const managedAt=nextStatus==='GESTIONADA'?now:undefined; const response={supervisorId:user.id,status:nextStatus,feedbackPerformed:nextStatus==='GESTIONADA',managementDetail:String(body.managementDetail||'').trim(),evidenceUrl:body.evidenceUrl||undefined,managedAt,elapsedMinutes:managedAt?Math.max(0,Math.round((new Date(managedAt).getTime()-new Date(current.publishedAt).getTime())/60000)):undefined,updatedAt:now}; const responses=[...current.supervisorResponses.filter((r:any)=>r.supervisorId!==user.id),response]; const allManaged=current.supervisorIds.every((id:string)=>responses.some((r:any)=>r.supervisorId===id&&r.status==='GESTIONADA')); const alert={...current,status:allManaged?'GESTIONADA':nextStatus,supervisorResponses:responses,updatedAt:now};
    try { persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert); res.json({ alert }); } catch { res.status(502).json({ error:'No fue posible actualizar la alerta.' }); }
  });
  app.delete('/api/quality-alerts/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!qualityManagers.has(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadAlerts()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Alerta no encontrada.'});db.prepare('DELETE FROM quality_alerts WHERE id=?').run(current.id);if(googleStorage.enabled)await googleStorage.deleteQualityAlert(current.id);res.json({ok:true});});
  app.get('/api/quality-alerts/:id/audio',requireAuth,async(req,res)=>{const user=(req as any).authUser as User,directory=await readRepository(),alert=(await loadAlerts()).find(i=>i.id===req.params.id);if(!alert||!visibleAlerts([alert],user,directory).length||!alert.audioUrl)return res.status(404).json({error:'Audio no encontrado.'});const fileId=String(alert.audioUrl).match(/\/api\/files\/([^/]+)\/content/)?.[1];if(!fileId)return res.status(404).json({error:'Audio no encontrado.'});try{const file=await googleStorage.fileMetadata(fileId),stream=await googleStorage.downloadFile(fileId);res.set({'Content-Type':file.mimeType||'audio/mpeg','Content-Disposition':`inline; filename="${String(file.name||'audio.mp3').replace(/[\\\r\n"]/g,'_')}"`,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});stream.pipe(res);}catch{res.status(404).json({error:'Audio no encontrado.'});}});

  const loadCalibrations=async()=>{let rows=calibrationRows();try{const remote=googleStorage.enabled?await googleStorage.loadCalibrations():[];if(remote.length){rows=remote;remote.forEach(persistCalibration);}}catch{}const now=Date.now();for(const item of rows){if(['PROGRAMADA','EN_VIVO'].includes(item.status)&&item.dueAt&&new Date(item.dueAt).getTime()<=now){const participants=(item.participants||[]).map((p:any)=>p.response?p:{...p,status:'VENCIDA',expiredAt:new Date().toISOString()});const expired={...item,status:'FINALIZADA',participants,expiredAt:new Date().toISOString(),updatedAt:new Date().toISOString(),audit:[...(item.audit||[]),{action:'VENCIDA',userId:'SYSTEM',at:new Date().toISOString()}]};await saveCalibration(expired);Object.assign(item,expired);}}return rows;};
  const saveCalibration=async(item:any)=>{persistCalibration(item);if(googleStorage.enabled)await googleStorage.saveCalibration(item);};
  const calibrationManagers=(role:string)=>['ADMINISTRADOR','CONSULTOR'].includes(role);
  const responseScore=(answers:Record<string,string>,items:any[]=[])=>{const applicable=items.filter(item=>answers[item.criterionId]&&answers[item.criterionId]!=='NO_APLICA');const total=applicable.reduce((sum,item)=>sum+Number(item.qualityGuideline?.weight||1),0);return total?Math.round(applicable.reduce((sum,item)=>sum+(answers[item.criterionId]==='CUMPLE'?Number(item.qualityGuideline?.weight||1):0),0)/total*100):0;};
  // @ts-ignore Los identificadores se normalizan a texto al persistir.
  // Agreement Rev.3: coincidencias exactas / atributos aplicables. No mezcla nota ni tipificación.
  const withAffinity=(item:any)=>{const expert=item.expertResponse;if(!expert)return item;const participants=(item.participants||[]).map((p:any)=>{if(!p.response)return p;const keys=Object.keys(expert.answers||{}).filter(key=>Object.prototype.hasOwnProperty.call(p.response.answers||{},key));const matches=keys.filter(key=>p.response.answers[key]===expert.answers[key]).length;const agreement=keys.length?Math.round(matches/keys.length*1000)/10:0;const differences=keys.filter(key=>p.response.answers[key]!==expert.answers[key]).map(key=>item.attributeLabels?.[key]||key);return{...p,answers:p.response.answers,agreement,affinity:agreement,affinityLevel:agreement>=90?'Muy calibrado':agreement>=80?'Calibrado':agreement>=70?'Requiere ajuste':'No calibrado',deviation:Math.round((Number(p.response.score)-Number(expert.score))*10)/10,mainDifferences:differences.slice(0,5)};});return{...item,participants};};
  const audited=(item:any,action:string,userId:string,extra:any={})=>({...item,...extra,audit:[...(item.audit||[]),{action,userId,at:new Date().toISOString()}],updatedAt:new Date().toISOString()});
  app.get('/api/calibrations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(['ASESOR','GERENCIA','MONITOR'].includes(user.role))return res.json({calibrations:[]});let rows=(await loadCalibrations()).map(withAffinity);if(['SUPERVISOR','FORMADOR'].includes(user.role))rows=rows.filter(i=>i.expertId===user.id||i.participants?.some((p:any)=>p.supervisorId===user.id));rows=rows.map(i=>{if(calibrationManagers(user.role)||i.status==='CERRADA')return i;const{expertResponse,officialAnswers,results,...safe}=i;return safe;});res.json({calibrations:rows});});
  app.post('/api/calibrations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const b=req.body||{},e=b.evaluation,repo=repository(),participantIds=[...new Set((b.participantIds||b.supervisorIds||[]).filter(Boolean))] as string[];if(!e?.id||e.evaluationType!=='QUALITY')return res.status(400).json({error:'Selecciona una evaluación de Calidad.'});if(!b.expertId||!repo.users.some(u=>u.id===b.expertId&&u.status==='ACTIVO'))return res.status(400).json({error:'Selecciona un Referente Experto activo.'});const validIds=participantIds.filter(id=>id!==b.expertId&&repo.users.some(u=>u.id===id&&u.status==='ACTIVO'));if(!validIds.length)return res.status(400).json({error:'Selecciona participantes activos.'});const now=new Date().toISOString(),labels=Object.fromEntries((e.items||[]).map((x:any)=>[x.criterionId,x.qualityGuideline?.name||x.attribute||x.criterionId])),item={id:`cal_${randomBytes(8).toString('hex')}`,evaluationId:e.id,campaignId:e.campaignId,title:String(b.title||`Calibración ${e.callId}`),description:String(b.description||''),callType:b.callType||(e.sale?'VENTA':'NO_VENTA'),scheduledAt:b.scheduledAt||'',dueAt:b.dueAt||'',status:'BORRADOR',expertId:b.expertId,participants:validIds.map(supervisorId=>({supervisorId,status:'PENDIENTE'})),attributeLabels:labels,caseSnapshot:{callId:e.callId,date:e.date,time:e.time,advisorId:e.advisorId,product:e.product,typification:e.noSaleReason||e.saleResult,result:e.qualityResult,observation:b.observation||e.comments,audioUrl:e.audioUrl,audioFileName:e.audioFileName,audioDurationSeconds:e.audioDurationSeconds,items:e.items||[]},createdBy:user.id,createdAt:now,updatedAt:now,audit:[{action:'CREADA',userId:user.id,at:now}]};try{await saveCalibration(item);res.status(201).json({calibration:item});}catch{res.status(502).json({error:'No fue posible crear la calibración.'});}});
  app.patch('/api/calibrations/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(['CERRADA','ANULADA'].includes(current.status)&&user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede corregir registros cerrados o anulados.'});const allowed=['title','description','callType','scheduledAt','dueAt','expertId','participants'],changes=Object.fromEntries(allowed.filter(k=>req.body?.[k]!==undefined).map(k=>[k,req.body[k]]));if(changes.participants)changes.participants=(changes.participants as any[]).filter(p=>p.supervisorId!==(changes.expertId||current.expertId));const next=audited(current,'EDITADA',user.id,changes);await saveCalibration(next);res.json({calibration:next});});
  app.patch('/api/calibrations/:id/state',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(['CERRADA','ANULADA'].includes(current.status)&&user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede corregir este estado.'});const target=String(req.body?.status||''),transitions:Record<string,string[]>={BORRADOR:['PROGRAMADA','ANULADA'],PROGRAMADA:['EN_VIVO','ANULADA'],EN_VIVO:['FINALIZADA','ANULADA'],FINALIZADA:['CERRADA','ANULADA'],CERRADA:[],ANULADA:[]};if(!(transitions[current.status]||[]).includes(target)&&user.role!=='ADMINISTRADOR')return res.status(400).json({error:'Transición no permitida.'});if(target==='EN_VIVO'&&(!current.title||!current.campaignId||!current.caseSnapshot?.callId||!current.caseSnapshot?.audioUrl||!current.expertId||!current.participants?.length))return res.status(400).json({error:'Completa obligatorios, audio, referente y participantes.'});if(target==='CERRADA'&&!current.expertResponse)return res.status(400).json({error:'No se puede cerrar sin evaluación del Referente Experto.'});let next=withAffinity(audited(current,target,user.id,{status:target}));if(target==='CERRADA'){const values=next.participants.filter((p:any)=>p.affinity!==undefined).map((p:any)=>p.affinity);next={...next,results:{patternScore:next.expertResponse.score,averageAffinity:values.length?Math.round(values.reduce((a:number,b:number)=>a+b,0)/values.length*10)/10:0,highestAffinity:values.length?Math.max(...values):0,lowestAffinity:values.length?Math.min(...values):0,closedAt:new Date().toISOString()}};}await saveCalibration(next);res.json({calibration:next});});
  app.post('/api/calibrations/:id/invitations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(!['PROGRAMADA','EN_VIVO'].includes(current.status))return res.status(400).json({error:'La calibración debe estar programada o en vivo.'});const repo=await readRepository(),campaign=repo.campaigns.find(c=>c.id===current.campaignId);const sent:any[]=[];const participants=[];for(const p of current.participants||[]){const recipient=repo.users.find(u=>u.id===p.supervisorId&&u.status==='ACTIVO');try{if(!recipient?.email)throw new Error('Correo no configurado.');const ok=await emailService.sendSupervisorNotification({recipient:recipient.email,subject:`Calidad y Mejora Continua: Invitación a calibración | ${current.title}`,title:'Invitación a calibración',description:`Tienes una calibración asignada. Fecha límite: ${current.dueAt||'sin plazo'}.`,advisorName:current.caseSnapshot?.advisorId||'Caso de calibración',campaignName:campaign?.name||'Sin campaña',actionLabel:'Abrir calibración',path:`/?section=calibrations&calibrationId=${encodeURIComponent(current.id)}`});if(!ok)throw new Error('Servicio de correo no disponible.');participants.push({...p,status:p.response?'RESPONDIDA':'SENT',sentAt:new Date().toISOString(),inviteError:undefined});sent.push({supervisorId:p.supervisorId,sent:true});}catch(error:any){participants.push({...p,status:p.response?'RESPONDIDA':'PENDIENTE',inviteError:error.message||'No fue posible enviar'});sent.push({supervisorId:p.supervisorId,sent:false});}}const next=audited(current,'INVITACIONES_ENVIADAS',user.id,{participants});await saveCalibration(next);res.json({calibration:next,results:sent});});
  app.patch('/api/calibrations/:id/respond',requireAuth,async(req,res)=>{const user=(req as any).authUser as User,current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(current.status!=='EN_VIVO')return res.status(400).json({error:'Solo se puede responder durante En vivo.'});const participant=current.participants?.find((p:any)=>p.supervisorId===user.id),isExpert=current.expertId===user.id;if(!participant&&!isExpert)return res.status(403).json({error:'No estás asignado.'});if((isExpert&&current.expertResponse)||participant?.response)return res.status(409).json({error:'La evaluación ya fue enviada y está bloqueada.'});const answers=req.body?.answers||{},keys=Object.keys(current.attributeLabels||{});if(!keys.length||keys.some(k=>!answers[k]))return res.status(400).json({error:'Responde todos los ítems.'});const response={answers,comments:req.body.comments||{},typification:String(req.body.typification||''),observation:String(req.body.observation||''),criticalIds:req.body.criticalIds||[],score:responseScore(answers,current.caseSnapshot?.items||[]),submittedAt:new Date().toISOString()};let next=isExpert?audited(current,'PATRON_ENVIADO',user.id,{expertResponse:response}):audited(current,'RESPUESTA_ENVIADA',user.id,{participants:current.participants.map((p:any)=>p.supervisorId===user.id?{...p,status:'RESPONDIDA',response,answers,submittedAt:response.submittedAt}:p)});next=withAffinity(next);await saveCalibration(next);const{expertResponse,...safe}=next;res.json({calibration:isExpert||calibrationManagers(user.role)?next:safe});});
  app.delete('/api/calibrations/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede eliminar.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});db.prepare('DELETE FROM calibrations WHERE id=?').run(current.id);if(googleStorage.enabled)await googleStorage.deleteCalibration(current.id);res.json({ok:true});});
  app.get('/api/reports/:kind.xlsx',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!['ADMINISTRADOR','CONSULTOR','SUPERVISOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});const kind=String(req.params.kind),repo=await readRepository(),team=user.role==='SUPERVISOR'?teamAdvisorIds(user,repo):null;const evaluations=(await loadVisibleEvaluations()).filter(e=>!team||team.has(e.advisorId));const commitments=(db.prepare('SELECT * FROM evaluation_commitments').all() as any[]).filter(c=>!team||team.has(c.advisor_id));if(!['evaluations','commitments','calibrations','alerts'].includes(kind))return res.status(404).json({error:'Reporte no encontrado.'});if(kind==='alerts'&&user.role==='SUPERVISOR')return res.status(403).json({error:'Solo Admin puede exportar alertas.'});let rows:any[]=[];if(kind==='evaluations')rows=evaluations.map(e=>({Fecha:e.date,Asesor:repo.advisors.find(a=>a.id===e.advisorId)?.name||e.advisorId,Campaña:repo.campaigns.find(c=>c.id===e.campaignId)?.name||e.campaignId,Supervisor:repo.users.find(u=>u.id===e.supervisorId)?.name||e.supervisorId,Nota:Number(e.technicalScore??e.scoreTotal??0),Validación:normalizedValidationStatus(e),Origen:e.origin||'MANUAL'}));if(kind==='commitments')rows=commitments.map(c=>({Asesor:repo.advisors.find(a=>a.id===c.advisor_id)?.name||c.advisor_id,Compromiso:c.commitment,Fecha:c.commitment_date,Estado:c.commitment_date<new Date().toISOString().slice(0,10)?'VENCIDO':'EN_CURSO'}));if(kind==='calibrations')rows=(await loadCalibrations()).flatMap(c=>c.participants.map((p:any)=>({Sesión:c.title,Fecha:c.createdAt,Caso:c.caseSnapshot?.callId||c.evaluationId,Supervisor:repo.users.find(u=>u.id===p.supervisorId)?.name||p.supervisorId,Estado:p.status,Agreement:Number(p.agreement??'' )||'',Campaña:repo.campaigns.find(x=>x.id===c.campaignId)?.name||c.campaignId})));if(kind==='alerts')rows=(await loadAlerts()).map(a=>({Alerta:a.title,Campaña:repo.campaigns.find(c=>c.id===a.campaignId)?.name||a.campaignId,Asesor:repo.advisors.find(x=>x.id===a.advisorId)?.name||a.advisorId,Supervisor:repo.users.find(x=>x.id===a.supervisorId)?.name||a.supervisorId,Vigencia:a.validUntil,Criticidad:a.criticality,Estado:a.status,Detalle:a.detail,Publicado:a.publishedAt}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Reporte');const output=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${kind}-${new Date().toISOString().slice(0,10)}.xlsx"`});res.end(output);});
  app.get('/api/admin/calibration-kpi',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!['ADMINISTRADOR','CONSULTOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});const values=(await loadCalibrations()).filter(c=>c.status==='CERRADA').flatMap(c=>c.participants.map((p:any)=>p.agreement).filter((v:any)=>typeof v==='number'));res.json({averageAgreement:values.length?Math.round(values.reduce((a:number,b:number)=>a+b,0)/values.length*10)/10:null});});

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
    const user = (req as any).authUser as User; if (!['ADMINISTRADOR','MONITOR','ASESOR'].includes(user.role)) return res.status(403).json({ error:'Acceso denegado.' }); try{await hydrateDevelopment();}catch(error){console.error('[google-storage] No fue posible cargar desarrollo.',error instanceof Error?error.message:'');} const capsules = capsuleRows();
    if (user.role === 'MONITOR') return res.json({ capsules: capsules.filter(item => item.createdByUserId === user.id) });
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
    const user = (req as any).authUser as User; if (!['ADMINISTRADOR','MONITOR'].includes(user.role)) return res.status(403).json({ error:'Acceso denegado.' }); const now = new Date().toISOString(); const body = req.body || {};
    const capsule = { ...body, id: `cap_${randomBytes(8).toString('hex')}`, status: 'BORRADOR', createdByUserId: user.id, createdByName: user.name, createdAt: now, updatedAt: now };
    if (!capsule.title || !capsule.content?.type || !['FORMULARIO','FORO'].includes(capsule.evaluation?.type)) return res.status(400).json({ error: 'Datos de cápsula incompletos.' });
    db.prepare('INSERT INTO development_capsules (id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(capsule.id, capsule.status, JSON.stringify(capsule), now, now); await syncDevelopment(); return res.status(201).json({ capsule });
  });
  app.patch('/api/development/capsules/:id', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (!['ADMINISTRADOR','MONITOR'].includes(user.role)) return res.status(403).json({ error:'Acceso denegado.' }); const row = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any; if (!row) return res.status(404).json({ error: 'Cápsula no encontrada.' }); const current = JSON.parse(row.data_json); if (user.role === 'MONITOR' && current.createdByUserId !== user.id) return res.status(403).json({ error:'Esta cápsula pertenece a otro creador.' });
    const now = new Date().toISOString(); const capsule = { ...current, ...req.body, id: req.params.id, createdByUserId: current.createdByUserId, createdByName: current.createdByName, updatedAt: now };
    db.prepare('UPDATE development_capsules SET status=?,data_json=?,updated_at=? WHERE id=?').run(capsule.status, JSON.stringify(capsule), now, capsule.id); await syncDevelopment(); return res.json({ capsule });
  });
  app.post('/api/development/capsules/:id/duplicate', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; if (!['ADMINISTRADOR','MONITOR'].includes(user.role)) return res.status(403).json({ error:'Acceso denegado.' }); const row = db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any; if (!row) return res.status(404).json({ error: 'Cápsula no encontrada.' }); const source = JSON.parse(row.data_json); if (user.role === 'MONITOR' && source.createdByUserId !== user.id) return res.status(403).json({ error:'Esta cápsula pertenece a otro creador.' });
    const now = new Date().toISOString(); const capsule = { ...source, id: `cap_${randomBytes(8).toString('hex')}`, title: `${source.title} · Copia`, status: 'BORRADOR', createdByUserId: user.id, createdByName: user.name, createdAt: now, updatedAt: now };
    db.prepare('INSERT INTO development_capsules (id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(capsule.id, capsule.status, JSON.stringify(capsule), now, now); await syncDevelopment(); return res.status(201).json({ capsule });
  });
  app.delete('/api/development/capsules/:id', requireAuth, async (req, res) => { const user=(req as any).authUser as User;if(!['ADMINISTRADOR','MONITOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});const row=db.prepare('SELECT data_json FROM development_capsules WHERE id=?').get(req.params.id) as any;if(!row)return res.status(404).json({error:'Cápsula no encontrada.'});if(user.role==='MONITOR'&&JSON.parse(row.data_json).createdByUserId!==user.id)return res.status(403).json({error:'Esta cápsula pertenece a otro creador.'});db.prepare('DELETE FROM development_assignments WHERE capsule_id=?').run(req.params.id); db.prepare('DELETE FROM development_capsules WHERE id=?').run(req.params.id); await syncDevelopment(); return res.status(204).end(); });
  app.get('/api/development/assignments', requireAuth, async (req, res) => { const user = (req as any).authUser as User; if(!['ADMINISTRADOR','MONITOR','ASESOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});try{await hydrateDevelopment();}catch{} let assignments = assignmentRows().map(item=>item.dueAt&&new Date(item.dueAt)<new Date()&&!['COMPLETADA','VENCIDA'].includes(item.status)?{...item,status:'VENCIDA'}:item);if(user.role==='MONITOR'){const ids=new Set(capsuleRows().filter(item=>item.createdByUserId===user.id).map(item=>item.id));assignments=assignments.filter(item=>ids.has(item.capsuleId));}return res.json({ assignments: user.role === 'ASESOR' ? assignments.filter(item => item.advisorId === user.advisorId) : assignments }); });
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
