import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const url = String(process.env.SUPABASE_URL || '').trim();
const key = String(process.env.SUPABASE_SECRET_KEY || '').trim();

if (!url) throw new Error('Falta SUPABASE_URL');
if (!key) throw new Error('Falta SUPABASE_SECRET_KEY');

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const schemaSql = await fs.readFile(
  path.join(root, '01_schema.sql'),
  'utf8'
);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tableMeta(table) {
  const escaped = escapeRegex(table);

  const match = schemaSql.match(
    new RegExp(
      `CREATE\\s+TABLE\\s+(?:public\\.)?"?${escaped}"?\\s*\\(([\\s\\S]*?)\\);`,
      'i'
    )
  );

  if (!match) {
    throw new Error(`No encontrÃ© CREATE TABLE ${table}`);
  }

  const columns = new Map();

  const regex =
    /(?:^|,)\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(uuid|text|timestamptz|timestamp|date|integer|bigint|smallint|numeric|decimal|real|double precision|boolean|jsonb|json)\b([^,]*)/gim;

  let m;

  while ((m = regex.exec(match[1])) !== null) {
    columns.set(m[1], {
      type: m[2].toLowerCase(),
      notNull:
        /\bNOT\s+NULL\b/i.test(m[3]) ||
        /\bPRIMARY\s+KEY\b/i.test(m[3]),
      hasDefault: /\bDEFAULT\b/i.test(m[3])
    });
  }

  return columns;
}

function hash(seed) {
  return crypto
    .createHash('sha1')
    .update(String(seed))
    .digest('hex');
}

function uuid(seed) {
  const chars = hash(seed)
    .slice(0, 32)
    .split('');

  chars[12] = '5';
  chars[16] = (
    (parseInt(chars[16], 16) & 0x3) | 0x8
  ).toString(16);

  const h = chars.join('');

  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32)
  ].join('-');
}

function camelCase(snake) {
  return snake.replace(
    /_([a-z])/g,
    (_, c) => c.toUpperCase()
  );
}

function snakeCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function blankToNull(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  return value;
}

function convert(value, type) {
  value = blankToNull(value);

  if (value === null) return null;

  if (type === 'boolean') {
    const v = String(value).trim();

    if (/^(true|1|yes|si|sÃ­)$/i.test(v)) return true;
    if (/^(false|0|no)$/i.test(v)) return false;

    return value;
  }

  if (
    type === 'integer' ||
    type === 'bigint' ||
    type === 'smallint'
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  }

  if (
    type === 'numeric' ||
    type === 'decimal' ||
    type === 'real' ||
    type === 'double precision'
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  return value;
}

function getValue(source, column, aliases = {}) {
  const candidates = [
    column,
    camelCase(column),
    ...(aliases[column] || [])
  ];

  for (const candidate of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(source, candidate) &&
      blankToNull(source[candidate]) !== null
    ) {
      return source[candidate];
    }
  }

  /*
   * ComparaciÃ³n adicional ignorando camelCase/snake_case.
   */
  const normalizedColumn = snakeCase(column);

  for (const [key, value] of Object.entries(source)) {
    if (
      snakeCase(key) === normalizedColumn &&
      blankToNull(value) !== null
    ) {
      return value;
    }
  }

  return null;
}

