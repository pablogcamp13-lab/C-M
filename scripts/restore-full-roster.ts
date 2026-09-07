import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import XLSX from 'xlsx';
import { googleStorage } from '../server/googleStorage';
import type { Advisor, Campaign, Team, User } from '../src/types';

const filePath=process.env.ROSTER_FILE;
if(!filePath||!googleStorage.enabled) throw new Error('Define ROSTER_FILE y las variables GOOGLE_* en .env.');
const current=await googleStorage.loadRepository(),auth=await googleStorage.loadUsersForAuthentication();
if(!current||!auth) throw new Error('No fue posible leer la persistencia actual.');
const normalize=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ');
const slug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const date=(value:unknown)=>{if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);const text=normalize(value);if(!text)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return match?`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`:''};
const hash=(password:string)=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`};
const workbook=XLSX.readFile(filePath,{cellDates:true});
const now=new Date().toISOString(),existingDnis=new Set(current.advisors.map(item=>item.dni.trim())),seen=new Set<string>();
const campaigns=[...current.campaigns],teams=[...current.teams],users=[...current.users],advisors=[...current.advisors];
const hashes=new Map(auth.map(user=>[user.id,user.passwordHash]));
let imported=0,duplicates=0,invalid=0;
for(const sheetName of workbook.SheetNames){
  const campaignKey=sheetName.toLocaleLowerCase('es');
  let campaign=campaigns.find(item=>item.name.trim().toLocaleLowerCase('es')===campaignKey);
  if(!campaign){campaign={id:`camp_excel_${slug(sheetName)}`,name:sheetName,client:sheetName,status:'ACTIVA',products:[]};campaigns.push(campaign);}
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets[sheetName],{defval:'',raw:true});
  for(const row of rows){
    const dni=normalize(row.DNI),name=normalize(row.ASESOR||row.ASESORES);
    if(!dni||!name){invalid++;continue} if(seen.has(dni)||existingDnis.has(dni)){duplicates++;continue} seen.add(dni);
    const supervisorName=normalize(row.SUPERVISOR)||'SIN SUPERVISOR';
    let supervisor=users.find(item=>item.role==='SUPERVISOR'&&normalize(item.name).toLocaleLowerCase('es')===supervisorName.toLocaleLowerCase('es'));
    if(!supervisor){const base=`usr_sup_${slug(supervisorName)}`;supervisor={id:users.some(item=>item.id===base)?`${base}_${users.length}`:base,name:supervisorName,email:`${slug(supervisorName)}@supervisores3c.com`,username:slug(supervisorName),role:'SUPERVISOR',status:'ACTIVO',createdAt:now,mustChangePassword:true};users.push(supervisor);hashes.set(supervisor.id,hash('12345678'));}
    let team=teams.find(item=>item.campaignId===campaign!.id&&item.supervisorId===supervisor!.id);
    if(!team){team={id:`team_${slug(sheetName)}_${slug(supervisorName)}`,campaignId:campaign.id,supervisorId:supervisor.id,name:`${sheetName} · ${supervisorName}`};teams.push(team);}
    const terminationDate=date(row.FECHA_CESE),advisorId=`adv_excel_${dni}`;
    const advisor:Advisor={id:advisorId,dni,employeeCode:`ADV-${dni.slice(-4)}`,name,campaignId:campaign.id,operationId:`op_legacy_${campaign.id}`,sourceCampaignName:normalize(row['CAMPAÑA'])||sheetName,teamId:team.id,supervisorId:supervisor.id,supervisor:supervisor.name,schedule:normalize(row.HORARIO),shift:/tarde|noche/i.test(normalize(row.TURNO))?'TARDE':/mañana|manana/i.test(normalize(row.TURNO))?'MANANA':'COMPLETO',status:terminationDate||/inactiv|cesad/i.test(normalize(row.ESTADO))?'INACTIVO':'ACTIVO',active:!terminationDate,hireDate:date(row.FECHA_INGRESO),hireDatePending:!date(row.FECHA_INGRESO),campaignStartDate:date(row.FECHA_INGRESO_CAMPAÑA)||undefined,campaignStartDatePending:!date(row.FECHA_INGRESO_CAMPAÑA),terminationDate:terminationDate||undefined,condition:normalize(row.CONDICION),fte:normalize(row.FTE),modality:normalize(row.MODALIDAD),sourceShift:normalize(row.TURNO),site:normalize(row.SEDE),quartile:normalize(row.CUARTIL)||undefined,indicators:normalize(row.INDICADORES)||undefined};
    advisors.push(advisor);existingDnis.add(dni);imported++;
    const username=`asesor_${dni}`;const user:User={id:`usr_${advisorId}`,name,email:`${username}@asesores3c.com`,username,role:'ASESOR',status:advisor.status==='ACTIVO'?'ACTIVO':'INACTIVO',advisorId,teamId:team.id,createdAt:now,mustChangePassword:true};users.push(user);hashes.set(user.id,hash('12345678'));
  }
}
await googleStorage.saveRepository({users,campaigns,teams,advisors},hashes);
console.log(JSON.stringify({imported,duplicates,invalid,total:advisors.length,campaigns:workbook.SheetNames.length}));
