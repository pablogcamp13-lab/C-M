import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { google } from 'googleapis';
import { googleStorage } from '../server/googleStorage.ts';

const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const normalizeHeader = value => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const cleanDni = value => String(value ?? '').trim().replace(/\.0$/, '').replace(/\D/g, '');
const slug = value => normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };

const valueByHeader = (row, aliases) => {
  const entries = Object.entries(row);
  const match = entries.find(([header]) => aliases.includes(normalizeHeader(header)));
  return match?.[1] ?? '';
};

export function readRosterFile(filePath) {
  const workbook = XLSX.readFile(resolve(filePath), { cellDates: true });
  const sheetName = workbook.SheetNames.find(name => normalize(name) === 'dotacion')
    || workbook.SheetNames.find(name => normalize(name) !== 'listas');
  if (!sheetName) throw new Error('El archivo no contiene una hoja de Dotación.');
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
  const rows = sourceRows.map((row, index) => ({
    rowNumber: index + 2,
    dni: cleanDni(valueByHeader(row, ['dni', 'documento', 'numero de documento'])),
    firstName: String(valueByHeader(row, ['nombre', 'nombres'])).trim(),
    lastName: String(valueByHeader(row, ['apellido', 'apellidos'])).trim(),
    fullName: String(valueByHeader(row, ['asesor', 'asesores', 'nombre completo'])).trim(),
    supervisorName: String(valueByHeader(row, ['supervisor'])).trim(),
    quartile: String(valueByHeader(row, ['cuartil'])).trim(),
    campaignName: String(valueByHeader(row, ['campana'])).trim(),
    companyName: String(valueByHeader(row, ['empresa'])).trim()
  })).filter(row => row.dni || row.firstName || row.lastName || row.fullName);
  if (!rows.length) throw new Error('El archivo no contiene filas de dotación.');
  const invalid = rows.filter(row => !row.dni || !(row.fullName || row.firstName || row.lastName));
  if (invalid.length) throw new Error(`Hay ${invalid.length} filas sin DNI o nombre; no se modificó nada.`);
  const duplicates = rows.filter((row, index) => rows.findIndex(candidate => candidate.dni === row.dni) !== index);
  if (duplicates.length) throw new Error(`El archivo contiene ${new Set(duplicates.map(row => row.dni)).size} DNI duplicados; no se modificó nada.`);
  return rows;
}

