import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const apply=process.argv.includes('--apply');
const allowReview=process.argv.includes('--allow-review-required');
const databaseUrl=String(process.env.SUPABASE_DATABASE_URL||'').trim();
const safeTables=new Set(manifest.import_order);

function parseCsv(text){const rows=[];let row=[],field='',quoted=false;const clean=text.replace(/^\uFEFF/,'');for(let i=0;i<clean.length;i++){const ch=clean[i];if(quoted){if(ch==='"'&&clean[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));if(row.some(value=>value!==''))rows.push(row);row=[];field='';}else field+=ch;}if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return[];const headers=rows[0];return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])));}
const readRows=async table=>parseCsv(await fs.readFile(path.join(root,'staging',`${table}.csv`),'utf8'));
const report={mode:apply?'APPLY':'DRY_RUN',source:manifest.source_file,sourceSha256:manifest.source_sha256,reviewRequired:manifest.source_status_counts.REVIEW_REQUIRED,invalid:manifest.source_status_counts.INVALID,tables:[],verified:false};

if(!apply){for(const table of manifest.import_order)report.tables.push({table,planned:manifest.destination_counts[table]||0});console.log(JSON.stringify(report,null,2));process.exit(0);}
if(!databaseUrl)throw new Error('Falta SUPABASE_DATABASE_URL.');
if(manifest.source_status_counts.INVALID)throw new Error('La migración contiene registros INVALID.');
if(manifest.source_status_counts.REVIEW_REQUIRED&&!allowReview)throw new Error(`Hay ${manifest.source_status_counts.REVIEW_REQUIRED} registros REVIEW_REQUIRED. Revisa los reportes y usa --allow-review-required sólo para conservarlos con ese estado.`);

const pool=new Pool({connectionString:databaseUrl,ssl:{rejectUnauthorized:false},max:4,statement_timeout:60_000});
const client=await pool.connect();
try{
  const exists=Boolean((await client.query("SELECT to_regclass('public.companies') existing")).rows[0]?.existing);
  if(!exists)await client.query(await fs.readFile(path.join(root,'01_schema.sql'),'utf8'));
  await client.query('BEGIN');
  for(const table of manifest.import_order){
    if(!safeTables.has(table))throw new Error(`Tabla no permitida: ${table}`);
    const rows=await readRows(table);let written=0;
    for(const row of rows){const columns=Object.keys(row),values=columns.map(column=>row[column]===''?null:row[column]),quoted=columns.map(column=>`"${column.replaceAll('"','""')}"`),parameters=columns.map((_,index)=>`$${index+1}`),updates=quoted.filter(column=>column!=='"id"').map(column=>`${column}=EXCLUDED.${column}`);const sql=`INSERT INTO "${table}"(${quoted.join(',')}) VALUES(${parameters.join(',')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(',')}`;await client.query(sql,values);written++;}
    const ids=rows.map(row=>row.id);const persisted=ids.length?Number((await client.query(`SELECT count(*)::int total FROM "${table}" WHERE id::text = ANY($1::text[])`,[ids])).rows[0].total):0;report.tables.push({table,source:rows.length,written,persisted,difference:persisted-rows.length});
  }
  await client.query('COMMIT');
  if(!exists)await client.query(await fs.readFile(path.join(root,'02_constraints_indexes.sql'),'utf8'));
  await client.query(await fs.readFile(path.join(root,'04_runtime_hardening.sql'),'utf8'));
  report.verified=report.tables.every(item=>item.difference===0);
  if(!report.verified)process.exitCode=1;
  console.log(JSON.stringify(report,null,2));
}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();await pool.end();}
