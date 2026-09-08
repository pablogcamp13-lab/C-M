import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const temp=await mkdtemp(join(tmpdir(),'cm-operations-'));
const port=3900+Math.floor(Math.random()*300),base=`http://127.0.0.1:${port}`;
const app=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','server.ts'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',PORT:String(port),SQLITE_PATH:join(temp,'contact.sqlite'),INITIAL_ADMIN_PASSWORD:'Admin-test-2026',GOOGLE_SHEET_ID:'',GOOGLE_DRIVE_FOLDER_ID:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_REFRESH_TOKEN:'',GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:''}});
const api=async(path,{token,method='GET',body}={})=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});let data={};try{data=await response.json()}catch{}return{response,data};};
try{
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(`${base}/api/health`)).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,80));}
  const login=await api('/api/auth/login',{method:'POST',body:{identity:'admin',password:'Admin-test-2026'}});assert.equal(login.response.status,200);const admin=login.data.token;
  const repo=(await api('/api/shared-repository',{token:admin})).data.repository,now=new Date().toISOString();
  const talent=repo.companies.find(company=>company.name==='TALENT UP');assert.ok(talent);
  const techcenter=repo.companies.find(company=>company.name==='TECHCENTER');assert.ok(techcenter);
  const retentions=repo.operations.find(operation=>operation.companyId===techcenter.id&&operation.name==='TECHCENTER / Retenciones Bitel');assert.ok(retentions);
  const duplicatedCampaign={id:'camp_duplicate_retentions',name:'Retenciones Bitel',client:'Bitel',status:'ACTIVA',products:[]};
  const duplicatedOperation={id:'op_duplicate_retentions',companyId:techcenter.id,campaignId:duplicatedCampaign.id,name:'TECHCENTER / Retenciones Bitel',status:'ACTIVA',legacy:false};
  const duplicatedAdvisor={id:'adv_duplicate_retentions',dni:'90000000',employeeCode:'DUP1',name:'Asesor Retenciones',campaignId:duplicatedCampaign.id,operationId:duplicatedOperation.id,teamId:'',supervisorId:'usr_admin',status:'ACTIVO',active:true,hireDate:'2026-01-01'};
  const reconciled=await api('/api/shared-repository/sync',{token:admin,method:'PUT',body:{...repo,campaigns:[...repo.campaigns,duplicatedCampaign],operations:[...repo.operations,duplicatedOperation],advisors:[...repo.advisors,duplicatedAdvisor]}});
  assert.equal(reconciled.response.status,200);
  const retainedOperations=reconciled.data.repository.operations.filter(operation=>operation.companyId===techcenter.id&&operation.name==='TECHCENTER / Retenciones Bitel'&&operation.status==='ACTIVA');assert.equal(retainedOperations.length,1,'Equivalent company/campaign operations are consolidated');
  const retainedStaffing=await api(`/api/staffing?operationId=${retainedOperations[0].id}`,{token:admin});assert.ok(retainedStaffing.data.rows.some(row=>row.id==='adv_duplicate_retentions'),'Reassigned people are visible in the canonical operation');
  const users=[...repo.users,{id:'usr_ops_supervisor',name:'Supervisor Operación',email:'ops.supervisor@test.local',username:'ops.supervisor',role:'SUPERVISOR',status:'ACTIVO',createdAt:now,password:'Supervisor-test-2026'},{id:'usr_ops_agent',name:'Agente Operación',email:'ops.agent@test.local',username:'ops.agent',role:'ASESOR',status:'ACTIVO',advisorId:'adv_ops',createdAt:now,password:'Agent-test-2026'}];
  const advisors=[...repo.advisors,{id:'adv_ops',dni:'90000001',employeeCode:'OPS1',name:'Asesor Operación',campaignId:'camp_1',operationId:'op_legacy_camp_1',teamId:'',supervisorId:'usr_ops_supervisor',status:'ACTIVO',active:true,hireDate:'2026-01-01'}];
  assert.equal((await api('/api/shared-repository/sync',{token:admin,method:'PUT',body:{...repo,users,advisors}})).response.status,200);
  const body={companyId:talent.id,name:'Operación de Prueba',supervisorIds:['usr_ops_supervisor'],selection:{advisorIds:['adv_ops']},supervisorMode:'KEEP',effectiveAt:'2026-09-08',dryRun:true};
  const preview=await api('/api/operations',{token:admin,method:'POST',body});assert.equal(preview.response.status,200);assert.equal(preview.data.preview.valid,true);
  const created=await api('/api/operations',{token:admin,method:'POST',body:{...body,dryRun:false}});assert.equal(created.response.status,201);assert.equal(created.data.assigned,1);
  const duplicate=await api('/api/operations',{token:admin,method:'POST',body:{...body,dryRun:false}});assert.equal(duplicate.response.status,400);
  const staffing=await api('/api/staffing',{token:admin});assert.equal(staffing.response.status,200);assert.equal(staffing.data.rows.find(row=>row.id==='adv_ops').operation_id,created.data.operationId);
  const history=await api('/api/staffing/movements',{token:admin});assert.equal(history.response.status,200);assert.ok(history.data.rows.some(row=>row.destination.operationId===created.data.operationId));
  const agentLogin=await api('/api/auth/login',{method:'POST',body:{identity:'ops.agent',password:'Agent-test-2026'}});assert.equal(agentLogin.response.status,200);const denied=await api('/api/staffing',{token:agentLogin.data.token});assert.equal(denied.response.status,403);
  console.log('Operación y Dotación: creación, dry-run, movimiento, historial, unicidad y RBAC correctos.');
}finally{app.kill();await new Promise(resolve=>setTimeout(resolve,500));try{await rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:250});}catch{}}