export function buildReassignmentPlan(current, rows, companyName, campaignName, at = new Date().toISOString()) {
  const companies = current.companies || [];
  const operations = current.operations || [];
  const company = companies.find(item => item.status === 'ACTIVA' && normalize(item.name) === normalize(companyName));
  if (!company) throw new Error(`No existe la empresa activa “${companyName}”.`);
  const candidates = operations.filter(item => item.status === 'ACTIVA' && !item.legacy && item.companyId === company.id
    && normalize(current.campaigns.find(campaign => campaign.id === item.campaignId)?.name) === normalize(campaignName));
  if (candidates.length !== 1) throw new Error(`Se esperaba una sola operación activa “${companyName} / ${campaignName}” y se encontraron ${candidates.length}.`);
  const operation = candidates[0];
  const campaign = current.campaigns.find(item => item.id === operation.campaignId && item.status === 'ACTIVA');
  if (!campaign) throw new Error(`La campaña “${campaignName}” no está activa.`);
  const mismatched = rows.filter(row => (row.companyName && normalize(row.companyName) !== normalize(companyName))
    || (row.campaignName && normalize(row.campaignName) !== normalize(campaignName)));
  if (mismatched.length) throw new Error(`${mismatched.length} filas no corresponden a ${companyName} / ${campaignName}; no se modificó nada.`);

  const users = current.users.map(item => ({ ...item }));
  const teams = current.teams.map(item => ({ ...item }));
  const advisors = current.advisors.map(item => ({ ...item }));
  const operationSupervisors = (current.operationSupervisors || []).map(item => ({ ...item }));
  const operationAssignments = (current.operationAssignments || []).map(item => ({ ...item }));
  const staffingMovements = (current.staffingMovements || []).map(item => ({ ...item }));
  const advisorsByDni = new Map(advisors.filter(item => item.dni).map(item => [cleanDni(item.dni), item]));
  const validSupervisors = users.filter(user => user.status === 'ACTIVO' && ['SUPERVISOR', 'FORMADOR', 'ADMINISTRADOR', 'CONSULTOR'].includes(user.role));
  const passwordHashes = new Map();
  const summary = { rows: rows.length, reassigned: 0, alreadyAssigned: 0, created: 0, assignmentsCreated: 0, teamsCreated: 0, supervisorsLinked: 0 };

  const teamFor = supervisor => {
    let team = teams.find(item => item.campaignId === campaign.id && item.supervisorId === supervisor.id);
    if (!team) {
      const base = `team_${slug(operation.id)}_${slug(supervisor.id)}`;
      team = { id: teams.some(item => item.id === base) ? `${base}_${teams.length}` : base, campaignId: campaign.id, operationId: operation.id, supervisorId: supervisor.id, name: `${campaign.name} · ${supervisor.name}` };
      teams.push(team);
      summary.teamsCreated++;
    }
    return team;
  };

  rows.forEach((row, index) => {
    let advisor = advisorsByDni.get(row.dni);
    const oldOperationId = advisor?.operationId;
    let supervisor = advisor && validSupervisors.find(user => user.id === advisor.supervisorId);
    if (!supervisor && row.supervisorName) supervisor = validSupervisors.find(user => normalize(user.name) === normalize(row.supervisorName));
    if (!supervisor) throw new Error(`La fila ${row.rowNumber} no tiene un supervisor existente y activo; no se modificó nada.`);
    const team = teamFor(supervisor);

    if (advisor) {
      const wasAssigned = advisor.operationId === operation.id && advisor.campaignId === campaign.id;
      advisor.operationId = operation.id;
      advisor.campaignId = campaign.id;
      advisor.teamId = team.id;
      advisor.sourceCampaignName = campaign.name;
      if (wasAssigned) summary.alreadyAssigned++; else summary.reassigned++;
      const advisorUser = users.find(user => user.advisorId === advisor.id);
      if (advisorUser) advisorUser.teamId = team.id;
    } else {
      const advisorId = `adv_import_${row.dni}`;
      const name = (row.fullName || `${row.firstName} ${row.lastName}`).trim();
      advisor = { id: advisorId, dni: row.dni, employeeCode: `ADV-${row.dni.slice(-4)}`, name, campaignId: campaign.id, operationId: operation.id, sourceCampaignName: campaign.name, teamId: team.id, supervisorId: supervisor.id, supervisor: supervisor.name, quartile: row.quartile || undefined, status: 'ACTIVO', active: true, hireDate: '', hireDatePending: true };
      advisors.push(advisor);
      advisorsByDni.set(row.dni, advisor);
      const usernameBase = `asesor_${row.dni}`;
      const username = users.some(user => normalize(user.username) === normalize(usernameBase)) ? `${usernameBase}_${users.length}` : usernameBase;
      const user = { id: `usr_${advisorId}`, name, email: `${username}@asesores3c.com`, username, role: 'ASESOR', status: 'ACTIVO', advisorId, teamId: team.id, createdAt: at, mustChangePassword: true };
      users.push(user);
      passwordHashes.set(user.id, hashPassword('12345678'));
      summary.created++;
    }

    if (!operationSupervisors.some(link => link.operationId === operation.id && link.supervisorId === supervisor.id && link.active)) {
      operationSupervisors.push({ operationId: operation.id, supervisorId: supervisor.id, active: true, startAt: at.slice(0, 10) });
      summary.supervisorsLinked++;
    }

    const activeAssignments = operationAssignments.filter(item => item.advisorId === advisor.id && item.active);
    const correctAssignment = activeAssignments.find(item => item.operationId === operation.id && item.teamId === team.id && item.supervisorId === supervisor.id);
    if (!correctAssignment || activeAssignments.length !== 1) {
      activeAssignments.forEach(item => { item.active = false; item.endDate = at.slice(0, 10); });
      const assignmentId = `assignment_recovery_${advisor.id}_${Date.parse(at)}_${index}`;
      operationAssignments.push({ id: assignmentId, advisorId: advisor.id, operationId: operation.id, teamId: team.id, supervisorId: supervisor.id, role: 'ASESOR', operationalStatus: 'PRODUCCION', startDate: at.slice(0, 10), active: true, source: 'IMPORTACION', observation: `Reasignación verificada desde ${campaign.name}` });
      staffingMovements.push({ id: `movement_recovery_${advisor.id}_${Date.parse(at)}_${index}`, advisorId: advisor.id, assignmentId, type: oldOperationId ? 'CAMBIO_ASIGNACION' : 'ALTA', effectiveAt: at.slice(0, 10), createdAt: at, occurredAt: at, origin: oldOperationId ? { operationId: oldOperationId } : undefined, destination: { operationId: operation.id, supervisorId: supervisor.id }, observation: `Reasignación verificada desde ${campaign.name}` });
      summary.assignmentsCreated++;
    }
  });

  return { repository: { ...current, users, teams, advisors, operationSupervisors, operationAssignments, staffingMovements }, passwordHashes, summary, operationId: operation.id, campaignId: campaign.id };
}

