import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const temp=await mkdtemp(join(tmpdir(),'cm-public-dashboard-'));
const port=4300+Math.floor(Math.random()*300),base=`http://127.0.0.1:${port}`;
const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','server.ts'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',PORT:String(port),SQLITE_PATH:join(temp,'contact.sqlite'),INITIAL_ADMIN_PASSWORD:'Admin-test-2026',SUPABASE_DATABASE_URL:'',REQUIRE_SUPABASE:'false',ALLOW_GOOGLE_SHEETS_FALLBACK:'false',GOOGLE_SHEET_ID:'',GOOGLE_DRIVE_FOLDER_ID:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_REFRESH_TOKEN:''}});
let log='';app.stdout.on('data',chunk=>log+=String(chunk));app.stderr.on('data',chunk=>log+=String(chunk));
const api=async(path,{token,method='GET',body}={})=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {response,data:await response.json().catch(()=>({}))};};
try{
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  const login=await api('/api/auth/login',{method:'POST',body:{identity:'admin',password:'Admin-test-2026'}});assert.equal(login.response.status,200,log);const admin=login.data.token;
  const repo=(await api('/api/shared-repository',{token:admin})).data.repository;
  const operation=repo.operations.find(item=>item.status==='ACTIVA'&&!item.legacy&&repo.companies.some(company=>company.id===item.companyId&&company.status==='ACTIVA')&&repo.campaigns.some(campaign=>campaign.id===item.campaignId&&campaign.status==='ACTIVA'));
  assert.ok(operation,'Fixture needs an active company/campaign operation');
  const other=repo.operations.find(item=>item.id!==operation.id&&item.companyId!==operation.companyId&&item.status==='ACTIVA'&&!item.legacy);
  assert.ok(other,'Fixture needs a second company');
  const advisor={id:'adv_public_test',dni:'92929292',employeeCode:'PUB1',name:'Cliente Asesor',campaignId:operation.campaignId,operationId:operation.id,teamId:'',supervisorId:'usr_admin',status:'ACTIVO',active:true,hireDate:'2026-01-01'};
  const otherAdvisor={...advisor,id:'adv_other_test',dni:'93939393',name:'Asesor Otra Empresa',campaignId:other.campaignId,operationId:other.id};
  const sync=await api('/api/shared-repository/sync',{token:admin,method:'PUT',body:{...repo,advisors:[...repo.advisors,advisor,otherAdvisor]}});assert.equal(sync.response.status,200,JSON.stringify(sync.data));
  for(const [id,person,op] of [['eval_public_test',advisor,operation],['eval_other_test',otherAdvisor,other]]){const result=await api('/api/evaluations',{token:admin,method:'POST',body:{id,advisorId:person.id,evaluatorId:'usr_admin',supervisorId:'usr_admin',campaignId:op.campaignId,companyId:op.companyId,operationId:op.id,evaluationType:'QUALITY',date:'2026-09-24',time:'11:00',technicalScore:75,scoreTotal:75,comments:'Texto privado nunca público',items:[]}});assert.equal(result.response.status,201,JSON.stringify(result.data));}
  const d3c=await api('/api/evaluations',{token:admin,method:'POST',body:{id:'eval_public_d3c',advisorId:advisor.id,evaluatorId:'usr_admin',supervisorId:'usr_admin',campaignId:operation.campaignId,companyId:operation.companyId,operationId:operation.id,evaluationType:'D3C',date:'2026-09-24',time:'12:00',scoreTotal:82,comments:'Detalle D3C privado',items:[]}});assert.equal(d3c.response.status,201,JSON.stringify(d3c.data));
  assert.equal((await api('/api/admin/public-dashboard-links')).response.status,401);
  assert.equal((await api('/api/admin/public-dashboard-links',{token:admin,method:'POST',body:{companyId:operation.companyId,campaignId:operation.campaignId,expiresInDays:30}})).response.status,400,'A dashboard type is required');
  const created=await api('/api/admin/public-dashboard-links',{token:admin,method:'POST',body:{companyId:operation.companyId,campaignId:operation.campaignId,dashboardType:'QUALITY',expiresInDays:30}});assert.equal(created.response.status,201,JSON.stringify(created.data));assert.equal(created.data.link.dashboardType,'QUALITY');assert.match(created.data.path,/^\/share\/dashboard\/[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
  const listing=await api('/api/admin/public-dashboard-links',{token:admin});assert.equal(listing.response.status,200);assert.ok(!JSON.stringify(listing.data).includes(created.data.path.split('.')[1]),'Secret is never returned by listing');
  const publicPath=created.data.path.replace('/share/dashboard/','/api/public/dashboard/');const view=await api(publicPath+'?dashboardType=D3C');assert.equal(view.response.status,200,JSON.stringify(view.data));assert.equal(view.data.dashboardType,'QUALITY');assert.equal(view.data.company.id,operation.companyId);assert.equal(view.data.campaign.id,operation.campaignId);assert.ok(view.data.evaluations.some(item=>item.id==='eval_public_test'));assert.ok(!view.data.evaluations.some(item=>item.id==='eval_other_test'));assert.ok(!view.data.evaluations.some(item=>item.id==='eval_public_d3c'),'Quality link does not reveal D+3C evaluations');
  const d3cLink=await api('/api/admin/public-dashboard-links',{token:admin,method:'POST',body:{companyId:operation.companyId,campaignId:operation.campaignId,dashboardType:'D3C',expiresInDays:30}});assert.equal(d3cLink.response.status,201);const d3cView=await api(d3cLink.data.path.replace('/share/dashboard/','/api/public/dashboard/'));assert.equal(d3cView.response.status,200);assert.equal(d3cView.data.dashboardType,'D3C');assert.ok(d3cView.data.evaluations.some(item=>item.id==='eval_public_d3c'));assert.ok(!d3cView.data.evaluations.some(item=>item.id==='eval_public_test'),'D+3C link does not reveal Quality evaluations');
  const exposed=JSON.stringify(view.data);assert.ok(!exposed.includes('92929292'));assert.ok(!exposed.includes('Texto privado nunca público'));assert.ok(!exposed.includes('Asesor Otra Empresa'));
  assert.equal((await api(publicPath.slice(0,-1)+'X')).response.status,404);
  const revoked=await api(`/api/admin/public-dashboard-links/${created.data.link.id}/revoke`,{token:admin,method:'POST'});assert.equal(revoked.response.status,200);assert.ok(revoked.data.link.revokedAt);assert.equal((await api(publicPath)).response.status,404);
  console.log('Public dashboard: scoped, sanitized, revocable ✓');
}finally{app.kill();if(app.exitCode===null)await once(app,'exit');await rm(temp,{recursive:true,force:true});}