function makeRow(
  table,
  source,
  evaluationId,
  ordinal,
  rawPayload,
  parentEvaluation
) {
  const meta = tableMeta(table);

  const aliases =
    table === 'evaluation_items'
      ? {
          evaluation_id: ['evaluationId'],

          category: [
            'categoryName',
            'categoria',
            'section',
            'sectionName'
          ],

          category_name: [
            'category',
            'categoryName',
            'categoria'
          ],

          attribute: [
            'attributeName',
            'atributo',
            'name',
            'label'
          ],

          attribute_name: [
            'attribute',
            'attributeName',
            'atributo',
            'name',
            'label'
          ],

          status: [
            'result',
            'compliance',
            'complianceStatus',
            'estado'
          ],

          error_type: [
            'errorType',
            'tipoError'
          ],

          classification: [
            'errorClassification',
            'criticality',
            'clasificacion'
          ],

          observation: [
            'observation',
            'observations',
            'comment',
            'comments',
            'notes'
          ],

          score: [
            'points',
            'value'
          ],

          position: [
            'index',
            'order',
            'ordinal'
          ]
        }
      : {
          evaluation_id: ['evaluationId'],

          recording_code: [
            'recordingCode'
          ],

          file_name: [
            'audioFileName'
          ],

          audio_file_name: [
            'audioFileName'
          ],

          file_size: [
            'audioFileSize'
          ],

          audio_file_size: [
            'audioFileSize'
          ],

          duration_seconds: [
            'audioDurationSeconds'
          ],

          audio_duration_seconds: [
            'audioDurationSeconds'
          ],

          mime_type: [
            'audioMimeType'
          ],

          audio_mime_type: [
            'audioMimeType'
          ],

          url: [
            'audioUrl'
          ],

          audio_url: [
            'audioUrl'
          ],

          stream_path: [
            'audioUrl'
          ]
        };

  const base = {
    ...source,

    evaluation_id: evaluationId,

    // HERENCIA DE TRAZABILIDAD DESDE EVALUATIONS
    source_file:
      parentEvaluation?.source_file ??
      source?.source_file ??
      null,

    source_sheet:
      parentEvaluation?.source_sheet ??
      source?.source_sheet ??
      null,

    source_row:
      parentEvaluation?.source_row ??
      source?.source_row ??
      null,

    ordinal,
    position: ordinal,

    migration_status: 'READY',
    resolution_status: 'RESOLVED',

    // Contenido original del elemento derivado
    item_json:
      table === 'evaluation_items'
        ? rawPayload
        : undefined,

    media_json:
      table === 'evaluation_media'
        ? rawPayload
        : undefined,

    payload_json: rawPayload,
    metadata_json: rawPayload
  };

  const result = {};

  for (const [column, definition] of meta.entries()) {
    let value = getValue(
      base,
      column,
      aliases
    );

    /*
     * IDs determinÃ­sticos.
     */
    if (
      column === 'id' &&
      value === null
    ) {
      const seed = [
        table,
        evaluationId,
        ordinal,
        source.recordingCode ?? '',
        source.attribute ??
          source.attributeName ??
          source.name ??
          ''
      ].join('|');

      value =
        definition.type === 'uuid'
          ? uuid(seed)
          : `mig_${hash(seed)}`;
    }

    /*
     * JSON completo del item/media cuando exista
     * una columna JSON destinada a conservarlo.
     */
    if (
      value === null &&
      (
        column === 'payload_json' ||
        column === 'metadata_json'
      )
    ) {
      value = rawPayload;
    }
    // INVALID_SOURCE_UUID_FIX
    // IDs funcionales del origen, por ejemplo item_q_1_1,
    // permanecen dentro de item_json, pero la PK de Supabase
    // debe ser un UUID valido y deterministico.
    if (
      column === 'id' &&
      definition.type === 'uuid' &&
      value !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value)
      )
    ) {
      const sourceIdentifier = String(value);

      const seed = [
        table,
        evaluationId,
        ordinal,
        sourceIdentifier,
        source.recordingCode ?? '',
        source.attribute ??
          source.attributeName ??
          source.name ??
          ''
      ].join('|');

      value = uuid(seed);
    }

    value = convert(
      value,
      definition.type
    );

    if (
      value === null &&
      definition.hasDefault
    ) {
      continue;
    }

    if (value !== null) {
      result[column] = value;
    }
  }

  return result;
}

async function fetchEvaluations() {
  const all = [];
  const pageSize = 1000;

  for (
    let from = 0;
    ;
    from += pageSize
  ) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .range(
        from,
        from + pageSize - 1
      );

    if (error) {
      throw new Error(
        `No pude leer evaluations: ${error.message}`
      );
    }

    all.push(...(data || []));

    if (
      !data ||
      data.length < pageSize
    ) {
      break;
    }
  }

  return all;
}

function parsePayload(value) {
  if (
    value &&
    typeof value === 'object'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    }
    catch {
      return null;
    }
  }

  return null;
}

console.log('');
console.log('==========================================');
console.log(' C&M - DERIVACION FINAL DE EVALUACIONES');
console.log('==========================================');
console.log('');

const evaluations = await fetchEvaluations();

console.log(
  `Evaluaciones remotas: ${evaluations.length}`
);

const itemRows = [];
const mediaRows = [];

let invalidPayloads = 0;

