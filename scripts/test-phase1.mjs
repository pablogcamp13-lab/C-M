import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory=await mkdtemp(join(tmpdir(),'cm-phase1-')),port=3397,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',SQLITE_PATH:join(directory,'test.sqlite'),INITIAL_ADMIN_PASSWORD:'Admin-test-2026',GOOGLE_SHEET_ID:'',GOOGLE_DRIVE_FOLDER_ID:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_REFRESH_TOKEN:'',GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:''},stdio:['ignore','pipe','pipe']});
const request=async(path,{token,body,...options}={})=>{const response=await fetch(`${base}${path}`,{...options,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});let data=null;try{data=await response.json();}catch{}return{response,data};};
const login=async(identity,password)=>{const {response,data}=await request('/api/auth/login',{method:'POST',body:{identity,password}});assert.equal(response.status,200);return data.token;};
const evaluation=(id,advisorId,status)=>({id,advisorId,evaluatorId:'usr_admin',campaignId:'camp_1',teamId:'',supervisorId:'usr_admin',product:'Migraciones',date:'2026-09-07',time:id.endsWith('2')?'11:00':'10:00',callId:`CALL-${id}`,recordingCode:`REC-${id}`,type:'MONITOREO_REGULAR',evaluationType:'QUALITY',qualityStatus:'FINALIZED',validationStatus:status,sale:false,saleResult:'NO_VENTA',comments:'Evaluación de prueba',scoreConnect:80,scoreClarify:80,scoreConvert:80,scoreTotal:80,technicalScore:80,primaryGap:'',secondaryGap:'',strongestPillar:'Claridad',recommendation:'',items:[],createdAt:new Date().toISOString(),audioUrl:'/api/files/private-audio/content'});
try{
  for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  const admin=await login('admin','Admin-test-2026');
  const current=(await request('/api/shared-repository',{token:admin})).data.repository;
  const agent={id:'usr_agent',name:'Agente Uno',email:'agent@example.test',username:'agent.one',role:'ASESOR',status:'ACTIVO',advisorId:'adv_1',createdAt:new Date().toISOString(),password:'Agent-test-2026'};
  const advisors=[{id:'adv_1',dni:'70000001',employeeCode:'A1',name:'Agente Uno',campaignId:'camp_1',teamId:'',supervisorId:'usr_admin',status:'ACTIVO',hireDate:'2026-01-01',active:true},{id:'adv_2',dni:'70000002',employeeCode:'A2',name:'Agente Dos',campaignId:'camp_1',teamId:'',supervisorId:'usr_admin',status:'ACTIVO',hireDate:'2026-01-01',active:true}];
  assert.equal((await request('/api/shared-repository/sync',{method:'PUT',token:admin,body:{...current,users:[...current.users,agent],advisors}})).response.status,200);
  const manual=(await request('/api/evaluations',{method:'POST',token:admin,body:evaluation('eval_1','adv_1')})).data.evaluation;assert.equal(manual.validationStatus,'VALIDATED');
  const foreign=(await request('/api/evaluations',{method:'POST',token:admin,body:evaluation('eval_2','adv_2')})).data.evaluation;
  const legacy={...evaluation('eval_legacy','adv_1'),validationStatus:undefined,time:'09:00'};const automatic={...evaluation('eval_auto','adv_1','AUTOMATIC_PENDING'),time:'08:00'};
  assert.equal((await request('/api/platform-state',{method:'PUT',token:admin,body:{evaluations:[manual,foreign,legacy,automatic],actionPlans:[],interventions:[],advisorInterventions:[],operationalMeasurements:[],importHistory:[],config:{}}})).response.status,200);
  const feedback=(await request('/api/feedbacks',{method:'POST',token:admin,body:{evaluation_id:'eval_1',feedback_text:'Feedback real'}})).data.feedback;
  const agentToken=await login('agent.one','Agent-test-2026');
  const state=(await request('/api/platform-state',{token:agentToken})).data.state;assert.deepEqual(new Set(state.evaluations.map(item=>item.id)),new Set(['eval_1','eval_legacy']));
  assert.equal((await request('/api/evaluations/eval_2/agent-detail',{token:agentToken})).response.status,404);
  assert.equal((await request('/api/evaluations/eval_2/audio',{token:agentToken})).response.status,404);
  assert.equal((await request('/api/evaluations/eval_1/commitment',{method:'PATCH',token:agentToken,body:{commitment:'Aplicar sondeo antes de presentar la oferta.',commitmentDate:'2026-09-15'}})).response.status,200);
  assert.equal((await request(`/api/feedbacks/${feedback.feedback_id}`,{method:'PATCH',token:agentToken,body:{status:'VALIDADO_ASESOR',advisor_response:'Conforme'}})).response.status,200);
  const detail=(await request('/api/evaluations/eval_1/agent-detail',{token:agentToken})).data;assert.equal(detail.commitment.text,'Aplicar sondeo antes de presentar la oferta.');assert.equal(detail.signature.status,'SIGNED');
  console.log('Fase 1: 14 verificaciones de integración correctas.');
} finally { child.kill(); await new Promise(resolve=>setTimeout(resolve,250)); await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }
