import assert from 'node:assert/strict';
import {buildEvaluationFolders} from '../src/components/evaluations/evaluationFolders';
import type {Advisor,Campaign,Company,Evaluation,Operation} from '../src/types';

const companies=[{id:'a',name:'Empresa A'},{id:'b',name:'Empresa B'}] as Company[];
const campaigns=[{id:'c',name:'Campaña Compartida'}] as Campaign[];
const operations=[{id:'oa',companyId:'a',campaignId:'c'},{id:'ob',companyId:'b',campaignId:'c'}] as Operation[];
const advisors=[{id:'advisor-a',operationId:'oa',campaignId:'c'}] as Advisor[];
const evaluations=[
  {id:'manual-a',advisorId:'advisor-a',campaignId:'c',operationId:'oa',origin:'MANUAL'},
  {id:'sa-b',advisorId:'pending',campaignId:'c',operationId:'ob',origin:'SPEECH_ANALYTICS'},
  {id:'historic-b',advisorId:'advisor-a',campaignId:'c',companyId:'b',origin:'MANUAL'},
  {id:'pending',advisorId:'pending',campaignId:'c',origin:'SPEECH_ANALYTICS'},
  {id:'unknown-company',advisorId:'pending',campaignId:'c',sourceCompanyName:'Cliente no registrado',origin:'SPEECH_ANALYTICS'},
] as Evaluation[];
const folders=buildEvaluationFolders(evaluations,companies,campaigns,operations,advisors);
assert.deepEqual(folders.map(folder=>[folder.name,folder.campaigns[0]?.name,folder.evaluations.map(item=>item.id)]),[
  ['Empresa A','Campaña Compartida',['manual-a']],
  ['Empresa B','Campaña Compartida',['sa-b','historic-b']],
  ['Empresa por relacionar','Campaña Compartida',['pending','unknown-company']],
]);
console.log('Carpetas de evaluaciones: OK');
