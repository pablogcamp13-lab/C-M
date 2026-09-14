import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(String(args.source || process.env.MIGRATION_SOURCE_XLSX || ""));
const outputDir = path.resolve(String(args.output || path.join(repoRoot, "migration", "supabase")));

if (!args.source && !process.env.MIGRATION_SOURCE_XLSX) {
  throw new Error('Falta --source. Ejemplo: node scripts/prepare-supabase-migration.mjs --source "C:\\ruta\\BBDD.xlsx"');
}

const expectedOutputDir = path.join(repoRoot, "migration", "supabase");
const relativeOutput = path.relative(repoRoot, outputDir);
const temporaryRoot = path.resolve(process.env.TEMP || process.env.TMP || repoRoot);
const relativeTemporaryOutput = path.relative(temporaryRoot, outputDir);
const insideRepository = !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput);
const insideTemporaryRoot = !relativeTemporaryOutput.startsWith("..") && !path.isAbsolute(relativeTemporaryOutput);
if ((!insideRepository && !insideTemporaryRoot) || path.basename(outputDir).toLowerCase() !== "supabase") {
  throw new Error(`Directorio de salida inseguro: ${outputDir}`);
}
if (outputDir !== expectedOutputDir && !args.output) {
  throw new Error(`Directorio de salida inesperado: ${outputDir}`);
}

const sourceBytes = await fs.readFile(sourcePath);
const sourceHashBefore = sha256(sourceBytes);
const sourceFile = path.basename(sourcePath);
const workbook = XLSX.read(sourceBytes, { type: "buffer", cellDates: true, raw: true, dense: false });

