import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => token.startsWith("--") ? [...pairs, [token.slice(2), all[index + 1]]] : pairs, []));
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < clean.length; i += 1) { const ch = clean[i]; if (quoted) { if (ch === '"' && clean[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch; } else if (ch === '"') quoted = true; else if (ch === ',') { row.push(field); field = ""; } else if (ch === '\n') { row.push(field.replace(/\r$/, "")); if (row.some((v) => v !== "")) rows.push(row); row = []; field = ""; } else field += ch; }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return []; const headers = rows[0]; return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}
async function csv(name, folder = "data") { return parseCsv(await fs.readFile(path.join(root, folder, name + ".csv"), "utf8")); }
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
const failures = []; const checks = [];
function check(name, condition, detail) { checks.push({ name, ok: Boolean(condition), detail }); if (!condition) failures.push(name + ": " + detail); }
const source = await csv("source_records", "staging"); const dispositions = await csv("source_record_disposition", "reports");
check("source row count", source.length === manifest.source_rows, source.length + " vs " + manifest.source_rows);
check("disposition count", dispositions.length === manifest.source_rows, dispositions.length + " vs " + manifest.source_rows);
check("unique source disposition", new Set(dispositions.map((r) => r.source_sheet + ":" + r.source_row)).size === dispositions.length, "duplicate source keys");
const tables = {};
for (const [table, expected] of Object.entries(manifest.destination_counts)) { tables[table] = await csv(table); check(table + " row count", tables[table].length === expected, tables[table].length + " vs " + expected); check(table + " primary key", tables[table].every((r) => r.id) && new Set(tables[table].map((r) => r.id)).size === tables[table].length, "missing or duplicate id"); }
const fks = [["users","person_id","people","id"],["teams","operation_id","operations","id"],["teams","supervisor_id","users","id"],["assignments","person_id","people","id"],["assignments","operation_id","operations","id"],["assignments","team_id","teams","id"],["assignments","supervisor_id","users","id"],["operation_supervisors","operation_id","operations","id"],["operation_supervisors","supervisor_id","users","id"],["staffing_movements","person_id","people","id"],["staffing_movements","assignment_id","assignments","id"],["evaluations","person_id","people","id"],["evaluations","evaluator_user_id","users","id"],["evaluations","supervisor_user_id","users","id"],["evaluations","operation_id","operations","id"],["evaluation_items","evaluation_id","evaluations","id"],["evaluation_media","evaluation_id","evaluations","id"],["feedback","evaluation_id","evaluations","id"],["feedback","person_id","people","id"],["feedback","supervisor_user_id","users","id"],["feedback","evaluator_user_id","users","id"],["development_assignments","capsule_id","development_capsules","id"],["development_assignments","person_id","people","id"],["legacy_sessions","user_id","users","id"]];
for (const [fromTable, fromColumn, toTable, toColumn] of fks) { const targets = new Set((tables[toTable] || []).map((r) => r[toColumn]).filter(Boolean)); const refs = (tables[fromTable] || []).map((r) => r[fromColumn]).filter(Boolean); const missing = refs.filter((value) => !targets.has(value)); check(fromTable + "." + fromColumn + " FK", missing.length === 0, missing.slice(0, 5).join(" | ")); }
const operationKeys = tables.operations.map((r) => r.company_id + "|" + r.normalized_name); check("operation uniqueness by company", new Set(operationKeys).size === operationKeys.length, "duplicate company+normalized_name");
const homonyms = new Map(); for (const r of tables.operations.filter((r) => r.legacy !== "true")) { const set = homonyms.get(r.normalized_name) || new Set(); set.add(r.company_id); homonyms.set(r.normalized_name, set); } check("homonymous operations remain company-scoped", [...homonyms.values()].every((set) => set.size >= 1), "invalid operation scope");
const stagedText = source.map((r) => r.raw_json).join("\n"); const refs = { http_urls: (stagedText.match(/https?:\/\//gi) || []).length, drive_or_file_references: (stagedText.match(/drive\.google\.com|\/api\/files\/|fileId/gi) || []).length }; check("external references preserved", JSON.stringify(refs) === JSON.stringify(manifest.source_reference_counts), JSON.stringify(refs));
if (args.source) { const bytes = await fs.readFile(path.resolve(args.source)); const hash = crypto.createHash("sha256").update(bytes).digest("hex"); check("source hash unchanged", hash === manifest.source_sha256, hash); }
console.log(JSON.stringify({ verified: failures.length === 0, checks, failures }, null, 2)); if (failures.length) process.exitCode = 1;
