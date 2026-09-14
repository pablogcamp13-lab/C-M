import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.cwd(),text=path=>readFile(join(root,path),'utf8');
const [server,app,context,storage,authorization,env,sql]=await Promise.all([text('server.ts'),text('src/App.tsx'),text('src/context/AppContext.tsx'),text('server/supabaseStorage.ts'),text('server/authorization.ts'),text('.env.example'),text('migration/supabase/04_runtime_hardening.sql')]);
assert.match(server,/supabaseStorage\.enabled \? supabaseStorage/);
assert.match(server,/ALLOW_GOOGLE_SHEETS_FALLBACK === 'true'/);
assert.match(server,/googleDriveStorage\.driveEnabled/);
assert.doesNotMatch(context,/localStorage\.(setItem|getItem|removeItem)/);
assert.match(app,/lazy\(\(\)=>import/);
assert.match(authorization,/canAccessCompany/);assert.match(authorization,/canAccessOperation/);assert.match(authorization,/canAccessPerson/);assert.match(authorization,/scopedRepository/);
assert.match(storage,/BEGIN/);assert.match(storage,/COMMIT/);assert.match(storage,/ROLLBACK/);
assert.match(sql,/operation_dashboard_metrics/);assert.match(sql,/evaluations_validation_date_idx/);assert.match(sql,/audio_drive_file_id/);assert.match(sql,/access_scope/);
for(const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_DATABASE_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','GOOGLE_DRIVE_FOLDER_ID'])assert.match(env,new RegExp(`^${name}=$`,'m'));
const srcFiles=(await readdir(join(root,'src'),{recursive:true})).filter(name=>/\.[jt]sx?$/.test(name));for(const name of srcFiles){const source=await readFile(join(root,'src',name),'utf8');assert.doesNotMatch(source,/from ['"]googleapis['"]/,`googleapis no debe entrar al frontend: ${name}`);}
console.log('Fase 4 estática: Supabase principal, Drive aislado, scopes, transacciones, índices, lazy loading y ausencia de localStorage crítico verificados.');
