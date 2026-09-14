import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const staging = path.join(root, 'staging');

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

const jobs = [
  {
    file: 'feedbacks.csv',
    table: 'feedback'
  },
  {
    file: 'development_capsules.csv',
    table: 'development_capsules'
  },
  {
    file: 'development_assignments.csv',
    table: 'development_assignments'
  },
  {
    file: 'app_state.csv',
    table: 'app_state_fragments'
  },
  {
    file: 'sessions.csv',
    table: 'legacy_sessions'
  }
];

// MIGRATION_RELAXED_REQUIRED
// Campos legacy cuya ausencia no debe impedir la migraciÃ³n.
// Se resolverÃ¡n posteriormente en Supabase.
const migrationRelaxedRequired = new Set([
  'feedback.supervisor_user_id',
  'app_state_fragments.parse_status',
  'legacy_sessions.legacy_token'
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTableMeta(table) {
  const escaped = escapeRegExp(table);

  const match = schemaSql.match(
    new RegExp(
      `CREATE\\s+TABLE\\s+(?:public\\.)?"?${escaped}"?\\s*\\(([\\s\\S]*?)\\);`,
      'i'
    )
  );

  if (!match) {
    throw new Error(`No encontrÃ© CREATE TABLE ${table}`);
  }

  const meta = new Map();

  const columnRegex =
    /(?:^|,)\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(uuid|text|timestamptz|timestamp|date|integer|bigint|smallint|numeric|decimal|real|double precision|boolean|jsonb|json)\b([^,]*)/gim;

  let m;

  while ((m = columnRegex.exec(match[1])) !== null) {
    meta.set(m[1], {
      type: m[2].toLowerCase(),
      notNull:
        /\bNOT\s+NULL\b/i.test(m[3]) ||
        /\bPRIMARY\s+KEY\b/i.test(m[3]),
      hasDefault: /\bDEFAULT\b/i.test(m[3])
    });
  }

  return meta;
}

function stableHex(seed) {
  return crypto
    .createHash('sha1')
    .update(String(seed))
    .digest('hex');
}

function stableUuid(seed) {
  const chars = stableHex(seed)
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

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function convert(value, type) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }

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
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.trunc(number)
      : value;
  }

  if (
    type === 'numeric' ||
    type === 'decimal' ||
    type === 'real' ||
    type === 'double precision'
  ) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number
      : value;
  }

  if (type === 'json' || type === 'jsonb') {
    if (typeof value !== 'string') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function prepareRows(table, rawRows) {
  const meta = getTableMeta(table);

  const aliases = {
    person_id: [
      'advisor_id',
      'person'
    ],
    evaluator_user_id: [
      'evaluator_id'
    ],
    capsule_id: [
      'development_capsule_id'
    ],
    start_at: [
      'start_date'
    ],
    end_at: [
      'end_date'
    ],
    source_actor_id: [
      'actor_id'
    ],
    created_by_user_id: [
      'created_by_id',
      'actor_id'
    ],
    assigned_by_user_id: [
      'assigned_by_id',
      'actor_id'
    ],
    source_assignment_id: [
      'assignment_id'
    ],
    source_team_id: [
      'team_id'
    ],
    source_campaign_id: [
      'campaign_id'
    ]
  };

  const problems = [];

  const rows = rawRows.map((source, index) => {
    const row = { ...source };

    for (const key of Object.keys(row)) {
      if (
        typeof row[key] === 'string' &&
        row[key].trim() === ''
      ) {
        row[key] = null;
      }
    }

    for (const [target, candidates] of Object.entries(aliases)) {
      if (!meta.has(target)) continue;

      if (
        row[target] !== null &&
        row[target] !== undefined
      ) {
        continue;
      }

      for (const candidate of candidates) {
        if (
          row[candidate] !== null &&
          row[candidate] !== undefined
        ) {
          row[target] = row[candidate];
          break;
        }
      }
    }

    if (
      meta.has('resolution_status') &&
      !row.resolution_status
    ) {
      row.resolution_status = 'UNRESOLVED';
    }

    if (
      meta.has('migration_status') &&
      !row.migration_status
    ) {
      row.migration_status = 'REVIEW_REQUIRED';
    }

    if (
      meta.has('normalized_name') &&
      !row.normalized_name
    ) {
      row.normalized_name = normalizeName(
        row.name ??
        row.display_name ??
        row.title ??
        row.id ??
        `pending-${index + 1}`
      );
    }

    if (
      meta.has('display_name') &&
      !row.display_name
    ) {
      row.display_name = String(
        row.full_name ??
        row.name ??
        row.id ??
        `PENDIENTE_${index + 1}`
      );
    }

    if (
      meta.has('id') &&
      !row.id
    ) {
      const seed = [
        table,
        row.source_file ?? '',
        row.source_sheet ?? '',
        row.source_row ?? '',
        row.evaluation_id ?? '',
        row.person_id ?? '',
        row.capsule_id ?? '',
        index
      ].join('|');

      row.id =
        meta.get('id').type === 'uuid'
          ? stableUuid(seed)
          : `mig_${stableHex(seed)}`;
    }

    const clean = {};

    for (const [column, definition] of meta.entries()) {
      if (!Object.prototype.hasOwnProperty.call(row, column)) {
        continue;
      }

      const value = convert(
        row[column],
        definition.type
      );

      /*
       * Si hay DEFAULT y el CSV no aporta valor,
       * omitimos la columna para que Supabase
       * aplique el DEFAULT real.
       */
      if (
        value === null &&
        definition.hasDefault
      ) {
        continue;
      }

      clean[column] = value;
    }

    for (const [column, definition] of meta.entries()) {
      if (
          !definition.notNull ||
          definition.hasDefault ||
          migrationRelaxedRequired.has(`${table}.${column}`)
        ) {
          continue;
        }

      const value = clean[column];

      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        problems.push({
          row: index + 1,
          id: clean.id ?? row.id ?? null,
          column
        });
      }
    }

    return clean;
  });

  return {
    rows,
    problems
  };
}

