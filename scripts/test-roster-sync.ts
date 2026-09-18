import assert from 'node:assert/strict';
import { rosterImportSnapshot } from '../server/rosterSync';
import { movementAssignmentLink } from '../server/supabaseStorage';
import type { SharedRepository } from '../server/googleStorage';

const repository = {
  companies: [{id:'company-1',name:'KONECTADOS',status:'ACTIVA'},{id:'company-2',name:'OTRA',status:'ACTIVA'}],
  campaigns: [{id:'campaign-1',name:'Migraciones Bitel',client:'Bitel',status:'ACTIVA',products:[]},{id:'campaign-2',name:'Otra',client:'Otra',status:'ACTIVA',products:[]}],
  operations: [{id:'operation-1',companyId:'company-1',campaignId:'campaign-1',name:'Migraciones Bitel',status:'ACTIVA'},{id:'operation-2',companyId:'company-2',campaignId:'campaign-2',name:'Otra',status:'ACTIVA'}],
  users: [{id:'supervisor-1',name:'Supervisor',email:'supervisor@test.local',role:'SUPERVISOR',status:'ACTIVO',createdAt:'2026-09-17'},{id:'user-1',name:'Asesor',email:'asesor@test.local',role:'ASESOR',status:'ACTIVO',advisorId:'advisor-1',createdAt:'2026-09-17'},{id:'user-2',name:'Otro',email:'otro@test.local',role:'ASESOR',status:'ACTIVO',advisorId:'advisor-2',createdAt:'2026-09-17'}],
  advisors: [{id:'advisor-1',dni:'12345678',name:'Asesor',campaignId:'campaign-1',operationId:'operation-1',teamId:'team-1',supervisorId:'supervisor-1'},{id:'advisor-2',dni:'87654321',name:'Otro',campaignId:'campaign-2',operationId:'operation-2',teamId:'team-2',supervisorId:'supervisor-2'}],
  teams: [{id:'team-1',campaignId:'campaign-1',supervisorId:'supervisor-1',name:'Equipo 1'},{id:'team-2',campaignId:'campaign-2',supervisorId:'supervisor-2',name:'Equipo 2'}],
  operationSupervisors: [{operationId:'operation-1',supervisorId:'supervisor-1',active:true,startAt:'2026-09-17'}],
  operationAssignments: [{id:'assignment-1',advisorId:'advisor-1',operationId:'operation-1',teamId:'team-1',supervisorId:'supervisor-1',role:'ASESOR',operationalStatus:'PRODUCCION',startDate:'2026-09-17',active:true,source:'IMPORTACION'}],
  staffingMovements: [{id:'movement-1',advisorId:'advisor-1',assignmentId:'assignment-1',type:'ALTA',effectiveAt:'2026-09-17'}]
} as SharedRepository;

const scoped = rosterImportSnapshot(repository,['advisor-1']);
assert.equal(scoped.advisors.length,1);
assert.equal(scoped.users.length,2);
assert.deepEqual(scoped.teams.map(item=>item.id),['team-1']);
assert.deepEqual(scoped.operations?.map(item=>item.id),['operation-1']);
assert.deepEqual(scoped.companies?.map(item=>item.id),['company-1']);
assert.deepEqual(scoped.operationAssignments?.map(item=>item.id),['assignment-1']);
assert.deepEqual(scoped.staffingMovements?.map(item=>item.id),['movement-1']);

const owners = new Map([['assignment-1','advisor-1']]);
assert.equal(movementAssignmentLink('assignment-1','advisor-1',owners),'assignment-1');
assert.equal(movementAssignmentLink('missing','advisor-1',owners),null);
assert.equal(movementAssignmentLink('assignment-1','advisor-2',owners),null);
console.log('Sincronización de dotación: alcance y movimientos históricos correctos.');
