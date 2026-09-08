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
  assert.ok(reconciled.data.repository.operationSupervisors.some(link=>link.operationId===retainedOperations[0].id&&link.supervisorId==='usr_admin'&&link.active),'An imported supervisor is linked to the destination operation');
  const historicalEvaluation=await api('/api/evaluations',{token:admin,method:'POST',body:{id:'eval_before_roster_import',advisorId:'adv_duplicate_retentions',evaluatorId:'usr_admin',evaluationType:'QUALITY',date:'2026-09-07',time:'10:00',items:[]}});assert.equal(historicalEvaluation.response.status,201);
  const historicalFeedback=await api('/api/feedbacks',{token:admin,method:'POST',body:{evaluation_id:'eval_before_roster_import',feedback_text:'Histórico que debe conservarse.'}});assert.equal(historicalFeedback.response.status,201);
  const importRows=[
    {advisor:{...duplicatedAdvisor,id:'client_id_must_not_replace_existing',name:'Asesor Retenciones Actualizado',operationId:retainedOperations[0].id,campaignId:retainedOperations[0].campaignId,supervisorId:'usr_admin',quartile:'Q4'}},
    {advisor:{id:'adv_imported_roster',dni:'90000003',employeeCode:'IMP1',name:'Asesor Nuevo Importado',operationId:retainedOperations[0].id,campaignId:retainedOperations[0].campaignId,teamId:'',supervisorId:'usr_admin',quartile:'Q2',status:'ACTIVO',active:true,hireDate:'2026-01-01'}}
  ];
  const imported=await api('/api/staffing/import',{token:admin,method:'POST',body:{operationId:retainedOperations[0].id,effectiveAt:'2026-09-08',rows:importRows}});
  assert.equal(imported.response.status,200);assert.equal(imported.data.verification.verified,2);assert.equal(imported.data.summary.created,1);assert.equal(imported.data.summary.updated,1);
  const importedExisting=imported.data.repository.advisors.find(advisor=>advisor.dni==='90000000');
  assert.equal(importedExisting.id,'adv_duplicate_retentions','Import by DNI preserves the advisor identity and its historical references');
  assert.equal(importedExisting.name,'Asesor Retenciones Actualizado');assert.equal(importedExisting.quartile,'Q4');assert.equal(importedExisting.operationId,retainedOperations[0].id);
  const importedNew=imported.data.repository.advisors.find(advisor=>advisor.dni==='90000003');assert.ok(importedNew);assert.equal(importedNew.operationId,retainedOperations[0].id);
  assert.ok(imported.data.repository.users.some(user=>user.advisorId===importedNew.id),'New advisors receive an account');
  const movementsAfterFirstImport=imported.data.repository.staffingMovements.length;
  const repeatedImport=await api('/api/staffing/import',{token:admin,method:'POST',body:{operationId:retainedOperations[0].id,effectiveAt:'2026-09-08',rows:importRows}});
  assert.equal(repeatedImport.response.status,200);assert.equal(repeatedImport.data.verification.verified,2);assert.equal(repeatedImport.data.summary.created,0);assert.equal(repeatedImport.data.summary.updated,2);assert.equal(repeatedImport.data.summary.assignmentsCreated,0);assert.equal(repeatedImport.data.summary.alreadyAssigned,2);
  assert.equal(repeatedImport.data.repository.staffingMovements.length,movementsAfterFirstImport,'Repeating the same roster does not duplicate assignments or movements');
  const evaluationsAfterImport=await api('/api/admin/dashboard',{token:admin});assert.ok(evaluationsAfterImport.data.evaluations.some(evaluation=>evaluation.id==='eval_before_roster_import'),'Evaluations survive reassignment');
  const feedbacksAfterImport=await api('/api/feedbacks',{token:admin});assert.ok(feedbacksAfterImport.data.feedbacks.some(feedback=>feedback.feedback_id===historicalFeedback.data.feedback.feedback_id),'Feedback survives reassignment');
  const rejectedImport=await api('/api/staffing/import',{token:admin,method:'POST',body:{operationId:retainedOperations[0].id,effectiveAt:'2026-09-08',rows:[{advisor:{id:'adv_should_rollback',dni:'90000004',name:'Fila válida previa',supervisorId:'usr_admin'}},{advisor:{id:'adv_invalid_supervisor',dni:'90000005',name:'Fila inválida',supervisorId:'missing_user'}}]}});
  assert.equal(rejectedImport.response.status,400);const afterRejectedImport=(await api('/api/shared-repository',{token:admin})).data.repository;assert.ok(!afterRejectedImport.advisors.some(advisor=>['90000004','90000005'].includes(advisor.dni)),'A rejected batch does not leave partial advisors');
  const deletedCampaign={id:'camp_deleted_evaluation',name:'Campaña eliminada de prueba',client:'Test',status:'ACTIVA',products:[]};
  const deletedOperation={id:'op_deleted_evaluation',companyId:techcenter.id,campaignId:deletedCampaign.id,name:'TECHCENTER / Campaña eliminada de prueba',status:'ACTIVA',legacy:false};
  const deletedAdvisor={id:'adv_deleted_evaluation',dni:'90000002',employeeCode:'DEL1',name:'Asesor de campaña eliminada',campaignId:deletedCampaign.id,operationId:deletedOperation.id,teamId:'',supervisorId:'usr_admin',status:'ACTIVO',active:true,hireDate:'2026-01-01'};
  const withDeletedCampaign=await api('/api/shared-repository/sync',{token:admin,method:'PUT',body:{...reconciled.data.repository,campaigns:[...reconciled.data.repository.campaigns,deletedCampaign],operations:[...reconciled.data.repository.operations,deletedOperation],advisors:[...reconciled.data.repository.advisors,deletedAdvisor]}});assert.equal(withDeletedCampaign.response.status,200);
  const removed=await api(`/api/admin/campaigns/${deletedCampaign.id}?companyId=${techcenter.id}`,{token:admin,method:'DELETE'});assert.equal(removed.response.status,204);
  const afterRemoval=(await api('/api/shared-repository',{token:admin})).data.repository;
  assert.equal(afterRemoval.campaigns.find(campaign=>campaign.id===deletedCampaign.id)?.status,'INACTIVA');
  assert.equal(afterRemoval.operations.find(operation=>operation.id===deletedOperation.id)?.status,'INACTIVA');
  const blockedEvaluation=await api('/api/evaluations',{token:admin,method:'POST',body:{id:'eval_deleted_campaign',advisorId:deletedAdvisor.id,evaluatorId:'usr_admin',evaluationType:'QUALITY',date:'2026-09-08',time:'12:00',items:[]}});
  assert.equal(blockedEvaluation.response.status,400,'A removed campaign cannot receive new evaluations');
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