function groupByShape(rows) {
  const groups = new Map();

  for (const row of rows) {
    const signature = Object.keys(row)
      .sort()
      .join('|');

    if (!groups.has(signature)) {
      groups.set(signature, []);
    }

    groups.get(signature).push(row);
  }

  return [...groups.values()];
}

async function countRemote(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', {
      count: 'exact',
      head: true
    });

  if (error) {
    throw new Error(
      `${table}: no pude contar remoto: ${error.message}`
    );
  }

  return Number(count || 0);
}

console.log('');
console.log('============================================');
console.log(' C&M - IMPORTACION DE TABLAS PENDIENTES');
console.log('============================================');
console.log('');

const preparedJobs = [];
const allProblems = [];

for (const job of jobs) {
  const csvPath = path.join(staging, job.file);

  const content = await fs.readFile(csvPath, 'utf8');

  const rawRows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true
  });

  const prepared = prepareRows(
    job.table,
    rawRows
  );

  preparedJobs.push({
    ...job,
    sourceCount: rawRows.length,
    rows: prepared.rows
  });

  if (prepared.problems.length) {
    for (const problem of prepared.problems) {
      allProblems.push({
        table: job.table,
        ...problem
      });
    }
  }
}

/*
 * PRECHECK GLOBAL.
 * Nada se escribe si queda algÃºn NOT NULL
 * irresoluble en cualquiera de las cinco tablas.
 */
if (allProblems.length) {
  console.log('PRECHECK = BLOQUEADO');
  console.log('');
  console.table(allProblems.slice(0, 100));

  console.log(
    `\nProblemas totales: ${allProblems.length}`
  );

  process.exit(2);
}

console.log('PRECHECK GLOBAL = OK');
console.log('');

const result = [];

for (const job of preparedJobs) {
  console.log(
    `${job.table}: ${job.sourceCount} filas`
  );

  const groups = groupByShape(job.rows);
  let written = 0;

  for (const group of groups) {
    for (
      let offset = 0;
      offset < group.length;
      offset += 100
    ) {
      const batch = group.slice(
        offset,
        offset + 100
      );

      const { error } = await supabase
        .from(job.table)
        .upsert(batch, {
          onConflict: 'id',
          ignoreDuplicates: false,
          defaultToNull: false
        });

      if (error) {
        throw new Error(
          `${job.table}: ${error.code || ''} ${error.message}`
        );
      }

      written += batch.length;

      console.log(
        `  OK ${written}/${job.sourceCount}`
      );
    }
  }

  const remote = await countRemote(job.table);

  result.push({
    table: job.table,
    source: job.sourceCount,
    remote,
    difference: remote - job.sourceCount
  });

  console.log(
    `  remoto=${remote} diferencia=${remote - job.sourceCount}`
  );

  console.log('');
}

console.log('============================================');
console.log(' RESULTADO');
console.log('============================================');

console.table(result);

const verified = result.every(
  row => row.difference === 0
);

console.log(
  verified
    ? 'PENDIENTES = MIGRADAS Y VERIFICADAS'
    : 'PENDIENTES = REVISAR DIFERENCIAS'
);

if (!verified) {
  process.exitCode = 1;
}
