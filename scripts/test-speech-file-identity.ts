import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { speechAdvisorIdentityFromFile, speechFileIdentityMatches } from '../server/speechFileIdentity';

const files = [
  'LESSLIE_BUENDIA_ROBLES_47547479_910055823_4m32s.mp3',
  'SHIRLEY_REYME_ALEGRIA_46585729_910055823_3m49s.mp3',
  '15000-O15001-20260917-082648-910055823-10-1789651593.2854489.BUENDIALESSLIE.mp3',
  '15000-O15001-20260917-155633-910055823-02-1789678582.8002660.REYMESHIRLEY.mp3',
  '15000-O15001-20260917-155633-910055823-02-1789678582.8002660.DESCONOCIDO.mp3'
];
assert.equal(speechAdvisorIdentityFromFile(files[2]).dni, '', 'La fecha del archivo no es un DNI');
const matches = speechFileIdentityMatches(files);
assert.equal(matches.get(files[2])?.dni, '47547479');
assert.equal(matches.get(files[3])?.dni, '46585729');
assert.equal(matches.has(files[4]), false, 'Un alias no reconocido debe quedar con alerta');

if (process.argv[2]) {
  const workbook = XLSX.read(readFileSync(process.argv[2]), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<{ Archivo: string; nota_final: string }>(workbook.Sheets.Resultados, { defval: '' });
  const resolved = speechFileIdentityMatches(rows.map(row => row.Archivo));
  assert.equal(rows.length, 14);
  assert.equal(resolved.size, 7, 'Las siete grabaciones legacy deben relacionarse sin inventar DNIs');
  assert.ok(rows.every(row => Number(row.nota_final) === 0), 'La nota 0 procede del Excel');
}
console.log('Identidad SA: fechas descartadas y grabaciones legacy relacionadas con coincidencia única.');
