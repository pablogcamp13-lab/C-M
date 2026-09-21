import express from "express";
import { mergeEvaluationSources } from "./server/platformStateRecovery";
import { registerOperationsModule } from "./server/operationsModule";
import { rosterImportSnapshot } from "./server/rosterSync";
import { speechAdvisorIdentityFromFile, speechFileIdentityMatches } from "./server/speechFileIdentity";
import path from "path";
import { googleStorage as googleDriveStorage } from "./server/googleStorage";
import { supabaseStorage } from "./server/supabaseStorage";
import { supabaseFileStorage } from "./server/supabaseFileStorage";
import { normalizeAccessUser, scopedRepository } from './server/authorization';
import { emailService } from "./server/emailService";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Advisor, Campaign, Company, Operation, OperationAssignment, OperationSupervisor, StaffingMovement, Team, User } from "./src/types";
// @ts-ignore node:sqlite está disponible en Node 22.5+; el proyecto conserva
// @types/node 22 para el resto del código existente.
import { DatabaseSync } from "node:sqlite";
import * as XLSX from 'xlsx';
import { calculateEvaluationSummary, getItemCompliance } from './src/utils/calculations';
import { QUALITY_ATTRIBUTES } from './src/data/qualityPueData';

// Keep the existing Sheets repository available during the Supabase cutover.
// An explicit "false" disables it; an unset variable must never leave
// production with an empty local repository.
const legacySheetsAllowed = process.env.ALLOW_GOOGLE_SHEETS_FALLBACK !== 'false';
const structuredStorage: any = supabaseStorage.enabled ? supabaseStorage : legacySheetsAllowed && googleDriveStorage.sheetsEnabled ? googleDriveStorage : null;
// Compatibility facade for structured data. New binary files use private
// Supabase Storage; Drive remains read-only compatibility for historical IDs.
const googleStorage: any = new Proxy(googleDriveStorage as any, { get(target, property) {
  if (property === 'enabled') return Boolean(structuredStorage);
  const owner = structuredStorage && property in structuredStorage ? structuredStorage : target;
  const value = owner[property]; return typeof value === 'function' ? value.bind(owner) : value;
} });
const legacyDriveFileStorage = {
  async fileMetadata(id: string) {
    try { return await googleDriveStorage.fileMetadata(id); }
    catch { return { id, name: 'audio-historico.mp3', mimeType: 'audio/mpeg' }; }
  },
  async downloadFile(id: string) {
    try { return await googleDriveStorage.downloadFile(id); }
    catch {
      const response = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, { redirect: 'follow' });
      const mimeType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!response.ok || mimeType.includes('text/html')) throw new Error('Audio histórico no disponible.');
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length || data.length > 35 * 1024 * 1024) throw new Error('Audio histórico inválido.');
      const { Readable } = await import('node:stream');
      return Readable.from(data);
    }
  },
  async deleteFile(id: string) { return googleDriveStorage.deleteFile(id); }
};
const fileStorageFor = (id: string) => supabaseFileStorage.owns(id) ? supabaseFileStorage : legacyDriveFileStorage;

const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production' || /dist[\\/]server\.cjs$/.test(process.argv[1] || '');

type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[]; companies?:Company[]; operations?:Operation[]; operationSupervisors?:OperationSupervisor[]; operationAssignments?:OperationAssignment[]; staffingMovements?:StaffingMovement[] };
const sqlitePath = process.env.SQLITE_PATH || join(process.cwd(), 'data', 'contact-center.sqlite');
mkdirSync(path.dirname(sqlitePath), { recursive: true });
const db = new DatabaseSync(sqlitePath);
// Only a fully consolidated snapshot is retained. It is a read-only fallback
// for transient Sheets quota errors; it is never written back to Google.
let lastCompletePlatformState: any | null = null;
let structuredRepositoryCache:{expiresAt:number,value:SharedRepository}|null=null;
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
const addColumn = (table:string,column:string,definition:string) => { if (!(db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(item=>item.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); };
addColumn('companies','updated_at','TEXT');
addColumn('users','access_scope',"TEXT NOT NULL DEFAULT 'GLOBAL'"); addColumn('users','company_ids_json',"TEXT NOT NULL DEFAULT '[]'"); addColumn('users','operation_ids_json',"TEXT NOT NULL DEFAULT '[]'");
addColumn('operations','normalized_name','TEXT'); addColumn('operations','created_at','TEXT'); addColumn('operations','updated_at','TEXT'); addColumn('operations','closed_at','TEXT'); addColumn('operations','version','INTEGER NOT NULL DEFAULT 1'); addColumn('operations','metadata_json',"TEXT NOT NULL DEFAULT '{}'");
addColumn('staffing_movements','effective_at','TEXT'); addColumn('staffing_movements','created_at','TEXT'); addColumn('staffing_movements','reversed_movement_id','TEXT');
db.exec(`CREATE TABLE IF NOT EXISTS operation_supervisors (operation_id TEXT NOT NULL REFERENCES operations(id), supervisor_id TEXT NOT NULL REFERENCES users(id), active INTEGER NOT NULL, start_at TEXT NOT NULL, end_at TEXT, PRIMARY KEY(operation_id,supervisor_id,start_at));
CREATE INDEX IF NOT EXISTS idx_operations_status_company ON operations(status,company_id);
CREATE INDEX IF NOT EXISTS idx_operation_supervisors_active ON operation_supervisors(operation_id,active,supervisor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_supervisor_active ON operation_assignments(supervisor_id,active);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON operation_assignments(start_date,end_date);
CREATE INDEX IF NOT EXISTS idx_movements_effective ON staffing_movements(effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_assignment ON staffing_movements(assignment_id);`);
const normalizeOperationName=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase();
const schemaNow=new Date().toISOString();
db.prepare("UPDATE companies SET updated_at=COALESCE(updated_at,created_at,?)").run(schemaNow);
for(const row of db.prepare('SELECT id,name FROM operations').all() as any[]) db.prepare("UPDATE operations SET normalized_name=COALESCE(NULLIF(normalized_name,''),?),created_at=COALESCE(created_at,?),updated_at=COALESCE(updated_at,?) WHERE id=?").run(normalizeOperationName(String(row.name).split('/').pop()||row.name),schemaNow,schemaNow,row.id);
db.prepare("UPDATE staffing_movements SET effective_at=COALESCE(effective_at,substr(occurred_at,1,10)),created_at=COALESCE(created_at,occurred_at)").run();

if (isProduction && !process.env.INITIAL_ADMIN_PASSWORD) throw new Error('INITIAL_ADMIN_PASSWORD es obligatoria en producción.');
const INITIAL_PASSWORD = '12345678';
const DEFAULT_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || INITIAL_PASSWORD;
const hashPassword = (password: string) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const validPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const derived = scryptSync(password, salt, 64); return timingSafeEqual(derived, Buffer.from(hash, 'hex')); };
const publicUser = (row: any): User => normalizeAccessUser(row);
const evaluationIdentity = (item: any) => item?.origin === 'SPEECH_ANALYTICS'
  ? `SA|${item.id}`
  : [item?.advisorId, item?.evaluationType, item?.date, item?.time, item?.callId || item?.recordingCode || item?.id].join('|');
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
const recalculateEditedEvaluation = (evaluation: any, campaigns: Campaign[]) => {
  const items = Array.isArray(evaluation.items) ? evaluation.items : [];
  if (evaluation.evaluationType !== 'QUALITY') {
    const summary = calculateEvaluationSummary(items);
    return { ...evaluation, ...summary };
  }
  const campaign = campaigns.find(item => item.id === evaluation.campaignId);
  const criterionWeights = campaign?.qualityCriterionWeights || { C1: .30, C2: .30, C3: .30, C4: .10 };
  const dimensionCriterion: Record<string,string> = { CONECTAR:'C1', CLARIFICAR:'C2', CONVERTIR:'C3', CONECTAR_C4:'C4' };
  const groups = ['C1','C2','C3','C4'].map(criterion => {
    const rows = items.filter((item:any) => (item.qualityGuideline?.criterion || dimensionCriterion[item.dimension]) === criterion && ['CUMPLE','NO_CUMPLE'].includes(item.compliance));
    const denominator = rows.reduce((sum:number,item:any) => sum + Number(item.attributeWeight || item.qualityGuideline?.weight || 1), 0);
    const achieved = rows.filter((item:any) => item.compliance === 'CUMPLE').reduce((sum:number,item:any) => sum + Number(item.attributeWeight || item.qualityGuideline?.weight || 1), 0);
    return { criterion, score: denominator ? achieved / denominator * 100 : null, weight: Number((criterionWeights as any)[criterion] || 0) };
  });
  const activeWeight = groups.reduce((sum,item) => sum + (item.score === null ? 0 : item.weight), 0);
  const technicalScore = activeWeight ? Math.round(groups.reduce((sum,item) => sum + (item.score === null ? 0 : item.score * item.weight), 0) / activeWeight) : null;
  const criticalItem = items.find((item:any) => item.compliance === 'NO_CUMPLE' && (item.qualityGuideline?.critical || String(item.classification || '').startsWith('CRITICO_')));
  const criticalFailure = Boolean(evaluation.qualityCriticalErrorIds?.length || criticalItem);
  const failedByMinimum = Boolean(isMigracionesBitel(campaign) && (technicalScore ?? 0) < 75);
  const gaps = items.filter((item:any) => item.compliance === 'NO_CUMPLE');
  return {
    ...evaluation,
    technicalScore,
    scoreTotal: criticalFailure ? 0 : technicalScore,
    scoreConnect: groups.find(item=>item.criterion==='C1')?.score == null ? null : Math.round(groups.find(item=>item.criterion==='C1')!.score!),
    scoreClarify: groups.find(item=>item.criterion==='C2')?.score == null ? null : Math.round(groups.find(item=>item.criterion==='C2')!.score!),
    scoreConvert: groups.find(item=>item.criterion==='C3')?.score == null ? null : Math.round(groups.find(item=>item.criterion==='C3')!.score!),
    qualityResult: criticalFailure || failedByMinimum ? 'REPROBADA' : 'APROBADA',
    criticalReason: criticalFailure ? (evaluation.qualityCriticalErrorSnapshot?.[0]?.name || criticalItem?.errorType || 'Error crítico') : failedByMinimum ? 'Puntaje menor al mínimo aprobatorio de 75%' : undefined,
    primaryGap: gaps[0]?.attribute || gaps[0]?.qualityGuideline?.name || 'Sin brechas identificadas',
    secondaryGap: gaps[1]?.attribute || gaps[1]?.qualityGuideline?.name || '',
    strongestPillar: groups.filter(item=>item.score!==null).sort((a,b)=>(b.score||0)-(a.score||0))[0]?.criterion || '',
    recommendation: gaps.length ? 'Revisar los atributos marcados como No cumple.' : 'Mantener el estándar de calidad alcanzado.'
  };
};

const speechHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);
const normalizeSpeechText = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const speechValue = (row: Record<string, unknown>, ...names: string[]) => {
  const values = new Map(Object.entries(row).map(([key, value]) => [normalizeSpeechText(key), value]));
  for (const name of names) {
    const value = values.get(normalizeSpeechText(name));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};
const speechText = (value: unknown) => String(value ?? '').trim();
const speechCompliance = (value: unknown) => {
  const normalized = normalizeSpeechText(value);
  if (!normalized || normalized === 'na' || normalized === 'n a' || normalized.includes('no aplica')) return 'NO_APLICA';
  if (normalized.startsWith('si') || normalized.startsWith('cumple')) return 'CUMPLE';
  if (normalized.startsWith('no') || normalized.startsWith('incumple')) return 'NO_CUMPLE';
  return 'NO_APLICA';
};
const speechDateTime = (value: unknown) => {
  let date: Date | null = value instanceof Date ? value : null;
  if (!date && typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0)));
  }
  if (!date && value) {
    const raw = speechText(value);
    const local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    date = local ? new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), Number(local[4] || 0), Number(local[5] || 0)) : new Date(raw);
  }
  if (!date || Number.isNaN(date.getTime())) date = new Date();
  const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return { date: localIso.slice(0, 10), time: localIso.slice(11, 16) };
};
const speechCriterionMap = [
  ['conexion_verificacion', 'q_1_1'],
  ['sondeo', 'q_1_2'],
  ['oferta_condiciones', 'q_2_1'],
  ['manejo_objeciones_cierre', 'q_3_1'],
  ['consentimiento_validaciones', 'q_3_2'],
  ['cumplimiento_transversal', 'q_4_1']
] as const;
const speechPreviewRow = (row: Record<string, unknown>, rowNumber: number, fileMatches: Map<string, { dni: string; name: string }> = new Map()) => {
  const externalId = speechText(speechValue(row, 'ID')) || `FILA-${rowNumber}`;
  const fileName = speechText(speechValue(row, 'Archivo'));
  // La nomenclatura SA usa el nombre antes del primer DNI de 8 dígitos.
  // La columna nombre_asesor contiene alias e incluso "NINGUNO", por lo que no es fiable para identificar.
  const fileIdentity = fileMatches.get(fileName) || speechAdvisorIdentityFromFile(fileName);
  const sourceAdvisorReportedName = speechText(speechValue(row, 'nombre_asesor', 'Asesor'));
  const sourceAdvisorName = fileIdentity.name || (/^(ningun[oa]|sin asesor|no identificado|n\/?a)$/i.test(sourceAdvisorReportedName) ? '' : sourceAdvisorReportedName);
  const dateTime = speechDateTime(speechValue(row, 'Fecha'));
  const dimensions: Record<string, string> = { C1:'CONECTAR', C2:'CLARIFICAR', C3:'CONVERTIR', C4:'CONECTAR_C4' };
  const items = speechCriterionMap.map(([sourceField, criterionId]) => {
    const attribute = QUALITY_ATTRIBUTES.find(item => item.id === criterionId)!;
    const compliance = speechCompliance(speechValue(row, sourceField, attribute.code, `${sourceField}_justif`));
    const finding = speechText(speechValue(row, `${sourceField} — por qué`, `${sourceField} por que`, `${sourceField}_justif — por qué`, `${sourceField}_justif por que`, `${attribute.code} — por qué`, `${attribute.code} por que`));
    const critical = 'critical' in attribute && Boolean(attribute.critical);
    const classification = critical ? (/cumplimiento/i.test(attribute.focus) ? 'CRITICO_COMPLIANCE' : /usuario/i.test(attribute.focus) ? 'CRITICO_USUARIO_FINAL' : 'CRITICO_NEGOCIO') : 'NO_CRITICO';
    return { id:`item_${criterionId}`, criterionId, dimension:dimensions[attribute.criterion], compliance, percentage:compliance==='CUMPLE'?100:0, level:compliance==='CUMPLE'?4:compliance==='NO_CUMPLE'?1:0, finding, evidence:'', recommendedAction:'', attributeWeight:attribute.weight, qualityGuideline:{...attribute,critical,active:true}, category:attribute.criterion, attribute:attribute.name, errorType:compliance==='NO_CUMPLE'?(critical?'Incumplimiento crítico':'Incumplimiento de atributo'):'', classification };
  });
  const rawSpeechScore = speechValue(row, 'nota_final', 'D');
  const speechScoreValue = Number(rawSpeechScore);
  const speechScore = rawSpeechScore !== '' && Number.isFinite(speechScoreValue) ? speechScoreValue : null;
  const approved = speechText(speechValue(row, 'aprobado'));
  const criticalValue = speechText(speechValue(row, 'error_critico'));
  const criticalDetected = speechCompliance(criticalValue) === 'CUMPLE';
  const criticalType = speechText(speechValue(row, 'tipo_error_critico'));
  const description = [
    approved && `Resultado Speech Analytics: ${approved}`,
    speechText(speechValue(row, 'aprobado — por qué', 'aprobado por que')) && `Justificación del resultado: ${speechText(speechValue(row, 'aprobado — por qué', 'aprobado por que'))}`,
    speechText(speechValue(row, 'fortalezas', 'A')) && `Fortalezas: ${speechText(speechValue(row, 'fortalezas', 'A'))}`,
    speechScore !== null && `Nota informada por Speech Analytics: ${speechScore}`,
    speechText(speechValue(row, 'nota_final — por qué', 'nota_final por que', 'D — por qué')) && `Justificación de la nota: ${speechText(speechValue(row, 'nota_final — por qué', 'nota_final por que', 'D — por qué'))}`,
    criticalValue && `Error crítico: ${criticalValue}`,
    criticalType && `Tipo de error crítico: ${criticalType}`,
    speechText(speechValue(row, 'error_critico — por qué', 'error_critico por que', 'error_critico_justif', 'error_critico_justif — por qué')) && `Detalle del error crítico: ${speechText(speechValue(row, 'error_critico — por qué', 'error_critico por que', 'error_critico_justif', 'error_critico_justif — por qué'))}`,
    speechText(speechValue(row, 'oportunidades_mejora', 'B')) && `Oportunidades de mejora: ${speechText(speechValue(row, 'oportunidades_mejora', 'B'))}`,
    speechText(speechValue(row, 'C')) && `Acción sugerida: ${speechText(speechValue(row, 'C'))}`
  ].filter(Boolean).join('\n\n');
  const saleLabel = normalizeSpeechText(speechValue(row, 'venta_evaluable'));
  return { rowNumber, externalId, fileName, sourceAdvisorName, sourceAdvisorReportedName, sourceAdvisorDni:fileIdentity.dni, ...dateTime, durationSeconds:Math.max(0, Math.round(Number(speechValue(row, 'Duración (min)')) * 60) || 0), speechScore, speechApproved:approved, criticalDetected, criticalType, description, items, sale:saleLabel.includes('vendida'), saleResult:saleLabel.includes('vendida')?'VENTA_CONCRETADA':'NO_VENTA' };
};
const speechNeedsRepair = (current: any, source: any) => current?.origin === 'SPEECH_ANALYTICS'
  && normalizedValidationStatus(current) === 'AUTOMATIC_PENDING'
  && (String(current.sourceAdvisorDni || '') !== String(source.sourceAdvisorDni || '') && /^\d{8}$/.test(String(source.sourceAdvisorDni || ''))
    || (current.speechScore == null || (current.speechScore === 0 && source.speechScore !== 0)) && source.speechScore != null
    || (current.items || []).every((item: any) => item.compliance === 'NO_APLICA')
      && (source.items || []).some((item: any) => item.compliance !== 'NO_APLICA'));

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
for(const row of db.prepare('SELECT id,name FROM operations').all() as any[]) db.prepare("UPDATE operations SET normalized_name=COALESCE(NULLIF(normalized_name,''),?),created_at=COALESCE(created_at,?),updated_at=COALESCE(updated_at,?) WHERE id=?").run(normalizeOperationName(String(row.name).split('/').pop()||row.name),schemaNow,schemaNow,row.id);
db.prepare(`INSERT OR IGNORE INTO operation_supervisors (operation_id,supervisor_id,active,start_at)
  SELECT operation_id,supervisor_id,1,MIN(start_date) FROM operation_assignments WHERE active=1 AND supervisor_id IS NOT NULL GROUP BY operation_id,supervisor_id`).run();
for(const duplicate of db.prepare('SELECT advisor_id FROM operation_assignments WHERE active=1 GROUP BY advisor_id HAVING COUNT(*)>1').all() as any[]){const rows=db.prepare('SELECT id,start_date FROM operation_assignments WHERE advisor_id=? AND active=1 ORDER BY start_date DESC,id DESC').all(duplicate.advisor_id) as any[];for(const stale of rows.slice(1))db.prepare('UPDATE operation_assignments SET active=0,end_date=COALESCE(end_date,?) WHERE id=?').run(rows[0].start_date,stale.id);}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_assignment_one_active ON operation_assignments(advisor_id) WHERE active=1;');

