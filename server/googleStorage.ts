import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { readPlatformStateRows } from './platformStateRecovery';
import type { Advisor, Campaign, Company, Operation, OperationAssignment, OperationSupervisor, StaffingMovement, Team, User } from '../src/types';

export type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[]; companies?:Company[]; operations?:Operation[]; operationSupervisors?:OperationSupervisor[]; operationAssignments?:OperationAssignment[]; staffingMovements?:StaffingMovement[] };
export type AuthUserRecord = { id: string; name: string; email: string; username?: string; role: User['role']; status: User['status']; teamId?: string; advisorId?: string; advisorDni?: string; avatar?: string; createdAt: string; passwordHash: string; mustChangePassword: boolean };

const SHEETS = {
  USERS: ['id', 'name', 'email', 'username', 'role', 'status', 'team_id', 'advisor_id', 'avatar', 'created_at', 'password_hash', 'must_change_password'],
  CAMPAIGNS: ['id', 'name', 'client', 'status', 'products_json', 'description', 'quality_guidelines_json', 'quality_criterion_weights_json', 'quality_critical_errors_json', 'background_image'],
  TEAMS: ['id', 'campaign_id', 'supervisor_id', 'name'],
  ADVISORS: ['id', 'dni', 'employee_code', 'name', 'campaign_id', 'team_id', 'supervisor_id', 'data_json'],
  COMPANIES: ['id', 'name', 'status', 'created_at', 'updated_at'],
  OPERATIONS: ['id', 'company_id', 'campaign_id', 'name', 'normalized_name', 'status', 'legacy', 'created_at', 'updated_at', 'closed_at', 'version', 'metadata_json'],
  OPERATION_SUPERVISORS: ['operation_id', 'supervisor_id', 'active', 'start_at', 'end_at'],
  OPERATION_ASSIGNMENTS: ['id', 'advisor_id', 'operation_id', 'team_id', 'supervisor_id', 'role', 'operational_status', 'start_date', 'end_date', 'active', 'source', 'actor_id', 'observation'],
  STAFFING_MOVEMENTS: ['id', 'advisor_id', 'assignment_id', 'type', 'effective_at', 'created_at', 'origin', 'destination', 'actor_id', 'observation', 'reversed_movement_id'],
  EVALUATIONS: ['id', 'advisor_id', 'evaluator_id', 'evaluation_type', 'evaluated_at', 'payload_json', 'created_at'],
  FEEDBACKS: ['feedback_id', 'evaluation_id', 'advisor_id', 'supervisor_id', 'evaluator_id', 'evaluation_type', 'feedback_text', 'advisor_response', 'advisor_evidence_url', 'supervisor_closure_comment', 'status', 'created_at', 'advisor_action_at', 'closed_at', 'updated_at'],
  APP_STATE: ['id', 'payload_json', 'updated_at'],
  DEVELOPMENT_CAPSULES: ['id', 'status', 'data_json', 'created_at', 'updated_at'],
  DEVELOPMENT_ASSIGNMENTS: ['id', 'capsule_id', 'advisor_id', 'status', 'data_json', 'created_at', 'updated_at'],
  QUALITY_ALERTS: ['id', 'status', 'advisor_id', 'supervisor_id', 'campaign_id', 'data_json', 'created_at', 'updated_at'],
  CALIBRATIONS: ['id', 'status', 'evaluation_id', 'campaign_id', 'data_json', 'created_at', 'updated_at'],
  SESSIONS: ['token', 'user_id', 'created_at']
} as const;

type SheetName = keyof typeof SHEETS;
type Row = Record<string, string | null | undefined>;
const log = (message: string, error?: unknown) => console.error(`[google-storage] ${message}`, error instanceof Error ? error.message : '');
const configured = () => Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
const clean = (value: unknown) => value == null ? '' : String(value);

