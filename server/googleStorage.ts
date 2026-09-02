import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import type { Advisor, Campaign, Team, User } from '../src/types';

export type SharedRepository = { users: User[]; campaigns: Campaign[]; teams: Team[]; advisors: Advisor[] };

const SHEETS = {
  USERS: ['id', 'name', 'email', 'username', 'role', 'status', 'team_id', 'advisor_id', 'avatar', 'created_at', 'password_hash'],
  CAMPAIGNS: ['id', 'name', 'client', 'status', 'products_json', 'description'],
  TEAMS: ['id', 'campaign_id', 'supervisor_id', 'name'],
  ADVISORS: ['id', 'dni', 'employee_code', 'name', 'campaign_id', 'team_id', 'supervisor_id', 'data_json'],
  EVALUATIONS: ['id', 'advisor_id', 'evaluator_id', 'evaluation_type', 'evaluated_at', 'payload_json', 'created_at'],
  FEEDBACKS: ['feedback_id', 'evaluation_id', 'advisor_id', 'supervisor_id', 'evaluator_id', 'evaluation_type', 'feedback_text', 'advisor_response', 'supervisor_closure_comment', 'status', 'created_at', 'advisor_action_at', 'closed_at', 'updated_at'],
  APP_STATE: ['id', 'payload_json', 'updated_at']
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
      if (!existing.data.values?.[0]?.length) await sheets.spreadsheets.values.update({ spreadsheetId, range: `${this.quote(name)}!A1`, valueInputOption: 'RAW', requestBody: { values: [SHEETS[name] as unknown as string[]] } });
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
      users: users!.map(row => ({ id: row.id!, name: row.name!, email: row.email!, username: row.username || undefined, role: row.role as User['role'], status: row.status as User['status'], teamId: row.team_id || undefined, advisorId: row.advisor_id || undefined, avatar: row.avatar || undefined, createdAt: row.created_at!, password: undefined })),
      campaigns: campaigns!.map(row => ({ id: row.id!, name: row.name!, client: row.client!, status: row.status as Campaign['status'], products: JSON.parse(row.products_json || '[]'), description: row.description || undefined })),
      teams: teams!.map(row => ({ id: row.id!, campaignId: row.campaign_id!, supervisorId: row.supervisor_id!, name: row.name! })),
      advisors: advisors!.map(row => JSON.parse(row.data_json || '{}') as Advisor)
    };
  }

  async saveRepository(repository: SharedRepository, passwordHashes: Map<string, string>) {
    if (!this.enabled) return;
    await Promise.all([
      this.replace('USERS', repository.users.map(user => ({ id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, status: user.status, team_id: user.teamId, advisor_id: user.advisorId, avatar: user.avatar, created_at: user.createdAt, password_hash: passwordHashes.get(user.id) }))),
      this.replace('CAMPAIGNS', repository.campaigns.map(campaign => ({ id: campaign.id, name: campaign.name, client: campaign.client, status: campaign.status, products_json: JSON.stringify(campaign.products || []), description: campaign.description }))),
      this.replace('TEAMS', repository.teams.map(team => ({ id: team.id, campaign_id: team.campaignId, supervisor_id: team.supervisorId, name: team.name }))),
      this.replace('ADVISORS', repository.advisors.map(advisor => ({ id: advisor.id, dni: advisor.dni, employee_code: advisor.employeeCode || '', name: advisor.name, campaign_id: advisor.campaignId, team_id: advisor.teamId, supervisor_id: advisor.supervisorId, data_json: JSON.stringify(advisor) })))
    ]);
  }

  async saveEvaluation(evaluation: any) { await this.upsert('EVALUATIONS', 'id', { id: evaluation.id, advisor_id: evaluation.advisorId, evaluator_id: evaluation.evaluatorId, evaluation_type: evaluation.evaluationType, evaluated_at: `${evaluation.date}T${evaluation.time || '00:00'}:00`, payload_json: JSON.stringify(evaluation), created_at: evaluation.createdAt || new Date().toISOString() }); }
  async loadFeedbacks() { return this.rows('FEEDBACKS'); }
  async saveFeedback(feedback: Row) { await this.upsert('FEEDBACKS', 'feedback_id', feedback); }
  async clearRuntimeData() {
    await Promise.all([this.replace('EVALUATIONS', []), this.replace('FEEDBACKS', []), this.replace('APP_STATE', [])]);
  }
  async loadPlatformState() { const rows = await this.rows('APP_STATE'); const row = rows?.find(item => item.id === 'global'); return row?.payload_json ? JSON.parse(row.payload_json) : null; }
  async savePlatformState(state: unknown) { await this.upsert('APP_STATE', 'id', { id: 'global', payload_json: JSON.stringify(state), updated_at: new Date().toISOString() }); }

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