function repository(): SharedRepository {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(publicUser);
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY name').all().map((r: any) => ({ id: r.id, name: r.name, client: r.client, status: r.status, products: JSON.parse(r.products_json), description: r.description || undefined, backgroundImage: r.background_image || undefined, qualityGuidelines: JSON.parse(r.quality_guidelines_json || '[]'), qualityCriterionWeights: JSON.parse(r.quality_criterion_weights_json || 'null') || undefined, qualityCriticalErrors: JSON.parse(r.quality_critical_errors_json || '[]') }));
  const companies=db.prepare('SELECT id,name,status,created_at,updated_at FROM companies ORDER BY name').all().map((r:any)=>({id:r.id,name:r.name,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at||undefined}));
  const operations=db.prepare('SELECT * FROM operations ORDER BY name').all().map((r:any)=>({id:r.id,companyId:r.company_id,campaignId:r.campaign_id,name:r.name,normalizedName:r.normalized_name,status:r.status,legacy:Boolean(r.legacy),createdAt:r.created_at||undefined,updatedAt:r.updated_at||undefined,closedAt:r.closed_at||undefined,version:Number(r.version||1),metadata:JSON.parse(r.metadata_json||'{}')}));
  const operationSupervisors=db.prepare('SELECT * FROM operation_supervisors ORDER BY start_at').all().map((r:any)=>({operationId:r.operation_id,supervisorId:r.supervisor_id,active:Boolean(r.active),startAt:r.start_at,endAt:r.end_at||undefined}));
  const operationAssignments=db.prepare('SELECT * FROM operation_assignments ORDER BY start_date').all().map((r:any)=>({id:r.id,advisorId:r.advisor_id,operationId:r.operation_id,teamId:r.team_id||undefined,supervisorId:r.supervisor_id||undefined,role:r.role,operationalStatus:r.operational_status,startDate:r.start_date,endDate:r.end_date||undefined,active:Boolean(r.active),source:r.source,actorId:r.actor_id||undefined,observation:r.observation||undefined}));
  const staffingMovements=db.prepare('SELECT * FROM staffing_movements ORDER BY COALESCE(effective_at,occurred_at) DESC').all().map((r:any)=>({id:r.id,advisorId:r.advisor_id,assignmentId:r.assignment_id||undefined,type:r.type,effectiveAt:r.effective_at||String(r.occurred_at).slice(0,10),createdAt:r.created_at||r.occurred_at,occurredAt:r.created_at||r.occurred_at,origin:r.origin?JSON.parse(r.origin):undefined,destination:r.destination?JSON.parse(r.destination):undefined,actorId:r.actor_id||undefined,observation:r.observation||undefined,reversedMovementId:r.reversed_movement_id||undefined}));
  const teams = db.prepare('SELECT * FROM teams ORDER BY name').all().map((r: any) => ({ id: r.id, campaignId: r.campaign_id, operationId:`op_legacy_${r.campaign_id}`, supervisorId: r.supervisor_id, name: r.name }));
  const advisors = db.prepare('SELECT data_json FROM advisors ORDER BY name').all().map((r: any) => JSON.parse(r.data_json)).filter((advisor:any)=>!advisor.speechImportPlaceholder).map((advisor:any) => ({...advisor,operationId:advisor.operationId||`op_legacy_${advisor.campaignId}`}));
  return { users, campaigns, teams, advisors, companies, operations, operationSupervisors, operationAssignments, staffingMovements };
}

// Older imports can leave two active operation IDs for the same company and
// campaign label. Keep the operation with the most active people, move only
// current assignments to it, and preserve every historical evaluation/feedback.
function reconcileEquivalentOperations(now: string) {
  const groups = db.prepare(`SELECT o.company_id,lower(trim(ca.name)) campaign_key,COUNT(*) total FROM operations o JOIN campaigns ca ON ca.id=o.campaign_id WHERE o.legacy=0 AND o.status='ACTIVA' GROUP BY o.company_id,lower(trim(ca.name)) HAVING COUNT(*)>1`).all() as any[];
  for (const group of groups) {
    const candidates = db.prepare(`SELECT o.id,o.campaign_id,COALESCE((SELECT COUNT(*) FROM operation_assignments a WHERE a.operation_id=o.id AND a.active=1),0) active_count FROM operations o JOIN campaigns ca ON ca.id=o.campaign_id WHERE o.company_id=? AND o.legacy=0 AND o.status='ACTIVA' AND lower(trim(ca.name))=? ORDER BY active_count DESC,o.id`).all(group.company_id,group.campaign_key) as any[];
    const [canonical, ...duplicates] = candidates;
    if (!canonical) continue;
    for (const duplicate of duplicates) {
      const activeRows = db.prepare('SELECT a.id assignment_id,a.advisor_id,ad.data_json FROM operation_assignments a JOIN advisors ad ON ad.id=a.advisor_id WHERE a.operation_id=? AND a.active=1').all(duplicate.id) as any[];
      for (const row of activeRows) {
        const advisor = JSON.parse(row.data_json || '{}');
        const normalizedAdvisor = { ...advisor, operationId: canonical.id, campaignId: canonical.campaign_id, teamId: '' };
        db.prepare('UPDATE operation_assignments SET operation_id=?,team_id=NULL WHERE id=?').run(canonical.id,row.assignment_id);
        db.prepare('UPDATE advisors SET campaign_id=?,team_id=NULL,data_json=? WHERE id=?').run(canonical.campaign_id,JSON.stringify(normalizedAdvisor),row.advisor_id);
      }
      db.prepare('UPDATE operations SET status=?,updated_at=? WHERE id=?').run('INACTIVA',now,duplicate.id);
      console.warn(`[operations] Operación duplicada normalizada: ${duplicate.id} -> ${canonical.id} (${activeRows.length} colaboradores).`);
    }
  }
}

// Releases anteriores podían confirmar una baja y luego reactivarla desde una
// pestaña atrasada. El traslado histórico a LEGACY conserva la intención de la
// baja y permite repararla una sola vez sin borrar personas ni evaluaciones.
function recoverHistoricallyRetiredOperations(now: string) {
  const rows = db.prepare(`SELECT DISTINCT current.operation_id FROM operation_assignments marker JOIN operations marker_operation ON marker_operation.id=marker.operation_id AND marker_operation.legacy=1 JOIN operation_assignments current ON current.advisor_id=marker.advisor_id AND current.active=1 JOIN operations current_operation ON current_operation.id=current.operation_id AND current_operation.legacy=0 AND current_operation.status='ACTIVA' WHERE marker.observation LIKE 'Campaña retirada de la empresa%'`).all() as any[];
  for (const row of rows) {
    const operation = db.prepare('SELECT id,campaign_id FROM operations WHERE id=?').get(row.operation_id) as any;
    if (!operation) continue;
    db.prepare("UPDATE operations SET status='INACTIVA',updated_at=?,closed_at=COALESCE(closed_at,?),version=version+1 WHERE id=?").run(now,now,operation.id);
    const legacyOperationId = `op_legacy_${operation.campaign_id}`;
    for (const current of db.prepare('SELECT id,advisor_id FROM operation_assignments WHERE operation_id=? AND active=1').all(operation.id) as any[]) {
      db.prepare('UPDATE operation_assignments SET active=0,end_date=? WHERE id=?').run(now.slice(0,10),current.id);
      const marker = db.prepare("SELECT id FROM operation_assignments WHERE advisor_id=? AND operation_id=? AND observation LIKE 'Campaña retirada de la empresa%' ORDER BY start_date DESC,id DESC LIMIT 1").get(current.advisor_id,legacyOperationId) as any;
      if (marker) db.prepare('UPDATE operation_assignments SET active=1,end_date=NULL WHERE id=?').run(marker.id);
      const advisorRow = db.prepare('SELECT data_json FROM advisors WHERE id=?').get(current.advisor_id) as any;
      if (advisorRow) {
        const advisor = JSON.parse(advisorRow.data_json || '{}');
        db.prepare('UPDATE advisors SET data_json=? WHERE id=?').run(JSON.stringify({...advisor,operationId:legacyOperationId}),current.advisor_id);
      }
    }
    const active = Number((db.prepare("SELECT COUNT(*) total FROM operations WHERE campaign_id=? AND legacy=0 AND status='ACTIVA'").get(operation.campaign_id) as any)?.total || 0);
    if (!active) db.prepare("UPDATE campaigns SET status='INACTIVA' WHERE id=?").run(operation.campaign_id);
    console.warn(`[operations] Baja administrativa histórica recuperada: ${operation.id}.`);
  }
}