class GoogleStorage {
  private bootstrapPromise?: Promise<boolean>;
  // A dashboard can request the same data more than once while React mounts.
  // Keep short-lived, per-sheet results and coalesce in-flight requests so that
  // one browser refresh cannot exhaust the Sheets per-user read quota.
  private readonly rowsCache = new Map<SheetName, { expiresAt: number; rows: Row[] }>();
  private readonly rowsLoading = new Map<SheetName, Promise<Row[]>>();
  private readonly rowsCacheTtlMs = 30_000;
  get enabled() { return configured(); }
  private auth() {
    if (!this.enabled) throw new Error('Google Storage no está configurado.');
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return auth;
  }
  private sheets() { return google.sheets({ version: 'v4', auth: this.auth() }); }
  private drive() { return google.drive({ version: 'v3', auth: this.auth() }); }
  private quote(name: string) { return `'${name.replaceAll("'", "''")}'`; }

  async bootstrap() {
    if (!this.enabled) return false;
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.bootstrapPromise = this.bootstrapSheets();
    try { return await this.bootstrapPromise; }
    catch (error) { this.bootstrapPromise = undefined; throw error; }
  }

  private async bootstrapSheets() {
    const sheets = this.sheets();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    const current = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(title))' });
    const names = new Set(current.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean));
    const missing = (Object.keys(SHEETS) as SheetName[]).filter(name => !names.has(name));
    if (missing.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map(title => ({ addSheet: { properties: { title } } })) } });
    const sheetNames = Object.keys(SHEETS) as SheetName[];
    // Read all header rows in one API operation instead of one request per
    // sheet. This changes a cold start from roughly twenty reads to two.
    const headerRanges = sheetNames.map(name => `${this.quote(name)}!A1:ZZ1`);
    const headersResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: headerRanges });
    const pendingHeaders = sheetNames.flatMap((name, index) => {
      const currentHeaders = headersResponse.data.valueRanges?.[index]?.values?.[0] || [];
      return !currentHeaders.length || (SHEETS[name] as readonly string[]).some(header => !currentHeaders.includes(header))
        ? [{ range: `${this.quote(name)}!A1`, values: [SHEETS[name] as unknown as string[]] }]
        : [];
    });
    if (pendingHeaders.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: pendingHeaders } });
    return true;
  }

  private async rows(name: SheetName): Promise<Row[] | null> {
    if (!this.enabled) return null;
    const cached = this.rowsCache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const loading = this.rowsLoading.get(name);
    if (loading) return loading;
    const load = (async () => {
      await this.bootstrap();
      const result = await this.sheets().spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID!, range: `${this.quote(name)}!A:ZZ` });
      const [headers = [], ...values] = result.data.values || [];
      const rows = headers.length ? values.filter(row => row.some(value => clean(value))).map(row => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))) : [];
      this.rowsCache.set(name, { rows, expiresAt: Date.now() + this.rowsCacheTtlMs });
      return rows;
    })();
    this.rowsLoading.set(name, load);
    try { return await load; }
    finally { this.rowsLoading.delete(name); }
  }

  private async replace(name: SheetName, rows: Row[]) {
    if (!this.enabled) return;
    if (name === 'EVALUATIONS') throw new Error('EVALUATIONS no admite reemplazos completos. Usa guardado por fila para proteger el historial.');
    await this.bootstrap();
    const headers = SHEETS[name] as unknown as string[];
    const values = [headers, ...rows.map(row => headers.map(header => clean(row[header])))];
    const sheets = this.sheets();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${this.quote(name)}!A:ZZ` });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${this.quote(name)}!A1`, valueInputOption: 'RAW', requestBody: { values } });
    this.rowsCache.delete(name);
  }

  private async upsert(name: SheetName, key: string, row: Row) {
    // Never mutate a cached read before the replacement has actually reached
    // Sheets; a failed write must leave the last known-good cache intact.
    const rows = (await this.rows(name) || []).map(item => ({ ...item }));
    const index = rows.findIndex(item => item[key] === clean(row[key]));
    if (index < 0) rows.push(row); else rows[index] = { ...rows[index], ...row };
    await this.replace(name, rows);
  }

  async loadRepository(): Promise<SharedRepository | null> {
    if (!this.enabled) return null;
    const [users, campaigns, teams, advisors, companies, operations, operationSupervisors, operationAssignments, staffingMovements] = await Promise.all(['USERS', 'CAMPAIGNS', 'TEAMS', 'ADVISORS', 'COMPANIES', 'OPERATIONS', 'OPERATION_SUPERVISORS', 'OPERATION_ASSIGNMENTS', 'STAFFING_MOVEMENTS'].map(name => this.rows(name as SheetName)));
    if (![users, campaigns, teams, advisors].every(Boolean)) return null;
    return {
      users: users!.map(row => ({ id: row.id!, name: row.name!, email: row.email!, username: row.username || undefined, role: row.role as User['role'], status: row.status as User['status'], teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at!, password: undefined, mustChangePassword: row.must_change_password !== '0' })),
      campaigns: campaigns!.map(row => ({ id: row.id!, name: row.name!, client: row.client!, status: row.status as Campaign['status'], products: JSON.parse(row.products_json || '[]'), description: row.description || undefined, backgroundImage: row.background_image || undefined, qualityGuidelines: JSON.parse(row.quality_guidelines_json || '[]'), qualityCriterionWeights: JSON.parse(row.quality_criterion_weights_json || 'null') || undefined, qualityCriticalErrors: JSON.parse(row.quality_critical_errors_json || '[]') })),
      teams: teams!.map(row => ({ id: row.id!, campaignId: row.campaign_id!, supervisorId: row.supervisor_id!, name: row.name! })),
      advisors: advisors!.map(row => JSON.parse(row.data_json || '{}') as Advisor),
      companies: (companies || []).map(row => ({id:row.id!,name:row.name!,status:row.status as Company['status'],createdAt:row.created_at!,updatedAt:row.updated_at||undefined})),
      operations: (operations || []).map(row => ({id:row.id!,companyId:row.company_id!,campaignId:row.campaign_id!,name:row.name!,normalizedName:row.normalized_name||undefined,status:row.status as Operation['status'],legacy:row.legacy==='1',createdAt:row.created_at||undefined,updatedAt:row.updated_at||undefined,closedAt:row.closed_at||undefined,version:Number(row.version||1),metadata:JSON.parse(row.metadata_json||'{}')})),
      operationSupervisors: (operationSupervisors || []).map(row => ({operationId:row.operation_id!,supervisorId:row.supervisor_id!,active:row.active==='1',startAt:row.start_at!,endAt:row.end_at||undefined})),
      operationAssignments: (operationAssignments || []).map(row => ({id:row.id!,advisorId:row.advisor_id!,operationId:row.operation_id!,teamId:row.team_id||undefined,supervisorId:row.supervisor_id||undefined,role:row.role as User['role'],operationalStatus:row.operational_status as OperationAssignment['operationalStatus'],startDate:row.start_date!,endDate:row.end_date||undefined,active:row.active==='1',source:row.source as OperationAssignment['source'],actorId:row.actor_id||undefined,observation:row.observation||undefined})),
      staffingMovements: (staffingMovements || []).map(row => ({id:row.id!,advisorId:row.advisor_id!,assignmentId:row.assignment_id||undefined,type:row.type!,effectiveAt:row.effective_at!,createdAt:row.created_at!,occurredAt:row.created_at!,origin:row.origin?JSON.parse(row.origin):undefined,destination:row.destination?JSON.parse(row.destination):undefined,actorId:row.actor_id||undefined,observation:row.observation||undefined,reversedMovementId:row.reversed_movement_id||undefined}))
    };
  }

  async loadUsersForAuthentication(): Promise<AuthUserRecord[] | null> {
    const [users, advisors] = await Promise.all([this.rows('USERS'), this.rows('ADVISORS')]);
    if (!users || !advisors) return null;
    const advisorDnis = new Map(advisors.map(row => [row.id, row.dni]));
    return users.filter(row => row.id && row.email).map(row => ({
      id: row.id!, name: row.name!, email: row.email!, username: row.username || undefined,
      role: row.role as User['role'], status: row.status as User['status'], teamId: row.team_id || undefined,
      advisorId: row.advisor_id || undefined, advisorDni: row.advisor_id ? advisorDnis.get(row.advisor_id) || undefined : undefined,
      avatar: row.avatar || undefined, createdAt: row.created_at!, passwordHash: row.password_hash || '', mustChangePassword: row.must_change_password !== '0'
    }));
  }

  async updateUserPasswordHash(id: string, passwordHash: string, mustChangePassword = false) { await this.upsert('USERS', 'id', { id, password_hash: passwordHash, must_change_password: mustChangePassword ? '1' : '0' }); }
  async loadSession(token: string) { return (await this.rows('SESSIONS') || []).find(row => row.token === token) || null; }
  async saveSession(token: string, userId: string, createdAt: string) { await this.upsert('SESSIONS', 'token', { token, user_id: userId, created_at: createdAt }); }
  async deleteSession(token: string) { await this.replace('SESSIONS', (await this.rows('SESSIONS') || []).filter(row => row.token !== token)); }

  async saveRepository(repository: SharedRepository, passwordHashes: Map<string, string>) {
    if (!this.enabled) return;
    const existingAdvisors = await this.rows('ADVISORS') || [];
    const advisorWrite = repository.advisors.length === 0 && existingAdvisors.length > 0
      ? Promise.resolve()
      : this.replace('ADVISORS', repository.advisors.map(advisor => ({ id: advisor.id, dni: advisor.dni, employee_code: advisor.employeeCode || '', name: advisor.name, campaign_id: advisor.campaignId, team_id: advisor.teamId, supervisor_id: advisor.supervisorId, data_json: JSON.stringify(advisor) })));
    await Promise.all([
      this.replace('USERS', repository.users.map(user => ({ id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, status: user.status, team_id: user.teamId, advisor_id: user.advisorId, avatar: user.avatar, created_at: user.createdAt, password_hash: passwordHashes.get(user.id), must_change_password: user.mustChangePassword !== false ? '1' : '0' }))),
      this.replace('CAMPAIGNS', repository.campaigns.map(campaign => ({ id: campaign.id, name: campaign.name, client: campaign.client, status: campaign.status, products_json: JSON.stringify(campaign.products || []), description: campaign.description, background_image: campaign.backgroundImage, quality_guidelines_json: JSON.stringify(campaign.qualityGuidelines || []), quality_criterion_weights_json: JSON.stringify(campaign.qualityCriterionWeights || null), quality_critical_errors_json: JSON.stringify(campaign.qualityCriticalErrors || []) }))),
      this.replace('TEAMS', repository.teams.map(team => ({ id: team.id, campaign_id: team.campaignId, supervisor_id: team.supervisorId, name: team.name }))),
      advisorWrite,
      this.replace('COMPANIES', (repository.companies || []).map(item=>({id:item.id,name:item.name,status:item.status,created_at:item.createdAt,updated_at:item.updatedAt}))),
      this.replace('OPERATIONS', (repository.operations || []).map(item=>({id:item.id,company_id:item.companyId,campaign_id:item.campaignId,name:item.name,normalized_name:item.normalizedName,status:item.status,legacy:item.legacy?'1':'0',created_at:item.createdAt,updated_at:item.updatedAt,closed_at:item.closedAt,version:String(item.version||1),metadata_json:JSON.stringify(item.metadata||{})}))),
      this.replace('OPERATION_SUPERVISORS', (repository.operationSupervisors || []).map(item=>({operation_id:item.operationId,supervisor_id:item.supervisorId,active:item.active?'1':'0',start_at:item.startAt,end_at:item.endAt}))),
      this.replace('OPERATION_ASSIGNMENTS', (repository.operationAssignments || []).map(item=>({id:item.id,advisor_id:item.advisorId,operation_id:item.operationId,team_id:item.teamId,supervisor_id:item.supervisorId,role:item.role,operational_status:item.operationalStatus,start_date:item.startDate,end_date:item.endDate,active:item.active?'1':'0',source:item.source,actor_id:item.actorId,observation:item.observation}))),
      this.replace('STAFFING_MOVEMENTS', (repository.staffingMovements || []).map(item=>({id:item.id,advisor_id:item.advisorId,assignment_id:item.assignmentId,type:item.type,effective_at:item.effectiveAt,created_at:item.createdAt||item.occurredAt,origin:typeof item.origin==='string'?item.origin:JSON.stringify(item.origin||null),destination:typeof item.destination==='string'?item.destination:JSON.stringify(item.destination||null),actor_id:item.actorId,observation:item.observation,reversed_movement_id:item.reversedMovementId})))
    ]);
  }

  async saveEvaluation(evaluation: any) {
    if (!this.enabled) return;
    await this.bootstrap();
    const headers=SHEETS.EVALUATIONS as unknown as string[];
    const row:Row={id:evaluation.id,advisor_id:evaluation.advisorId,evaluator_id:evaluation.evaluatorId,evaluation_type:evaluation.evaluationType,evaluated_at:`${evaluation.date}T${evaluation.time || '00:00'}:00`,payload_json:JSON.stringify(evaluation),created_at:evaluation.createdAt || new Date().toISOString()};
    if(!row.id || !row.advisor_id || !row.evaluator_id || !['QUALITY','D3C'].includes(clean(row.evaluation_type)))throw new Error('Evaluación inválida; no se modificó Sheets.');
    const sheets=this.sheets(),spreadsheetId=process.env.GOOGLE_SHEET_ID!;
    const ids=(await sheets.spreadsheets.values.get({spreadsheetId,range:`${this.quote('EVALUATIONS')}!A:A`,valueRenderOption:'UNFORMATTED_VALUE'})).data.values || [];
    const matches=ids.flatMap((cells,index)=>clean(cells[0])===clean(row.id)?[index+1]:[]);
    if(matches.length>1)throw new Error(`EVALUATIONS contiene el ID duplicado ${row.id}; no se modificó Sheets.`);
    const values=[headers.map(header=>clean(row[header]))];
    if(matches.length===1){
      await sheets.spreadsheets.values.update({spreadsheetId,range:`${this.quote('EVALUATIONS')}!A${matches[0]}:G${matches[0]}`,valueInputOption:'RAW',requestBody:{values}});
    }else{
      // Una evaluación nueva se agrega en una única escritura. Nunca se vacía ni
      // se reescribe el historial completo, incluso si Sheets rechaza la petición.
      await sheets.spreadsheets.values.append({spreadsheetId,range:`${this.quote('EVALUATIONS')}!A:G`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values}},{retry:false});
    }
    this.rowsCache.delete('EVALUATIONS');
  }
  async loadEvaluations() {
    const rows = await this.rows('EVALUATIONS') || [];
    return rows.map((row, index) => {
      try {
        const evaluation = JSON.parse(row.payload_json || '');
        if (!evaluation?.id) throw new Error('missing id');
        return evaluation;
      } catch {
        throw new Error(`EVALUATIONS: registro inválido en la fila ${index + 2}; no se omitió silenciosamente.`);
      }
    });
  }
  async deduplicateEvaluations() {
    const rows = await this.rows('EVALUATIONS') || [];
    const seen = new Set<string>();
    const unique = rows.filter(row => {
      try {
        const item = JSON.parse(row.payload_json || '{}');
        const key = [item.advisorId, item.evaluationType, item.date, item.time, item.callId || item.recordingCode || item.id].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      } catch { return true; }
    });
    const duplicates=rows.length-unique.length;
    if(duplicates)log(`Se detectaron ${duplicates} evaluaciones duplicadas; no se reescribió EVALUATIONS.`);
    return 0;
  }
  async loadFeedbacks() { return this.rows('FEEDBACKS'); }
  async saveFeedback(feedback: Row) { await this.upsert('FEEDBACKS', 'feedback_id', feedback); }
  async clearRuntimeData() {
    throw new Error('Limpieza de datos operativos deshabilitada para proteger evaluaciones y feedbacks.');
  }
  async loadPlatformState() {
    const rows = await this.rows('APP_STATE') || [];
    return readPlatformStateRows(rows);
  }
  async savePlatformState(state: unknown) {
    const payload=JSON.stringify(state),updatedAt=new Date().toISOString(),chunkSize=45000;
    const chunks=Array.from({length:Math.ceil(payload.length/chunkSize)},(_,index)=>({id:`global_${String(index).padStart(4,'0')}`,payload_json:payload.slice(index*chunkSize,(index+1)*chunkSize),updated_at:updatedAt}));
    // Una sola escritura evita agotar la cuota de Sheets. Las filas sobrantes se
    // vacían dentro de la misma actualización cuando el estado reduce su tamaño.
    const previous=await this.rows('APP_STATE') || [],headers=SHEETS.APP_STATE as unknown as string[];
    const rowCount=Math.max(previous.length,chunks.length),body=[headers,...Array.from({length:rowCount},(_,index)=>index<chunks.length?headers.map(header=>clean((chunks[index] as Row)[header])):['','',''])];
    await this.sheets().spreadsheets.values.update({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${this.quote('APP_STATE')}!A1:C${rowCount+1}`,valueInputOption:'RAW',requestBody:{values:body}});
    this.rowsCache.delete('APP_STATE');
  }
  async loadDevelopment() { const [capsules, assignments] = await Promise.all([this.rows('DEVELOPMENT_CAPSULES'), this.rows('DEVELOPMENT_ASSIGNMENTS')]); return { capsules: (capsules || []).map(row => JSON.parse(row.data_json || '{}')), assignments: (assignments || []).map(row => JSON.parse(row.data_json || '{}')) }; }
  async saveDevelopment(capsules: any[], assignments: any[]) { await Promise.all([this.replace('DEVELOPMENT_CAPSULES', capsules.map(item => ({ id:item.id,status:item.status,data_json:JSON.stringify(item),created_at:item.createdAt,updated_at:item.updatedAt }))),this.replace('DEVELOPMENT_ASSIGNMENTS', assignments.map(item => ({ id:item.id,capsule_id:item.capsuleId,advisor_id:item.advisorId,status:item.status,data_json:JSON.stringify(item),created_at:item.assignedAt,updated_at:item.updatedAt })))]); }
  async loadQualityAlerts() { const rows = await this.rows('QUALITY_ALERTS'); return (rows || []).map(row => JSON.parse(row.data_json || '{}')); }
  async saveQualityAlert(item: any) { await this.upsert('QUALITY_ALERTS', 'id', { id:item.id,status:item.status,advisor_id:item.advisorId,supervisor_id:item.supervisorId,campaign_id:item.campaignId,data_json:JSON.stringify(item),created_at:item.publishedAt,updated_at:item.updatedAt }); }
  async deleteQualityAlert(id: string) { await this.replace('QUALITY_ALERTS', (await this.rows('QUALITY_ALERTS') || []).filter(row => row.id !== id)); }
  async loadCalibrations() { const rows = await this.rows('CALIBRATIONS'); return (rows || []).map(row => JSON.parse(row.data_json || '{}')); }
  async saveCalibration(item: any) { await this.upsert('CALIBRATIONS', 'id', { id:item.id,status:item.status,evaluation_id:item.evaluationId,campaign_id:item.campaignId,data_json:JSON.stringify(item),created_at:item.createdAt,updated_at:item.updatedAt }); }
  async deleteCalibration(id: string) { await this.replace('CALIBRATIONS', (await this.rows('CALIBRATIONS') || []).filter(row => row.id !== id)); }

  async uploadFile(input: { name: string; mimeType: string; base64: string }) {
    if (!this.enabled) throw new Error('Google Drive no está configurado.');
    const data = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!data.length || data.length > 45 * 1024 * 1024) throw new Error('Archivo inválido o excede el límite permitido.');
    const file = await this.drive().files.create({ requestBody: { name: input.name.replace(/[\\/]/g, '_'), mimeType: input.mimeType || 'application/octet-stream', parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!] }, media: { mimeType: input.mimeType || 'application/octet-stream', body: Readable.from(data) }, fields: 'id,name,mimeType,size,webViewLink,webContentLink,createdTime' });
    return file.data;
  }
  async fileMetadata(id: string) { return (await this.drive().files.get({ fileId: id, fields: 'id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,trashed' })).data; }
  async downloadFile(id: string) {
    const response = await this.drive().files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
    return response.data as Readable;
  }
  async deleteFile(id: string) { await this.drive().files.delete({ fileId: id }); }
}

export const googleStorage = new GoogleStorage();
export const googleStorageLog = log;