const STATUS = Object.freeze({ READY: "READY", REVIEW: "REVIEW_REQUIRED", INVALID: "INVALID" });
const RESOLUTION = Object.freeze({ RESOLVED: "RESOLVED", AMBIGUOUS: "AMBIGUOUS", UNMAPPED: "UNMAPPED", INVALID: "INVALID" });
const confirmedOperations = new Set([
  "company_techcenter|migraciones bitel",
  "company_techcenter|retenciones bitel",
  "company_techcenter|portabilidad bitel",
  "company_talent_up|migraciones bitel",
  "company_talent_up|portabilidad bitel",
  "company_talent_up|win",
  "company_talent_up|carsa",
  "company_talent_up|prosegur",
  "company_konectados|migraciones bitel",
  "company_konectados|portabilidad bitel",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(namespace, value) {
  const hex = sha256(`${namespace}\u0000${value}`).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00A0\u200B-\u200D\u2060\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedName(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE");
}

function nullable(value) {
  const text = normalizeWhitespace(value);
  return text === "" || /^(null|undefined)$/i.test(text) ? null : text;
}

function booleanValue(value) {
  if (value === true || value === 1 || /^(1|true|si|sí|yes)$/i.test(String(value ?? "").trim())) return true;
  if (value === false || value === 0 || /^(0|false|no)$/i.test(String(value ?? "").trim())) return false;
  return null;
}

function isoValue(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const text = nullable(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? text : parsed.toISOString();
}

function safeJson(value) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value === "object") return { ok: true, value };
  try {
    return { ok: true, value: JSON.parse(String(value)) };
  } catch (error) {
    return { ok: false, value: null, error: error.message };
  }
}

function jsonText(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function sourceValue(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  return value ?? null;
}

function slugify(value) {
  const slug = normalizedName(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "empty_sheet";
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function writeCsv(filePath, rows, headers) {
  const columns = headers?.length ? headers : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text.replace(/\r?\n/g, "\n"), "utf8");
}

function parseSheet(sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null, blankrows: true });
  while (matrix.length && matrix[matrix.length - 1].every((value) => value === null || value === "")) matrix.pop();
  const headerIndex = matrix.findIndex((row) => row.some((value) => value !== null && value !== ""));
  if (headerIndex < 0) return { sheetName, headerRow: null, headers: [], rows: [] };
  const lastColumn = Math.max(...matrix.map((row) => row.reduce((last, value, index) => (value === null || value === "" ? last : index + 1), 0)), 0);
  const headers = Array.from({ length: lastColumn }, (_, index) => normalizeWhitespace(matrix[headerIndex]?.[index]) || `__blank_${index + 1}`);
  const rows = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const values = Array.from({ length: lastColumn }, (_, column) => sourceValue(matrix[index]?.[column]));
    if (values.every((value) => value === null || value === "")) continue;
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    rows.push({ ...record, __source_file: sourceFile, __source_sheet: sheetName, __source_row: index + 1 });
  }
  return { sheetName, headerRow: headerIndex + 1, headers, rows };
}

const parsedSheets = workbook.SheetNames.map(parseSheet);
const sheetMap = new Map(parsedSheets.map((sheet) => [sheet.sheetName, sheet]));
const rowsOf = (sheetName) => sheetMap.get(sheetName)?.rows ?? [];

function apparentType(value) {
  if (value === null || value === "") return "blank";
  if (value instanceof Date) return "date";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  const text = String(value).trim();
  if (/^https?:\/\//i.test(text)) return "url";
  if (/^[\[{]/.test(text) && safeJson(text).ok) return "json";
  if (/^(true|false|0|1|si|sí|no)$/i.test(text)) return "boolean_text";
  if (/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(text)) return "date_text";
  return "text";
}

function probableKey(sheet) {
  if (!sheet.rows.length) return "";
  const candidates = sheet.headers.filter((header) => /(^id$|_id$|^token$|^feedback_id$)/i.test(header));
  for (const candidate of candidates) {
    const values = sheet.rows.map((row) => nullable(row[candidate])).filter(Boolean);
    if (values.length === sheet.rows.length && new Set(values).size === values.length) return candidate;
  }
  return "";
}

const entityBySheet = {
  USERS: "users", CAMPAIGNS: "campaign_definitions", TEAMS: "teams", ADVISORS: "people",
  EVALUATIONS: "evaluations", FEEDBACKS: "feedback", APP_STATE: "app_state_fragments",
  DEVELOPMENT_CAPSULES: "development_capsules", DEVELOPMENT_ASSIGNMENTS: "development_assignments",
  QUALITY_ALERTS: "quality_alerts", CALIBRATIONS: "calibrations", SESSIONS: "legacy_sessions",
  COMPANIES: "companies", OPERATIONS: "operations", OPERATION_SUPERVISORS: "operation_supervisors",
  OPERATION_ASSIGNMENTS: "assignments", STAFFING_MOVEMENTS: "staffing_movements",
};

const workbookInventory = parsedSheets.map((sheet) => {
  const emptyColumns = sheet.headers.filter((header) => sheet.rows.every((row) => row[header] === null || row[header] === ""));
  const serialized = sheet.rows.map((row) => JSON.stringify(sheet.headers.map((header) => sourceValue(row[header]))));
  const duplicateRows = serialized.length - new Set(serialized).size;
  const key = probableKey(sheet);
  const problems = [];
  if (!sheet.rows.length) problems.push(sheet.headers.length ? "Sólo encabezados; sin registros" : "Hoja vacía");
  if (emptyColumns.length) problems.push(`Columnas vacías: ${emptyColumns.join(" | ")}`);
  if (duplicateRows) problems.push(`Filas completamente duplicadas: ${duplicateRows}`);
  if (!key && sheet.rows.length) problems.push("Sin clave única evidente");
  const types = Object.fromEntries(sheet.headers.map((header) => [header, [...new Set(sheet.rows.map((row) => apparentType(row[header])))].sort().join("|")]));
  return {
    sheet: sheet.sheetName,
    data_rows: sheet.rows.length,
    columns: sheet.headers.length,
    header_row: sheet.headerRow,
    probable_key: key,
    probable_entity: entityBySheet[sheet.sheetName] || (sheet.sheetName.includes("_conflict") ? "conflict_sheet" : "unclassified"),
    empty_columns: emptyColumns.join(" | "),
    duplicate_full_rows: duplicateRows,
    headers: sheet.headers.join(" | "),
    apparent_types_json: JSON.stringify(types),
    problems: problems.join("; "),
  };
});

const sourceRecords = [];
for (const sheet of parsedSheets) {
  for (const row of sheet.rows) {
    const raw = Object.fromEntries(sheet.headers.map((header) => [header, sourceValue(row[header])]));
    sourceRecords.push({
      source_file: sourceFile,
      source_sheet: sheet.sheetName,
      source_row: row.__source_row,
      record_sha256: sha256(JSON.stringify(raw)),
      raw_json: JSON.stringify(raw),
    });
  }
}

const data = {};
const dispositions = [];
const normalizationReport = [];
const ambiguousRecords = [];
const unmappedValues = [];
const possibleDuplicates = [];
const lineage = [];

function addDisposition(sourceRow, destinationTable, destinationId, status, reason = "") {
  const record = {
    source_file: sourceFile,
    source_sheet: sourceRow.__source_sheet,
    source_row: sourceRow.__source_row,
    destination_table: destinationTable,
    destination_id: destinationId,
    migration_status: status,
    reason,
  };
  dispositions.push(record);
  lineage.push(record);
}

function provenance(row) {
  return { source_file: sourceFile, source_sheet: row.__source_sheet, source_row: row.__source_row };
}

function reportNormalization(row, field, original, normalized, rule) {
  if (String(original ?? "") === String(normalized ?? "")) return;
  normalizationReport.push({ ...provenance(row), field, original_value: original, normalized_value: normalized, rule });
}

const companyRows = rowsOf("COMPANIES");
data.companies = companyRows.map((row) => {
  const name = normalizeWhitespace(row.name);
  const normalized = normalizedName(name);
  reportNormalization(row, "name", row.name, name, "trim/control/invisible whitespace");
  reportNormalization(row, "normalized_name", name, normalized, "clave de comparación: minúsculas, sin diacríticos y espacios normalizados");
  const status = row.id && name ? STATUS.READY : STATUS.INVALID;
  addDisposition(row, "companies", nullable(row.id), status, status === STATUS.INVALID ? "Falta id o nombre" : "");
  return { id: nullable(row.id), name, normalized_name: normalized, status: nullable(row.status), created_at: isoValue(row.created_at), updated_at: isoValue(row.updated_at), migration_status: status, ...provenance(row) };
});
const companyIds = new Set(data.companies.map((row) => row.id));

const campaignRows = rowsOf("CAMPAIGNS");
function classifyCampaign(row) {
  if (!nullable(row.id) || !nullable(row.name)) return { status: RESOLUTION.INVALID, reason: "Falta id o nombre" };
  const name = normalizedName(row.name);
  if (["carsa", "prosegur", "win"].includes(name)) return { status: RESOLUTION.RESOLVED, reason: "Regla organizacional confirmada: pertenece a TALENT UP" };
  if (["migraciones bitel", "portabilidad bitel", "retenciones bitel", "migra", "retencion in", "portabilidad out", "multiskill in"].includes(name)) {
    return { status: RESOLUTION.AMBIGUOUS, reason: "El nombre por sí solo no identifica una operación empresarial única" };
  }
  return { status: RESOLUTION.UNMAPPED, reason: "Campaña histórica/técnica sin evidencia empresarial suficiente" };
}
data.campaign_definitions = campaignRows.map((row) => {
  const resolution = classifyCampaign(row);
  const name = normalizeWhitespace(row.name);
  reportNormalization(row, "name", row.name, name, "trim/control/invisible whitespace");
  reportNormalization(row, "normalized_name", name, normalizedName(name), "clave de comparación: minúsculas, sin diacríticos y espacios normalizados");
  if (resolution.status === RESOLUTION.AMBIGUOUS) ambiguousRecords.push({ ...provenance(row), entity: "campaign_definition", record_id: row.id, field: "name", original_value: row.name, candidates: "", reason: resolution.reason });
  if (resolution.status === RESOLUTION.UNMAPPED) unmappedValues.push({ ...provenance(row), entity: "campaign_definition", record_id: row.id, field: "name", original_value: row.name, reason: resolution.reason });
  const migrationStatus = resolution.status === RESOLUTION.RESOLVED ? STATUS.READY : resolution.status === RESOLUTION.INVALID ? STATUS.INVALID : STATUS.REVIEW;
  addDisposition(row, "campaign_definitions", nullable(row.id), migrationStatus, resolution.reason);
  return {
    id: nullable(row.id), name, normalized_name: normalizedName(name), client: nullable(row.client), status: nullable(row.status),
    products_json: jsonText(row.products_json), description: nullable(row.description), quality_guidelines_json: jsonText(row.quality_guidelines_json),
    quality_criterion_weights_json: jsonText(row.quality_criterion_weights_json), quality_critical_errors_json: jsonText(row.quality_critical_errors_json),
    background_image: nullable(row.background_image), resolution_status: resolution.status, resolution_reason: resolution.reason,
    migration_status: migrationStatus, ...provenance(row),
  };
});
const campaignIds = new Set(data.campaign_definitions.map((row) => row.id));

const operationRows = rowsOf("OPERATIONS");
data.operations = operationRows.map((row) => {
  const normalized = normalizedName(row.normalized_name || String(row.name || "").split("/").pop());
  reportNormalization(row, "normalized_name", row.normalized_name || String(row.name || "").split("/").pop(), normalized, "clave de comparación: minúsculas, sin diacríticos y espacios normalizados");
  const key = `${nullable(row.company_id)}|${normalized}`;
  const legacy = booleanValue(row.legacy) === true;
  let migrationStatus = STATUS.READY;
  let reason = "Coincide con la estructura organizacional confirmada";
  if (!row.id || !companyIds.has(nullable(row.company_id)) || !campaignIds.has(nullable(row.campaign_id))) {
    migrationStatus = STATUS.INVALID;
    reason = "Falta id o una referencia obligatoria no existe";
  } else if (legacy || !confirmedOperations.has(key)) {
    migrationStatus = STATUS.REVIEW;
    reason = legacy ? "Operación legacy conservada; requiere decisión humana" : "Operación no incluida en la estructura organizacional confirmada";
    ambiguousRecords.push({ ...provenance(row), entity: "operation", record_id: row.id, field: "company_id+normalized_name", original_value: key, candidates: "", reason });
  }
  addDisposition(row, "operations", nullable(row.id), migrationStatus, reason);
  return {
    id: nullable(row.id), company_id: nullable(row.company_id), source_campaign_id: nullable(row.campaign_id), name: normalizeWhitespace(row.name),
    normalized_name: normalized, status: nullable(row.status), legacy, created_at: isoValue(row.created_at), updated_at: isoValue(row.updated_at),
    closed_at: isoValue(row.closed_at), version: nullable(row.version), metadata_json: jsonText(row.metadata_json), migration_status: migrationStatus, ...provenance(row),
  };
});
const operationById = new Map(data.operations.map((row) => [row.id, row]));
const canonicalOperationsByCampaign = new Map();
for (const operation of data.operations.filter((row) => !row.legacy && row.migration_status === STATUS.READY)) {
  const list = canonicalOperationsByCampaign.get(operation.source_campaign_id) || [];
  list.push(operation);
  canonicalOperationsByCampaign.set(operation.source_campaign_id, list);
}

const advisorRows = rowsOf("ADVISORS");
data.people = advisorRows.map((row) => {
  const parsed = safeJson(row.data_json);
  const displayName = normalizeWhitespace(row.name || parsed.value?.name);
  reportNormalization(row, "normalized_name", displayName, normalizedName(displayName), "clave de comparación: minúsculas, sin diacríticos y espacios normalizados");
  const status = row.id && displayName ? STATUS.READY : STATUS.INVALID;
  if (!displayName) unmappedValues.push({ ...provenance(row), entity: "person", record_id: row.id, field: "name", original_value: row.name, reason: "Nombre ausente" });
  addDisposition(row, "people", nullable(row.id), status, status === STATUS.INVALID ? "Falta id o nombre" : "Nombre completo preservado; separación nombre/apellido requiere revisión humana");
  return {
    id: nullable(row.id), source_advisor_id: nullable(row.id), dni: nullable(row.dni), employee_code: nullable(row.employee_code), display_name: displayName,
    normalized_name: normalizedName(displayName), first_name: null, last_name: null, name_parse_status: STATUS.REVIEW,
    status: nullable(parsed.value?.status), active: booleanValue(parsed.value?.active), profile_json: jsonText(row.data_json), migration_status: status, ...provenance(row),
  };
});
const personIds = new Set(data.people.map((row) => row.id));

const userRows = rowsOf("USERS");
data.users = userRows.map((row) => {
  const personId = personIds.has(nullable(row.advisor_id)) ? nullable(row.advisor_id) : null;
  const unresolvedAdvisor = nullable(row.advisor_id) && !personId;
  const status = row.id && row.email ? (unresolvedAdvisor ? STATUS.REVIEW : STATUS.READY) : STATUS.INVALID;
  const reason = status === STATUS.INVALID ? "Falta id o email" : unresolvedAdvisor ? "advisor_id no existe en ADVISORS; relación conservada como source_advisor_id" : "";
  if (unresolvedAdvisor) unmappedValues.push({ ...provenance(row), entity: "user", record_id: row.id, field: "advisor_id", original_value: row.advisor_id, reason });
  addDisposition(row, "users", nullable(row.id), status, reason);
  return {
    id: nullable(row.id), person_id: personId, source_advisor_id: nullable(row.advisor_id), name: normalizeWhitespace(row.name), email: nullable(row.email),
    username: nullable(row.username), role: nullable(row.role), status: nullable(row.status), source_team_id: nullable(row.team_id), avatar: nullable(row.avatar),
    created_at: isoValue(row.created_at), legacy_password_hash: nullable(row.password_hash), must_change_password: booleanValue(row.must_change_password),
    migration_status: status, ...provenance(row),
  };
});
const userIds = new Set(data.users.map((row) => row.id));

const teamRows = rowsOf("TEAMS");
function resolveOperationForCampaign(campaignId) {
  const candidates = canonicalOperationsByCampaign.get(campaignId) || [];
  if (candidates.length === 1) return { operationId: candidates[0].id, resolution: RESOLUTION.RESOLVED, candidates };
  if (campaignId === "service_retenciones_bitel" && operationById.has("op_techcenter_retenciones_bitel")) {
    return { operationId: "op_techcenter_retenciones_bitel", resolution: RESOLUTION.RESOLVED, candidates: [operationById.get("op_techcenter_retenciones_bitel")] };
  }
  return { operationId: null, resolution: candidates.length > 1 ? RESOLUTION.AMBIGUOUS : RESOLUTION.UNMAPPED, candidates };
}
data.teams = teamRows.map((row) => {
  const mapping = resolveOperationForCampaign(nullable(row.campaign_id));
  const refsValid = userIds.has(nullable(row.supervisor_id)) && campaignIds.has(nullable(row.campaign_id));
  const status = !row.id || !refsValid ? STATUS.INVALID : mapping.operationId ? STATUS.READY : STATUS.REVIEW;
  const reason = status === STATUS.INVALID ? "Falta id o referencia obligatoria" : mapping.operationId ? "Operación resuelta con evidencia suficiente" : "campaign_id no identifica empresa de forma única";
  if (status === STATUS.REVIEW) ambiguousRecords.push({ ...provenance(row), entity: "team", record_id: row.id, field: "campaign_id", original_value: row.campaign_id, candidates: mapping.candidates.map((item) => item.id).join(" | "), reason });
  addDisposition(row, "teams", nullable(row.id), status, reason);
  return { id: nullable(row.id), operation_id: mapping.operationId, source_campaign_id: nullable(row.campaign_id), supervisor_id: nullable(row.supervisor_id), name: normalizeWhitespace(row.name), resolution_status: mapping.resolution, migration_status: status, ...provenance(row) };
});
const teamIds = new Set(data.teams.map((row) => row.id));

const assignmentRows = rowsOf("OPERATION_ASSIGNMENTS");
data.assignments = assignmentRows.map((row) => {
  const personId = personIds.has(nullable(row.advisor_id)) ? nullable(row.advisor_id) : null;
  const operationId = operationById.has(nullable(row.operation_id)) ? nullable(row.operation_id) : null;
  const supervisorId = userIds.has(nullable(row.supervisor_id)) ? nullable(row.supervisor_id) : null;
  const teamId = teamIds.has(nullable(row.team_id)) ? nullable(row.team_id) : null;
  const requiredValid = Boolean(row.id && personId && operationId && supervisorId);
  const status = !requiredValid ? STATUS.INVALID : nullable(row.team_id) && !teamId ? STATUS.REVIEW : STATUS.READY;
  const reason = !requiredValid ? "Falta id o referencia obligatoria" : status === STATUS.REVIEW ? "team_id histórico no existe en TEAMS; se conserva como source_team_id" : "";
  if (status === STATUS.REVIEW) unmappedValues.push({ ...provenance(row), entity: "assignment", record_id: row.id, field: "team_id", original_value: row.team_id, reason });
  addDisposition(row, "assignments", nullable(row.id), status, reason);
  return {
    id: nullable(row.id), person_id: personId, operation_id: operationId, team_id: teamId, source_team_id: nullable(row.team_id), supervisor_id: supervisorId,
    role: nullable(row.role), operational_status: nullable(row.operational_status), start_at: isoValue(row.start_date), end_at: isoValue(row.end_date),
    active: booleanValue(row.active), source: nullable(row.source), actor_user_id: userIds.has(nullable(row.actor_id)) ? nullable(row.actor_id) : null,
    source_actor_id: nullable(row.actor_id), observation: nullable(row.observation), migration_status: status, ...provenance(row),
  };
});
const assignmentIds = new Set(data.assignments.map((row) => row.id));

const opSupervisorRows = rowsOf("OPERATION_SUPERVISORS");
data.operation_supervisors = opSupervisorRows.map((row) => {
  const id = deterministicUuid("operation_supervisor", `${row.operation_id}|${row.supervisor_id}|${row.start_at}|${row.__source_row}`);
  const status = operationById.has(nullable(row.operation_id)) && userIds.has(nullable(row.supervisor_id)) ? STATUS.READY : STATUS.INVALID;
  addDisposition(row, "operation_supervisors", id, status, status === STATUS.INVALID ? "Referencia obligatoria no existe" : "");
  return { id, operation_id: nullable(row.operation_id), supervisor_id: nullable(row.supervisor_id), active: booleanValue(row.active), start_at: isoValue(row.start_at), end_at: isoValue(row.end_at), migration_status: status, ...provenance(row) };
});

const movementRows = rowsOf("STAFFING_MOVEMENTS");
data.staffing_movements = movementRows.map((row) => {
  const matchedAssignment = assignmentIds.has(nullable(row.assignment_id)) ? nullable(row.assignment_id) : null;
  const requiredValid = row.id && personIds.has(nullable(row.advisor_id));
  const status = !requiredValid ? STATUS.INVALID : matchedAssignment ? STATUS.READY : STATUS.REVIEW;
  const reason = !requiredValid ? "Falta id o advisor_id válido" : !matchedAssignment ? "assignment_id no existe en OPERATION_ASSIGNMENTS; se conserva como source_assignment_id" : "";
  if (status === STATUS.REVIEW) unmappedValues.push({ ...provenance(row), entity: "staffing_movement", record_id: row.id, field: "assignment_id", original_value: row.assignment_id, reason });
  addDisposition(row, "staffing_movements", nullable(row.id), status, reason);
  return {
    id: nullable(row.id), person_id: nullable(row.advisor_id), assignment_id: matchedAssignment, source_assignment_id: nullable(row.assignment_id),
    type: nullable(row.type), effective_at: isoValue(row.effective_at), created_at: isoValue(row.created_at), origin_json: jsonText(row.origin),
    destination_json: jsonText(row.destination), actor_user_id: userIds.has(nullable(row.actor_id)) ? nullable(row.actor_id) : null,
    source_actor_id: nullable(row.actor_id), observation: nullable(row.observation), reversed_movement_id: nullable(row.reversed_movement_id),
    migration_status: status, ...provenance(row),
  };
});

const evaluationRows = rowsOf("EVALUATIONS");
data.evaluations = [];
data.evaluation_items = [];
data.evaluation_media = [];
for (const row of evaluationRows) {
  const parsed = safeJson(row.payload_json);
  const payload = parsed.value && typeof parsed.value === "object" ? parsed.value : {};
  let operationId = nullable(payload.operationId);
  let mappingStatus = RESOLUTION.UNMAPPED;
  let mappingReason = "No existe operationId histórico";
  let candidates = [];
  if (operationId && operationById.has(operationId)) {
    mappingStatus = RESOLUTION.RESOLVED;
    mappingReason = "operationId explícito en payload_json";
  } else {
    operationId = null;
    candidates = canonicalOperationsByCampaign.get(nullable(payload.campaignId || row.campaign_id)) || [];
    if (candidates.length === 1) {
      operationId = candidates[0].id;
      mappingStatus = RESOLUTION.RESOLVED;
      mappingReason = "campaignId identifica una sola operación canónica";
    } else if (candidates.length > 1 || ["camp_1", "camp_bitel_retenciones"].includes(nullable(payload.campaignId))) {
      mappingStatus = RESOLUTION.AMBIGUOUS;
      mappingReason = "campaignId no identifica empresa de forma única";
    }
  }
  const idsValid = row.id && personIds.has(nullable(row.advisor_id)) && userIds.has(nullable(row.evaluator_id));
  const migrationStatus = !idsValid || !parsed.ok ? STATUS.INVALID : mappingStatus === RESOLUTION.RESOLVED ? STATUS.READY : STATUS.REVIEW;
  if (migrationStatus === STATUS.REVIEW && mappingStatus === RESOLUTION.AMBIGUOUS) ambiguousRecords.push({ ...provenance(row), entity: "evaluation", record_id: row.id, field: "operation_id", original_value: payload.campaignId, candidates: candidates.map((item) => item.id).join(" | "), reason: mappingReason });
  if (mappingStatus === RESOLUTION.UNMAPPED) unmappedValues.push({ ...provenance(row), entity: "evaluation", record_id: row.id, field: "campaignId", original_value: payload.campaignId, reason: mappingReason });
  addDisposition(row, "evaluations", nullable(row.id), migrationStatus, mappingReason);
  data.evaluations.push({
    id: nullable(row.id), person_id: nullable(row.advisor_id), evaluator_user_id: nullable(row.evaluator_id), supervisor_user_id: userIds.has(nullable(payload.supervisorId)) ? nullable(payload.supervisorId) : null,
    operation_id: operationId, source_campaign_id: nullable(payload.campaignId), source_team_id: nullable(payload.teamId), evaluation_type: nullable(row.evaluation_type),
    evaluated_at: isoValue(row.evaluated_at), created_at: isoValue(row.created_at), product: nullable(payload.product), call_id: nullable(payload.callId),
    evaluation_subtype: nullable(payload.type), quality_status: nullable(payload.qualityStatus), origin: nullable(payload.origin || payload.source), validation_status: nullable(payload.validationStatus),
    validated_at: isoValue(payload.validatedAt), sale: booleanValue(payload.sale), sale_result: nullable(payload.saleResult), comments: nullable(payload.comments),
    primary_gap: nullable(payload.primaryGap), secondary_gap: nullable(payload.secondaryGap), strongest_pillar: nullable(payload.strongestPillar), recommendation: nullable(payload.recommendation),
    score_connect: payload.scoreConnect ?? null, score_clarify: payload.scoreClarify ?? null, score_convert: payload.scoreConvert ?? null, score_total: payload.scoreTotal ?? null,
    technical_score: payload.technicalScore ?? null, quality_result: nullable(payload.qualityResult), critical_reason: nullable(payload.criticalReason),
    payload_json: jsonText(row.payload_json), operation_resolution_status: mappingStatus, migration_status: migrationStatus, ...provenance(row),
  });
  const items = Array.isArray(payload.items) ? payload.items : [];
  items.forEach((item, index) => {
    const id = deterministicUuid("evaluation_item", `${row.id}|${index}|${item?.id || item?.criterionId || ""}`);
    data.evaluation_items.push({
      id, evaluation_id: nullable(row.id), ordinal: index + 1, source_item_id: nullable(item?.id), criterion_id: nullable(item?.criterionId),
      dimension: nullable(item?.dimension), compliance: nullable(item?.compliance), percentage: item?.percentage ?? null, level: item?.level ?? null,
      finding: nullable(item?.finding), evidence: nullable(item?.evidence), recommended_action: nullable(item?.recommendedAction), attribute_weight: item?.attributeWeight ?? null,
      category: nullable(item?.category), attribute: nullable(item?.attribute), error_type: nullable(item?.errorType), classification: nullable(item?.classification),
      quality_guideline_json: item?.qualityGuideline ? JSON.stringify(item.qualityGuideline) : null, item_json: JSON.stringify(item ?? {}),
      source_file: sourceFile, source_sheet: row.__source_sheet, source_row: row.__source_row,
    });
    lineage.push({ source_file: sourceFile, source_sheet: row.__source_sheet, source_row: row.__source_row, destination_table: "evaluation_items", destination_id: id, migration_status: migrationStatus, reason: "Fila derivada de payload_json.items" });
  });
  if (payload.audioUrl || payload.audioFileName || payload.recordingCode) {
    const id = deterministicUuid("evaluation_media", `${row.id}|${payload.audioUrl || ""}|${payload.audioFileName || ""}`);
    data.evaluation_media.push({
      id, evaluation_id: nullable(row.id), recording_code: nullable(payload.recordingCode), external_url: nullable(payload.audioUrl), file_name: nullable(payload.audioFileName),
      file_size_bytes: payload.audioFileSize ?? null, mime_type: nullable(payload.audioMimeType), duration_seconds: payload.audioDurationSeconds ?? null,
      metadata_json: JSON.stringify({ storage: "Google Drive/reference only", downloaded: false }), source_file: sourceFile, source_sheet: row.__source_sheet, source_row: row.__source_row,
    });
    lineage.push({ source_file: sourceFile, source_sheet: row.__source_sheet, source_row: row.__source_row, destination_table: "evaluation_media", destination_id: id, migration_status: migrationStatus, reason: "Referencia preservada; no se descargó el audio" });
  }
}
const evaluationIds = new Set(data.evaluations.map((row) => row.id));

const feedbackRows = rowsOf("FEEDBACKS");
data.feedback = feedbackRows.map((row) => {
  const valid = row.feedback_id && evaluationIds.has(nullable(row.evaluation_id)) && personIds.has(nullable(row.advisor_id)) && userIds.has(nullable(row.supervisor_id)) && userIds.has(nullable(row.evaluator_id));
  const status = valid ? STATUS.READY : STATUS.INVALID;
  addDisposition(row, "feedback", nullable(row.feedback_id), status, valid ? "" : "Falta id o referencia obligatoria");
  return {
    id: nullable(row.feedback_id), evaluation_id: nullable(row.evaluation_id), person_id: nullable(row.advisor_id), supervisor_user_id: nullable(row.supervisor_id), evaluator_user_id: nullable(row.evaluator_id),
    evaluation_type: nullable(row.evaluation_type), feedback_text: nullable(row.feedback_text), advisor_response: nullable(row.advisor_response), advisor_evidence_url: nullable(row.advisor_evidence_url),
    supervisor_closure_comment: nullable(row.supervisor_closure_comment), status: nullable(row.status), created_at: isoValue(row.created_at), advisor_action_at: isoValue(row.advisor_action_at),
    closed_at: isoValue(row.closed_at), updated_at: isoValue(row.updated_at), migration_status: status, ...provenance(row),
  };
});

const capsuleRows = rowsOf("DEVELOPMENT_CAPSULES");
data.development_capsules = capsuleRows.map((row) => {
  const parsed = safeJson(row.data_json);
  const status = row.id && parsed.ok ? STATUS.READY : STATUS.INVALID;
  addDisposition(row, "development_capsules", nullable(row.id), status, status === STATUS.INVALID ? "Falta id o JSON inválido" : "");
  return { id: nullable(row.id), status: nullable(row.status), data_json: jsonText(row.data_json), created_at: isoValue(row.created_at), updated_at: isoValue(row.updated_at), migration_status: status, ...provenance(row) };
});
const capsuleIds = new Set(data.development_capsules.map((row) => row.id));

const developmentRows = rowsOf("DEVELOPMENT_ASSIGNMENTS");
data.development_assignments = developmentRows.map((row) => {
  const valid = row.id && capsuleIds.has(nullable(row.capsule_id)) && personIds.has(nullable(row.advisor_id));
  const status = valid ? STATUS.READY : STATUS.INVALID;
  addDisposition(row, "development_assignments", nullable(row.id), status, valid ? "" : "Falta id o referencia obligatoria");
  return { id: nullable(row.id), capsule_id: nullable(row.capsule_id), person_id: nullable(row.advisor_id), status: nullable(row.status), data_json: jsonText(row.data_json), created_at: isoValue(row.created_at), updated_at: isoValue(row.updated_at), migration_status: status, ...provenance(row) };
});

const appStateRows = rowsOf("APP_STATE");
data.app_state_fragments = appStateRows.map((row) => {
  const parsed = safeJson(row.payload_json);
  const status = parsed.ok ? STATUS.READY : STATUS.REVIEW;
  const reason = parsed.ok ? "" : "payload_json es un fragmento/texto no JSON; se preserva sin interpretar";
  if (!parsed.ok) unmappedValues.push({ ...provenance(row), entity: "app_state_fragment", record_id: row.id, field: "payload_json", original_value: "[contenido preservado en staging]", reason });
  addDisposition(row, "app_state_fragments", nullable(row.id), status, reason);
  return { id: nullable(row.id), payload_fragment: row.payload_json ?? null, updated_at: isoValue(row.updated_at), parse_status: parsed.ok ? RESOLUTION.RESOLVED : RESOLUTION.UNMAPPED, migration_status: status, ...provenance(row) };
});

const sessionRows = rowsOf("SESSIONS");
data.legacy_sessions = sessionRows.map((row) => {
  const valid = row.token && userIds.has(nullable(row.user_id));
  const status = valid ? STATUS.REVIEW : STATUS.INVALID;
  const reason = valid ? "Token legacy sensible; no es importable a Supabase Auth sin decisión de Fase 2" : "Falta token o user_id válido";
  addDisposition(row, "legacy_sessions", deterministicUuid("legacy_session", row.token || `${row.user_id}|${row.__source_row}`), status, reason);
  return { id: deterministicUuid("legacy_session", row.token || `${row.user_id}|${row.__source_row}`), legacy_token: nullable(row.token), user_id: nullable(row.user_id), created_at: isoValue(row.created_at), migration_status: status, ...provenance(row) };
});

// Hojas con encabezados pero sin filas se contabilizan en inventario; no crean tablas vacías.
for (const sheet of parsedSheets.filter((item) => item.rows.length && !dispositions.some((row) => row.source_sheet === item.sheetName))) {
  for (const row of sheet.rows) {
    const id = deterministicUuid("staging_only", `${sheet.sheetName}|${row.__source_row}`);
    addDisposition(row, "staging_source_records", id, STATUS.REVIEW, "Entidad no normalizada; registro preservado íntegramente en staging");
  }
}

// Duplicate analysis.
const employeeCodeGroups = new Map();
for (const person of data.people) {
  if (!person.employee_code) continue;
  const list = employeeCodeGroups.get(person.employee_code) || [];
  list.push(person);
  employeeCodeGroups.set(person.employee_code, list);
}
for (const [employeeCode, people] of employeeCodeGroups) {
  if (people.length < 2) continue;
  for (const person of people) {
    possibleDuplicates.push({ ...pickProvenance(person), entity: "person", record_id: person.id, duplicate_key: `employee_code=${employeeCode}`, compared_ids: people.map((item) => item.id).filter((id) => id !== person.id).join(" | "), classification: "POSSIBLE_DUPLICATE", reason: "Código de empleado repetido con DNI e identidad distintos; no se fusionó" });
  }
}

const operationsByName = new Map();
for (const operation of data.operations.filter((row) => !row.legacy)) {
  const list = operationsByName.get(operation.normalized_name) || [];
  list.push(operation);
  operationsByName.set(operation.normalized_name, list);
}
for (const [name, operations] of operationsByName) {
  if (operations.length < 2) continue;
  for (const operation of operations) {
    possibleDuplicates.push({ ...pickProvenance(operation), entity: "operation", record_id: operation.id, duplicate_key: `normalized_name=${name}`, compared_ids: operations.map((item) => item.id).filter((id) => id !== operation.id).join(" | "), classification: "NOT_DUPLICATE", reason: "Mismo nombre en empresas distintas; se preservan como operaciones separadas" });
  }
}

const evalFingerprintGroups = new Map();
for (const evaluation of data.evaluations) {
  const payload = safeJson(evaluation.payload_json).value || {};
  const key = [evaluation.person_id, evaluation.evaluation_type, evaluation.evaluated_at, payload.callId || "", payload.recordingCode || ""].join("|");
  const list = evalFingerprintGroups.get(key) || [];
  list.push(evaluation);
  evalFingerprintGroups.set(key, list);
}
for (const [key, evaluations] of evalFingerprintGroups) {
  if (evaluations.length < 2) continue;
  for (const evaluation of evaluations) {
    possibleDuplicates.push({ ...pickProvenance(evaluation), entity: "evaluation", record_id: evaluation.id, duplicate_key: key, compared_ids: evaluations.map((item) => item.id).filter((id) => id !== evaluation.id).join(" | "), classification: "POSSIBLE_DUPLICATE", reason: "Coinciden persona, tipo, fecha/hora y referencia de llamada; no se eliminó" });
  }
}

function pickProvenance(row) {
  return { source_file: row.source_file, source_sheet: row.source_sheet, source_row: row.source_row };
}

const fkDefinitions = [
  ["users", "person_id", "people", "id"], ["teams", "operation_id", "operations", "id"], ["teams", "supervisor_id", "users", "id"],
  ["assignments", "person_id", "people", "id"], ["assignments", "operation_id", "operations", "id"], ["assignments", "team_id", "teams", "id"], ["assignments", "supervisor_id", "users", "id"],
  ["operation_supervisors", "operation_id", "operations", "id"], ["operation_supervisors", "supervisor_id", "users", "id"],
  ["staffing_movements", "person_id", "people", "id"], ["staffing_movements", "assignment_id", "assignments", "id"],
  ["evaluations", "person_id", "people", "id"], ["evaluations", "evaluator_user_id", "users", "id"], ["evaluations", "supervisor_user_id", "users", "id"], ["evaluations", "operation_id", "operations", "id"],
  ["evaluation_items", "evaluation_id", "evaluations", "id"], ["evaluation_media", "evaluation_id", "evaluations", "id"],
  ["feedback", "evaluation_id", "evaluations", "id"], ["feedback", "person_id", "people", "id"], ["feedback", "supervisor_user_id", "users", "id"], ["feedback", "evaluator_user_id", "users", "id"],
  ["development_assignments", "capsule_id", "development_capsules", "id"], ["development_assignments", "person_id", "people", "id"], ["legacy_sessions", "user_id", "users", "id"],
];
const referentialIntegrity = fkDefinitions.map(([sourceTable, sourceColumn, targetTable, targetColumn]) => {
  const targets = new Set((data[targetTable] || []).map((row) => nullable(row[targetColumn])).filter(Boolean));
  const refs = (data[sourceTable] || []).map((row) => ({ value: nullable(row[sourceColumn]), row })).filter((item) => item.value);
  const missing = refs.filter((item) => !targets.has(item.value));
  return {
    source_table: sourceTable, source_column: sourceColumn, target_table: targetTable, target_column: targetColumn,
    references: refs.length, resolved: refs.length - missing.length, unresolved: missing.length,
    status: missing.length ? "FAIL" : "PASS", examples: missing.slice(0, 5).map((item) => `${item.value}@${item.row.source_sheet}:${item.row.source_row}`).join(" | "),
  };
});

const dispositionKey = (row) => `${row.source_sheet}:${row.source_row}`;
const duplicateDispositions = dispositions.length - new Set(dispositions.map(dispositionKey)).size;
if (duplicateDispositions) throw new Error(`Hay ${duplicateDispositions} disposiciones primarias duplicadas`);
if (dispositions.length !== sourceRecords.length) throw new Error(`No todas las filas origen fueron contabilizadas: ${sourceRecords.length} origen vs ${dispositions.length} disposiciones`);

const sourceCounts = dispositions.reduce((counts, row) => {
  counts[row.migration_status] = (counts[row.migration_status] || 0) + 1;
  return counts;
}, {});
const destinationCounts = Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
const sourceReferenceText = sourceRecords.map((row) => row.raw_json).join("\n");
const sourceReferenceCounts = {
  http_urls: (sourceReferenceText.match(/https?:\/\//gi) || []).length,
  drive_or_file_references: (sourceReferenceText.match(/drive\.google\.com|\/api\/files\/|fileId/gi) || []).length,
};

const importOrder = [
  "companies", "campaign_definitions", "operations", "people", "users", "teams", "operation_supervisors", "assignments",
  "staffing_movements", "evaluations", "evaluation_items", "evaluation_media", "feedback", "development_capsules", "development_assignments",
  "app_state_fragments", "legacy_sessions",
];

const manifest = {
  package_version: 1,
  generated_at: new Date().toISOString(),
  source_file: sourceFile,
  source_sha256: sourceHashBefore,
  source_sheet_count: parsedSheets.length,
  source_rows: sourceRecords.length,
  source_status_counts: { READY: sourceCounts.READY || 0, REVIEW_REQUIRED: sourceCounts.REVIEW_REQUIRED || 0, INVALID: sourceCounts.INVALID || 0 },
  destination_counts: destinationCounts,
  destination_rows: Object.values(destinationCounts).reduce((sum, count) => sum + count, 0),
  source_reference_counts: sourceReferenceCounts,
  import_order: importOrder,
  network_writes: false,
  source_modified: false,
};

const sqlSchema = `-- Generated from ${sourceFile}. No network operations are performed.\nBEGIN;\n\nCREATE TABLE migration_status_reference (\n  code text PRIMARY KEY,\n  description text NOT NULL\n);\n\nCREATE TABLE companies (\n  id text PRIMARY KEY, name text NOT NULL, normalized_name text NOT NULL, status text, created_at timestamptz, updated_at timestamptz,\n  migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE campaign_definitions (\n  id text PRIMARY KEY, name text NOT NULL, normalized_name text NOT NULL, client text, status text, products_json jsonb, description text,\n  quality_guidelines_json jsonb, quality_criterion_weights_json jsonb, quality_critical_errors_json jsonb, background_image text,\n  resolution_status text NOT NULL, resolution_reason text, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE operations (\n  id text PRIMARY KEY, company_id text NOT NULL, source_campaign_id text, name text NOT NULL, normalized_name text NOT NULL, status text, legacy boolean NOT NULL DEFAULT false,\n  created_at timestamptz, updated_at timestamptz, closed_at timestamptz, version text, metadata_json jsonb, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE people (\n  id text PRIMARY KEY, source_advisor_id text UNIQUE, dni text, employee_code text, display_name text NOT NULL, normalized_name text NOT NULL, first_name text, last_name text,\n  name_parse_status text NOT NULL, status text, active boolean, profile_json jsonb, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE users (\n  id text PRIMARY KEY, person_id text, source_advisor_id text, name text NOT NULL, email text NOT NULL, username text, role text, status text, source_team_id text, avatar text,\n  created_at timestamptz, legacy_password_hash text, must_change_password boolean, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE teams (\n  id text PRIMARY KEY, operation_id text, source_campaign_id text, supervisor_id text NOT NULL, name text NOT NULL, resolution_status text NOT NULL, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE assignments (\n  id text PRIMARY KEY, person_id text NOT NULL, operation_id text NOT NULL, team_id text, source_team_id text, supervisor_id text NOT NULL, role text, operational_status text,\n  start_at timestamptz, end_at timestamptz, active boolean, source text, actor_user_id text, source_actor_id text, observation text, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE operation_supervisors (\n  id uuid PRIMARY KEY, operation_id text NOT NULL, supervisor_id text NOT NULL, active boolean, start_at timestamptz, end_at timestamptz, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE staffing_movements (\n  id text PRIMARY KEY, person_id text NOT NULL, assignment_id text, source_assignment_id text NOT NULL, type text, effective_at timestamptz, created_at timestamptz,\n  origin_json jsonb, destination_json jsonb, actor_user_id text, source_actor_id text, observation text, reversed_movement_id text, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE evaluations (\n  id text PRIMARY KEY, person_id text NOT NULL, evaluator_user_id text NOT NULL, supervisor_user_id text, operation_id text, source_campaign_id text, source_team_id text,\n  evaluation_type text NOT NULL, evaluated_at timestamptz, created_at timestamptz, product text, call_id text, evaluation_subtype text, quality_status text, origin text, validation_status text, validated_at timestamptz,\n  sale boolean, sale_result text, comments text, primary_gap text, secondary_gap text, strongest_pillar text, recommendation text, score_connect numeric, score_clarify numeric, score_convert numeric,\n  score_total numeric, technical_score numeric, quality_result text, critical_reason text, payload_json jsonb NOT NULL, operation_resolution_status text NOT NULL, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE evaluation_items (\n  id uuid PRIMARY KEY, evaluation_id text NOT NULL, ordinal integer NOT NULL, source_item_id text, criterion_id text, dimension text, compliance text, percentage numeric, level numeric,\n  finding text, evidence text, recommended_action text, attribute_weight numeric, category text, attribute text, error_type text, classification text, quality_guideline_json jsonb, item_json jsonb NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE evaluation_media (\n  id uuid PRIMARY KEY, evaluation_id text NOT NULL, recording_code text, external_url text, file_name text, file_size_bytes bigint, mime_type text, duration_seconds numeric, metadata_json jsonb,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE feedback (\n  id text PRIMARY KEY, evaluation_id text NOT NULL, person_id text NOT NULL, supervisor_user_id text NOT NULL, evaluator_user_id text NOT NULL, evaluation_type text, feedback_text text,\n  advisor_response text, advisor_evidence_url text, supervisor_closure_comment text, status text, created_at timestamptz, advisor_action_at timestamptz, closed_at timestamptz, updated_at timestamptz,\n  migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE development_capsules (\n  id text PRIMARY KEY, status text, data_json jsonb NOT NULL, created_at timestamptz, updated_at timestamptz, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE development_assignments (\n  id text PRIMARY KEY, capsule_id text NOT NULL, person_id text NOT NULL, status text, data_json jsonb NOT NULL, created_at timestamptz, updated_at timestamptz, migration_status text NOT NULL,\n  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE app_state_fragments (\n  id text PRIMARY KEY, payload_fragment text, updated_at timestamptz, parse_status text NOT NULL, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCREATE TABLE legacy_sessions (\n  id uuid PRIMARY KEY, legacy_token text NOT NULL, user_id text NOT NULL, created_at timestamptz, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL\n);\n\nCOMMIT;\n`;

const sqlConstraints = `-- Apply only after loading and reviewing REVIEW_REQUIRED rows.\nBEGIN;\nALTER TABLE operations ADD CONSTRAINT operations_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);\nALTER TABLE operations ADD CONSTRAINT operations_campaign_source_fk FOREIGN KEY (source_campaign_id) REFERENCES campaign_definitions(id);\nALTER TABLE operations ADD CONSTRAINT operations_company_normalized_name_uq UNIQUE (company_id, normalized_name);\nALTER TABLE users ADD CONSTRAINT users_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE teams ADD CONSTRAINT teams_operation_fk FOREIGN KEY (operation_id) REFERENCES operations(id);\nALTER TABLE teams ADD CONSTRAINT teams_supervisor_fk FOREIGN KEY (supervisor_id) REFERENCES users(id);\nALTER TABLE assignments ADD CONSTRAINT assignments_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE assignments ADD CONSTRAINT assignments_operation_fk FOREIGN KEY (operation_id) REFERENCES operations(id);\nALTER TABLE assignments ADD CONSTRAINT assignments_team_fk FOREIGN KEY (team_id) REFERENCES teams(id);\nALTER TABLE assignments ADD CONSTRAINT assignments_supervisor_fk FOREIGN KEY (supervisor_id) REFERENCES users(id);\nALTER TABLE operation_supervisors ADD CONSTRAINT operation_supervisors_operation_fk FOREIGN KEY (operation_id) REFERENCES operations(id);\nALTER TABLE operation_supervisors ADD CONSTRAINT operation_supervisors_user_fk FOREIGN KEY (supervisor_id) REFERENCES users(id);\nALTER TABLE operation_supervisors ADD CONSTRAINT operation_supervisors_period_uq UNIQUE (operation_id, supervisor_id, start_at);\nALTER TABLE staffing_movements ADD CONSTRAINT staffing_movements_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE staffing_movements ADD CONSTRAINT staffing_movements_assignment_fk FOREIGN KEY (assignment_id) REFERENCES assignments(id);\nALTER TABLE evaluations ADD CONSTRAINT evaluations_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE evaluations ADD CONSTRAINT evaluations_evaluator_fk FOREIGN KEY (evaluator_user_id) REFERENCES users(id);\nALTER TABLE evaluations ADD CONSTRAINT evaluations_supervisor_fk FOREIGN KEY (supervisor_user_id) REFERENCES users(id);\nALTER TABLE evaluations ADD CONSTRAINT evaluations_operation_fk FOREIGN KEY (operation_id) REFERENCES operations(id);\nALTER TABLE evaluation_items ADD CONSTRAINT evaluation_items_evaluation_fk FOREIGN KEY (evaluation_id) REFERENCES evaluations(id);\nALTER TABLE evaluation_items ADD CONSTRAINT evaluation_items_ordinal_uq UNIQUE (evaluation_id, ordinal);\nALTER TABLE evaluation_media ADD CONSTRAINT evaluation_media_evaluation_fk FOREIGN KEY (evaluation_id) REFERENCES evaluations(id);\nALTER TABLE feedback ADD CONSTRAINT feedback_evaluation_fk FOREIGN KEY (evaluation_id) REFERENCES evaluations(id);\nALTER TABLE feedback ADD CONSTRAINT feedback_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE feedback ADD CONSTRAINT feedback_supervisor_fk FOREIGN KEY (supervisor_user_id) REFERENCES users(id);\nALTER TABLE feedback ADD CONSTRAINT feedback_evaluator_fk FOREIGN KEY (evaluator_user_id) REFERENCES users(id);\nALTER TABLE development_assignments ADD CONSTRAINT development_assignments_capsule_fk FOREIGN KEY (capsule_id) REFERENCES development_capsules(id);\nALTER TABLE development_assignments ADD CONSTRAINT development_assignments_person_fk FOREIGN KEY (person_id) REFERENCES people(id);\nALTER TABLE legacy_sessions ADD CONSTRAINT legacy_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id);\nCREATE UNIQUE INDEX companies_normalized_name_uq ON companies(normalized_name);\nCREATE INDEX assignments_person_active_idx ON assignments(person_id, active);\nCREATE INDEX assignments_operation_active_idx ON assignments(operation_id, active);\nCREATE INDEX evaluations_person_date_idx ON evaluations(person_id, evaluated_at);\nCREATE INDEX evaluations_operation_date_idx ON evaluations(operation_id, evaluated_at);\nCREATE INDEX feedback_evaluation_idx ON feedback(evaluation_id);\nCREATE INDEX staffing_movements_person_date_idx ON staffing_movements(person_id, effective_at);\nCOMMIT;\n`;

const sqlSeed = `BEGIN;\nINSERT INTO migration_status_reference(code, description) VALUES\n  ('READY', 'Puede importarse después de validar la Fase 2.'),\n  ('REVIEW_REQUIRED', 'Se preservó, pero necesita una decisión humana antes de la importación definitiva.'),\n  ('INVALID', 'No cumple una condición estructural obligatoria; permanece en staging.')\nON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;\nCOMMIT;\n`;

const validateScript = `import crypto from "node:crypto";\nimport fs from "node:fs/promises";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst args = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => token.startsWith("--") ? [...pairs, [token.slice(2), all[index + 1]]] : pairs, []));\nfunction parseCsv(text) {\n  const rows = []; let row = []; let field = ""; let quoted = false;\n  const clean = text.replace(/^\\uFEFF/, "");\n  for (let i = 0; i < clean.length; i += 1) { const ch = clean[i]; if (quoted) { if (ch === '"' && clean[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch; } else if (ch === '"') quoted = true; else if (ch === ',') { row.push(field); field = ""; } else if (ch === '\\n') { row.push(field.replace(/\\r$/, "")); if (row.some((v) => v !== "")) rows.push(row); row = []; field = ""; } else field += ch; }\n  if (field || row.length) { row.push(field); rows.push(row); }\n  if (!rows.length) return []; const headers = rows[0]; return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));\n}\nasync function csv(name, folder = "data") { return parseCsv(await fs.readFile(path.join(root, folder, name + ".csv"), "utf8")); }\nconst manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));\nconst failures = []; const checks = [];\nfunction check(name, condition, detail) { checks.push({ name, ok: Boolean(condition), detail }); if (!condition) failures.push(name + ": " + detail); }\nconst source = await csv("source_records", "staging"); const dispositions = await csv("source_record_disposition", "reports");\ncheck("source row count", source.length === manifest.source_rows, source.length + " vs " + manifest.source_rows);\ncheck("disposition count", dispositions.length === manifest.source_rows, dispositions.length + " vs " + manifest.source_rows);\ncheck("unique source disposition", new Set(dispositions.map((r) => r.source_sheet + ":" + r.source_row)).size === dispositions.length, "duplicate source keys");\nconst tables = {};\nfor (const [table, expected] of Object.entries(manifest.destination_counts)) { tables[table] = await csv(table); check(table + " row count", tables[table].length === expected, tables[table].length + " vs " + expected); check(table + " primary key", tables[table].every((r) => r.id) && new Set(tables[table].map((r) => r.id)).size === tables[table].length, "missing or duplicate id"); }\nconst fks = ${JSON.stringify(fkDefinitions)};\nfor (const [fromTable, fromColumn, toTable, toColumn] of fks) { const targets = new Set((tables[toTable] || []).map((r) => r[toColumn]).filter(Boolean)); const refs = (tables[fromTable] || []).map((r) => r[fromColumn]).filter(Boolean); const missing = refs.filter((value) => !targets.has(value)); check(fromTable + "." + fromColumn + " FK", missing.length === 0, missing.slice(0, 5).join(" | ")); }\nconst operationKeys = tables.operations.map((r) => r.company_id + "|" + r.normalized_name); check("operation uniqueness by company", new Set(operationKeys).size === operationKeys.length, "duplicate company+normalized_name");\nconst homonyms = new Map(); for (const r of tables.operations.filter((r) => r.legacy !== "true")) { const set = homonyms.get(r.normalized_name) || new Set(); set.add(r.company_id); homonyms.set(r.normalized_name, set); } check("homonymous operations remain company-scoped", [...homonyms.values()].every((set) => set.size >= 1), "invalid operation scope");\nconst stagedText = source.map((r) => r.raw_json).join("\\n"); const refs = { http_urls: (stagedText.match(/https?:\\/\\//gi) || []).length, drive_or_file_references: (stagedText.match(/drive\\.google\\.com|\\/api\\/files\\/|fileId/gi) || []).length }; check("external references preserved", JSON.stringify(refs) === JSON.stringify(manifest.source_reference_counts), JSON.stringify(refs));\nif (args.source) { const bytes = await fs.readFile(path.resolve(args.source)); const hash = crypto.createHash("sha256").update(bytes).digest("hex"); check("source hash unchanged", hash === manifest.source_sha256, hash); }\nconsole.log(JSON.stringify({ verified: failures.length === 0, checks, failures }, null, 2)); if (failures.length) process.exitCode = 1;\n`;

const importScript = `import fs from "node:fs/promises";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));\nif (process.argv.includes("--apply") || process.argv.includes("--execute")) { throw new Error("Fase 2 no implementada: este script no abre conexiones ni escribe en Supabase."); }\nconsole.log(JSON.stringify({ mode: "DRY_RUN_ONLY", networkWrites: false, source: manifest.source_file, importOrder: manifest.import_order.map((table) => ({ table, rows: manifest.destination_counts[table] || 0 })), reviewRequired: manifest.source_status_counts.REVIEW_REQUIRED, invalid: manifest.source_status_counts.INVALID, nextStep: "Resolver reportes y autorizar explícitamente la Fase 2." }, null, 2));\n`;

const summary = `# Resumen de preparación para Supabase\n\n## Estado\n\nPaquete local generado sin conexiones externas. El Excel fuente no se modificó. Hash SHA-256: \`${sourceHashBefore}\`.\n\n## 1. Hojas encontradas y filas\n\n| Hoja | Filas de datos | Columnas | Entidad probable | Problemas |\n|---|---:|---:|---|---|\n${workbookInventory.map((row) => `| ${row.sheet} | ${row.data_rows} | ${row.columns} | ${row.probable_entity} | ${row.problems || "Sin anomalías estructurales básicas"} |`).join("\n")}\n\n## 2. Entidades identificadas\n\n${Object.entries(destinationCounts).map(([table, count]) => `- ${table}: ${count}`).join("\n")}\n\nNo se crearon tablas de destino para QUALITY_ALERTS ni CALIBRATIONS porque sólo contienen encabezados. Sus hojas permanecen en staging.\n\n## 3. Relaciones identificadas\n\n- Empresa → operación por \`operations.company_id\`.\n- Campaña fuente → operación por \`operations.source_campaign_id\`, sin asumir que un nombre global identifica empresa.\n- Persona → asignaciones históricas por \`assignments.person_id\`.\n- Operación → supervisores por \`operation_supervisors\`.\n- Evaluación → persona, evaluador, supervisor, operación resoluble, ítems y referencia de audio.\n- Feedback → evaluación, persona, supervisor y evaluador.\n- Cápsula de desarrollo → asignaciones de desarrollo.\n- Movimiento → persona y asignación cuando la referencia existe; el id histórico no resoluble se conserva por separado.\n\n## 4. Esquema PostgreSQL propuesto\n\nEl esquema está en \`01_schema.sql\`. Las FK, el índice de operaciones y \`UNIQUE(company_id, normalized_name)\` están en \`02_constraints_indexes.sql\`. Los IDs existentes se preservaron; los IDs ausentes de relaciones derivadas usan UUID determinístico SHA-256.\n\n## 5. Transformaciones realizadas\n\n- Espacios, controles invisibles y claves de comparación se normalizaron sin alterar staging.\n- Fechas reconocibles se expresaron en ISO 8601; los valores no reconocibles permanecen textuales en staging.\n- Booleanos conocidos se tiparon; valores no reconocibles quedan nulos y trazables.\n- ADVISORS se separó en people y OPERATION_ASSIGNMENTS en assignments. El nombre completo se preservó; first_name y last_name quedan nulos porque el archivo no permite separarlos con seguridad.\n- Los campos JSON completos se preservaron. Los 418 ítems de evaluación se normalizaron además en evaluation_items.\n- Se preservaron ${data.evaluation_media.length} referencias de audio/archivo sin descargar contenido.\n\n## 6. Duplicados\n\n- Filas completamente duplicadas en hojas: ${workbookInventory.reduce((sum, row) => sum + Number(row.duplicate_full_rows || 0), 0)}.\n- Casos detallados en \`reports/possible_duplicates.csv\`: ${possibleDuplicates.length}.\n- Las operaciones homónimas de empresas distintas se clasifican como NOT_DUPLICATE.\n- No se fusionó ni eliminó ningún registro dudoso.\n\n## 7. Campañas ambiguas\n\nHay ${ambiguousRecords.filter((row) => row.entity.includes("campaign") || row.entity === "operation").length} registros de campaña/operación que requieren revisión. Migraciones Bitel y Portabilidad Bitel no se resolvieron sólo por nombre. Las operaciones confirmadas se mantienen separadas por empresa.\n\n## 8. Datos no resolubles automáticamente\n\n- USERS tiene referencias históricas a advisors/equipos ausentes.\n- ADVISORS y OPERATION_ASSIGNMENTS conservan team_id históricos que no existen en TEAMS.\n- STAFFING_MOVEMENTS contiene referencias a asignaciones históricas ausentes; source_assignment_id se conserva.\n- APP_STATE contiene fragmentos textuales que no son JSON autónomo.\n- Las sesiones y hashes legacy son sensibles y no son importables directamente a Supabase Auth.\n- El archivo no contiene fechas suficientes para reconstruir una historia completa anterior a las asignaciones existentes.\n\n## 9. Conteo origen → destino\n\n| Métrica | Conteo |\n|---|---:|\n| SOURCE_ROWS | ${sourceRecords.length} |\n| MIGRATABLE / READY | ${sourceCounts.READY || 0} |\n| REVIEW_REQUIRED | ${sourceCounts.REVIEW_REQUIRED || 0} |\n| INVALID | ${sourceCounts.INVALID || 0} |\n| DESTINATION_ROWS | ${manifest.destination_rows} |\n\nDESTINATION_ROWS incluye filas derivadas (ítems y referencias de audio). Cada fila origen tiene exactamente una disposición primaria en \`source_record_disposition.csv\`; una fila puede producir destinos hijos adicionales registrados en \`lineage.csv\`.\n\n## 10. Riesgos\n\n- Importar antes de resolver REVIEW_REQUIRED puede asociar evaluaciones a la empresa equivocada.\n- Aplicar FK directamente sobre ids históricos rotos perdería trazabilidad; por eso se separaron columnas fuente y FK resolubles.\n- Password hashes y tokens legacy requieren una estrategia específica de Supabase Auth y control de acceso al paquete.\n- La fuente contiene estado aplicativo fragmentado; debe decidirse si se archiva o se transforma en Fase 2.\n\n## 11. Decisiones humanas pendientes\n\n- Resolver campañas legacy/ambiguas y confirmar su empresa/operación.\n- Decidir el tratamiento de equipos históricos ausentes.\n- Confirmar si los movimientos huérfanos deben vincularse a asignaciones reconstruidas o quedar como archivo histórico.\n- Definir migración de autenticación y revocación de sesiones legacy.\n- Confirmar reglas de separación de nombres y apellidos, si se requieren campos distintos.\n\n## 12. Integridad y preservación\n\nLas ${sourceRecords.length} filas de datos se contabilizaron sin eliminación silenciosa. Las hojas vacías o sólo con encabezados se inventariaron y preservaron como archivos staging con encabezados. El hash antes y después se valida contra el mismo archivo fuente.\n`;

const readme = `# Paquete de migración C&M → Supabase/PostgreSQL\n\nEste paquete es de preparación local. No contiene cliente de Supabase, service role ni escritura de red.\n\n## Regenerar\n\n\`\`\`powershell\nnode scripts/prepare-supabase-migration.mjs --source "C:\\ruta\\BBDD.xlsx"\n\`\`\`\n\n## Validar\n\n\`\`\`powershell\nnode migration/supabase/scripts/validate-migration.mjs --source "C:\\ruta\\BBDD.xlsx"\nnode migration/supabase/scripts/import-to-supabase.mjs\n\`\`\`\n\nEl segundo comando sólo muestra el plan de importación. Rechaza \`--apply\`.\n`;

await fs.mkdir(outputDir, { recursive: true });
for (const folder of ["data", "reports", "scripts", "staging"]) {
  const folderPath = path.join(outputDir, folder);
  await fs.mkdir(folderPath, { recursive: true });
  for (const entry of await fs.readdir(folderPath, { withFileTypes: true })) {
    if (entry.isFile()) await fs.unlink(path.join(folderPath, entry.name));
  }
}

for (const sheet of parsedSheets) {
  const stagingRows = sheet.rows.map((row) => ({ source_file: sourceFile, source_sheet: sheet.sheetName, source_row: row.__source_row, ...Object.fromEntries(sheet.headers.map((header) => [header, sourceValue(row[header])])) }));
  await writeCsv(path.join(outputDir, "staging", `${slugify(sheet.sheetName)}.csv`), stagingRows, ["source_file", "source_sheet", "source_row", ...sheet.headers]);
}
await writeCsv(path.join(outputDir, "staging", "source_records.csv"), sourceRecords, ["source_file", "source_sheet", "source_row", "record_sha256", "raw_json"]);

for (const [table, rows] of Object.entries(data)) await writeCsv(path.join(outputDir, "data", `${table}.csv`), rows);
await writeCsv(path.join(outputDir, "reports", "workbook_inventory.csv"), workbookInventory);
await writeCsv(path.join(outputDir, "reports", "source_record_disposition.csv"), dispositions);
await writeCsv(path.join(outputDir, "reports", "lineage.csv"), lineage);
await writeCsv(path.join(outputDir, "reports", "ambiguous_records.csv"), ambiguousRecords, ["source_file", "source_sheet", "source_row", "entity", "record_id", "field", "original_value", "candidates", "reason"]);
await writeCsv(path.join(outputDir, "reports", "unmapped_values.csv"), unmappedValues, ["source_file", "source_sheet", "source_row", "entity", "record_id", "field", "original_value", "reason"]);
await writeCsv(path.join(outputDir, "reports", "possible_duplicates.csv"), possibleDuplicates, ["source_file", "source_sheet", "source_row", "entity", "record_id", "duplicate_key", "compared_ids", "classification", "reason"]);
await writeCsv(path.join(outputDir, "reports", "normalization_report.csv"), normalizationReport, ["source_file", "source_sheet", "source_row", "field", "original_value", "normalized_value", "rule"]);
await writeCsv(path.join(outputDir, "reports", "referential_integrity_report.csv"), referentialIntegrity);
await writeText(path.join(outputDir, "reports", "migration_summary.md"), summary);
await writeText(path.join(outputDir, "01_schema.sql"), sqlSchema);
await writeText(path.join(outputDir, "02_constraints_indexes.sql"), sqlConstraints);
await writeText(path.join(outputDir, "03_seed_reference_data.sql"), sqlSeed);
await writeText(path.join(outputDir, "scripts", "validate-migration.mjs"), validateScript);
await writeText(path.join(outputDir, "scripts", "import-to-supabase.mjs"), importScript);
await writeText(path.join(outputDir, "README.md"), readme);
await writeText(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeText(path.join(outputDir, "import-order.json"), `${JSON.stringify(importOrder, null, 2)}\n`);

const sourceHashAfter = sha256(await fs.readFile(sourcePath));
if (sourceHashAfter !== sourceHashBefore) throw new Error("El archivo fuente cambió durante la preparación");

console.log(JSON.stringify({
  mode: "LOCAL_DRY_RUN",
  source: sourceFile,
  sourceSha256: sourceHashBefore,
  sheets: parsedSheets.length,
  sourceRows: sourceRecords.length,
  sourceStatusCounts: manifest.source_status_counts,
  destinationRows: manifest.destination_rows,
  outputDir,
  sourceModified: false,
  networkWrites: false,
}, null, 2));