function persistRepository(input: SharedRepository) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const source = input;
    for (const company of source.companies || []) db.prepare('INSERT INTO companies (id,name,status,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,updated_at=excluded.updated_at').run(company.id,company.name,company.status,company.createdAt||now,company.updatedAt||now);
    for (const campaign of source.campaigns || []) db.prepare(`INSERT INTO campaigns (id,name,client,status,products_json,description,background_image,quality_guidelines_json,quality_criterion_weights_json,quality_critical_errors_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,client=excluded.client,status=excluded.status,products_json=excluded.products_json,description=excluded.description,background_image=excluded.background_image,quality_guidelines_json=excluded.quality_guidelines_json,quality_criterion_weights_json=excluded.quality_criterion_weights_json,quality_critical_errors_json=excluded.quality_critical_errors_json`).run(campaign.id, campaign.name, campaign.client, campaign.status, JSON.stringify(campaign.products || []), campaign.description || null, campaign.backgroundImage || null, JSON.stringify(campaign.qualityGuidelines || []), JSON.stringify(campaign.qualityCriterionWeights || null), JSON.stringify(campaign.qualityCriticalErrors || []));
    // Las campañas históricas llegan desde Sheets sin empresa/operación. Se crea su
    // operación LEGACY antes de validar asesores para conservar toda la dotación.
    db.prepare('INSERT OR IGNORE INTO companies (id,name,status,created_at) VALUES (?,?,?,?)').run('company_legacy','LEGACY','INACTIVA',now);
    for (const campaign of source.campaigns || []) db.prepare('INSERT OR IGNORE INTO operations (id,company_id,campaign_id,name,status,legacy) VALUES (?,?,?,?,?,1)').run(`op_legacy_${campaign.id}`,'company_legacy',campaign.id,`LEGACY / ${campaign.name}`,'ACTIVA');
    for (const operation of source.operations || []) db.prepare(`INSERT INTO operations (id,company_id,campaign_id,name,normalized_name,status,legacy,created_at,updated_at,closed_at,version,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,campaign_id=excluded.campaign_id,name=excluded.name,normalized_name=excluded.normalized_name,status=CASE WHEN operations.legacy=0 AND operations.status='INACTIVA' AND operations.closed_at IS NOT NULL THEN 'INACTIVA' ELSE excluded.status END,legacy=excluded.legacy,updated_at=excluded.updated_at,closed_at=CASE WHEN operations.legacy=0 AND operations.status='INACTIVA' AND operations.closed_at IS NOT NULL THEN operations.closed_at ELSE excluded.closed_at END,version=MAX(operations.version,excluded.version),metadata_json=excluded.metadata_json`).run(operation.id,operation.companyId,operation.campaignId,operation.name,operation.normalizedName||normalizeOperationName(operation.name.split('/').pop()||operation.name),operation.status,operation.legacy?1:0,operation.createdAt||now,operation.updatedAt||now,operation.closedAt||null,operation.version||1,JSON.stringify(operation.metadata||{}));
    // Las bajas administrativas son autoritativas: una instantánea antigua de
    // otra pestaña o de Sheets no puede reactivar la operación retirada.
    db.prepare(`UPDATE campaigns SET status='INACTIVA' WHERE id IN (SELECT campaign_id FROM operations WHERE legacy=0 GROUP BY campaign_id HAVING SUM(CASE WHEN status='ACTIVA' THEN 1 ELSE 0 END)=0 AND SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END)>0)`).run();
    for (const user of source.users || []) {
      const existing = db.prepare('SELECT password_hash,must_change_password FROM users WHERE id=?').get(user.id);
      const accessScope=user.accessScope||(user.role==='ASESOR'?'SELF':user.role==='SUPERVISOR'?'TEAM':'GLOBAL');
      db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash,must_change_password,access_scope,company_ids_json,operation_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,avatar=excluded.avatar,access_scope=excluded.access_scope,company_ids_json=excluded.company_ids_json,operation_ids_json=excluded.operation_ids_json`).run(user.id, user.name, user.email, user.username || null, user.role, user.status, user.teamId || null, user.advisorId || null, user.avatar || null, user.createdAt || now, existing?.password_hash || hashPassword(user.password || INITIAL_PASSWORD), existing ? existing.must_change_password : 1,accessScope,JSON.stringify(user.companyIds||[]),JSON.stringify(user.operationIds||[]));
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
      // An import may map a supervisor without an explicit operation-supervisor
      // record. Register that relationship atomically so the imported advisor is
      // immediately valid in Dotación and not flagged as incompatible.
      if(advisor.supervisorId && db.prepare("SELECT 1 FROM users WHERE id=? AND status='ACTIVO' AND role IN ('SUPERVISOR','FORMADOR','ADMINISTRADOR','CONSULTOR')").get(advisor.supervisorId)) {
        db.prepare('INSERT OR IGNORE INTO operation_supervisors (operation_id,supervisor_id,active,start_at) VALUES (?,?,1,?)').run(operationId,advisor.supervisorId,now.slice(0,10));
      }
      db.prepare(`INSERT INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET dni=excluded.dni,employee_code=excluded.employee_code,name=excluded.name,campaign_id=excluded.campaign_id,team_id=excluded.team_id,supervisor_id=excluded.supervisor_id,data_json=excluded.data_json`).run(advisor.id, advisor.dni, advisor.employeeCode || '', advisor.name, advisor.campaignId, advisor.teamId || null, advisor.supervisorId || null, JSON.stringify({...advisor,operationId}));
      const changed=!previous || previous.operationId!==operationId || previous.supervisorId!==advisor.supervisorId || previous.teamId!==advisor.teamId;
      if(changed){
        db.prepare('UPDATE operation_assignments SET active=0,end_date=? WHERE advisor_id=? AND active=1').run(now.slice(0,10),advisor.id);
        const assignmentId=`assignment_${advisor.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        db.prepare('INSERT INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,active,source,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(assignmentId,advisor.id,operationId,advisor.teamId||null,advisor.supervisorId||null,'ASESOR',advisor.status==='INACTIVO'?'BAJA':'PRODUCCION',now.slice(0,10),1,previous?'MANUAL':'MIGRACION',null,previous?'Cambio organizacional de Dotación':'Asignación inicial');
        db.prepare('INSERT INTO staffing_movements (id,advisor_id,assignment_id,type,occurred_at,origin,destination,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?)').run(`movement_${advisor.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,advisor.id,assignmentId,previous?'CAMBIO_ASIGNACION':'ALTA',now,previous?JSON.stringify({operationId:previous.operationId||`op_legacy_${previous.campaignId}`,supervisorId:previous.supervisorId||null}):null,JSON.stringify({operationId,supervisorId:advisor.supervisorId||null}),null,previous?'Before / after registrado automáticamente':'Alta inicial');
      }
    }
    for(const link of source.operationSupervisors||[]) db.prepare('INSERT OR REPLACE INTO operation_supervisors (operation_id,supervisor_id,active,start_at,end_at) VALUES (?,?,?,?,?)').run(link.operationId,link.supervisorId,link.active?1:0,link.startAt,link.endAt||null);
    for(const assignment of source.operationAssignments||[]) db.prepare('INSERT OR REPLACE INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,end_date,active,source,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(assignment.id,assignment.advisorId,assignment.operationId,assignment.teamId||null,assignment.supervisorId||null,assignment.role,assignment.operationalStatus,assignment.startDate,assignment.endDate||null,assignment.active?1:0,assignment.source,assignment.actorId||null,assignment.observation||null);
    for(const movement of source.staffingMovements||[]) db.prepare('INSERT OR REPLACE INTO staffing_movements (id,advisor_id,assignment_id,type,occurred_at,effective_at,created_at,origin,destination,actor_id,observation,reversed_movement_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(movement.id,movement.advisorId,movement.assignmentId||null,movement.type,movement.createdAt||movement.occurredAt,movement.effectiveAt,movement.createdAt||movement.occurredAt,typeof movement.origin==='string'?movement.origin:JSON.stringify(movement.origin||null),typeof movement.destination==='string'?movement.destination:JSON.stringify(movement.destination||null),movement.actorId||null,movement.observation||null,movement.reversedMovementId||null);
    recoverHistoricallyRetiredOperations(now);
    reconcileEquivalentOperations(now);
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

function hasEquivalentActiveOperations(source: SharedRepository) {
  const campaignNames = new Map((source.campaigns || []).map(campaign => [campaign.id, campaign.name]));
  const seen = new Set<string>();
  return (source.operations || []).some(operation => {
    if (operation.legacy || operation.status !== 'ACTIVA') return false;
    const key = `${operation.companyId}|${normalizeOperationName(campaignNames.get(operation.campaignId) || operation.name.split('/').pop() || operation.name)}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

async function readRepository() {
  if (!googleStorage.enabled) return repository();
  if(structuredRepositoryCache&&structuredRepositoryCache.expiresAt>Date.now())return structuredRepositoryCache.value;
  try {
    const remote = await googleStorage.loadRepository();
    if (remote && (remote.users.length || remote.campaigns.length || remote.teams.length || remote.advisors.length)) {
      const retiredOperationIds = new Set((db.prepare("SELECT id FROM operations WHERE legacy=0 AND status='INACTIVA' AND closed_at IS NOT NULL").all() as any[]).map(row => row.id));
      const mustRepairRetiredOperations = (remote.operations || []).some(operation => retiredOperationIds.has(operation.id) && operation.status === 'ACTIVA');
      const mustRepairOperationIndex = hasEquivalentActiveOperations(remote) || mustRepairRetiredOperations;
      try {
        persistRepository(remote);
        const normalized = repository();
        const normalizedOperations = new Map((normalized.operations || []).map(operation => [operation.id, operation]));
        const repairedHistoricalRetirement = (remote.operations || []).some(operation => operation.status === 'ACTIVA' && normalizedOperations.get(operation.id)?.status === 'INACTIVA');
        if (mustRepairOperationIndex || repairedHistoricalRetirement) {
          try {
            await googleStorage.saveRepository(normalized, passwordHashes());
            console.log('[operations] Operaciones duplicadas normalizadas y guardadas en el repositorio principal.');
          } catch (syncError) {
            console.error('[operations] Se normalizó la caché local, pero no pudo guardarse la reparación principal.', syncError instanceof Error ? syncError.message : '');
          }
        }
        structuredRepositoryCache={value:normalized,expiresAt:Date.now()+15_000};return normalized;
      }
      catch (cacheError) {
        console.error('[google-storage] La caché local no pudo actualizarse; se entrega la dotación remota.', cacheError instanceof Error ? cacheError.message : '');
        const local=repository(),legacyOperations=remote.campaigns.map(campaign=>({id:`op_legacy_${campaign.id}`,companyId:'company_legacy',campaignId:campaign.id,name:`LEGACY / ${campaign.name}`,status:'ACTIVA' as const,legacy:true}));
        const fallback={...remote,companies:local.companies,operations:[...(local.operations||[]),...legacyOperations.filter(operation=>!(local.operations||[]).some(item=>item.id===operation.id))]};structuredRepositoryCache={value:fallback,expiresAt:Date.now()+15_000};return fallback;
      }
    }
    if(supabaseStorage.enabled)throw new Error('Supabase no contiene el repositorio migrado. Ejecuta la migración antes del corte.');
    const local = repository();
    await googleStorage.saveRepository(local, passwordHashes());
    console.log('[google-storage] Google Sheets inicializado con la persistencia local existente.');
    structuredRepositoryCache={value:local,expiresAt:Date.now()+15_000};return local;
  } catch (error) {
    if(supabaseStorage.enabled)throw error;
    console.error('[structured-storage] No fue posible leer el fallback histórico; se usa la caché local.', error instanceof Error ? error.message : '');
    return repository();
  }
}

async function saveRepository(input: SharedRepository) {
  const persisted = persistRepository(input);
  if (googleStorage.enabled) {
    try { await googleStorage.saveRepository(persisted, passwordHashes()); }
    catch (error) { console.error('[structured-storage] No fue posible guardar la dotación.', error instanceof Error ? error.message : ''); throw new Error('No fue posible sincronizar la información con el repositorio principal.'); }
  }
  structuredRepositoryCache={value:persisted,expiresAt:Date.now()+15_000};
  return persisted;
}
async function syncRepositorySnapshot(){
  const current=repository();
  const hashes=passwordHashes();
  if(supabaseStorage.enabled)await supabaseStorage.saveRepository(current,hashes);
  else if(googleStorage.enabled)await googleStorage.saveRepository(current,hashes);
  structuredRepositoryCache={value:current,expiresAt:Date.now()+15_000};
  return current;
}
async function syncRosterImportSnapshot(advisorIds:string[]){
  const current=repository();
  const snapshot=rosterImportSnapshot(current,advisorIds);
  if(snapshot.advisors.length!==new Set(advisorIds).size)throw new Error('La sincronización no encontró todos los asesores importados.');
  await supabaseStorage.saveRepository(snapshot,passwordHashes());
  structuredRepositoryCache={value:current,expiresAt:Date.now()+15_000};
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  let session = token && db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  // Keep long-lived sessions aligned with user/advisor links edited by Admin.
  // Otherwise an advisor can remain scoped to the previous person indefinitely.
  if (session && googleStorage.enabled && Date.now() - lastGoogleAuthSync >= 60_000) {
    try {
      await syncAuthUsersFromGoogle();
      session = db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
    } catch (error) { console.error('[structured-storage] No fue posible actualizar el alcance de la sesión.', error instanceof Error ? error.message : ''); }
  }
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
  if (session && session.role === 'ASESOR' && !session.advisor_id && googleStorage.enabled) {
    try {
      await syncAuthUsersFromGoogle(true);
      session = db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
    } catch (error) { console.error('[structured-storage] No fue posible reparar el vínculo del asesor.', error instanceof Error ? error.message : ''); }
  }
  if (session && token && supabaseStorage.enabled && Date.now() - (lastSessionCheck.get(token) || 0) >= 5 * 60_000) {
    try {
      const remoteSession = await supabaseStorage.loadSession(token);
      if (!remoteSession) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); return res.status(401).json({ error: 'Sesión no válida o expirada.' }); }
      if (new Date(remoteSession.expires_at).getTime() - Date.now() < 24 * 60 * 60_000) {
        await supabaseStorage.saveSession(token, remoteSession.user_id, remoteSession.created_at);
      }
      lastSessionCheck.set(token, Date.now());
    } catch (error) { console.error('[auth] No fue posible renovar la sesión.', error instanceof Error ? error.message : ''); }
  }
  if (!session) return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  (req as any).authUser = publicUser(session); (req as any).token = token; next();
}

let lastGoogleAuthSync = 0;
const lastSessionCheck = new Map<string, number>();
const advisorDnisForAuth = new Map<string, string>();
const advisorUsersByDni = new Map<string, string>();
async function syncAuthUsersFromGoogle(force = false) {
  if (!googleStorage.enabled || (!force && Date.now() - lastGoogleAuthSync < 60_000)) return;
  const users = await googleStorage.loadUsersForAuthentication();
  if (!users?.length) return;
  const upsert = db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,avatar,created_at,password_hash,must_change_password,access_scope,company_ids_json,operation_ids_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,avatar=excluded.avatar,created_at=excluded.created_at,password_hash=excluded.password_hash,must_change_password=excluded.must_change_password,access_scope=excluded.access_scope,company_ids_json=excluded.company_ids_json,operation_ids_json=excluded.operation_ids_json`);
  db.exec('BEGIN IMMEDIATE');
  const repaired: Array<{ id: string; passwordHash: string }> = [];
  try {
    for (const user of users) {
      const passwordHash = user.passwordHash || hashPassword(INITIAL_PASSWORD);
      upsert.run(user.id, user.name, user.email, user.username || null, user.role, user.status, user.teamId || null, user.advisorId || null, user.avatar || null, user.createdAt, passwordHash, user.passwordHash ? (user.mustChangePassword ? 1 : 0) : 1,user.accessScope||(user.role==='ASESOR'?'SELF':user.role==='SUPERVISOR'?'TEAM':'GLOBAL'),JSON.stringify(user.companyIds||[]),JSON.stringify(user.operationIds||[]));
      if (!user.passwordHash) repaired.push({ id: user.id, passwordHash });
      if (user.advisorId && user.advisorDni) { advisorDnisForAuth.set(user.advisorId, user.advisorDni); advisorUsersByDni.set(user.advisorDni, user.id); }
    }
    db.exec('COMMIT'); lastGoogleAuthSync = Date.now();
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  for (const user of repaired) await googleStorage.updateUserPasswordHash(user.id, user.passwordHash, true);
}

async function startServer() {
  if (isProduction && process.env.REQUIRE_SUPABASE === 'true' && !supabaseStorage.enabled) throw new Error('SUPABASE_DATABASE_URL es obligatoria cuando REQUIRE_SUPABASE=true.');
  const app = express();
  try { await cleanupEvaluationDuplicates(); } catch (error) { console.error('[evaluations] No fue posible completar la limpieza de duplicados.', error instanceof Error ? error.message : ''); }

  // Increase payload size for base64 audio files
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((req,res,next)=>{const requestId=req.header('x-request-id')||randomBytes(8).toString('hex'),started=Date.now();res.setHeader('X-Request-Id',requestId);res.on('finish',()=>console.log(JSON.stringify({event:'http_request',requestId,method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started,userId:(req as any).authUser?.id||null})));next();});
  const rawFileParser = express.raw({ type: () => true, limit: 36 * 1024 * 1024 });
  const parseRawFile = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    rawFileParser(req, res, (error?: any) => {
      if (!error) return next();
      if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo supera el límite de 35 MB.' });
      return res.status(400).json({ error: 'No fue posible leer el archivo enviado.' });
    });
  };
  registerOperationsModule({app,db,requireAuth,repository,sync:async(advisorIds)=>{
    if(advisorIds?.length&&supabaseStorage.enabled)await syncRosterImportSnapshot(advisorIds);
    else await syncRepositorySnapshot();
  }});

  app.post('/api/auth/login', async (req, res) => {
    const { identity, password } = req.body || {};
    if (!identity || !password) return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    try { await syncAuthUsersFromGoogle(true); }
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
    catch (error) { console.error('[structured-storage] No fue posible guardar la contraseña.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible guardar la contraseña en el repositorio principal.' }); }
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(passwordHash, user.id);
    lastGoogleAuthSync = Date.now();
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
  });
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const token = (req as any).token; db.prepare('DELETE FROM sessions WHERE token=?').run(token); lastSessionCheck.delete(token);
    try { if (googleStorage.enabled) await googleStorage.deleteSession(token); }
    catch (error) { console.error('[google-storage] No fue posible eliminar la sesión persistente.', error instanceof Error ? error.message : ''); }
    res.status(204).end();
  });
  const requireAdmin = (req: express.Request, res: express.Response) => (req as any).authUser?.role === 'ADMINISTRADOR' || res.status(403).json({ error: 'Acceso restringido a administración.' });
  const isGlobalActor = (user: User) => (user.accessScope || 'GLOBAL') === 'GLOBAL';
  const scopeWithinActor = (actor: User, accessScope: string, companyIds: string[], operationIds: string[]) => {
    if (isGlobalActor(actor)) return true;
    if (accessScope !== 'COMPANY') return false;
    return companyIds.length > 0 && companyIds.every(id => (actor.companyIds || []).includes(id)) && operationIds.length === 0;
  };
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
    const actor = (req as any).authUser as User;
    const body = req.body || {}; const name = String(body.name || '').trim(); const email = String(body.email || '').trim().toLowerCase();
    const validRoles = ['ADMINISTRADOR','CONSULTOR','MONITOR','SUPERVISOR','FORMADOR','GERENCIA','ASESOR']; const role = validRoles.includes(body.role) ? body.role : 'ASESOR'; const status = body.status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';
    if (!name || !email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    if (role === 'SUPERVISOR' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El supervisor debe tener un correo válido.' });
    try { await readRepository(); }
    catch (error) { console.error('[structured-storage] No fue posible validar el alta del usuario.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible validar el repositorio principal. Intenta nuevamente.' }); }
    const localEmailUser=db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email) as any;
    let remoteEmailUser:User|null=null;
    try { if(supabaseStorage.enabled)remoteEmailUser=await supabaseStorage.findUserByEmail(email); }
    catch (error) { console.error('[supabase] No fue posible validar el correo del nuevo usuario.',error instanceof Error?error.message:'');return res.status(502).json({error:'No se pudo confirmar si el correo ya existe. El usuario no fue creado.'}); }
    if(remoteEmailUser)return res.status(409).json({ error: `El correo ya pertenece a ${remoteEmailUser.name}. No se creó una cuenta duplicada.` });
    if(localEmailUser&&!supabaseStorage.enabled)return res.status(409).json({ error: 'El correo ya está registrado; la cuenta nueva no fue creada.' });
    // Si el correo sólo quedó en SQLite por un intento antiguo incompleto, se
    // reutiliza ese identificador y se termina de persistir en Supabase.
    const recoveredLocalUser=Boolean(localEmailUser&&supabaseStorage.enabled);
    const id=localEmailUser?.id||`usr_${randomBytes(8).toString('hex')}`; const createdAt=localEmailUser?.created_at||new Date().toISOString();
    const base = String(body.username || name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim().replace(/[\s.]+/g, '.').replace(/^\.|\.$/g, '') || `usuario.${Date.now()}`;
    let username = base; let suffix = 1; while (db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?) AND id<>?').get(username,id)) username = `${base}.${++suffix}`;
    const requestedAccessScope=['GLOBAL','COMPANY','OPERATION','TEAM','SELF'].includes(body.accessScope)?body.accessScope:'GLOBAL';
    const accessScope=role==='ASESOR'?'SELF':role==='SUPERVISOR'?'TEAM':role==='MONITOR'?'GLOBAL':requestedAccessScope;
    const companyIds=Array.isArray(body.companyIds)?body.companyIds.map(String):[],operationIds=Array.isArray(body.operationIds)?body.operationIds.map(String):[];
    const advisorId=role==='ASESOR'?String(body.advisorId||'').trim():'';
    if(advisorId&&!db.prepare('SELECT 1 FROM advisors WHERE id=?').get(advisorId))return res.status(422).json({error:'El asesor seleccionado ya no existe en la dotación.'});
    const linkedUser=advisorId?db.prepare('SELECT id,name FROM users WHERE advisor_id=? AND id<>?').get(advisorId,id) as any:null;
    if(linkedUser)return res.status(409).json({error:`El asesor ya tiene una cuenta vinculada a ${linkedUser.name}.`});
    if(accessScope==='COMPANY'&&!companyIds.length)return res.status(422).json({error:'El administrador por empresa requiere al menos una empresa.'});
    if(!scopeWithinActor(actor,accessScope,companyIds,operationIds))return res.status(403).json({error:'No puedes otorgar acceso fuera de tu alcance.'});
    const passwordHash=hashPassword(INITIAL_PASSWORD);
    try {
      const created={id,name,email,username,role,status,teamId:body.teamId||undefined,advisorId:advisorId||undefined,createdAt,mustChangePassword:true,accessScope,companyIds,operationIds} as User;
      if(supabaseStorage.enabled)await supabaseStorage.saveUser(created,passwordHash);
      db.prepare(`INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,created_at,password_hash,must_change_password,access_scope,company_ids_json,operation_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,status=excluded.status,team_id=excluded.team_id,advisor_id=excluded.advisor_id,password_hash=excluded.password_hash,must_change_password=1,access_scope=excluded.access_scope,company_ids_json=excluded.company_ids_json,operation_ids_json=excluded.operation_ids_json`).run(id,name,email,username,role,status,body.teamId||null,advisorId||null,createdAt,passwordHash,accessScope,JSON.stringify(companyIds),JSON.stringify(operationIds));
      if(!supabaseStorage.enabled)await syncRepositorySnapshot();
      structuredRepositoryCache={value:repository(),expiresAt:Date.now()+15_000};
      return res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)), recovered:recoveredLocalUser });
    } catch (error) {
      if(!recoveredLocalUser)db.prepare('DELETE FROM users WHERE id=?').run(id);
      const detail=error instanceof Error?error.message:'';
      console.error('[structured-storage] No fue posible crear el usuario.',detail);
      if(/UNIQUE constraint failed: users\.advisor_id/i.test(detail))return res.status(409).json({error:'El asesor ya tiene una cuenta vinculada.'});
      if(/UNIQUE constraint failed: users\.(email|username)/i.test(detail))return res.status(409).json({error:'El correo o usuario ya está registrado.'});
      return res.status(502).json({ error: 'No fue posible guardar el usuario en el repositorio principal.' });
    }
  });
  app.patch('/api/admin/users/:id', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    const actor = (req as any).authUser as User;
    const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as any; if (!current) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const body = req.body || {}; const validRoles = ['ADMINISTRADOR','CONSULTOR','MONITOR','SUPERVISOR','FORMADOR','GERENCIA','ASESOR']; const next = { name: String(body.name ?? current.name).trim(), email: String(body.email ?? current.email).trim().toLowerCase(), username: String((body.username ?? current.username) || '').trim().toLowerCase() || null, role: validRoles.includes(body.role) ? body.role : current.role, status: body.status === 'INACTIVO' ? 'INACTIVO' : body.status === 'ACTIVO' ? 'ACTIVO' : current.status, teamId: body.teamId ?? current.team_id, advisorId: body.advisorId ?? current.advisor_id, accessScope:['GLOBAL','COMPANY','OPERATION','TEAM','SELF'].includes(body.accessScope)?body.accessScope:current.access_scope, companyIds:Array.isArray(body.companyIds)?body.companyIds.map(String):JSON.parse(current.company_ids_json||'[]'), operationIds:Array.isArray(body.operationIds)?body.operationIds.map(String):JSON.parse(current.operation_ids_json||'[]') };
    if (!next.name || !next.email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    const localConflict=db.prepare('SELECT id FROM users WHERE (lower(email)=lower(?) OR (? IS NOT NULL AND lower(username)=lower(?))) AND id<>?').get(next.email,next.username,next.username,current.id) as any;
    if(localConflict)return res.status(409).json({error:'El correo o nombre de usuario ya está registrado.'});
    if(supabaseStorage.enabled){
      try { const remoteConflict=await supabaseStorage.findUserByEmail(next.email); if(remoteConflict&&remoteConflict.id!==current.id)return res.status(409).json({error:`El correo ya pertenece a ${remoteConflict.name}.`}); }
      catch(error){console.error('[supabase] No fue posible validar la edición del usuario.',error instanceof Error?error.message:'');return res.status(502).json({error:'No se pudo validar el correo en el repositorio principal.'});}
    }
    next.accessScope=next.role==='ASESOR'?'SELF':next.role==='SUPERVISOR'?'TEAM':next.role==='MONITOR'?'GLOBAL':next.accessScope;
    if(next.accessScope==='COMPANY'&&!next.companyIds.length)return res.status(422).json({error:'El administrador por empresa requiere al menos una empresa.'});
    if(!scopeWithinActor(actor,next.accessScope,next.companyIds.map(String),next.operationIds.map(String)) || (!isGlobalActor(actor) && !scopeWithinActor(actor,current.access_scope,JSON.parse(current.company_ids_json||'[]'),JSON.parse(current.operation_ids_json||'[]'))))return res.status(404).json({error:'Usuario no encontrado.'});
    try {
      const updated:User={...publicUser(current),name:next.name,email:next.email,username:next.username||undefined,role:next.role,status:next.status,teamId:next.teamId||undefined,advisorId:next.advisorId||undefined,accessScope:next.accessScope,companyIds:next.companyIds,operationIds:next.operationIds};
      if(supabaseStorage.enabled)await supabaseStorage.updateUser(updated);
      db.prepare('UPDATE users SET name=?,email=?,username=?,role=?,status=?,team_id=?,advisor_id=?,access_scope=?,company_ids_json=?,operation_ids_json=? WHERE id=?').run(next.name,next.email,next.username,next.role,next.status,next.teamId||null,next.advisorId||null,next.accessScope,JSON.stringify(next.companyIds),JSON.stringify(next.operationIds),current.id);
      if(!supabaseStorage.enabled)await syncRepositorySnapshot(); else structuredRepositoryCache=null;
      return res.json({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(current.id))});
    } catch(error) {
      const detail=error instanceof Error?error.message:''; console.error('[users] No fue posible actualizar el usuario.',detail);
      if(/duplicate key|unique constraint/i.test(detail))return res.status(409).json({error:'El correo o nombre de usuario ya está registrado.'});
      return res.status(502).json({ error: 'No fue posible guardar los cambios en el repositorio principal.' });
    }
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
    try { await syncRepositorySnapshot(); return res.status(204).end(); }
    catch { return res.status(502).json({ error: 'No fue posible sincronizar la eliminación.' }); }
  });

  app.get('/api/shared-repository', requireAuth, async (req, res) => {
    const source = await readRepository(); const user = (req as any).authUser as User;
    if (['ADMINISTRADOR','CONSULTOR','FORMADOR','GERENCIA'].includes(user.role) && user.accessScope && user.accessScope !== 'GLOBAL') return res.json({ repository: scopedRepository(user,source) });
    if (user.role === 'MONITOR') {
      const advisors = source.advisors.filter(item => item.active !== false && item.status === 'ACTIVO');
      const campaignIds = new Set(advisors.map(item => item.campaignId));
      const operationIds=new Set(advisors.map(item=>item.operationId||`op_legacy_${item.campaignId}`)), operations=(source.operations||[]).filter(item=>operationIds.has(item.id)), companyIds=new Set(operations.map(item=>item.companyId));
      return res.json({ repository: { advisors, campaigns: source.campaigns.filter(item => item.status === 'ACTIVA' && campaignIds.has(item.id)), companies:(source.companies||[]).filter(item=>companyIds.has(item.id)), operations, teams: source.teams.filter(item => campaignIds.has(item.campaignId)), users: source.users } });
    }
    if (user.role === 'SUPERVISOR') {
      const advisors = source.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId));
      const campaignIds = new Set(advisors.map(item => item.campaignId)); const teamIds = new Set(advisors.map(item => item.teamId).filter(Boolean));
      const operationIds=new Set(advisors.map(item=>item.operationId||`op_legacy_${item.campaignId}`)), operations=(source.operations||[]).filter(item=>operationIds.has(item.id)), companyIds=new Set(operations.map(item=>item.companyId));
      return res.json({ repository: { advisors, campaigns: source.campaigns.filter(item => campaignIds.has(item.id)), companies:(source.companies||[]).filter(item=>companyIds.has(item.id)), operations, teams: source.teams.filter(item => teamIds.has(item.id)), users: source.users.filter(item => item.id === user.id || item.advisorId && advisors.some(advisor => advisor.id === item.advisorId)) } });
    }
    if (user.role !== 'ASESOR') return res.json({ repository: source });
    if (!user.advisorId) return res.json({ repository: { advisors: [], campaigns: [], companies: [], operations: [], teams: [], users: source.users.filter(item => item.id === user.id) } });
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
    const user=(req as any).authUser as User;
    if (!['ADMINISTRADOR','CONSULTOR'].includes(user.role) || !isGlobalActor(user)) return res.status(403).json({ error: 'La migración global requiere alcance global.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible migrar la dotación.' }); }
  });
  app.put('/api/shared-repository/sync', requireAuth, async (req, res) => {
    const user=(req as any).authUser as User;
    if (!['ADMINISTRADOR','CONSULTOR'].includes(user.role) || !isGlobalActor(user)) return res.status(403).json({ error: 'La sincronización global requiere alcance global.' });
    try { return res.json({ repository: await saveRepository(req.body as SharedRepository) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'No fue posible guardar la dotación.' }); }
  });
  app.delete('/api/admin/campaigns/:id', requireAuth, async (req, res) => {
    if (requireAdmin(req, res) !== true) return;
    try {
      const campaignId=req.params.id,companyId=String(req.query.companyId||'');
      const actor=(req as any).authUser as User;
      if(!isGlobalActor(actor)&&(!companyId||!(actor.companyIds||[]).includes(companyId)))return res.status(404).json({error:'Campaña no encontrada.'});
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
        for(const operation of selectedOperations)db.prepare('UPDATE operations SET status=?,updated_at=?,closed_at=?,version=version+1 WHERE id=?').run('INACTIVA',now,now,operation.id);
        const active=(db.prepare('SELECT COUNT(*) total FROM operations WHERE campaign_id=? AND legacy=0 AND status=?').get(campaignId,'ACTIVA') as any).total;
        if(!active)db.prepare('UPDATE campaigns SET status=? WHERE id=?').run('INACTIVA',campaignId);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      await syncRepositorySnapshot();
      res.json({ repository: repository() });
    } catch (error: any) { res.status(400).json({ error: error.message || 'No se pudo eliminar la campaña.' }); }
  });
  const scopedRecord=(user:User,item:any)=>{const scope=user.role==='MONITOR'?'GLOBAL':user.accessScope||(user.role==='ASESOR'?'SELF':user.role==='SUPERVISOR'?'TEAM':'GLOBAL');if(scope==='GLOBAL')return true;if(scope==='COMPANY')return (user.companyIds||[]).includes(String(item.companyId||item.company_id||''));if(scope==='OPERATION')return (user.operationIds||[]).includes(String(item.operationId||item.operation_id||''));if(scope==='TEAM')return user.id===String(item.supervisorId||item.supervisor_id||'')||(item.supervisorIds||[]).includes(user.id)||(user.operationIds||[]).includes(String(item.operationId||item.operation_id||''));return user.advisorId===String(item.advisorId||item.advisor_id||'');};
  app.post('/api/evaluations', requireAuth, async (req, res) => {
    const authUser = (req as any).authUser as User;
    if (!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(authUser.role)) return res.status(403).json({ error: 'Solo Calidad, Monitor o Administración puede crear evaluaciones.' });
    let evaluation = authUser.role === 'MONITOR' ? { ...(req.body || {}), evaluatorId: authUser.id, evaluatorName: authUser.name } : req.body;
    if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY', 'D3C'].includes(evaluation?.evaluationType)) return res.status(400).json({ error: 'Evaluación inválida.' });
    if (!evaluation?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(evaluation.date)) || (evaluation.time && !/^\d{2}:\d{2}$/.test(String(evaluation.time)))) return res.status(400).json({ error: 'La fecha u hora de evaluación no es válida.' });
    const answeredItems = Array.isArray(evaluation.items) ? evaluation.items.filter((item:any) => ['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(item?.compliance)) : [];
    const submittedScore = evaluation.technicalScore ?? evaluation.scoreTotal;
    const hasSubmittedScore = submittedScore !== null && submittedScore !== undefined && Number.isFinite(Number(submittedScore));
    if (!answeredItems.some((item:any) => item.compliance !== 'NO_APLICA') && !hasSubmittedScore) return res.status(400).json({ error: 'Responde al menos un criterio evaluable antes de finalizar.' });
    const evaluatedAt = `${evaluation.date}T${evaluation.time || '00:00'}:00`;
    try {
      const directory = googleStorage.enabled ? await readRepository() : repository();
      const advisor = directory.advisors.find(item => item.id === evaluation.advisorId);
      if (!advisor || advisor.active === false || advisor.status !== 'ACTIVO') return res.status(400).json({ error: 'El asesor no está habilitado para evaluación.' });
      const operation=directory.operations?.find(item=>item.id===(advisor.operationId||`op_legacy_${advisor.campaignId}`));
      const campaign=directory.campaigns.find(item=>item.id===advisor.campaignId);
      if (!operation || operation.legacy || operation.status !== 'ACTIVA' || operation.campaignId !== advisor.campaignId || !campaign || campaign.status !== 'ACTIVA') return res.status(400).json({ error: 'La campaña del asesor ya no está activa. Selecciona una campaña vigente.' });
      evaluation = { ...evaluation, campaignId:advisor.campaignId, teamId:advisor.teamId, supervisorId:advisor.supervisorId, operationId:operation.id, companyId:operation.companyId, supervisorAtEvaluation:advisor.supervisorId, validationStatus: 'VALIDATED' };
      if(!scopedRecord(authUser,evaluation))return res.status(404).json({error:'Asesor no encontrado en tu alcance.'});
      evaluation = correctMigracionesQualityEvaluation(evaluation, directory.campaigns);
      const localDuplicate = (db.prepare('SELECT payload_json FROM evaluations WHERE advisor_id=? AND evaluation_type=? AND evaluated_at=?').all(evaluation.advisorId,evaluation.evaluationType,evaluatedAt) as any[]).flatMap(row=>{try{return [JSON.parse(row.payload_json)];}catch{return [];}}).find(item=>evaluationIdentity(item)===evaluationIdentity(evaluation));
      if (localDuplicate) return res.status(200).json({ evaluation: localDuplicate, deduplicated: true });
      // Evita volver a leer toda EVALUATIONS antes de cada alta. La deduplicación
      // local ya opera sobre el historial consolidado y reduce cuota/latencia.
      if (supabaseStorage.enabled) await supabaseStorage.saveEvaluation(evaluation);
      else if (googleDriveStorage.sheetsEnabled) await googleDriveStorage.saveEvaluation(evaluation);
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
    } catch (error: any) {
      const status=Number(error?.response?.status||error?.code||0),detail=[error?.message,error?.response?.data?.error,error?.response?.data?.error_description].filter(Boolean).map(String).join(' ').toLowerCase();
      console.error('[google-storage] No fue posible guardar la evaluación.', `status=${status||'unknown'}`, error instanceof Error ? error.message : '');
      if(status===429||/quota exceeded|rate.?limit/.test(detail))return res.status(503).json({error:'El repositorio principal alcanzó temporalmente su límite. La evaluación permanece abierta.'});
      return res.status(status>=500?503:400).json({ error: error.message || 'No fue posible guardar la evaluación.' });
    }
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
  app.delete('/api/evaluations/:id', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    if (!adminRoles.has(user.role)) return res.status(403).json({ error: 'Sólo Administración o Calidad puede eliminar evaluaciones.' });
    const id = String(req.params.id || '').trim();
    const current = await loadEvaluationById(id);
    if (!current || !scopedRecord(user,current)) return res.status(404).json({ error: 'La evaluación ya no existe.' });
    if ((db.prepare('SELECT 1 FROM calibrations WHERE evaluation_id=? LIMIT 1').get(id) as any)) return res.status(409).json({ error: 'La evaluación tiene una calibración asociada. Elimina primero esa calibración.' });
    try {
      if (googleStorage.enabled) await googleStorage.deleteEvaluation(id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM evaluation_commitments WHERE evaluation_id=?').run(id);
        db.prepare('DELETE FROM feedbacks WHERE evaluation_id=?').run(id);
        db.prepare('DELETE FROM evaluations WHERE id=?').run(id);
        const stateRow = db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
        if (stateRow?.payload_json) {
          const state = JSON.parse(stateRow.payload_json);
          const next = { ...state, evaluations: (state.evaluations || []).filter((item:any) => item?.id !== id) };
          db.prepare('UPDATE app_state SET payload_json=?,updated_at=? WHERE id=?').run(JSON.stringify(next), new Date().toISOString(), 'global');
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      if (lastCompletePlatformState) lastCompletePlatformState = { ...lastCompletePlatformState, evaluations: (lastCompletePlatformState.evaluations || []).filter((item:any) => item?.id !== id) };
      return res.json({ deleted: true, id });
    } catch (error: any) {
      const status=Number(error?.response?.status||error?.code||0),detail=[error?.message,error?.response?.data?.error,error?.response?.data?.error_description].filter(Boolean).map(String).join(' ').toLowerCase();
      console.error('[evaluations] No fue posible eliminar la evaluación.', `status=${status||'unknown'}`, error instanceof Error ? error.message : '');
      if(status===429||/quota exceeded|rate.?limit/.test(detail))return res.status(503).json({error:'El repositorio principal alcanzó temporalmente su límite. Reintenta la eliminación.'});
      return res.status(status>=500?503:400).json({ error: error.message || 'No fue posible eliminar la evaluación.' });
    }
  });
  const adminEvaluationRows = async () => { let rows=(db.prepare('SELECT payload_json FROM evaluations ORDER BY evaluated_at DESC').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.payload_json)]}catch{return[]}});if(googleStorage.enabled)try{const primary=await googleStorage.loadEvaluations();rows=supabaseStorage.enabled?primary:uniqueEvaluations([...primary,...rows]);}catch{}return rows; };
  app.delete('/api/evaluations/speech-batches/:batchId',requireAuth,async(req,res)=>{
    const user=(req as any).authUser as User;
    if(user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Administración puede eliminar una carga SA.'});
    const batchId=String(req.params.batchId||'').trim();
    const batch=(await adminEvaluationRows()).filter((item:any)=>item.origin==='SPEECH_ANALYTICS'&&item.sourceBatchId===batchId);
    if(!batch.length)return res.status(404).json({error:'La carga ya no existe.'});
    if(batch.some((item:any)=>!scopedRecord(user,item)))return res.status(403).json({error:'No tienes acceso a toda esta carga.'});
    const ids=batch.map((item:any)=>item.id),idSet=new Set(ids);
    if(ids.some((id:string)=>(db.prepare('SELECT 1 FROM calibrations WHERE evaluation_id=? LIMIT 1').get(id) as any)))return res.status(409).json({error:'La carga contiene evaluaciones con calibración. Elimina primero esas calibraciones.'});
    try{
      if(supabaseStorage.enabled)await supabaseStorage.deleteEvaluationBatch(ids);
      else if(googleStorage.enabled)for(const id of ids)await googleStorage.deleteEvaluation(id);
      db.exec('BEGIN IMMEDIATE');
      try{
        const removeCommitment=db.prepare('DELETE FROM evaluation_commitments WHERE evaluation_id=?'),removeFeedback=db.prepare('DELETE FROM feedbacks WHERE evaluation_id=?'),removeEvaluation=db.prepare('DELETE FROM evaluations WHERE id=?');
        for(const id of ids){removeCommitment.run(id);removeFeedback.run(id);removeEvaluation.run(id);}
        const stateRow=db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
        if(stateRow?.payload_json){const state=JSON.parse(stateRow.payload_json);db.prepare('UPDATE app_state SET payload_json=?,updated_at=? WHERE id=?').run(JSON.stringify({...state,evaluations:(state.evaluations||[]).filter((item:any)=>!idSet.has(item.id))}),new Date().toISOString(),'global');}
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(lastCompletePlatformState)lastCompletePlatformState={...lastCompletePlatformState,evaluations:(lastCompletePlatformState.evaluations||[]).filter((item:any)=>!idSet.has(item.id))};
      return res.json({deleted:ids.length,batchId});
    }catch(error:any){console.error('[speech-import] No fue posible eliminar la carga.',error);return res.status(/calibraci|cambi[oó]/i.test(error?.message||'')?409:502).json({error:error?.message||'No fue posible eliminar la carga.'});}
  });
  const speechCampaignContext=(directory:any,user:User,campaignName:string)=>{
    const key=normalizeSpeechText(campaignName);
    const campaigns=(directory.campaigns||[]).filter((item:Campaign)=>normalizeSpeechText(item.name)===key&&item.status==='ACTIVA');
    const campaignIds=new Set(campaigns.map((item:Campaign)=>item.id));
    const operations=(directory.operations||[]).filter((item:Operation)=>item.status==='ACTIVA'&&!item.legacy&&campaignIds.has(item.campaignId)&&scopedRecord(user,{operationId:item.id,companyId:item.companyId,campaignId:item.campaignId}));
    const operationIds=new Set(operations.map((item:Operation)=>item.id));
    const roster=(directory.advisors||[]).filter((advisor:Advisor)=>advisor.status==='ACTIVO'&&advisor.active!==false&&advisor.operationId&&operationIds.has(advisor.operationId));
    const operationById=new Map<string,Operation>(operations.map((item:Operation)=>[item.id,item]));
    const campaignById=new Map<string,Campaign>(campaigns.map((item:Campaign)=>[item.id,item]));
    const companyById=new Map<string,Company>((directory.companies||[]).map((item:Company)=>[item.id,item]));
    const activeAssignments=(directory.operationAssignments||[]).filter((item:OperationAssignment)=>item.active&&operationIds.has(item.operationId));
    const byDni=new Map<string,Advisor[]>(),byName=new Map<string,Advisor[]>();
    for(const advisor of roster){
      const dni=String(advisor.dni||'').replace(/\D/g,'');
      if(dni)byDni.set(dni,[...(byDni.get(dni)||[]),advisor]);
      const name=normalizeSpeechText(advisor.name);if(name)byName.set(name,[...(byName.get(name)||[]),advisor]);
    }
    const choose=(candidates:Advisor[])=>[...candidates].sort((left,right)=>{
      const leftAssignment=activeAssignments.filter((item:OperationAssignment)=>item.advisorId===left.id&&item.operationId===left.operationId).sort((a:OperationAssignment,b:OperationAssignment)=>String(b.startDate).localeCompare(String(a.startDate)))[0];
      const rightAssignment=activeAssignments.filter((item:OperationAssignment)=>item.advisorId===right.id&&item.operationId===right.operationId).sort((a:OperationAssignment,b:OperationAssignment)=>String(b.startDate).localeCompare(String(a.startDate)))[0];
      return Number(Boolean(rightAssignment))-Number(Boolean(leftAssignment))||String(rightAssignment?.startDate||'').localeCompare(String(leftAssignment?.startDate||''));
    })[0];
    const resolve=(dni:string,name:string)=>choose(byDni.get(String(dni||'').replace(/\D/g,''))||(!dni&&byName.get(normalizeSpeechText(name)))||[]);
    return{key,campaigns,operations,operationById,campaignById,companyById,activeAssignments,resolve};
  };
  const limaDate=()=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(item=>[item.type,item.value]));
    return`${parts.year}-${parts.month}-${parts.day}`;
  };
  app.post('/api/evaluations/import-speech/preview', requireAuth, parseRawFile, async (req,res) => {
    const user=(req as any).authUser as User;
    if(!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(user.role))return res.status(403).json({error:'Tu perfil no puede importar evaluaciones.'});
    const campaignName=decodeURIComponent(String(req.header('x-campaign-name')||'')).trim(),directory=await readRepository();
    const context=speechCampaignContext(directory,user,campaignName);
    if(!campaignName||!context.campaigns.length||!context.operations.length)return res.status(400).json({error:'Selecciona una campaña activa disponible en tu alcance.'});
    try{
      const workbook=XLSX.read(req.body,{type:'buffer',cellDates:true});
      const sheet=workbook.Sheets['Resultados']||workbook.Sheets[workbook.SheetNames.find(name=>normalizeSpeechText(name)==='resultados')||''];
      if(!sheet)return res.status(400).json({error:'El archivo no contiene la hoja Resultados.'});
      const sourceRows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:true});
      if(!sourceRows.length)return res.status(400).json({error:'La hoja Resultados no contiene registros.'});
      if(sourceRows.length>2000)return res.status(400).json({error:'El archivo supera el máximo de 2,000 evaluaciones por importación.'});
      const existing=await adminEvaluationRows(),existingIds=new Set(existing.map((item:any)=>item.id)),existingById=new Map(existing.map((item:any)=>[item.id,item]));
      const existingSourceKeys=new Set(existing.filter((item:any)=>item.origin==='SPEECH_ANALYTICS'&&normalizeSpeechText(item.sourceCampaignName||directory.campaigns.find((campaign:Campaign)=>campaign.id===item.campaignId)?.name)===context.key).map((item:any)=>`${speechText(item.sourceExternalId)}|${speechText(item.recordingCode||item.audioFileName)}`));
      const seenInFile=new Set<string>();
      const fileMatches=speechFileIdentityMatches(sourceRows.map(source=>speechText(speechValue(source,'Archivo'))));
      const rows=sourceRows.map((source,rowIndex)=>{
        const parsed=speechPreviewRow(source,rowIndex+2,fileMatches),advisor=context.resolve(parsed.sourceAdvisorDni,parsed.sourceAdvisorName),operation=advisor?.operationId?context.operationById.get(advisor.operationId):undefined,company=operation?context.companyById.get(operation.companyId):undefined;
        const sourceKey=`${parsed.externalId}|${parsed.fileName}`,evaluationId=`eval_speech_${speechHash(`${context.key}|${sourceKey}`)}`,prior=existingById.get(evaluationId),repair=!seenInFile.has(sourceKey)&&speechNeedsRepair(prior,parsed),duplicate=seenInFile.has(sourceKey)||!repair&&(existingIds.has(evaluationId)||existingSourceKeys.has(sourceKey));seenInFile.add(sourceKey);
        const warning=duplicate?'La evaluación ya fue importada.':advisor?'':parsed.sourceAdvisorDni?`El DNI ${parsed.sourceAdvisorDni} no figura en la dotación activa de ${context.campaigns[0].name}. Se creará con alerta para relacionarlo después.`:'El archivo no contiene un DNI válido de 8 dígitos. Se creará con alerta para relacionarlo después.';
        return{...parsed,evaluationId,matchedAdvisorId:advisor?.id||'',matchedAdvisorName:advisor?.name||'',matchedOperationId:operation?.id||'',matchedOperationName:operation?.name||'',matchedCompanyId:company?.id||'',matchedCompanyName:company?.name||'',status:duplicate?'DUPLICATE':repair?'REPAIR':advisor?'READY':'WARNING',warning};
      });
      const summary={total:rows.length,ready:rows.filter(row=>row.status==='READY').length,warnings:rows.filter(row=>row.status==='WARNING').length,repairs:rows.filter(row=>row.status==='REPAIR').length,duplicates:rows.filter(row=>row.status==='DUPLICATE').length};
      return res.json({fileName:decodeURIComponent(req.header('x-file-name')||'speech-analytics.xlsx'),campaign:{key:context.key,name:context.campaigns[0].name},summary,rows});
    }catch(error){console.error('[speech-import] No fue posible analizar el archivo.',error);return res.status(400).json({error:'No fue posible leer el archivo. Verifica que sea un XLSX válido de Speech Analytics.'});}
  });
  app.post('/api/evaluations/import-speech', requireAuth, async (req,res) => {
    const user=(req as any).authUser as User;
    if(!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(user.role))return res.status(403).json({error:'Tu perfil no puede importar evaluaciones.'});
    const campaignName=String(req.body?.campaignName||''),rows=Array.isArray(req.body?.rows)?req.body.rows:[];
    if(!rows.length||rows.length>2000)return res.status(400).json({error:'No hay evaluaciones válidas para importar.'});
    const directory=await readRepository(),context=speechCampaignContext(directory,user,campaignName);
    if(!context.campaigns.length||!context.operations.length)return res.status(400).json({error:'La campaña seleccionada ya no está disponible.'});
    const existing=await adminEvaluationRows(),existingIds=new Set(existing.map((item:any)=>item.id)),existingById=new Map(existing.map((item:any)=>[item.id,item])),existingSourceKeys=new Set(existing.filter((item:any)=>item.origin==='SPEECH_ANALYTICS'&&normalizeSpeechText(item.sourceCampaignName||directory.campaigns.find((campaign:Campaign)=>campaign.id===item.campaignId)?.name)===context.key).map((item:any)=>`${speechText(item.sourceExternalId)}|${speechText(item.recordingCode||item.audioFileName)}`));
    const created:any[]=[],repaired:any[]=[],pendingPeople:any[]=[];let duplicates=0,linked=0,pending=0;
    const dimensions:Record<string,string>={C1:'CONECTAR',C2:'CLARIFICAR',C3:'CONVERTIR',C4:'CONECTAR_C4'};
    const sourceBatchDate=limaDate(),sourceBatchId=`sa_${sourceBatchDate.replace(/-/g,'')}_${speechHash(`${campaignName}|${req.body?.fileName}|${Date.now()}`).slice(0,12)}`;
    for(const source of rows){
      const externalId=speechText(source.externalId),sourceKey=`${externalId}|${speechText(source.fileName)}`,evaluationId=`eval_speech_${speechHash(`${context.key}|${sourceKey}`)}`;
      const prior=existingById.get(evaluationId);
      if(prior&&speechNeedsRepair(prior,source)&&source.status==='REPAIR'){
        const sourceDni=speechText(source.sourceAdvisorDni),sourceAdvisorName=speechText(source.sourceAdvisorName),advisor=context.resolve(sourceDni,sourceAdvisorName),operation=advisor?.operationId?context.operationById.get(advisor.operationId):undefined,company=operation?context.companyById.get(operation.companyId):undefined,assignment=advisor&&operation?context.activeAssignments.find((item:OperationAssignment)=>item.advisorId===advisor.id&&item.operationId===operation.id):undefined;
        repaired.push(correctMigracionesQualityEvaluation({...prior,items:source.items,speechScore:source.speechScore,scoreTotal:source.speechScore,technicalScore:source.speechScore,comments:speechText(source.description),sourceAdvisorDni:sourceDni,sourceAdvisorName,...(advisor?{advisorId:advisor.id,operationId:operation?.id,companyId:company?.id,assignmentId:assignment?.id,supervisorId:advisor.supervisorId||'',supervisorAtEvaluation:advisor.supervisorId||'',advisorResolutionStatus:'RESOLVED',importAlert:undefined}: {importAlert:`El DNI ${sourceDni} no figura en la dotación activa de ${campaignName}. Solicita a Administración crear o regularizar al asesor y luego relaciónalo.`})},directory.campaigns));
        if(advisor)linked++;else pending++;
        existingById.delete(evaluationId);
        continue;
      }
      if(!externalId||existingIds.has(evaluationId)||existingSourceKeys.has(sourceKey)){duplicates++;continue;}
      const fileIdentity=speechAdvisorIdentityFromFile(speechText(source.fileName)),sourceDni=(fileIdentity.dni||speechText(source.sourceAdvisorDni)).replace(/\D/g,''),sourceAdvisorName=fileIdentity.name||speechText(source.sourceAdvisorName),advisor=context.resolve(sourceDni,sourceAdvisorName),operation=advisor?.operationId?context.operationById.get(advisor.operationId):undefined,campaign=(operation&&context.campaignById.get(operation.campaignId))||context.campaigns[0],company=operation?context.companyById.get(operation.companyId):undefined;
      const operationId=operation?.id;
      const pendingPersonId=`speech_pending_${speechHash(`${context.key}|${sourceDni||normalizeSpeechText(sourceAdvisorName)||source.fileName||externalId}`)}`;
      const advisorId=advisor?.id||pendingPersonId;
      if(!advisor&&!pendingPeople.some(person=>person.id===pendingPersonId))pendingPeople.push({id:pendingPersonId,dni:`PENDING-${speechHash(pendingPersonId).slice(0,12)}`,employeeCode:'',name:sourceAdvisorName||`Asesor por relacionar ${externalId}`,campaignId:campaign.id,teamId:'',supervisorId:'',status:'INACTIVO',active:false,speechImportPlaceholder:true,sourceAdvisorDni:sourceDni,sourceAdvisorName});
      const items=QUALITY_ATTRIBUTES.map(attribute=>{const imported=(source.items||[]).find((item:any)=>item.criterionId===attribute.id)||{},compliance=['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(imported.compliance)?imported.compliance:'NO_APLICA',critical='critical' in attribute&&Boolean(attribute.critical),classification=critical?(/cumplimiento/i.test(attribute.focus)?'CRITICO_COMPLIANCE':/usuario/i.test(attribute.focus)?'CRITICO_USUARIO_FINAL':'CRITICO_NEGOCIO'):'NO_CRITICO';return{id:`item_${attribute.id}`,criterionId:attribute.id,dimension:dimensions[attribute.criterion],compliance,percentage:compliance==='CUMPLE'?100:0,level:compliance==='CUMPLE'?4:compliance==='NO_CUMPLE'?1:0,finding:speechText(imported.finding),evidence:'',recommendedAction:'',attributeWeight:attribute.weight,qualityGuideline:{...attribute,critical,active:true},category:attribute.criterion,attribute:attribute.name,errorType:compliance==='NO_CUMPLE'?(critical?'Incumplimiento crítico':'Incumplimiento de atributo'):'',classification};});
      const criticalDetected=Boolean(source.criticalDetected),criticalName=speechText(source.criticalType)||'Error crítico detectado por Speech Analytics',now=new Date().toISOString(),gaps=items.filter(item=>item.compliance==='NO_CUMPLE');
      const assignment=advisor&&operationId?context.activeAssignments.find((item:OperationAssignment)=>item.advisorId===advisor.id&&item.operationId===operationId):undefined;
      let evaluation:any={id:evaluationId,advisorId,evaluatorId:user.id,evaluatorName:user.name,campaignId:campaign.id,operationId,companyId:company?.id,assignmentId:assignment?.id,teamId:advisor?.teamId||'',supervisorId:advisor?.supervisorId||'',supervisorAtEvaluation:advisor?.supervisorId||'',product:campaign.products?.[0]||'Migraciones',date:/^\d{4}-\d{2}-\d{2}$/.test(String(source.date))?source.date:new Date().toISOString().slice(0,10),time:/^\d{2}:\d{2}$/.test(String(source.time))?source.time:'00:00',callId:externalId,recordingCode:speechText(source.fileName),type:'DIAGNOSTICO_INICIAL',evaluationType:'QUALITY',qualityStatus:'DRAFT',validationStatus:'AUTOMATIC_PENDING',origin:'SPEECH_ANALYTICS',sourceTag:'SA',sourceBatchId,sourceBatchDate,sourceCampaignName:campaignName,sourceCompanyName:company?.name,sourceOperationName:operation?.name,qualityCriticalErrorIds:criticalDetected?[`speech_${speechHash(criticalName)}`]:[],qualityCriticalErrorSnapshot:criticalDetected?[{id:`speech_${speechHash(criticalName)}`,name:criticalName,description:'Detectado por Speech Analytics.',active:true}]:[],sale:Boolean(source.sale),saleResult:source.sale?'VENTA_CONCRETADA':'NO_VENTA',comments:speechText(source.description),audioFileName:speechText(source.fileName),audioDurationSeconds:Math.max(0,Number(source.durationSeconds)||0),audioMimeType:'audio/mpeg',scoreConnect:null,scoreClarify:null,scoreConvert:null,scoreTotal:source.speechScore,technicalScore:source.speechScore,primaryGap:gaps[0]?.attribute||'Sin brechas identificadas',secondaryGap:gaps[1]?.attribute||'',strongestPillar:'',recommendation:gaps.length?'Revisar los atributos marcados como No cumple.':'Mantener el estándar alcanzado.',items,createdAt:now,sourceExternalId:externalId,sourceFileName:speechText(req.body?.fileName),sourceRowNumber:Number(source.rowNumber)||undefined,sourceAdvisorName,sourceAdvisorDni:sourceDni,advisorResolutionStatus:advisor?'RESOLVED':'PENDING',importAlert:advisor?undefined:`El DNI ${sourceDni||'no informado'} no figura en la dotación activa de ${campaign.name}. Solicita a Administración crear o regularizar al asesor y luego relaciónalo.`,speechScore:source.speechScore === null || source.speechScore === '' ? null : Number.isFinite(Number(source.speechScore)) ? Number(source.speechScore) : null,speechApproved:speechText(source.speechApproved)};
      evaluation=correctMigracionesQualityEvaluation(evaluation,directory.campaigns);created.push(evaluation);existingIds.add(evaluationId);existingSourceKeys.add(sourceKey);if(advisor)linked++;else pending++;
    }
    if(!created.length&&!repaired.length)return res.json({summary:{created:0,repaired:0,linked:0,pending:0,duplicates}});
    try{
      if(supabaseStorage.enabled)await supabaseStorage.saveSpeechEvaluationBatch(created,pendingPeople);
      else if(googleStorage.enabled)for(const evaluation of created)await googleStorage.saveEvaluation(evaluation);
      for(const evaluation of repaired){if(supabaseStorage.enabled)await supabaseStorage.saveEvaluation(evaluation);else if(googleStorage.enabled)await googleStorage.saveEvaluation(evaluation);}
      db.exec('BEGIN IMMEDIATE');
      try{
        const insertPerson=db.prepare(`INSERT OR IGNORE INTO advisors(id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES(?,?,?,?,?,?,?,?)`),insertEvaluation=db.prepare(`INSERT OR IGNORE INTO evaluations(id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES(?,?,?,?,?,?,?)`);
        for(const person of pendingPeople)insertPerson.run(person.id,person.dni,person.employeeCode,person.name,person.campaignId,null,null,JSON.stringify(person));
        for(const evaluation of created)insertEvaluation.run(evaluation.id,evaluation.advisorId,evaluation.evaluatorId,evaluation.evaluationType,`${evaluation.date}T${evaluation.time}:00`,JSON.stringify(evaluation),evaluation.createdAt);
        const updateEvaluation=db.prepare('UPDATE evaluations SET advisor_id=?,payload_json=? WHERE id=?');
        for(const evaluation of repaired)updateEvaluation.run(evaluation.advisorId,JSON.stringify(evaluation),evaluation.id);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(lastCompletePlatformState)lastCompletePlatformState={...lastCompletePlatformState,evaluations:uniqueEvaluations([...created,...(lastCompletePlatformState.evaluations||[]).map((item:any)=>repaired.find((fixed:any)=>fixed.id===item.id)||item)])};
      return res.status(201).json({summary:{created:created.length,repaired:repaired.length,linked,pending,duplicates}});
    }catch(error:any){console.error('[speech-import] No fue posible guardar la importación.',error);return res.status(502).json({error:error.message||'No fue posible guardar la importación.'});}
  });
  app.post('/api/evaluations/:id/create-advisor',requireAuth,async(req,res)=>{
    const user=(req as any).authUser as User,current=await loadEvaluationById(req.params.id);
    if(!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(user.role)||!current||current.origin!=='SPEECH_ANALYTICS'||current.advisorResolutionStatus!=='PENDING')return res.status(404).json({error:'Evaluación pendiente no encontrada.'});
    if(user.role==='MONITOR'&&current.evaluatorId!==user.id)return res.status(403).json({error:'Sólo puedes resolver evaluaciones importadas por ti.'});
    const body=req.body||{},name=String(body.name||'').trim(),dni=String(body.dni||'').replace(/\D/g,''),companyId=String(body.companyId||''),operationId=String(body.operationId||''),supervisorId=String(body.supervisorId||'');
    if(name.length<3||!/^\d{8}$/.test(dni)||dni!==String(current.sourceAdvisorDni||'').replace(/\D/g,''))return res.status(400).json({error:'Verifica el nombre y el DNI de 8 dígitos indicado por Speech Analytics.'});
    const directory=await readRepository(),company=directory.companies?.find(item=>item.id===companyId&&item.status==='ACTIVA'),operation=directory.operations?.find(item=>item.id===operationId&&item.companyId===companyId&&item.status==='ACTIVA'&&!item.legacy),campaign=directory.campaigns.find(item=>item.id===operation?.campaignId&&item.status==='ACTIVA');
    if(!company||!operation||!campaign||normalizeSpeechText(campaign.name)!==normalizeSpeechText(current.sourceCampaignName||directory.campaigns.find(item=>item.id===current.campaignId)?.name))return res.status(400).json({error:'Selecciona una empresa y una operación activas de la campaña importada.'});
    if(!scopedRecord(user,{companyId,operationId,campaignId:campaign.id}))return res.status(404).json({error:'La campaña no está disponible en tu alcance.'});
    const supervisor=directory.users.find(item=>item.id===supervisorId&&item.status==='ACTIVO'&&['SUPERVISOR','FORMADOR','ADMINISTRADOR','CONSULTOR'].includes(item.role));
    if(!supervisor||!(directory.operationSupervisors||[]).some(item=>item.operationId===operationId&&item.supervisorId===supervisorId&&item.active))return res.status(400).json({error:'Selecciona un supervisor activo vinculado a esa operación.'});
    if(directory.advisors.some(item=>String(item.dni).replace(/\D/g,'')===dni)||db.prepare('SELECT 1 FROM advisors WHERE dni=?').get(dni))return res.status(409).json({error:'Ya existe un asesor con ese DNI. Relaciónalo desde la lista o regulariza su asignación en Dotación.'});
    const now=new Date().toISOString(),today=limaDate(),advisorId=`adv_${randomBytes(9).toString('hex')}`,userId=`usr_${advisorId}`,assignmentId=`assignment_${randomBytes(9).toString('hex')}`;
    db.exec('BEGIN IMMEDIATE');
    try{
      let team=db.prepare('SELECT id FROM teams WHERE campaign_id=? AND supervisor_id=? ORDER BY id LIMIT 1').get(campaign.id,supervisorId) as {id:string}|undefined;
      if(!team){team={id:`team_${randomBytes(9).toString('hex')}`};db.prepare('INSERT INTO teams (id,campaign_id,supervisor_id,name) VALUES (?,?,?,?)').run(team.id,campaign.id,supervisorId,`${campaign.name} · ${supervisor.name}`);}
      const advisor:Advisor={id:advisorId,name,dni,employeeCode:`ADV-${dni.slice(-4)}`,campaignId:campaign.id,operationId,teamId:team.id,supervisorId,supervisor:supervisor.name,status:'ACTIVO',active:true,hireDate:today,campaignStartDate:today};
      db.prepare('INSERT INTO advisors (id,dni,employee_code,name,campaign_id,team_id,supervisor_id,data_json) VALUES (?,?,?,?,?,?,?,?)').run(advisorId,dni,advisor.employeeCode,name,campaign.id,team.id,supervisorId,JSON.stringify(advisor));
      let username=`asesor_${dni}`;if(db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(username,`${username}@asesores3c.com`))username=`${username}_${randomBytes(3).toString('hex')}`;
      db.prepare('INSERT INTO users (id,name,email,username,role,status,team_id,advisor_id,created_at,password_hash,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,1)').run(userId,name,`${username}@asesores3c.com`,username,'ASESOR','ACTIVO',team.id,advisorId,now,hashPassword(dni));
      db.prepare("INSERT INTO operation_assignments (id,advisor_id,operation_id,team_id,supervisor_id,role,operational_status,start_date,active,source,actor_id,observation) VALUES (?,?,?,?,?,?,?, ?,1,'MANUAL',?,?)").run(assignmentId,advisorId,operationId,team.id,supervisorId,'ASESOR','PRODUCCION',today,user.id,'Alta desde resolución de alerta Speech Analytics.');
      db.prepare('INSERT INTO staffing_movements (id,advisor_id,assignment_id,type,occurred_at,effective_at,created_at,origin,destination,actor_id,observation) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(`movement_${randomBytes(9).toString('hex')}`,advisorId,assignmentId,'ALTA',now,today,now,null,JSON.stringify({operationId,companyId,campaignId:campaign.id,companyName:company.name,campaignName:campaign.name,supervisorId,supervisorName:supervisor.name}),user.id,'Alta desde resolución de alerta Speech Analytics.');
      if(supabaseStorage.enabled)await syncRosterImportSnapshot([advisorId]);else await syncRepositorySnapshot();
      db.exec('COMMIT');
      return res.status(201).json({advisor});
    }catch(error:any){db.exec('ROLLBACK');console.error('[speech-import] No fue posible crear asesor:',error);return res.status(409).json({error:error?.message||'No fue posible crear y guardar al asesor.'});}
  });
  app.patch('/api/evaluations/:id/link-advisor',requireAuth,async(req,res)=>{
    const user=(req as any).authUser as User,current=await loadEvaluationById(req.params.id);
    if(!['ADMINISTRADOR','CONSULTOR','MONITOR'].includes(user.role)||!current||current.origin!=='SPEECH_ANALYTICS'||current.advisorResolutionStatus!=='PENDING')return res.status(404).json({error:'Evaluación pendiente no encontrada.'});
    if(user.role==='MONITOR'&&current.evaluatorId!==user.id)return res.status(403).json({error:'Sólo puedes relacionar evaluaciones importadas por ti.'});
    const directory=await readRepository(),advisor=directory.advisors.find(item=>item.id===String(req.body?.advisorId)&&item.status==='ACTIVO'&&item.active!==false),operation=directory.operations?.find(item=>item.id===advisor?.operationId),campaign=directory.campaigns.find(item=>item.id===operation?.campaignId),company=directory.companies?.find(item=>item.id===operation?.companyId);
    if(!advisor||!operation||normalizeSpeechText(campaign?.name)!==normalizeSpeechText(current.sourceCampaignName||directory.campaigns.find(item=>item.id===current.campaignId)?.name))return res.status(400).json({error:'Selecciona un asesor activo de la misma campaña.'});
    if(!scopedRecord(user,{operationId:operation.id,companyId:operation.companyId,campaignId:operation.campaignId}))return res.status(404).json({error:'El asesor no está disponible en tu alcance.'});
    const now=new Date().toISOString(),assignment=(directory.operationAssignments||[]).find(item=>item.advisorId===advisor.id&&item.operationId===operation.id&&item.active),next={...current,advisorId:advisor.id,campaignId:campaign!.id,operationId:operation.id,companyId:company?.id,sourceCompanyName:company?.name,sourceOperationName:operation.name,teamId:advisor.teamId||'',supervisorId:advisor.supervisorId||'',supervisorAtEvaluation:advisor.supervisorId||'',assignmentId:assignment?.id,advisorResolutionStatus:'RESOLVED',importAlert:undefined,linkedAdvisorAt:now,linkedAdvisorBy:user.id};
    try{if(supabaseStorage.enabled)await supabaseStorage.saveEvaluation(next);else if(googleStorage.enabled)await googleStorage.saveEvaluation(next);db.prepare('UPDATE evaluations SET advisor_id=?,payload_json=? WHERE id=?').run(advisor.id,JSON.stringify(next),next.id);if(lastCompletePlatformState)lastCompletePlatformState={...lastCompletePlatformState,evaluations:(lastCompletePlatformState.evaluations||[]).map((item:any)=>item.id===next.id?next:item)};return res.json({evaluation:next});}catch(error:any){return res.status(502).json({error:error.message||'No fue posible relacionar al asesor.'});}
  });
  const adminFilteredEvaluations = async (query:any,user:User) => { const directory=await readRepository(),campaignId=String(query.campaignId||''),supervisorId=String(query.supervisorId||''),advisorName=String(query.advisorName||'').trim().toLocaleLowerCase(),feedbackStatus=String(query.feedbackStatus||''),validationStatus=String(query.validationStatus||'');let feedbacks=(db.prepare('SELECT * FROM feedbacks').all() as any[]);if(googleStorage.enabled)try{feedbacks=await googleStorage.loadFeedbacks();}catch{}const feedbackByEvaluation=new Map(feedbacks.map(item=>[item.evaluation_id,item]));const rows=(await adminEvaluationRows()).filter(item=>{const advisor=directory.advisors.find(a=>a.id===item.advisorId),fb=feedbackByEvaluation.get(item.id),fbState=fb&&['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(fb.status)?'FIRMADO':'PENDIENTE';return scopedRecord(user,item)&&(!campaignId||item.campaignId===campaignId)&&(!supervisorId||item.supervisorId===supervisorId||advisor?.supervisorId===supervisorId)&&(!advisorName||advisor?.name.toLocaleLowerCase().includes(advisorName))&&(!feedbackStatus||fbState===feedbackStatus)&&(!validationStatus||normalizedValidationStatus(item)===validationStatus);});const visibleIds=new Set(rows.map((item:any)=>item.id));feedbacks=feedbacks.filter((item:any)=>visibleIds.has(item.evaluation_id));return{rows,feedbacks,directory,feedbackByEvaluation}; };
  app.get('/api/admin/dashboard',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!adminRoles.has(user.role))return res.status(403).json({error:'Acceso restringido a Calidad y Administración.'});const {rows,feedbacks,directory}=await adminFilteredEvaluations(req.query,user);const valid=rows.filter(item=>normalizedValidationStatus(item)==='VALIDATED'),average=(items:any[])=>items.length?Math.round(items.reduce((sum,item)=>sum+Number(item.technicalScore??item.scoreTotal??0),0)/items.length):null;const by=(key:(item:any)=>string)=>Object.entries(valid.reduce((out:any,item)=>{const id=key(item);(out[id]??=[]).push(item);return out;},{})).map(([id,items]:any)=>({id,name:directory.campaigns.find(c=>c.id===id)?.name||directory.users.find(u=>u.id===id)?.name||'Sin asignar',average:average(items),count:items.length}));const signed=feedbacks.filter(item=>['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(item.status)).length;res.json({metrics:{feedbackDone:signed,feedbackPending:Math.max(0,feedbacks.length-signed),automaticPending:rows.filter(item=>normalizedValidationStatus(item)==='AUTOMATIC_PENDING').length},byCampaign:by(item=>item.campaignId),bySupervisor:by(item=>item.supervisorId),evaluations:rows.map(item=>({...item,feedbackStatus:(()=>{const fb=feedbacks.find(f=>f.evaluation_id===item.id);return fb&&['VALIDADO_ASESOR','CERRADO_SUPERVISOR'].includes(fb.status)?'FIRMADO':'PENDIENTE';})()}))});});
  app.patch('/api/admin/evaluations/:id', requireAuth, async (req,res) => {
    const user=(req as any).authUser as User;
    const current=await loadEvaluationById(req.params.id);
    if(!current || !scopedRecord(user,current)) return res.status(404).json({error:'Evaluación no encontrada.'});
    const monitorImported=user.role==='MONITOR'&&current.origin==='SPEECH_ANALYTICS'&&normalizedValidationStatus(current)==='AUTOMATIC_PENDING'&&current.evaluatorId===user.id;
    if(user.role!=='ADMINISTRADOR'&&!monitorImported) return res.status(403).json({error:'No tienes permiso para editar esta evaluación.'});
    const body=req.body||{},now=new Date().toISOString();
    if((body.validate||body.validationStatus==='VALIDATED')&&current.advisorResolutionStatus==='PENDING')return res.status(400).json({error:'Relaciona primero la evaluación con un asesor activo.'});
    const editableFields=['date','time','callId','recordingCode','type','product','sale','saleResult','noSaleReason','comments','items','qualityCriticalErrorIds','qualityCriticalErrorSnapshot','audioUrl','audioFileName','audioFileSize','audioDurationSeconds','audioMimeType'];
    const changes=Object.fromEntries(editableFields.filter(key=>body[key]!==undefined).map(key=>[key,body[key]]));
    const contentEdit=editableFields.filter(key=>!key.startsWith('audio')).some(key=>body[key]!==undefined);
    if(changes.date&&!/^\d{4}-\d{2}-\d{2}$/.test(String(changes.date))) return res.status(400).json({error:'La fecha de evaluación no es válida.'});
    if(changes.time&&!/^\d{2}:\d{2}$/.test(String(changes.time))) return res.status(400).json({error:'La hora de evaluación no es válida.'});
    const items=Array.isArray(changes.items)?changes.items:current.items;
    const itemCompliance=(item:any)=>['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(item?.compliance)?item.compliance:(item?.level!==undefined||item?.percentage!==undefined?getItemCompliance(item):undefined);
    const answered=items.map((item:any)=>itemCompliance(item));
    const existingScore=current.technicalScore??current.scoreTotal;
    if(contentEdit&&!answered.some((status:any)=>status==='CUMPLE'||status==='NO_CUMPLE')&&!(existingScore!==null&&existingScore!==undefined&&Number.isFinite(Number(existingScore)))) return res.status(400).json({error:'Responde al menos un criterio evaluable antes de guardar.'});
    const invalidNa=items.some((item:any)=>item.compliance==='NO_APLICA'&&item.qualityGuideline&&!item.qualityGuideline?.applicableRules?.length);
    if(invalidNa)return res.status(400).json({error:'NO_APLICA requiere una regla explícita en el atributo.'});
    const directory=await readRepository();
    const validationStatus=body.validate||body.validationStatus==='VALIDATED'?'VALIDATED':current.validationStatus;
    const merged={...current,...changes,items:items.map((item:any)=>({...item,compliance:itemCompliance(item)})),validationStatus,updatedAt:now,audit:[...(current.audit||[]),{action:body.validate?'VALIDATED':'EDITED',userId:user.id,at:now}]};
    const next=contentEdit?recalculateEditedEvaluation(merged,directory.campaigns):correctMigracionesQualityEvaluation(merged,directory.campaigns);
    try {
      if(googleStorage.enabled) await googleStorage.saveEvaluation(next);
      db.prepare('UPDATE evaluations SET evaluated_at=?,payload_json=? WHERE id=?').run(`${next.date}T${next.time||'00:00'}:00`,JSON.stringify(next),next.id);
      if(lastCompletePlatformState) lastCompletePlatformState={...lastCompletePlatformState,evaluations:(lastCompletePlatformState.evaluations||[]).map((item:any)=>item.id===next.id?next:item)};
      return res.json({evaluation:next});
    } catch(error:any) {
      const status=Number(error?.response?.status||error?.code||0),detail=[error?.message,error?.response?.data?.error,error?.response?.data?.error_description].filter(Boolean).map(String).join(' ').toLowerCase();
      if(status===429||/quota exceeded|rate.?limit/.test(detail))return res.status(503).json({error:'El repositorio principal alcanzó temporalmente su límite. Reintenta el guardado.'});
      return res.status(status>=500?503:400).json({error:error.message||'No fue posible actualizar la evaluación.'});
    }
  });
  const canReadEvaluation = (user: User, evaluation: any) => !scopedRecord(user,evaluation)?false:user.role === 'ASESOR'
    ? user.advisorId === evaluation.advisorId
    : user.role === 'SUPERVISOR'
      ? user.id === evaluation.supervisorId || Boolean(user.teamId && user.teamId === evaluation.teamId)
      : user.role === 'MONITOR' ? user.id === evaluation.evaluatorId || evaluation.origin === 'SPEECH_ANALYTICS' : ['ADMINISTRADOR','CONSULTOR'].includes(user.role);
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
    try { const storage=fileStorageFor(fileId),file=await storage.fileMetadata(fileId),stream=await storage.downloadFile(fileId);res.set({'Content-Type':file.mimeType||'audio/mpeg','Content-Disposition':`inline; filename="${String(file.name||'audio.mp3').replace(/[\\\r\n"]/g,'_')}"`,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});stream.on('error',()=>res.destroy());stream.pipe(res); } catch { if(!res.headersSent)res.status(404).json({error:'Audio no encontrado.'}); }
  });
  app.get('/api/feedbacks', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User;
    const directory=await readRepository(),supervisorAdvisorIds=new Set(directory.advisors.filter(item=>item.supervisorId===user.id||(user.teamId&&item.teamId===user.teamId)).map(item=>item.id));
    const evaluationIds=new Set((await adminEvaluationRows()).map((evaluation:any)=>evaluation.id));
    const onlyOwn = (feedbacks: any[]) => {const existing=feedbacks.filter(feedback=>evaluationIds.has(feedback.evaluation_id));return user.role === 'ASESOR' ? existing.filter(feedback => feedback.advisor_id === user.advisorId) : user.role === 'SUPERVISOR' ? existing.filter(feedback => supervisorAdvisorIds.has(feedback.advisor_id)) : user.role === 'MONITOR' ? existing.filter(feedback => feedback.evaluator_id === user.id) : existing;};
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
    if (authUser.role === 'MONITOR' && ev.evaluatorId !== authUser.id && ev.origin !== 'SPEECH_ANALYTICS') return res.status(403).json({ error: 'Solo puedes crear feedback de evaluaciones manuales propias o de Speech Analytics.' });
    if (authUser.role === 'SUPERVISOR') { const directory=await readRepository(),team=new Set(directory.advisors.filter(item=>item.supervisorId===authUser.id||(authUser.teamId&&item.teamId===authUser.teamId)).map(item=>item.id));if(!team.has(ev.advisorId))return res.status(403).json({error:'Solo puedes crear feedback para asesores de tu equipo.'}); }
    const feedbackText=String(body.feedback_text||'').trim();if(!feedbackText)return res.status(400).json({error:'Registra el contenido del feedback.'});
    const now = new Date().toISOString(); const feedback = { feedback_id: `fb_${randomBytes(8).toString('hex')}`, evaluation_id: ev.id, advisor_id: ev.advisorId, supervisor_id: ev.supervisorId, evaluator_id: ev.origin==='SPEECH_ANALYTICS'?authUser.id:ev.evaluatorId, evaluation_type: ev.evaluationType, feedback_text: feedbackText, advisor_response: null, advisor_evidence_url: null, supervisor_closure_comment: null, status: 'PENDIENTE', created_at: now, advisor_action_at: null, closed_at: null, updated_at: now };
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
    if (user.role === 'SUPERVISOR') { const directory=await readRepository(),team=new Set(directory.advisors.filter(item=>item.supervisorId===user.id||(user.teamId&&item.teamId===user.teamId)).map(item=>item.id));if(!team.has(current.advisor_id))return res.status(403).json({ error: 'Este feedback no pertenece a tu equipo.' }); }
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
      if (user.role === 'MONITOR') return { ...state, evaluations: (state.evaluations || []).filter((item: any) => item.evaluatorId === user.id || item.origin === 'SPEECH_ANALYTICS'), actionPlans: [], advisorInterventions: [], operationalMeasurements: [], importHistory: [] };
      if (user.accessScope && user.accessScope !== 'GLOBAL' && !['ASESOR','SUPERVISOR'].includes(user.role)) { const mine=(items:any[]|undefined)=>(items||[]).filter(item=>scopedRecord(user,item));return{...state,evaluations:mine(state.evaluations),actionPlans:(state.actionPlans||[]).filter((item:any)=>canAccessActionPlan(user,item,directory)),advisorInterventions:mine(state.advisorInterventions),operationalMeasurements:mine(state.operationalMeasurements),importHistory:[]}; }
      if (!['ASESOR','SUPERVISOR'].includes(user.role)) return state;
      const advisorIds = user.role === 'ASESOR' ? new Set(user.advisorId ? [user.advisorId] : []) : new Set(directory.advisors.filter(item => item.supervisorId === user.id || (user.teamId && item.teamId === user.teamId)).map(item => item.id));
      const mine = (items: any[] | undefined) => (items || []).filter(item => advisorIds.has(item.advisorId));
      const visibleEvaluations = mine(state.evaluations).filter((item: any) => normalizedValidationStatus(item) === 'VALIDATED');
      const visiblePlans = (state.actionPlans || []).filter((item: any) => user.role === 'ASESOR' ? planAdvisorIds(item).includes(String(user.advisorId || '')) : planAdvisorIds(item).every(id => advisorIds.has(id)));
      return { ...state, evaluations: visibleEvaluations, actionPlans: visiblePlans.map((item: any) => user.role === 'ASESOR' ? { ...item, advisorMetrics: (item.advisorMetrics || []).filter((row: any) => row.advisorId === user.advisorId) } : item), advisorInterventions: mine(state.advisorInterventions), operationalMeasurements: mine(state.operationalMeasurements), importHistory: [] };
    };
    try {
      if (googleStorage.enabled) {
        const [state, storedEvaluations] = await Promise.all([googleStorage.loadPlatformState(), googleStorage.loadEvaluations()]);
        const localRow = supabaseStorage.enabled ? null : db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;
        const localState = localRow ? JSON.parse(localRow.payload_json) : {};
        const localEvaluations = supabaseStorage.enabled ? [] : (db.prepare('SELECT payload_json FROM evaluations').all() as any[]).map(row => JSON.parse(row.payload_json));
        const consolidated = { ...localState, ...(state || {}), evaluations: mergeEvaluationSources(storedEvaluations || [], state?.evaluations || [], localEvaluations, localState.evaluations || []) };
        const corrected = { ...consolidated, evaluations: consolidated.evaluations.map((evaluation:any) => correctMigracionesQualityEvaluation(evaluation, directory.campaigns)) };
        lastCompletePlatformState = corrected;
        const evaluationTypes=corrected.evaluations.reduce((totals:any,item:any)=>{const type=item.evaluationType||'SIN_TIPO';totals[type]=(totals[type]||0)+1;return totals;},{});
        console.log(`[platform-state] fuente=${supabaseStorage.enabled?'Supabase':'Sheets legacy'} evaluaciones=${corrected.evaluations.length} tipos=${JSON.stringify(evaluationTypes)} asesores=${directory.advisors.length}`);
        console.log('[platform-state] fuentes=' + JSON.stringify({ primaryEvaluations: storedEvaluations.length, primaryState: state?.evaluations?.length || 0, cacheEvaluations: localEvaluations.length, cacheState: localState.evaluations?.length || 0, total: corrected.evaluations.length }));
        return res.json({ state: onlyOwn(corrected) });
      }
    }
    catch (error) {
      console.error('[google-storage] No fue posible leer el estado de plataforma.', error instanceof Error ? error.message : '');
      if (lastCompletePlatformState) {
        console.warn('[platform-state] Se entrega el último estado completo en caché por una falla transitoria del repositorio principal.');
        return res.json({ state: onlyOwn(lastCompletePlatformState), source: 'LAST_COMPLETE_CACHE' });
      }
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
    const actor=(req as any).authUser as User;
    if (!['ADMINISTRADOR','CONSULTOR'].includes(actor.role) || !isGlobalActor(actor)) return res.status(403).json({ error: 'Sólo un administrador global puede sobrescribir el estado global.' });
    const now = new Date().toISOString();
    let canonicalEvaluations = (db.prepare('SELECT payload_json FROM evaluations ORDER BY created_at DESC').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.payload_json)]}catch{return[]}});
    try { if (googleStorage.enabled) canonicalEvaluations = await googleStorage.loadEvaluations(); }
    catch (error) { console.error('[google-storage] No fue posible validar EVALUATIONS antes de guardar el estado.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No se pudo validar el historial de evaluaciones; no se modificó el estado.' }); }
    const normalizedState = normalizePlatformState({ ...(req.body || {}), evaluations: canonicalEvaluations });
    try { if (googleStorage.enabled) await googleStorage.savePlatformState(normalizedState); }
    catch (error) { console.error('[structured-storage] No fue posible guardar el estado de plataforma.', error instanceof Error ? error.message : ''); return res.status(502).json({ error: 'No fue posible sincronizar el estado con el repositorio principal.' }); }
    db.prepare(`INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run('global', JSON.stringify(normalizedState), now);
    for (const evaluation of (normalizedState?.evaluations || [])) { if (!evaluation?.id || !evaluation?.advisorId || !evaluation?.evaluatorId || !['QUALITY','D3C'].includes(evaluation?.evaluationType)) continue; try { db.prepare(`INSERT OR IGNORE INTO evaluations (id,advisor_id,evaluator_id,evaluation_type,evaluated_at,payload_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(evaluation.id, evaluation.advisorId, evaluation.evaluatorId, evaluation.evaluationType, `${evaluation.date}T${evaluation.time || '00:00'}:00`, JSON.stringify(evaluation), evaluation.createdAt || now); } catch {} }
    res.json({ ok: true });
  });

  app.post('/api/files/upload', requireAuth, parseRawFile, async (req, res) => {
    const legacyBody = !Buffer.isBuffer(req.body) ? req.body || {} : {};
    let name = legacyBody.name || req.header('x-file-name') || '';
    try { name = decodeURIComponent(String(name)); } catch { name = String(name); }
    const requestedMimeType = String(legacyBody.mimeType || req.header('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const inferredMimeType = /\.(mp3|mpeg|mpg)$/i.test(name) ? 'audio/mpeg'
      : /\.wav$/i.test(name) ? 'audio/wav'
      : /\.(m4a|mp4)$/i.test(name) ? 'audio/mp4'
      : /\.ogg$/i.test(name) ? 'audio/ogg'
      : /\.webm$/i.test(name) ? 'audio/webm'
      : /\.aac$/i.test(name) ? 'audio/aac'
      : /\.(png|jpe?g|gif|webp)$/i.test(name) ? `image/${name.toLowerCase().endsWith('.jpg') ? 'jpeg' : name.split('.').pop()}`
      : requestedMimeType;
    const data = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(legacyBody.base64 || '').replace(/^data:[^,]*,/, ''), 'base64');
    if (!name || !data.length) return res.status(400).json({ error: 'El archivo está vacío o no tiene un nombre válido.' });
    if (data.length > 35 * 1024 * 1024) return res.status(413).json({ error: 'El archivo supera el límite de 35 MB.' });
    if (!/^(audio\/|image\/)/.test(inferredMimeType)) return res.status(415).json({ error: 'Solo se permiten archivos de audio o imágenes compatibles.' });
    try {
      const file = await supabaseFileStorage.uploadFile({ name: String(name), mimeType: inferredMimeType, data });
      res.status(201).json({ file: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, url: `/api/files/${file.id}/content` } });
    } catch (error: any) {
      const status = Number(error?.statusCode || error?.status || error?.code || 0);
      const detail = String(error?.message || '').toLowerCase();
      console.error('[supabase-storage] No fue posible subir el archivo.', `status=${status || 'unknown'}`, error instanceof Error ? error.message : '');
      if (/no está configurado|not configured/.test(detail)) return res.status(503).json({ code: 'SUPABASE_STORAGE_NOT_CONFIGURED', error: 'Supabase Storage no está configurado en el servidor.' });
      if (status === 413 || /maximum allowed size|payload too large|exceeded.*size/.test(detail)) return res.status(413).json({ code: 'SUPABASE_FILE_TOO_LARGE', error: 'El archivo supera el límite de 35 MB.' });
      if (status === 401 || status === 403 || /unauthorized|permission|row-level security/.test(detail)) return res.status(503).json({ code: 'SUPABASE_STORAGE_PERMISSION', error: 'Supabase Storage rechazó la carga por configuración de permisos.' });
      return res.status(502).json({ code: 'SUPABASE_UPLOAD_FAILED', error: 'No fue posible guardar el archivo en Supabase. Intenta nuevamente.' });
    }
  });
  app.get('/api/files/:id/content', requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser as User;
      const pathPart = `/api/files/${req.params.id}/content`;
      let evaluations = (db.prepare('SELECT payload_json FROM evaluations').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.payload_json)];}catch{return[];}});
      let feedbacks = db.prepare('SELECT * FROM feedbacks').all() as any[];
      let alerts=(db.prepare('SELECT data_json FROM quality_alerts').all() as any[]).flatMap(row=>{try{return[JSON.parse(row.data_json)]}catch{return[]}});
      if (googleStorage.enabled) { try { evaluations=supabaseStorage.enabled?await googleStorage.loadEvaluations():uniqueEvaluations([...(await googleStorage.loadEvaluations()),...evaluations]);feedbacks=await googleStorage.loadFeedbacks();alerts=await googleStorage.loadQualityAlerts(); } catch {} }
      const canRead=(item:any)=>canReadEvaluation(user,item);
      const allowed = evaluations.some(item=>canRead(item)&&String(item.audioUrl||'').includes(pathPart))
        || feedbacks.some(item=>{const evaluation=evaluations.find(e=>e.id===item.evaluation_id);return evaluation&&canRead(evaluation)&&String(item.advisor_evidence_url||'').includes(pathPart);})
        || alerts.some(item=>{const visible=scopedRecord(user,item)&&(qualityManagers.has(user.role)||(user.role==='SUPERVISOR'&&item.supervisorIds?.includes(user.id))||(user.role==='ASESOR'&&item.advisorId===user.advisorId));const urls=user.role==='ASESOR'?[item.audioUrl]:[item.audioUrl,item.evidenceUrl,...(item.supervisorResponses||[]).map((response:any)=>response.evidenceUrl)];return visible&&urls.some(url=>String(url||'').includes(pathPart));});
      if (!allowed) return res.status(404).json({ error:'Archivo no encontrado.' });
      const storage = fileStorageFor(req.params.id);
      const file = await storage.fileMetadata(req.params.id);
      const stream = await storage.downloadFile(req.params.id);
      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${String(file.name || 'archivo').replace(/[\\\r\n"]/g, '_')}"`,
        'Cache-Control': 'private, max-age=3600'
      });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      console.error('[file-storage] No fue posible descargar el archivo.', error instanceof Error ? error.message : '');
      if (!res.headersSent) res.status(404).json({ error: 'Archivo no encontrado.' });
    }
  });
  app.get('/api/files/:id', requireAuth, async (_req, res) => res.status(404).json({error:'Usa el endpoint autorizado del registro asociado.'}));
  app.delete('/api/files/:id', requireAuth, async (req, res) => { const user=(req as any).authUser as User;if(user.role!=='ADMINISTRADOR'||!isGlobalActor(user))return res.status(403).json({error:'Acceso denegado.'});try { await fileStorageFor(req.params.id).deleteFile(req.params.id); res.status(204).end(); } catch { res.status(404).json({ error: 'Archivo no encontrado.' }); } });

  const qualityManagers = new Set(['ADMINISTRADOR', 'CONSULTOR']);
  const alertRows = () => (db.prepare('SELECT data_json FROM quality_alerts ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const calibrationRows = () => (db.prepare('SELECT data_json FROM calibrations ORDER BY updated_at DESC').all() as any[]).map(row => JSON.parse(row.data_json));
  const persistAlert = (item: any) => db.prepare(`INSERT INTO quality_alerts (id,status,advisor_id,supervisor_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,advisor_id=excluded.advisor_id,supervisor_id=excluded.supervisor_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.advisorId,item.supervisorId,item.campaignId,JSON.stringify(item),item.publishedAt,item.updatedAt);
  const persistCalibration = (item: any) => db.prepare(`INSERT INTO calibrations (id,status,evaluation_id,campaign_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,evaluation_id=excluded.evaluation_id,campaign_id=excluded.campaign_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(item.id,item.status,item.evaluationId,item.campaignId,JSON.stringify(item),item.createdAt,item.updatedAt);

  const isAlertActive = (item:any) => item.status !== 'CERRADA' && String(item.validUntil || '') >= new Date().toISOString().slice(0,10);
  const normalizeAlert = (item:any) => { const supervisorResponses=item.supervisorResponses||[],latest=[...supervisorResponses].sort((a:any,b:any)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];return{...item,managementDetail:item.managementDetail||latest?.managementDetail,evidenceUrl:item.evidenceUrl||latest?.evidenceUrl,supervisorIds:[...new Set((item.supervisorIds?.length?item.supervisorIds:[item.supervisorId]).filter(Boolean))],supervisorResponses}; };
  const loadAlerts = async () => { let items=alertRows(); try { const remote=googleStorage.enabled?await googleStorage.loadQualityAlerts():[]; if(remote.length){items=remote;remote.forEach(persistAlert);} } catch {} return items.map(normalizeAlert); };
  const teamAdvisorIds = (user:User, directory:SharedRepository) => new Set(directory.advisors.filter(item=>item.supervisorId===user.id || (!!user.teamId&&item.teamId===user.teamId)).map(item=>item.id));
  const localRuntimeState=()=>{const row=db.prepare('SELECT payload_json FROM app_state WHERE id=?').get('global') as any;try{return row?JSON.parse(row.payload_json):{};}catch{return{};}};
  const loadActionPlans=async()=>supabaseStorage.enabled?await supabaseStorage.loadActionPlans():googleStorage.enabled?((await googleStorage.loadPlatformState())?.actionPlans||[]):(localRuntimeState().actionPlans||[]);
  const saveFallbackActionPlans=async(actionPlans:any[])=>{const current=googleStorage.enabled?(await googleStorage.loadPlatformState()||{}):localRuntimeState(),next={...current,actionPlans},now=new Date().toISOString();if(googleStorage.enabled)await googleStorage.savePlatformState(next);db.prepare(`INSERT INTO app_state (id,payload_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run('global',JSON.stringify(next),now);};
  const canAccessPlanAdvisor=(user:User,advisorId:string,directory:SharedRepository)=>{const advisor=directory.advisors.find(item=>item.id===advisorId);if(!advisor)return false;if(user.role==='SUPERVISOR')return teamAdvisorIds(user,directory).has(advisorId);if(user.role==='ASESOR')return user.advisorId===advisorId;if(!['ADMINISTRADOR','CONSULTOR'].includes(user.role))return false;const operation=directory.operations?.find(item=>item.id===advisor.operationId)||directory.operations?.find(item=>item.campaignId===advisor.campaignId);return scopedRecord(user,{advisorId,campaignId:advisor.campaignId,operationId:advisor.operationId||operation?.id,companyId:operation?.companyId,supervisorId:advisor.supervisorId});};
  const planAdvisorIds=(plan:any):string[]=>Array.isArray(plan.advisorIds)&&plan.advisorIds.length?[...new Set<string>(plan.advisorIds.map(String))]:[String(plan.advisorId||'')];
  const canAccessActionPlan=(user:User,plan:any,directory:SharedRepository)=>user.role==='ASESOR'?planAdvisorIds(plan).includes(String(user.advisorId||'')):planAdvisorIds(plan).every(id=>canAccessPlanAdvisor(user,id,directory));
  const planMetrics=(value:any,ids:string[],requireInitial=true)=>ids.map(advisorId=>{
    const row=Array.isArray(value)?value.find((item:any)=>item.advisorId===advisorId):undefined;
    const initial=row?.sphInitial,updated=row?.sphUpdated,retraining=row?.sphRetraining;
    const sphInitial=initial===''||initial==null?null:Number(initial),sphUpdated=updated===''||updated==null?null:Number(updated),sphRetraining=retraining===''||retraining==null?null:Number(retraining);
    if(requireInitial&&(sphInitial===null||!Number.isFinite(sphInitial)||sphInitial<0)||sphInitial!==null&&(!Number.isFinite(sphInitial)||sphInitial<0)||sphUpdated!==null&&(!Number.isFinite(sphUpdated)||sphUpdated<0)||sphRetraining!==null&&(!Number.isFinite(sphRetraining)||sphRetraining<0))throw new Error('Registra SPH válidos para cada asesor.');
    const date=(key:string)=>{const text=String(row?.[key]||'').trim();if(text&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||new Date(`${text}T00:00:00Z`).toISOString().slice(0,10)!==text))throw new Error('Registra fechas de SPH válidas.');return text;};
    return{advisorId,sphInitial,sphInitialDate:date('sphInitialDate'),sphUpdated,sphUpdatedDate:date('sphUpdatedDate'),sphRetraining,sphRetrainingDate:date('sphRetrainingDate'),followUpType:row?.followUpType==='REENTRENAMIENTO'?'REENTRENAMIENTO':'SEGUIMIENTO_FEEDBACK',observations:String(row?.observations||'').trim().slice(0,4000)};
  });
  app.post('/api/action-plans',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!['ADMINISTRADOR','CONSULTOR','SUPERVISOR'].includes(user.role))return res.status(403).json({error:'No tienes permiso para crear planes de acción.'});const body=req.body||{},directory=await readRepository();const advisorIds=[...new Set<string>((Array.isArray(body.advisorIds)?body.advisorIds:[body.advisorId]).map(String).filter(Boolean))];if(!advisorIds.length||advisorIds.length>100||!String(body.objective||'').trim()||!String(body.action||'').trim())return res.status(400).json({error:'Selecciona entre 1 y 100 asesores y completa objetivo y acción.'});if(advisorIds.some(id=>!canAccessPlanAdvisor(user,id,directory)))return res.status(404).json({error:'Hay asesores fuera de tu alcance.'});const group=advisorIds.map(id=>directory.advisors.find(item=>item.id===id)!);if(group.some(advisor=>advisor.campaignId!==group[0].campaignId||advisor.operationId!==group[0].operationId||advisor.supervisorId!==group[0].supervisorId))return res.status(400).json({error:'Los asesores del grupo deben pertenecer a la misma operación y supervisor.'});let advisorMetrics;try{advisorMetrics=planMetrics(body.advisorMetrics,advisorIds);}catch(error:any){return res.status(400).json({error:error.message});}const now=new Date(),plan={...body,id:`act_${randomBytes(8).toString('hex')}`,advisorId:advisorIds[0],advisorIds,advisorMetrics,objective:String(body.objective).trim(),action:String(body.action).trim(),responsibleId:user.role==='SUPERVISOR'?user.id:body.responsibleId,status:'PENDIENTE',createdDate:now.toISOString().slice(0,10),createdAt:now.toISOString(),createdBy:user.id};try{if(supabaseStorage.enabled)await supabaseStorage.createActionPlan(plan);else await saveFallbackActionPlans([plan,...(await loadActionPlans())]);res.status(201).json({plan});}catch(error){console.error('[action-plans] No fue posible crear el plan.',error);res.status(502).json({error:'No fue posible guardar el plan de acción.'});}});
  app.patch('/api/action-plans/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User,plans=await loadActionPlans(),current=plans.find((item:any)=>item.id===req.params.id),directory=await readRepository();if(!current||!canAccessActionPlan(user,current,directory))return res.status(404).json({error:'Plan no encontrado en tu alcance.'});if(!['ADMINISTRADOR','CONSULTOR','SUPERVISOR','ASESOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});const allowed=user.role==='ASESOR'?['status']:user.role==='ADMINISTRADOR'?['advisorId','advisorIds','criterionId','objective','action','targetDate','dueDate','followUpDate','responsibleId','status','advisorMetrics','notes','comments','evidence','result','completedDate']:['criterionId','objective','action','targetDate','dueDate','followUpDate','responsibleId','status','advisorMetrics','notes','comments','evidence','result','completedDate'],changes=Object.fromEntries(allowed.filter(key=>req.body?.[key]!==undefined).map(key=>[key,req.body[key]]));if(changes.status&&!['PENDIENTE','EN_CURSO','COMPLETADO','VENCIDO'].includes(String(changes.status)))return res.status(400).json({error:'Estado inválido.'});if(user.role==='ASESOR'&&planAdvisorIds(current).length>1)return res.status(403).json({error:'El estado de un plan grupal lo actualiza el responsable.'});if(user.role==='ASESOR'&&changes.status&&!['EN_CURSO','COMPLETADO'].includes(String(changes.status)))return res.status(403).json({error:'El asesor sólo puede iniciar o completar su plan.'});const requestedIds=user.role==='ADMINISTRADOR'&&(Array.isArray(changes.advisorIds)||changes.advisorId)?[...new Set((Array.isArray(changes.advisorIds)?changes.advisorIds:[changes.advisorId]).map(String).filter(Boolean))]:planAdvisorIds(current);if(user.role==='ADMINISTRADOR'&&(changes.advisorIds!==undefined||changes.advisorId!==undefined)){if(!requestedIds.length||requestedIds.length>100||requestedIds.some(id=>!canAccessPlanAdvisor(user,id,directory)))return res.status(400).json({error:'Selecciona asesores válidos.'});const group=requestedIds.map(id=>directory.advisors.find(item=>item.id===id)!);if(group.some(advisor=>advisor.campaignId!==group[0].campaignId||advisor.operationId!==group[0].operationId||advisor.supervisorId!==group[0].supervisorId))return res.status(400).json({error:'Los asesores del grupo deben pertenecer a la misma operación y supervisor.'});changes.advisorIds=requestedIds;changes.advisorId=requestedIds[0];}if(changes.advisorMetrics){try{changes.advisorMetrics=planMetrics(changes.advisorMetrics,requestedIds,user.role!=='ADMINISTRADOR');}catch(error:any){return res.status(400).json({error:error.message});}}const plan={...current,...changes,id:current.id,updatedAt:new Date().toISOString(),updatedBy:user.id};try{if(supabaseStorage.enabled){const saved=await supabaseStorage.updateActionPlan(current.id,plan);if(!saved)return res.status(404).json({error:'Plan no encontrado.'});}else await saveFallbackActionPlans(plans.map((item:any)=>item.id===current.id?plan:item));res.json({plan});}catch(error){console.error('[action-plans] No fue posible actualizar el plan.',error);res.status(502).json({error:'No fue posible actualizar el plan.'});}});
  app.delete('/api/action-plans/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!['ADMINISTRADOR','CONSULTOR','SUPERVISOR'].includes(user.role))return res.status(403).json({error:'No tienes permiso para eliminar planes.'});const plans=await loadActionPlans(),current=plans.find((item:any)=>item.id===req.params.id),directory=await readRepository();if(!current||!canAccessActionPlan(user,current,directory))return res.status(404).json({error:'Plan no encontrado en tu alcance.'});try{if(supabaseStorage.enabled){if(!await supabaseStorage.deleteActionPlan(current.id))return res.status(404).json({error:'Plan no encontrado.'});}else await saveFallbackActionPlans(plans.filter((item:any)=>item.id!==current.id));res.json({ok:true});}catch(error){console.error('[action-plans] No fue posible eliminar el plan.',error);res.status(502).json({error:'No fue posible eliminar el plan de acción.'});}});
  const visibleAlerts = (items:any[], user:User, directory:SharedRepository) => {
    if (qualityManagers.has(user.role)) return items.filter(item=>scopedRecord(user,item));
    if (user.role === 'SUPERVISOR') { const team=teamAdvisorIds(user,directory), campaigns=new Set(directory.advisors.filter(a=>team.has(a.id)).map(a=>a.campaignId)); return items.filter(item=>item.supervisorIds.includes(user.id)||team.has(item.advisorId)||campaigns.has(item.campaignId)); }
    if (user.role === 'ASESOR') return items.filter(item=>isAlertActive(item)&&Boolean(user.advisorId)&&item.advisorId===user.advisorId).map(({ supervisorResponses,managementDetail,evidenceUrl,feedbackPerformed,managedAt,elapsedMinutes,...safe })=>safe);
    return [];
  };
  const loadVisibleEvaluations = async () => { let rows=(db.prepare('SELECT payload_json FROM evaluations').all() as any[]).flatMap(r=>{try{return[JSON.parse(r.payload_json)]}catch{return[]}}); if(googleStorage.enabled)try{const primary=await googleStorage.loadEvaluations();rows=supabaseStorage.enabled?primary:uniqueEvaluations([...primary,...rows]);}catch{} return rows; };
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
    const advisor=directory.advisors.find(a=>a.id===body.advisorId); if(!advisor||advisor.campaignId!==body.campaignId)return res.status(400).json({error:'El asesor y la campaña no coinciden.'});
    const operationId=advisor.operationId||`op_legacy_${advisor.campaignId}`;
    const isActiveSupervisor=(id:string)=>directory.users.some(u=>u.id===id&&u.role==='SUPERVISOR'&&u.status==='ACTIVO');
    const requestedSupervisorIds=(Array.isArray(body.supervisorIds)?body.supervisorIds:[body.supervisorId||advisor.supervisorId]).filter(Boolean).map(String);
    let supervisorIds=[...new Set(requestedSupervisorIds.filter(isActiveSupervisor))];
    if(!supervisorIds.length)supervisorIds=[...new Set((directory.operationSupervisors||[]).filter(item=>item.operationId===operationId&&item.active&&isActiveSupervisor(item.supervisorId)).map(item=>item.supervisorId))];
    if(!supervisorIds.length)return res.status(400).json({error:'La operación no tiene supervisores activos. Asígnala antes de publicar la alerta.'});
    const now = new Date().toISOString(); const alert:any = { id:`alert_${randomBytes(8).toString('hex')}`,title:String(body.title).trim(),audioUrl:body.audioUrl || undefined,audioFileName:body.audioFileName||undefined,audioFileSize:Number(body.audioFileSize||0)||undefined,audioDurationSeconds:Number(body.audioDurationSeconds||0)||undefined,audioMimeType:body.audioMimeType||undefined,contactNumber:String(body.contactNumber || ''),detail:String(body.detail).trim(),advisorId:body.advisorId,supervisorId:supervisorIds[0],supervisorIds,supervisorResponses:[],campaignId:body.campaignId,operationId,validUntil:body.validUntil,criticality:['BAJA','MEDIA','ALTA','CRITICA'].includes(body.criticality)?body.criticality:'MEDIA',status:'NUEVA',publishedAt:now,createdBy:user.id,updatedAt:now };
    const operation=directory.operations?.find(item=>item.id===operationId);alert.companyId=operation?.companyId;
    if(!scopedRecord(user,alert))return res.status(404).json({error:'Asesor no encontrado en tu alcance.'});
    try {
      persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert);
      try {
        const advisor = directory.advisors.find(item => item.id === alert.advisorId);
        const campaign = directory.campaigns.find(item => item.id === alert.campaignId);
        const supervisors = directory.users.filter(item => alert.supervisorIds.includes(item.id) && item.role === 'SUPERVISOR' && item.status === 'ACTIVO' && item.email);
        if (advisor) { const results=await Promise.allSettled(supervisors.map(supervisor=>emailService.sendSupervisorNotification({ recipient: supervisor.email, subject: `Calidad y Mejora Continua: Nueva Alerta | ${advisor.name} - ${campaign?.name || 'Sin campaña'}`, title: 'Nueva alerta de calidad', description: `${alert.title}. Criticidad: ${alert.criticality}.`, advisorName: advisor.name, campaignName: campaign?.name || 'Sin campaña', actionLabel: 'Ver alerta', path: `/?section=quality_alerts&alertId=${encodeURIComponent(alert.id)}` })));if(results.some(result=>result.status==='rejected'))console.error('[email] Uno o más supervisores no recibieron la alerta.'); }
      } catch (mailError) { console.error('[email] La alerta se guardó, pero no se notificó al supervisor.', mailError instanceof Error ? mailError.message : ''); }
      res.status(201).json({ alert });
    } catch (error) { console.error('[quality-alerts] No fue posible guardar la alerta.',error instanceof Error?error.message:''); res.status(502).json({ error:'No fue posible guardar la alerta. Intenta nuevamente.' }); }
  });
  app.patch('/api/quality-alerts/:id', requireAuth, async (req, res) => {
    const user = (req as any).authUser as User; let items = await loadAlerts();
    const current = items.find(item => item.id === req.params.id); if (!current || !scopedRecord(user,current)) return res.status(404).json({ error:'Alerta no encontrada.' });
    const isAssigned = user.role === 'SUPERVISOR' && current.supervisorIds.includes(user.id); if (!isAssigned && !qualityManagers.has(user.role)) return res.status(403).json({ error:'No puedes gestionar esta alerta.' });
    const body=req.body||{}; const now=new Date().toISOString(); const nextStatus=body.status || current.status;
    if (qualityManagers.has(user.role) && nextStatus !== current.status) return res.status(403).json({ error:'El cierre de una alerta corresponde únicamente al supervisor asignado.' });
    if (isAssigned && !['PENDIENTE_GESTION','GESTIONADA','CERRADA'].includes(nextStatus)) return res.status(403).json({ error:'El supervisor solo puede gestionar o cerrar la alerta.' });
    if (nextStatus === 'CERRADA' && (!body.feedbackPerformed || !String(body.managementDetail || '').trim())) return res.status(400).json({ error:'Para cerrar registra el texto del feedback. La imagen es opcional.' });
    const editable=['title','audioUrl','audioFileName','audioFileSize','audioDurationSeconds','audioMimeType','contactNumber','detail','advisorId','campaignId','validUntil','criticality']; if(qualityManagers.has(user.role)){const changes=Object.fromEntries(editable.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));const alert={...current,...changes,status:current.status,closedAt:current.closedAt,updatedAt:now};try{persistAlert(alert);if(googleStorage.enabled)await googleStorage.saveQualityAlert(alert);return res.json({alert});}catch{return res.status(502).json({error:'No fue posible actualizar la alerta.'});}}
    const managedAt=['GESTIONADA','CERRADA'].includes(nextStatus)?now:undefined,detail=String(body.managementDetail||'').trim(),evidenceUrl=body.evidenceUrl||undefined; const response={supervisorId:user.id,status:nextStatus,feedbackPerformed:['GESTIONADA','CERRADA'].includes(nextStatus),managementDetail:detail,evidenceUrl,managedAt,elapsedMinutes:managedAt?Math.max(0,Math.round((new Date(managedAt).getTime()-new Date(current.publishedAt).getTime())/60000)):undefined,updatedAt:now}; const responses=[...current.supervisorResponses.filter((r:any)=>r.supervisorId!==user.id),response]; const alert={...current,status:nextStatus,feedbackPerformed:response.feedbackPerformed,managementDetail:detail||current.managementDetail,evidenceUrl:evidenceUrl||current.evidenceUrl,managedAt:managedAt||current.managedAt,elapsedMinutes:response.elapsedMinutes??current.elapsedMinutes,closedAt:nextStatus==='CERRADA'?now:current.closedAt,closedBy:nextStatus==='CERRADA'?user.id:current.closedBy,supervisorResponses:responses,updatedAt:now};
    try { persistAlert(alert); if (googleStorage.enabled) await googleStorage.saveQualityAlert(alert); res.json({ alert }); } catch { res.status(502).json({ error:'No fue posible actualizar la alerta.' }); }
  });
  app.delete('/api/quality-alerts/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!qualityManagers.has(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadAlerts()).find(i=>i.id===req.params.id);if(!current||!scopedRecord(user,current))return res.status(404).json({error:'Alerta no encontrada.'});db.prepare('DELETE FROM quality_alerts WHERE id=?').run(current.id);if(googleStorage.enabled)await googleStorage.deleteQualityAlert(current.id);res.json({ok:true});});
  app.get('/api/quality-alerts/:id/audio',requireAuth,async(req,res)=>{const user=(req as any).authUser as User,directory=await readRepository(),alert=(await loadAlerts()).find(i=>i.id===req.params.id);if(!alert||!visibleAlerts([alert],user,directory).length||!alert.audioUrl)return res.status(404).json({error:'Audio no encontrado.'});const fileId=String(alert.audioUrl).match(/\/api\/files\/([^/]+)\/content/)?.[1];if(!fileId)return res.status(404).json({error:'Audio no encontrado.'});try{const storage=fileStorageFor(fileId),file=await storage.fileMetadata(fileId),stream=await storage.downloadFile(fileId);res.set({'Content-Type':file.mimeType||'audio/mpeg','Content-Disposition':`inline; filename="${String(file.name||'audio.mp3').replace(/[\\\r\n"]/g,'_')}"`,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});stream.pipe(res);}catch{res.status(404).json({error:'Audio no encontrado.'});}});

  const loadCalibrations=async()=>{let rows=calibrationRows();try{const remote=googleStorage.enabled?await googleStorage.loadCalibrations():[];if(remote.length){rows=remote;remote.forEach(persistCalibration);}}catch{}const now=Date.now();for(const item of rows){if(['PROGRAMADA','EN_VIVO'].includes(item.status)&&item.dueAt&&new Date(item.dueAt).getTime()<=now){const participants=(item.participants||[]).map((p:any)=>p.response?p:{...p,status:'VENCIDA',expiredAt:new Date().toISOString()});const expired={...item,status:'FINALIZADA',participants,expiredAt:new Date().toISOString(),updatedAt:new Date().toISOString(),audit:[...(item.audit||[]),{action:'VENCIDA',userId:'SYSTEM',at:new Date().toISOString()}]};await saveCalibration(expired);Object.assign(item,expired);}}return rows;};
  const saveCalibration=async(item:any)=>{persistCalibration(item);if(googleStorage.enabled)await googleStorage.saveCalibration(item);};
  const calibrationManagers=(role:string)=>['ADMINISTRADOR','CONSULTOR'].includes(role);
  app.use('/api/calibrations',requireAuth,async(req,res,next)=>{const user=(req as any).authUser as User;if(req.method==='GET'||!calibrationManagers(user.role)||isGlobalActor(user))return next();const id=req.path.split('/').filter(Boolean)[0];const item=!id?req.body?.evaluation:(await loadCalibrations()).find(row=>row.id===id);if(!item||!scopedRecord(user,item))return res.status(404).json({error:'Calibración no encontrada en tu alcance.'});next();});
  const responseScore=(answers:Record<string,string>,items:any[]=[])=>{const applicable=items.filter(item=>answers[item.criterionId]&&answers[item.criterionId]!=='NO_APLICA');const total=applicable.reduce((sum,item)=>sum+Number(item.qualityGuideline?.weight||1),0);return total?Math.round(applicable.reduce((sum,item)=>sum+(answers[item.criterionId]==='CUMPLE'?Number(item.qualityGuideline?.weight||1):0),0)/total*100):0;};
  app.use(['/api/reports','/api/admin/calibration-kpi'],requireAuth,(req,res,next)=>{const user=(req as any).authUser as User;if(['ADMINISTRADOR','CONSULTOR'].includes(user.role)&&!isGlobalActor(user))return res.status(403).json({error:'Este reporte global requiere alcance global.'});next();});
  // @ts-ignore Los identificadores se normalizan a texto al persistir.
  // Agreement Rev.3: coincidencias exactas / atributos aplicables. No mezcla nota ni tipificación.
  const withAffinity=(item:any)=>{const expert=item.expertResponse;if(!expert)return item;const participants=(item.participants||[]).map((p:any)=>{if(!p.response)return p;const keys=Object.keys(expert.answers||{}).filter(key=>Object.prototype.hasOwnProperty.call(p.response.answers||{},key));const matches=keys.filter(key=>p.response.answers[key]===expert.answers[key]).length;const agreement=keys.length?Math.round(matches/keys.length*1000)/10:0;const differences=keys.filter(key=>p.response.answers[key]!==expert.answers[key]).map(key=>item.attributeLabels?.[key]||key);return{...p,answers:p.response.answers,agreement,affinity:agreement,affinityLevel:agreement>=90?'Muy calibrado':agreement>=80?'Calibrado':agreement>=70?'Requiere ajuste':'No calibrado',deviation:Math.round((Number(p.response.score)-Number(expert.score))*10)/10,mainDifferences:differences.slice(0,5)};});return{...item,participants};};
  const audited=(item:any,action:string,userId:string,extra:any={})=>({...item,...extra,audit:[...(item.audit||[]),{action,userId,at:new Date().toISOString()}],updatedAt:new Date().toISOString()});
  app.get('/api/calibrations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(['ASESOR','GERENCIA','MONITOR'].includes(user.role))return res.json({calibrations:[]});let rows=(await loadCalibrations()).map(withAffinity).filter(item=>scopedRecord(user,item));if(['SUPERVISOR','FORMADOR'].includes(user.role))rows=rows.filter(i=>i.expertId===user.id||i.participants?.some((p:any)=>p.supervisorId===user.id));rows=rows.map(i=>{if(calibrationManagers(user.role)||i.status==='CERRADA')return i;const{expertResponse,officialAnswers,results,...safe}=i;return safe;});res.json({calibrations:rows});});
  app.post('/api/calibrations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const b=req.body||{},e=b.evaluation,repo=repository(),participantIds=[...new Set((b.participantIds||b.supervisorIds||[]).filter(Boolean))] as string[];if(!e?.id||e.evaluationType!=='QUALITY')return res.status(400).json({error:'Selecciona una evaluación de Calidad.'});if(!b.expertId||!repo.users.some(u=>u.id===b.expertId&&u.status==='ACTIVO'))return res.status(400).json({error:'Selecciona un Referente Experto activo.'});const validIds=participantIds.filter(id=>id!==b.expertId&&repo.users.some(u=>u.id===id&&u.status==='ACTIVO'));if(!validIds.length)return res.status(400).json({error:'Selecciona participantes activos.'});const now=new Date().toISOString(),labels=Object.fromEntries((e.items||[]).map((x:any)=>[x.criterionId,x.qualityGuideline?.name||x.attribute||x.criterionId])),item={id:`cal_${randomBytes(8).toString('hex')}`,evaluationId:e.id,campaignId:e.campaignId,operationId:e.operationId||`op_legacy_${e.campaignId}`,title:String(b.title||`Calibración ${e.callId}`),description:String(b.description||''),callType:b.callType||(e.sale?'VENTA':'NO_VENTA'),scheduledAt:b.scheduledAt||'',dueAt:b.dueAt||'',status:'BORRADOR',expertId:b.expertId,participants:validIds.map(supervisorId=>({supervisorId,status:'PENDIENTE'})),attributeLabels:labels,caseSnapshot:{callId:e.callId,date:e.date,time:e.time,advisorId:e.advisorId,operationId:e.operationId||`op_legacy_${e.campaignId}`,product:e.product,typification:e.noSaleReason||e.saleResult,result:e.qualityResult,observation:b.observation||e.comments,audioUrl:e.audioUrl,audioFileName:e.audioFileName,audioDurationSeconds:e.audioDurationSeconds,items:e.items||[]},createdBy:user.id,createdAt:now,updatedAt:now,audit:[{action:'CREADA',userId:user.id,at:now}]};try{await saveCalibration(item);res.status(201).json({calibration:item});}catch{res.status(502).json({error:'No fue posible crear la calibración.'});}});
  app.patch('/api/calibrations/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(['CERRADA','ANULADA'].includes(current.status)&&user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede corregir registros cerrados o anulados.'});const allowed=['title','description','callType','scheduledAt','dueAt','expertId','participants'],changes=Object.fromEntries(allowed.filter(k=>req.body?.[k]!==undefined).map(k=>[k,req.body[k]]));if(changes.participants)changes.participants=(changes.participants as any[]).filter(p=>p.supervisorId!==(changes.expertId||current.expertId));const next=audited(current,'EDITADA',user.id,changes);await saveCalibration(next);res.json({calibration:next});});
  app.patch('/api/calibrations/:id/state',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(['CERRADA','ANULADA'].includes(current.status)&&user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede corregir este estado.'});const target=String(req.body?.status||''),transitions:Record<string,string[]>={BORRADOR:['PROGRAMADA','ANULADA'],PROGRAMADA:['EN_VIVO','ANULADA'],EN_VIVO:['FINALIZADA','ANULADA'],FINALIZADA:['CERRADA','ANULADA'],CERRADA:[],ANULADA:[]};if(!(transitions[current.status]||[]).includes(target)&&user.role!=='ADMINISTRADOR')return res.status(400).json({error:'Transición no permitida.'});if(target==='EN_VIVO'&&(!current.title||!current.campaignId||!current.caseSnapshot?.callId||!current.caseSnapshot?.audioUrl||!current.expertId||!current.participants?.length))return res.status(400).json({error:'Completa obligatorios, audio, referente y participantes.'});if(target==='CERRADA'&&!current.expertResponse)return res.status(400).json({error:'No se puede cerrar sin evaluación del Referente Experto.'});let next=withAffinity(audited(current,target,user.id,{status:target}));if(target==='CERRADA'){const values=next.participants.filter((p:any)=>p.affinity!==undefined).map((p:any)=>p.affinity);next={...next,results:{patternScore:next.expertResponse.score,averageAffinity:values.length?Math.round(values.reduce((a:number,b:number)=>a+b,0)/values.length*10)/10:0,highestAffinity:values.length?Math.max(...values):0,lowestAffinity:values.length?Math.min(...values):0,closedAt:new Date().toISOString()}};}await saveCalibration(next);res.json({calibration:next});});
  app.post('/api/calibrations/:id/invitations',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!calibrationManagers(user.role))return res.status(403).json({error:'Acceso denegado.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(!['PROGRAMADA','EN_VIVO'].includes(current.status))return res.status(400).json({error:'La calibración debe estar programada o en vivo.'});const repo=await readRepository(),campaign=repo.campaigns.find(c=>c.id===current.campaignId);const sent:any[]=[];const participants=[];for(const p of current.participants||[]){const recipient=repo.users.find(u=>u.id===p.supervisorId&&u.status==='ACTIVO');try{if(!recipient?.email)throw new Error('Correo no configurado.');const ok=await emailService.sendSupervisorNotification({recipient:recipient.email,subject:`Calidad y Mejora Continua: Invitación a calibración | ${current.title}`,title:'Invitación a calibración',description:`Tienes una calibración asignada. Fecha límite: ${current.dueAt||'sin plazo'}.`,advisorName:current.caseSnapshot?.advisorId||'Caso de calibración',campaignName:campaign?.name||'Sin campaña',actionLabel:'Abrir calibración',path:`/?section=calibrations&calibrationId=${encodeURIComponent(current.id)}`});if(!ok)throw new Error('Servicio de correo no disponible.');participants.push({...p,status:p.response?'RESPONDIDA':'SENT',sentAt:new Date().toISOString(),inviteError:undefined});sent.push({supervisorId:p.supervisorId,sent:true});}catch(error:any){participants.push({...p,status:p.response?'RESPONDIDA':'PENDIENTE',inviteError:error.message||'No fue posible enviar'});sent.push({supervisorId:p.supervisorId,sent:false});}}const next=audited(current,'INVITACIONES_ENVIADAS',user.id,{participants});await saveCalibration(next);res.json({calibration:next,results:sent});});
  app.patch('/api/calibrations/:id/respond',requireAuth,async(req,res)=>{const user=(req as any).authUser as User,current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});if(current.status!=='EN_VIVO')return res.status(400).json({error:'Solo se puede responder durante En vivo.'});const participant=current.participants?.find((p:any)=>p.supervisorId===user.id),isExpert=current.expertId===user.id;if(!participant&&!isExpert)return res.status(403).json({error:'No estás asignado.'});if((isExpert&&current.expertResponse)||participant?.response)return res.status(409).json({error:'La evaluación ya fue enviada y está bloqueada.'});const answers=req.body?.answers||{},keys=Object.keys(current.attributeLabels||{});if(!keys.length||keys.some(k=>!answers[k]))return res.status(400).json({error:'Responde todos los ítems.'});const response={answers,comments:req.body.comments||{},typification:String(req.body.typification||''),observation:String(req.body.observation||''),criticalIds:req.body.criticalIds||[],score:responseScore(answers,current.caseSnapshot?.items||[]),submittedAt:new Date().toISOString()};let next=isExpert?audited(current,'PATRON_ENVIADO',user.id,{expertResponse:response}):audited(current,'RESPUESTA_ENVIADA',user.id,{participants:current.participants.map((p:any)=>p.supervisorId===user.id?{...p,status:'RESPONDIDA',response,answers,submittedAt:response.submittedAt}:p)});next=withAffinity(next);await saveCalibration(next);const{expertResponse,...safe}=next;res.json({calibration:isExpert||calibrationManagers(user.role)?next:safe});});
  app.delete('/api/calibrations/:id',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(user.role!=='ADMINISTRADOR')return res.status(403).json({error:'Solo Admin puede eliminar.'});const current=(await loadCalibrations()).find(i=>i.id===req.params.id);if(!current)return res.status(404).json({error:'Calibración no encontrada.'});db.prepare('DELETE FROM calibrations WHERE id=?').run(current.id);if(googleStorage.enabled)await googleStorage.deleteCalibration(current.id);res.json({ok:true});});
  app.get('/api/reports/:kind.xlsx',requireAuth,async(req,res)=>{const user=(req as any).authUser as User;if(!['ADMINISTRADOR','CONSULTOR','SUPERVISOR'].includes(user.role))return res.status(403).json({error:'Acceso denegado.'});const kind=String(req.params.kind),repo=await readRepository(),team=user.role==='SUPERVISOR'?teamAdvisorIds(user,repo):null;const evaluations=(await loadVisibleEvaluations()).filter(e=>(!team||team.has(e.advisorId))&&(user.role!=='SUPERVISOR'||normalizedValidationStatus(e)==='VALIDATED'));const commitments=(db.prepare('SELECT * FROM evaluation_commitments').all() as any[]).filter(c=>!team||team.has(c.advisor_id));if(!['evaluations','commitments','calibrations','alerts'].includes(kind))return res.status(404).json({error:'Reporte no encontrado.'});if(kind==='alerts'&&user.role==='SUPERVISOR')return res.status(403).json({error:'Solo Admin puede exportar alertas.'});let rows:any[]=[];if(kind==='evaluations')rows=evaluations.map(e=>({Fecha:e.date,Asesor:repo.advisors.find(a=>a.id===e.advisorId)?.name||e.sourceAdvisorName||e.advisorId,Campaña:repo.campaigns.find(c=>c.id===e.campaignId)?.name||e.sourceCampaignName||e.campaignId,Supervisor:repo.users.find(u=>u.id===e.supervisorId)?.name||e.supervisorId,Nota:Number(e.technicalScore??e.scoreTotal??0),Validación:normalizedValidationStatus(e),Origen:e.origin==='SPEECH_ANALYTICS'?'SA':e.origin||'MANUAL'}));if(kind==='commitments')rows=commitments.map(c=>({Asesor:repo.advisors.find(a=>a.id===c.advisor_id)?.name||c.advisor_id,Compromiso:c.commitment,Fecha:c.commitment_date,Estado:c.commitment_date<new Date().toISOString().slice(0,10)?'VENCIDO':'EN_CURSO'}));if(kind==='calibrations'){let calibrations=(await loadCalibrations()).filter(c=>scopedRecord(user,c));if(user.role==='SUPERVISOR')calibrations=calibrations.filter(c=>c.expertId===user.id||c.participants?.some((p:any)=>p.supervisorId===user.id));rows=calibrations.flatMap(c=>(c.participants||[]).filter((p:any)=>user.role!=='SUPERVISOR'||p.supervisorId===user.id).map((p:any)=>({Sesión:c.title,Fecha:c.createdAt,Caso:c.caseSnapshot?.callId||c.evaluationId,Supervisor:repo.users.find(u=>u.id===p.supervisorId)?.name||p.supervisorId,Estado:p.status,Agreement:Number(p.agreement??'')||'',Campaña:repo.campaigns.find(x=>x.id===c.campaignId)?.name||c.campaignId})));}if(kind==='alerts')rows=(await loadAlerts()).map(a=>({Alerta:a.title,Campaña:repo.campaigns.find(c=>c.id===a.campaignId)?.name||a.campaignId,Asesor:repo.advisors.find(x=>x.id===a.advisorId)?.name||a.advisorId,Supervisor:repo.users.find(x=>x.id===a.supervisorId)?.name||a.supervisorId,Vigencia:a.validUntil,Criticidad:a.criticality,Estado:a.status,Detalle:a.detail,Publicado:a.publishedAt}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Reporte');const output=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${kind}-${new Date().toISOString().slice(0,10)}.xlsx"`});res.end(output);});
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

  // Readiness verifica el repositorio principal sin exponer secretos.
  const health=async(_req:express.Request,res:express.Response)=>{let database:any={configured:supabaseStorage.enabled,ok:!supabaseStorage.enabled};try{if(supabaseStorage.enabled)database={configured:true,...await supabaseStorage.health()};}catch{database={configured:true,ok:false};}const media=await supabaseFileStorage.health();const required=process.env.REQUIRE_SUPABASE==='true';const healthy=database.ok&&(!required||media.ok);return res.status(required&&!healthy?503:200).json({status:healthy||!required?'ok':'degraded',database,media,legacyDrive:{configured:googleDriveStorage.driveEnabled},sheetsFallback:{enabled:legacySheetsAllowed,configured:googleDriveStorage.sheetsEnabled}});};
  app.get('/health', health);
  app.get('/api/health', health);

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
