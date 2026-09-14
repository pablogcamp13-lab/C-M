import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const csvPath = path.join(
  root,
  'staging',
  'evaluations.csv'
);

const content = await fs.readFile(csvPath, 'utf8');

const rows = parse(content, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  relax_quotes: true,
  relax_column_count: true
});

const arrays = new Map();
const fields = new Map();

let parsed = 0;
let failed = 0;

function addArray(pathName, length) {
  const current = arrays.get(pathName) || {
    path: pathName,
    occurrences: 0,
    totalItems: 0,
    maxItems: 0
  };

  current.occurrences += 1;
  current.totalItems += length;
  current.maxItems = Math.max(
    current.maxItems,
    length
  );

  arrays.set(pathName, current);
}

function addField(pathName, value) {
  const lower = pathName.toLowerCase();

  if (
    !lower.match(
      /audio|media|file|archivo|drive|url|recording|grabacion|grabación|adjunto/
    )
  ) {
    return;
  }

  const current = fields.get(pathName) || {
    path: pathName,
    occurrences: 0,
    nonEmpty: 0,
    samples: []
  };

  current.occurrences += 1;

  if (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''
  ) {
    current.nonEmpty += 1;

    if (current.samples.length < 3) {
      current.samples.push(
        typeof value === 'string'
          ? value.slice(0, 120)
          : JSON.stringify(value).slice(0, 120)
      );
    }
  }

  fields.set(pathName, current);
}

function walk(value, pathName = '$') {

  if (Array.isArray(value)) {

    addArray(
      pathName,
      value.length
    );

    value.forEach((item) => {
      walk(
        item,
        `${pathName}[]`
      );
    });

    return;
  }

  if (
    value &&
    typeof value === 'object'
  ) {

    for (const [key, child] of Object.entries(value)) {
      walk(
        child,
        `${pathName}.${key}`
      );
    }

    return;
  }

  addField(pathName, value);
}

for (const row of rows) {

  if (!row.payload_json) {
    continue;
  }

  try {

    const payload =
      typeof row.payload_json === 'string'
        ? JSON.parse(row.payload_json)
        : row.payload_json;

    parsed += 1;

    walk(payload);

  }
  catch {
    failed += 1;
  }
}

const arrayResult = [...arrays.values()]
  .sort(
    (a, b) =>
      b.totalItems - a.totalItems
  );

const fieldResult = [...fields.values()]
  .sort(
    (a, b) =>
      b.nonEmpty - a.nonEmpty
  );

console.log('');
console.log('====================================');
console.log(' ANALISIS PAYLOAD EVALUATIONS');
console.log('====================================');
console.log('');

console.log('Evaluaciones CSV:', rows.length);
console.log('Payload parseados:', parsed);
console.log('Payload con error:', failed);

console.log('');
console.log('=== ARRAYS ENCONTRADOS ===');

console.table(arrayResult);

console.log('');
console.log('=== COINCIDENCIAS OBJETIVO ===');

const exact = arrayResult.filter(
  item =>
    item.totalItems === 418 ||
    item.totalItems === 61
);

if (exact.length) {
  console.table(exact);
}
else {
  console.log(
    'No hay arrays con total exacto 418 o 61.'
  );
}

console.log('');
console.log('=== CAMPOS POSIBLE MEDIA/AUDIO ===');

console.table(
  fieldResult.map(item => ({
    path: item.path,
    occurrences: item.occurrences,
    nonEmpty: item.nonEmpty,
    samples: item.samples.join(' | ')
  }))
);
