import assert from 'node:assert/strict';
import { aggregateDepartments, normalizeDepartment, resolveGeoAnalysis } from '../src/utils/movistarGeo';
import { MOVISTAR_GEO_DEMO } from '../src/data/movistarGeoDemo';

assert.equal(normalizeDepartment('Áncash'),'ANCASH');
assert.equal(normalizeDepartment('Lima Provincia'),'LIMA');
assert.equal(normalizeDepartment('lugar imaginario'),'No identificado');
assert.equal(resolveGeoAnalysis({transcript:'Estoy en Pampa Chico, provincia de Recuay.'}).department,'ANCASH');
const classified=resolveGeoAnalysis({primaryMotive:'No hay delivery',secondaryMotive:'Cobertura',transcript:'Movistar anteriormente tenía mala señal.'});
assert.equal(classified.primaryMotive,'No hay delivery');
assert.ok(classified.mentionedMotives?.includes('Cobertura / señal'));
assert.equal(aggregateDepartments(MOVISTAR_GEO_DEMO,'Cobertura / señal','PRIMARY').find(item=>item.department==='ANCASH')?.incidence,60);
assert.equal(aggregateDepartments(MOVISTAR_GEO_DEMO,'Cobertura / señal','PRIMARY').find(item=>item.department==='TUMBES')?.incidence,null);
assert.equal(aggregateDepartments([{...MOVISTAR_GEO_DEMO[0],sale:null}],'Cobertura / señal','PRIMARY').find(item=>item.department==='ANCASH')?.selectedCases,0);
console.log('Movistar geo: 8 verificaciones correctas');
