import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import type { Advisor, Campaign, Team, User } from '../src/types';

export type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[] };
export type AuthUserRecord = { id: string; name: string; email: string; username?: string; role: User['role']; status: User['status']; teamId?: string; advisorId?: string; advisorDni?: string; avatar?: string; createdAt: string; passwordHash: string; mustChangePassword: boolean };

const SHEETS = {
  USERS: ['id', 'name', 'email', 'username', 'role', 'status', 'team_id', 'advisor_id', 'avatar', 'created_at', 'password_hash', 'must_change_password'],
  CAMPAIGNS: ['id', 'name', 'client', 'status', 'products_json', 'description', 'quality_guidelines_json', 'quality_criterion_weights_json', 'quality_critical_errors_json', 'background_image'],
  TEAMS: ['id', 'campaign_id', 'supervisor_id', 'name'],
  ADVISORS: ['id', 'dni', 'employee_code', 'name', 'campaign_id', 'team_id', 'supervisor_id', 'data_json'],
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
    for (const name of Object.keys(SHEETS) as SheetName[]) {
      const range = `${this.quote(name)}!A1:ZZ1`;
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const currentHeaders = existing.data.values?.[0] || [];
      if (!currentHeaders.length || (SHEETS[name] as readonly string[]).some(header => !currentHeaders.includes(header))) await sheets.spreadsheets.values.update({ spreadsheetId, range: `${this.quote(name)}!A1`, valueInputOption: 'RAW', requestBody: { values: [SHEETS[name] as unknown as string[]] } });
    }
    return true;
  }

  private async rows(name: SheetName): Promise<Row[] | null> {
    if (!this.enabled) return null;
    await this.bootstrap();
    const result = await this.sheets().spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID!, range: `${this.quote(name)}!A:ZZ` });
    const [headers = [], ...values] = result.data.values || [];
    if (!headers.length) return [];
    return values.filter(row => row.some(value => clean(value))).map(row => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])));
  }

  private async replace(name: SheetName, rows: Row[]) {
    if (!this.enabled) return;
    await this.bootstrap();
    const headers = SHEETS[name] as unknown as string[];
    const values = [headers, ...rows.map(row => headers.map(header => clean(row[header])))];
    const sheets = this.sheets();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${this.quote(name)}!A:ZZ` });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${this.quote(name)}!A1`, valueInputOption: 'RAW', requestBody: { values } });
  }

  private async upsert(name: SheetName, key: string, row: Row) {
    const rows = await this.rows(name) || [];
    const index = rows.findIndex(item => item[key] === clean(row[key]));
    if (index < 0) rows.push(row); else rows[index] = { ...rows[index], ...row };
    await this.replace(name, rows);
  }

  async loadRepository(): Promise<SharedRepository | null> {
    if (!this.enabled) return null;
    const [users, campaigns, teams, advisors] = await Promise.all(['USERS', 'CAMPAIGNS', 'TEAMS', 'ADVISORS'].map(name => this.rows(name as SheetName)));
    if (![users, campaigns, teams, advisors].every(Boolean)) return null;
    return {
      users: users!.map(row => ({ id: row.id!, name: row.name!, email: row.email!, username: row.username || undefined, role: row.role as User['role'], status: row.status as User['status'], teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at!, password: undefined, mustChangePassword: row.must_change_password !== '0' })),
      campaigns: campaigns!.map(row => ({ id: row.id!, name: row.name!, client: row.client!, status: row.status as Campaign['status'], products: JSON.parse(row.products_json || '[]'), description: row.description || undefined, backgroundImage: row.background_image || undefined, qualityGuidelines: JSON.parse(row.quality_guidelines_json || '[]'), qualityCriterionWeights: JSON.parse(row.quality_criterion_weights_json || 'null') || undefined, qualityCriticalErrors: JSON.parse(row.quality_critical_errors_json || '[]') })),
      teams: teams!.map(row => ({ id: row.id!, campaignId: row.campaign_id!, supervisorId: row.supervisor_id!, name: row.name! })),
      advisors: advisors!.map(row => JSON.parse(row.data_json || '{}') as Advisor)
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
      advisorWrite
    ]);
  }

  async saveEvaluation(evaluation: any) { await this.upsert('EVALUATIONS', 'id', { id: evaluation.id, advisor_id: evaluation.advisorId, evaluator_id: evaluation.evaluatorId, evaluation_type: evaluation.evaluationType, evaluated_at: `${evaluation.date}T${evaluation.time || '00:00'}:00`, payload_json: JSON.stringify(evaluation), created_at: evaluation.createdAt || new Date().toISOString() }); }
  async loadEvaluations() {
    const rows = await this.rows('EVALUATIONS') || [];
    return rows.flatMap(row => { try { return [JSON.parse(row.payload_json || '{}')]; } catch { return []; } });
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
    if (unique.length !== rows.length) await this.replace('EVALUATIONS', unique);
    return rows.length - unique.length;
  }
  async loadFeedbacks() { return this.rows('FEEDBACKS'); }
  async saveFeedback(feedback: Row) { await this.upsert('FEEDBACKS', 'feedback_id', feedback); }
  async clearRuntimeData() {
    await Promise.all([this.replace('EVALUATIONS', []), this.replace('FEEDBACKS', []), this.replace('APP_STATE', [])]);
  }
  async loadPlatformState() {
    const rows = await this.rows('APP_STATE');
    const legacy = rows?.find(item => item.id === 'global');
    if (legacy?.payload_json) return JSON.parse(legacy.payload_json);
    const chunks=(rows || []).filter(item=>/^global_\d+$/.test(item.id || '')).sort((a,b)=>(a.id || '').localeCompare(b.id || ''));
    return chunks.length ? JSON.parse(chunks.map(item=>item.payload_json || '').join('')) : null;
  }
  async savePlatformState(state: unknown) {
    const payload=JSON.stringify(state),updatedAt=new Date().toISOString(),chunkSize=45000;
    const chunks=Array.from({length:Math.ceil(payload.length/chunkSize)},(_,index)=>({id:`global_${String(index).padStart(4,'0')}`,payload_json:payload.slice(index*chunkSize,(index+1)*chunkSize),updated_at:updatedAt}));
    // Una sola escritura evita agotar la cuota de Sheets. Las filas sobrantes se
    // vacían dentro de la misma actualización cuando el estado reduce su tamaño.
    const previous=await this.rows('APP_STATE') || [],headers=SHEETS.APP_STATE as unknown as string[];
    const rowCount=Math.max(previous.length,chunks.length),body=[headers,...Array.from({length:rowCount},(_,index)=>index<chunks.length?headers.map(header=>clean((chunks[index] as Row)[header])):['','',''])];
    await this.sheets().spreadsheets.values.update({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${this.quote('APP_STATE')}!A1:C${rowCount+1}`,valueInputOption:'RAW',requestBody:{values:body}});
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
