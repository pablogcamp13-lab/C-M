import { readFile, writeFile } from 'node:fs/promises';

const boundaryFile = new URL('../src/data/peruDepartments.json', import.meta.url);
const outputFile = new URL('../src/data/peruDistricts.json', import.meta.url);
const boundaries = JSON.parse(await readFile(boundaryFile, 'utf8'));
const codes = [...new Set(boundaries.features.map(item => item.properties.CD_DEPA))].sort();
// El servicio también contiene CD_DEPA=99: siete lagos/lagunas, no distritos administrativos.
const endpoint = 'https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CARTOGRAFIA_DEMARCACION_WGS84/MapServer/2/query';
const rows = [];
for (const code of codes) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({where:`CD_DEPA='${code}'`,outFields:'CD_DIST,NM_DIST,NM_PROV,NM_DEPA',returnGeometry:'false',f:'json'}).toString();
  const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`INGEMMET ${code}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error || data.exceededTransferLimit || !data.features?.length) throw new Error(`INGEMMET ${code}: respuesta incompleta`);
  for (const feature of data.features) {
    const {CD_DIST,NM_DIST,NM_PROV,NM_DEPA} = feature.attributes;
    rows.push({code:CD_DIST,department:NM_DEPA,province:NM_PROV,district:NM_DIST});
  }
}
rows.sort((a,b) => a.department.localeCompare(b.department,'es') || a.province.localeCompare(b.province,'es') || a.district.localeCompare(b.district,'es'));
await writeFile(outputFile, JSON.stringify(rows));
console.log(`Guardados ${rows.length} distritos de ${codes.length} departamentos.`);