for (const evaluation of evaluations) {
  const payload = parsePayload(
    evaluation.payload_json
  );

  if (!payload) {
    invalidPayloads += 1;
    continue;
  }

  /*
   * ITEMS
   * Confirmado por auditorÃ­a:
   * $.items = 418 en total.
   */
  const items = Array.isArray(payload.items)
    ? payload.items
    : [];

  items.forEach((item, index) => {
    itemRows.push(
      makeRow(
        'evaluation_items',
        item && typeof item === 'object'
          ? item
          : { value: item },
        evaluation.id,
        index + 1,
        item,
        evaluation
      )
    );
  });

  /*
   * MEDIA
   * Confirmado por auditorÃ­a:
   * recordingCode no vacÃ­o = 61.
   */
  if (
    payload.recordingCode !== null &&
    payload.recordingCode !== undefined &&
    String(payload.recordingCode).trim() !== ''
  ) {
    mediaRows.push(
      makeRow(
        'evaluation_media',
        payload,
        evaluation.id,
        1,
        {
          recordingCode:
            payload.recordingCode ?? null,

          audioUrl:
            payload.audioUrl ?? null,

          audioFileName:
            payload.audioFileName ?? null,

          audioFileSize:
            payload.audioFileSize ?? null,

          audioDurationSeconds:
            payload.audioDurationSeconds ?? null,

          audioMimeType:
            payload.audioMimeType ?? null
        },
        evaluation
      )
    );
  }
}

console.log('');
console.log('=== DERIVACION ===');
console.log(`evaluation_items = ${itemRows.length}`);
console.log(`evaluation_media = ${mediaRows.length}`);
console.log(`payload invÃ¡lidos = ${invalidPayloads}`);

if (itemRows.length !== 418) {
  throw new Error(
    `Esperaba 418 evaluation_items y obtuve ${itemRows.length}`
  );
}

if (mediaRows.length !== 61) {
  throw new Error(
    `Esperaba 61 evaluation_media y obtuve ${mediaRows.length}`
  );
}

/*
 * PRECHECK TOTAL ANTES DE ESCRIBIR.
 */

const problems = [];

for (const [
  table,
  rows
] of [
  ['evaluation_items', itemRows],
  ['evaluation_media', mediaRows]
]) {
  const meta = tableMeta(table);

  rows.forEach((row, index) => {
    for (
      const [column, definition]
      of meta.entries()
    ) {
      if (
        !definition.notNull ||
        definition.hasDefault
      ) {
        continue;
      }

      const value = row[column];

      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        problems.push({
          table,
          row: index + 1,
          evaluation_id:
            row.evaluation_id ?? null,
          id: row.id ?? null,
          column
        });
      }
    }
  });
}

if (problems.length) {
  console.log('');
  console.log('PRECHECK = BLOQUEADO');
  console.table(
    problems.slice(0, 100)
  );

  console.log(
    `Problemas totales: ${problems.length}`
  );

  process.exit(2);
}

console.log('');
console.log('PRECHECK = OK');

/*
 * UPSERT
 */

async function upsertRows(table, rows) {
  let done = 0;

  for (
    let offset = 0;
    offset < rows.length;
    offset += 100
  ) {
    const batch = rows.slice(
      offset,
      offset + 100
    );

    const { error } = await supabase
      .from(table)
      .upsert(batch, {
        onConflict: 'id',
        ignoreDuplicates: false,
        defaultToNull: false
      });

    if (error) {
      throw new Error(
        `${table}: ${error.code || ''} ${error.message}`
      );
    }

    done += batch.length;

    console.log(
      `${table}: OK ${done}/${rows.length}`
    );
  }
}

await upsertRows(
  'evaluation_items',
  itemRows
);

await upsertRows(
  'evaluation_media',
  mediaRows
);

/*
 * VALIDACION REMOTA
 */

async function count(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', {
      count: 'exact',
      head: true
    });

  if (error) {
    throw new Error(
      `${table}: ${error.message}`
    );
  }

  return Number(count || 0);
}

const remoteItems =
  await count('evaluation_items');

const remoteMedia =
  await count('evaluation_media');

console.log('');
console.log('==========================================');
console.log(' RESULTADO FINAL');
console.log('==========================================');

console.table([
  {
    table: 'evaluation_items',
    esperado: 418,
    remoto: remoteItems,
    diferencia: remoteItems - 418
  },
  {
    table: 'evaluation_media',
    esperado: 61,
    remoto: remoteMedia,
    diferencia: remoteMedia - 61
  }
]);

if (
  remoteItems === 418 &&
  remoteMedia === 61
) {
  console.log('');
  console.log(
    'DERIVACION FINAL = MIGRADA Y VERIFICADA'
  );
}
else {
  console.log('');
  console.log(
    'DERIVACION FINAL = REVISAR CONTEOS'
  );

  process.exitCode = 1;
}
