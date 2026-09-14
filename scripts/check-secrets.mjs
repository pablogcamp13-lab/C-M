import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const listed=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});assert.equal(listed.status,0,'No se pudo listar archivos versionados.');
const files=listed.stdout.split('\0').filter(Boolean).filter(name=>!name.endsWith('package-lock.json'));
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/AIza[0-9A-Za-z_-]{30,}/,/(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|GOOGLE_REFRESH_TOKEN|GOOGLE_CLIENT_SECRET|SUPABASE_DATABASE_URL)[ \t]*=[ \t]*['"]?[^\s'"<>{}]{12,}/i,/postgres(?:ql)?:\/\/[^\s'"<>]+:[^\s'"<>]+@/i];
const offenders=[];for(const file of files){let source;try{source=await readFile(file,'utf8')}catch{continue}if(patterns.some(pattern=>pattern.test(source)))offenders.push(file);}
assert.deepEqual(offenders,[],`Posible secreto en archivos versionados: ${offenders.join(', ')}`);
console.log(`Secret scan: ${files.length} archivos versionados revisados; sin credenciales detectadas.`);
