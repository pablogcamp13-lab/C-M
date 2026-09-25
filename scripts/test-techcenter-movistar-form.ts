import assert from 'node:assert/strict';
import { TECHCENTER_MOVISTAR_FIELDS, TECHCENTER_MOVISTAR_FLOWS, isTechcenterCriterion, isTechcenterMovistarCampaign, scoreTechcenterMovistar, techcenterFieldsForFlow } from '../src/data/techcenterMovistarForm';

assert.equal(TECHCENTER_MOVISTAR_FIELDS.length,110);
assert.equal(TECHCENTER_MOVISTAR_FIELDS.filter(isTechcenterCriterion).length,75);
assert.equal(isTechcenterMovistarCampaign('TECHCENTER','Movistar Portabilidad Out'),true);
assert.equal(isTechcenterMovistarCampaign('TECHCENTER','Movistar Portabilida Out'),true);
assert.equal(isTechcenterMovistarCampaign('Tech Center S.A.C.','Movistar Portabilidad Out'),true);
assert.equal(isTechcenterMovistarCampaign('','Movistar Portabilidad Out','company_techcenter'),true);
assert.equal(isTechcenterMovistarCampaign('TALENT UP','Movistar Portabilidad Out'),false);
assert.equal(isTechcenterMovistarCampaign('TALENT UP','Movistar Portabilida Out'),false);
assert.equal(isTechcenterMovistarCampaign('TECHCENTER','Portabilidad Bitel'),false);
for(const flow of TECHCENTER_MOVISTAR_FLOWS){
  const fields=techcenterFieldsForFlow(flow);
  assert.ok(fields.some(field=>field.id===8));
  assert.ok(fields.some(field=>field.id===108));
  assert.ok(fields.some(isTechcenterCriterion));
  assert.equal(fields.some(field=>field.section==='Migración / Convertibilidad'),false);
  const criteria=fields.filter(isTechcenterCriterion);
  const allPass=Object.fromEntries(criteria.map(field=>[field.id,[57,59,60,61,83,84].includes(field.id)?'No':'Sí']));
  assert.equal(scoreTechcenterMovistar(fields,allPass).percent,100);
  const first=criteria[0];
  assert.equal(scoreTechcenterMovistar(fields,{...allPass,[first.id]:'No aplica'}).possible,criteria.length-1);
}
console.log('Techcenter Movistar: alcance, flujos y ponderación OK');