const SHEETS = {
  USERS: ['id', 'name', 'email', 'username', 'role', 'status', 'team_id', 'advisor_id', 'avatar', 'created_at', 'password_hash', 'must_change_password'],
  TEAMS: ['id', 'campaign_id', 'supervisor_id', 'name'],
  ADVISORS: ['id', 'dni', 'employee_code', 'name', 'campaign_id', 'team_id', 'supervisor_id', 'data_json'],
  OPERATION_SUPERVISORS: ['operation_id', 'supervisor_id', 'active', 'start_at', 'end_at'],
  OPERATION_ASSIGNMENTS: ['id', 'advisor_id', 'operation_id', 'team_id', 'supervisor_id', 'role', 'operational_status', 'start_date', 'end_date', 'active', 'source', 'actor_id', 'observation'],
  STAFFING_MOVEMENTS: ['id', 'advisor_id', 'assignment_id', 'type', 'effective_at', 'created_at', 'origin', 'destination', 'actor_id', 'observation', 'reversed_movement_id']
};
const clean = value => value == null ? '' : String(value);
const rowValues = (headers, rows) => [headers, ...rows.map(row => headers.map(header => clean(row[header])))];

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--apply') options[key] = true;
    else if (['--file', '--company', '--campaign'].includes(key) && args[index + 1]) options[key] = args[++index];
    else throw new Error('Usa --file archivo.xlsx --company EMPRESA --campaign CAMPAÑA [--apply].');
  }
  if (!options['--file'] || !options['--company'] || !options['--campaign']) throw new Error('Faltan --file, --company o --campaign.');
  if (!googleStorage.enabled) throw new Error('No están disponibles las credenciales GOOGLE_* de Railway.');
  const rows = readRosterFile(options['--file']);
  const current = await googleStorage.loadRepository();
  const authUsers = await googleStorage.loadUsersForAuthentication();
  if (!current || !authUsers) throw new Error('No fue posible leer la dotación de producción.');
  const plan = buildReassignmentPlan(current, rows, options['--company'], options['--campaign']);
  for (const user of authUsers) plan.passwordHashes.set(user.id, user.passwordHash);
  console.log(JSON.stringify({ mode: options['--apply'] ? 'APPLY' : 'LIVE_NO_WRITES', target: `${options['--company']} / ${options['--campaign']}`, ...plan.summary }));
  if (!options['--apply']) return;

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const affectedNames = Object.keys(SHEETS);
  const before = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: affectedNames.map(name => `'${name}'!A:ZZ`), valueRenderOption: 'UNFORMATTED_VALUE' });
  const recoveryRoot = resolve('data', 'recovery');
  await mkdir(recoveryRoot, { recursive: true });
  const backupDirectory = await mkdtemp(resolve(recoveryRoot, 'retentions-roster-'));
  await writeFile(resolve(backupDirectory, 'before.json'), JSON.stringify({ at: new Date().toISOString(), spreadsheetId, sheets: Object.fromEntries(affectedNames.map((name, index) => [name, before.data.valueRanges?.[index]?.values || []])) }), { flag: 'wx' });

  const repository = plan.repository;
  const data = [
    { name: 'USERS', rows: repository.users.map(user => ({ id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, status: user.status, team_id: user.teamId, advisor_id: user.advisorId, avatar: user.avatar, created_at: user.createdAt, password_hash: plan.passwordHashes.get(user.id), must_change_password: user.mustChangePassword !== false ? '1' : '0' })) },
    { name: 'TEAMS', rows: repository.teams.map(team => ({ id: team.id, campaign_id: team.campaignId, supervisor_id: team.supervisorId, name: team.name })) },
    { name: 'ADVISORS', rows: repository.advisors.map(advisor => ({ id: advisor.id, dni: advisor.dni, employee_code: advisor.employeeCode || '', name: advisor.name, campaign_id: advisor.campaignId, team_id: advisor.teamId, supervisor_id: advisor.supervisorId, data_json: JSON.stringify(advisor) })) },
    { name: 'OPERATION_SUPERVISORS', rows: repository.operationSupervisors.map(item => ({ operation_id: item.operationId, supervisor_id: item.supervisorId, active: item.active ? '1' : '0', start_at: item.startAt, end_at: item.endAt })) },
    { name: 'OPERATION_ASSIGNMENTS', rows: repository.operationAssignments.map(item => ({ id: item.id, advisor_id: item.advisorId, operation_id: item.operationId, team_id: item.teamId, supervisor_id: item.supervisorId, role: item.role, operational_status: item.operationalStatus, start_date: item.startDate, end_date: item.endDate, active: item.active ? '1' : '0', source: item.source, actor_id: item.actorId, observation: item.observation })) },
    { name: 'STAFFING_MOVEMENTS', rows: repository.staffingMovements.map(item => ({ id: item.id, advisor_id: item.advisorId, assignment_id: item.assignmentId, type: item.type, effective_at: item.effectiveAt, created_at: item.createdAt || item.occurredAt, origin: item.origin ? JSON.stringify(item.origin) : '', destination: item.destination ? JSON.stringify(item.destination) : '', actor_id: item.actorId, observation: item.observation, reversed_movement_id: item.reversedMovementId })) }
  ];
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: data.map(item => ({ range: `'${item.name}'!A1`, values: rowValues(SHEETS[item.name], item.rows) })) } });
  const verified = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'ADVISORS'!A:H", valueRenderOption: 'UNFORMATTED_VALUE' });
  const advisorRows = verified.data.values || [];
  const advisorHeaders = advisorRows[0] || [];
  const dataIndex = advisorHeaders.indexOf('data_json');
  const verifiedAdvisors = advisorRows.slice(1).flatMap(values => { try { return [JSON.parse(values[dataIndex] || '{}')]; } catch { return []; } });
  const targetDnis = new Set(rows.map(row => row.dni));
  const verifiedCount = verifiedAdvisors.filter(advisor => targetDnis.has(cleanDni(advisor.dni)) && advisor.operationId === plan.operationId && advisor.campaignId === plan.campaignId).length;
  if (verifiedCount !== rows.length) throw new Error(`Verificación incompleta: ${verifiedCount} de ${rows.length}. Conserva el respaldo ${backupDirectory}.`);
  console.log(JSON.stringify({ verified: true, targetRows: rows.length, verifiedRows: verifiedCount, backup: backupDirectory }));
  console.log('Reinicia Railway y recarga la plataforma con Ctrl+F5. EVALUATIONS y FEEDBACKS no fueron modificadas.');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === resolve(fileURLToPath(import.meta.url))) main().catch(error => { console.error(error?.response || error?.config ? 'Falló la operación con Google; no repitas --apply hasta revisar el respaldo y el diagnóstico.' : error.message); process.exitCode = 1; });
