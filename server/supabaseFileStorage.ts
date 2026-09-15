import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

const MAX_FILE_SIZE = 35 * 1024 * 1024;
const DEFAULT_BUCKET = 'evaluation-media-private';

type StoredFile = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

const encodeFile = (file: StoredFile) => `sb_${Buffer.from(JSON.stringify(file)).toString('base64url')}`;

const decodeFile = (id: string): StoredFile => {
  if (!id.startsWith('sb_')) throw new Error('El archivo no pertenece a Supabase Storage.');
  try {
    const value = JSON.parse(Buffer.from(id.slice(3), 'base64url').toString('utf8')) as StoredFile;
    if (!value.path || !value.name || !value.mimeType) throw new Error();
    return value;
  } catch {
    throw new Error('Identificador de archivo inválido.');
  }
};

class SupabaseFileStorage {
  private client: SupabaseClient | null = null;
  private bucketReady: Promise<void> | null = null;

  get enabled() {
    return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  }

  get bucket() {
    return process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  }

  owns(id: string) {
    return id.startsWith('sb_');
  }

  private storage() {
    if (!this.enabled) throw new Error('Supabase Storage no está configurado.');
    if (!this.client) {
      this.client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
    }
    return this.client.storage;
  }

  async ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const storage = this.storage();
        const { data, error } = await storage.getBucket(this.bucket);
        if (!error && data) {
          if (data.public) {
            const result = await storage.updateBucket(this.bucket, { public: false, fileSizeLimit: MAX_FILE_SIZE });
            if (result.error) throw result.error;
          }
          return;
        }
        const created = await storage.createBucket(this.bucket, { public: false, fileSizeLimit: MAX_FILE_SIZE });
        if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;
      })().catch(error => {
        this.bucketReady = null;
        throw error;
      });
    }
    await this.bucketReady;
  }

  async uploadFile(input: { name: string; mimeType: string; data: Buffer }) {
    if (!input.data.length || input.data.length > MAX_FILE_SIZE) throw new Error('Archivo inválido o excede el límite permitido.');
    await this.ensureBucket();
    const now = new Date();
    const path = `runtime/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(18).toString('hex')}`;
    const stored: StoredFile = {
      path,
      name: input.name.replace(/[\\/\r\n]/g, '_').slice(0, 220) || 'archivo',
      mimeType: input.mimeType || 'application/octet-stream',
      size: input.data.length
    };
    const { error } = await this.storage().from(this.bucket).upload(path, input.data, {
      contentType: stored.mimeType,
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;
    return { id: encodeFile(stored), ...stored };
  }

  async fileMetadata(id: string) {
    const file = decodeFile(id);
    return { id, ...file };
  }

  async downloadFile(id: string) {
    const file = decodeFile(id);
    const { data, error } = await this.storage().from(this.bucket).download(file.path);
    if (error || !data) throw error || new Error('Archivo no encontrado.');
    return Readable.from(Buffer.from(await data.arrayBuffer()));
  }

  async deleteFile(id: string) {
    const file = decodeFile(id);
    const { data, error } = await this.storage().from(this.bucket).remove([file.path]);
    if (error) throw error;
    if (!data?.length) throw new Error('Archivo no encontrado.');
  }

  async health() {
    if (!this.enabled) return { configured: false, ok: false, bucket: this.bucket };
    try {
      await this.ensureBucket();
      return { configured: true, ok: true, provider: 'supabase', bucket: this.bucket, private: true };
    } catch (error) {
      return { configured: true, ok: false, provider: 'supabase', bucket: this.bucket, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }
}

export const supabaseFileStorage = new SupabaseFileStorage();
