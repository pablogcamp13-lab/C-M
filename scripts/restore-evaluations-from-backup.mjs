import 'dotenv/config';
import XLSX from 'xlsx';
import { google } from 'googleapis';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { planRecovery, appendRecovery } from './evaluation-backup-recovery.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (['--apply', '--writers-paused'].includes(key)) options[key] = true;
  else if (['--backup', '--current', '--sheet'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
  else throw new Error('Argumento inválido. Usa --backup archivo.xlsx y --current actual.xlsx (local), o --sheet ID (Google). --apply requiere --writers-paused.');
}

function readWorkbook(path) {
  const book = XLSX.readFile(resolve(path));
  return Object.fromEntries(['EVALUATIONS', 'ADVISORS', 'CAMPAIGNS', 'USERS', 'TEAMS'].map(name => [name,
    book.Sheets[name] ? XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', raw: true }) : [],
  ]));
}

async function main() {
  if (!options['--backup'] || Boolean(options['--current']) === Boolean(options['--sheet'])) throw new Error('Indica --backup y exactamente uno de --current o --sheet.');
  if (options['--apply'] && (options['--current'] || !options['--writers-paused'])) throw new Error('La aplicación exige --sheet y --writers-paused. Detén los escritores de Railway y cualquier servidor local antes de continuar.');
  const source = readWorkbook(options['--backup']);
  if (options['--current']) {
    const current = readWorkbook(options['--current']);
    const plan = planRecovery(current.EVALUATIONS, source.EVALUATIONS, current);
    console.log(JSON.stringify({ mode: 'OFFLINE_NO_WRITES', ...plan.summary }));
    return;
  }
  const spreadsheetId = options['--sheet'] === 'env' ? process.env.GOOGLE_SHEET_ID : options['--sheet'];
  if (!spreadsheetId || spreadsheetId !== process.env.GOOGLE_SHEET_ID) throw new Error('--sheet no coincide con GOOGLE_SHEET_ID del .env. Usa --sheet env para el destino configurado.');
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) if (!process.env[name]) throw new Error(`Falta ${name}.`);
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const sheets = google.sheets({ version: 'v4', auth });
  const names = ['EVALUATIONS', 'ADVISORS', 'CAMPAIGNS', 'USERS', 'TEAMS'];
  // No bootstrap, sheet clearing, header changes or repository replacement.
  const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: names.map(n => `'${n}'!A:ZZ`), valueRenderOption: 'UNFORMATTED_VALUE' });
  const current = Object.fromEntries(names.map((n, i) => [n, response.data.valueRanges?.[i]?.values || []]));
  const plan = planRecovery(current.EVALUATIONS, source.EVALUATIONS, current);
  console.log(JSON.stringify({ mode: options['--apply'] ? 'APPLY' : 'LIVE_NO_WRITES', ...plan.summary }));
  if (!options['--apply']) return;
  const result = await appendRecovery(plan, {
    read: async () => (await sheets.spreadsheets.values.get({ spreadsheetId, range: "'EVALUATIONS'!A:ZZ", valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [],
    backup: async () => {
      const root = resolve('data', 'recovery');
      await mkdir(root, { recursive: true });
      const directory = await mkdtemp(join(root, 'evaluations-'));
      // Local recovery data stays in gitignored data/. No users, passwords or sessions.
      await writeFile(join(directory, 'before-and-import.json'), JSON.stringify({ spreadsheetId, at: new Date().toISOString(), before: current.EVALUATIONS, missing: plan.values }), { flag: 'wx' });
      console.log(`Respaldo previo: ${directory}`);
    },
    append: async values => {
      await sheets.spreadsheets.values.append({ spreadsheetId, range: "'EVALUATIONS'!A:G", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } }, { retry: false });
    },
  });
  console.log(JSON.stringify(result));
  console.log('Sólo se modificó EVALUATIONS. Reinicia el servicio y recarga la plataforma para que GET /api/platform-state consolide el historial.');
}

main().catch(error => {
  // Google error objects may contain credentials/request bodies. Never dump them.
  console.error(error?.response || error?.config ? 'Falló la operación con Google. No repitas --apply a ciegas: ejecuta primero el diagnóstico sin --apply.' : error.message);
  process.exitCode = 1;
});
