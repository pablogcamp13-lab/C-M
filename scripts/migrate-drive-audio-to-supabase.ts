import 'dotenv/config';
import pg from 'pg';
import { supabaseFileStorage } from '../server/supabaseFileStorage';

const databaseUrl = String(process.env.SUPABASE_DATABASE_URL || '').trim();
if (!databaseUrl || !supabaseFileStorage.enabled) throw new Error('Falta la configuración de Supabase.');

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
const sourceId = (url: unknown) => String(url || '').match(/\/api\/files\/([^/]+)\/content/)?.[1] || '';
const summary = { discovered: 0, migrated: 0, skipped: 0, failed: 0 };

try {
  const { rows } = await pool.query("SELECT id,payload_json FROM evaluations WHERE payload_json::text LIKE '%/api/files/%' ORDER BY created_at");
  const uploaded = new Map<string, { id: string; mimeType: string; size: number }>();
  for (const row of rows) {
    const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
    const driveId = sourceId(payload.audioUrl);
    if (!driveId || driveId.startsWith('sb_')) { summary.skipped += 1; continue; }
    summary.discovered += 1;
    try {
      let file = uploaded.get(driveId);
      if (!file) {
        const response = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`, { redirect: 'follow' });
        const mimeType = String(response.headers.get('content-type') || payload.audioMimeType || 'audio/mpeg').split(';')[0].toLowerCase();
        if (!response.ok || mimeType.includes('text/html')) throw new Error(`Descarga rechazada (${response.status}).`);
        const data = Buffer.from(await response.arrayBuffer());
        if (!data.length || data.length > 35 * 1024 * 1024) throw new Error('Tamaño de archivo inválido.');
        const stored = await supabaseFileStorage.uploadFile({ name: payload.audioFileName || `audio-${row.id}.mp3`, mimeType, data });
        file = { id: stored.id, mimeType, size: data.length };
        uploaded.set(driveId, file);
      }
      const next = { ...payload, audioUrl: `/api/files/${file.id}/content`, audioMimeType: file.mimeType, audioFileSize: file.size, audioStorageProvider: 'SUPABASE' };
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE evaluations SET payload_json=$2 WHERE id=$1', [row.id, JSON.stringify(next)]);
        await client.query("UPDATE evaluation_media SET audio_drive_file_id=$2,audio_mime_type=$3,audio_size=$4,metadata_json=COALESCE(metadata_json,'{}'::jsonb)||$5::jsonb WHERE evaluation_id=$1", [row.id, file.id, file.mimeType, file.size, JSON.stringify({ storageProvider: 'SUPABASE', migratedAt: new Date().toISOString() })]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      summary.migrated += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`[audio-migration] ${row.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(JSON.stringify(summary));
  if (summary.failed) process.exitCode = 1;
} finally {
  await pool.end();
}
