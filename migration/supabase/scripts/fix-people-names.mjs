import fs from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const { Pool } = pg;

const APPLY = process.argv.includes('--apply');

const databaseUrl = String(
  process.env.SUPABASE_DATABASE_URL || ''
).trim();

if (!databaseUrl) {
  throw new Error('Falta SUPABASE_DATABASE_URL');
}

const csvPath =
  './migration/supabase/staging/advisors.csv';

const csv = await fs.readFile(csvPath, 'utf8');

const advisors = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  relax_quotes: true,
  relax_column_count: true
});

const names = new Map();

for (const row of advisors) {
  const id = String(row.id || '').trim();
  const name = String(row.name || '').trim();

  if (id && name) {
    names.set(id, name);
  }
}

console.log('');
console.log('=== CORRECCION MASIVA PEOPLE ===');
console.log(`Advisors con nombre fuente: ${names.size}`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

const client = await pool.connect();

try {

  const columnsResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'people'
  `);

  const columns = new Set(
    columnsResult.rows.map(r => r.column_name)
  );

  if (!columns.has('id')) {
    throw new Error('people no tiene columna id');
  }

  if (!columns.has('display_name')) {
    throw new Error(
      'people no tiene display_name. No se modifica nada.'
    );
  }

  const hasSourceAdvisor =
    columns.has('source_advisor_id');

  const peopleResult = await client.query(`
    SELECT
      id,
      ${
        hasSourceAdvisor
          ? 'source_advisor_id,'
          : ''
      }
      display_name
    FROM public.people
    ORDER BY id
  `);

  const candidates = [];

  for (const person of peopleResult.rows) {

    const sourceId =
      hasSourceAdvisor
        ? String(person.source_advisor_id || '').trim()
        : '';

    const personId =
      String(person.id || '').trim();

    const realName =
      names.get(sourceId) ||
      names.get(personId);

    if (!realName) continue;

    if (
      String(person.display_name || '').trim() ===
      realName
    ) {
      continue;
    }

    candidates.push({
      person_id: person.id,
      advisor_id: sourceId || personId,
      anterior: person.display_name,
      nuevo: realName
    });
  }

  console.log('');
  console.log(
    `Personas remotas: ${peopleResult.rows.length}`
  );
  console.log(
    `Coincidencias a corregir: ${candidates.length}`
  );

  console.log('');
  console.log('=== MUESTRA ===');

  console.table(
    candidates.slice(0, 20)
  );

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN = NO SE MODIFICO SUPABASE');
    console.log(
      'Ejecuta nuevamente con --apply para aplicar.'
    );
    process.exit(0);
  }

  if (candidates.length === 0) {
    console.log('');
    console.log('NO HAY CAMBIOS PENDIENTES');
    process.exit(0);
  }

  await client.query('BEGIN');

  await client.query(`
    CREATE TEMP TABLE tmp_people_names (
      person_id text PRIMARY KEY,
      real_name text NOT NULL
    ) ON COMMIT DROP
  `);

  const batchSize = 100;

  for (
    let offset = 0;
    offset < candidates.length;
    offset += batchSize
  ) {

    const batch = candidates.slice(
      offset,
      offset + batchSize
    );

    const params = [];
    const placeholders = [];

    batch.forEach((row, index) => {
      const base = index * 2;

      placeholders.push(
        `($${base + 1}, $${base + 2})`
      );

      params.push(
        row.person_id,
        row.nuevo
      );
    });

    await client.query(
      `
      INSERT INTO tmp_people_names (
        person_id,
        real_name
      )
      VALUES ${placeholders.join(',')}
      `,
      params
    );
  }

  const setParts = [
    'display_name = t.real_name'
  ];

  if (columns.has('updated_at')) {
    setParts.push('updated_at = now()');
  }

  const updateResult = await client.query(`
    UPDATE public.people p
       SET ${setParts.join(', ')}
      FROM tmp_people_names t
     WHERE p.id = t.person_id
    RETURNING p.id, p.display_name
  `);

  await client.query('COMMIT');

  console.log('');
  console.log(
    `ACTUALIZADOS = ${updateResult.rowCount}`
  );

  const check = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (
        WHERE display_name ~ '^adv_'
      )::int AS nombres_tecnicos
    FROM public.people
  `);

  console.log('');
  console.log('=== VALIDACION ===');
  console.table(check.rows);

  const preview = await client.query(`
    SELECT
      id,
      display_name
    FROM public.people
    ORDER BY display_name
    LIMIT 20
  `);

  console.log('');
  console.log('=== PEOPLE DESPUES ===');
  console.table(preview.rows);

  console.log('');
  console.log('NOMBRES PEOPLE = CORREGIDOS');

}
catch (error) {

  try {
    await client.query('ROLLBACK');
  }
  catch {}

  console.error('');
  console.error('ERROR:', error.message);
  process.exitCode = 1;

}
finally {

  client.release();
  await pool.end();

}
