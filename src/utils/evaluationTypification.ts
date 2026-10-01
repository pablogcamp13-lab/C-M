import districts from '../data/peruDistricts.json';
import type { Evaluation } from '../types';
import { TECHCENTER_MOVISTAR_FORM_ID } from '../data/techcenterMovistarScope';

export const SIGNAL_TYPIFICATION = 'Señal deficiente / No hay señal';
export const DELIVERY_TYPIFICATION = 'No hay delivery';
export const SECONDARY_SIGNAL_TYPIFICATION = 'Mala señal';
export const requiresLocation = (typification:string) => typification===SIGNAL_TYPIFICATION||typification===DELIVERY_TYPIFICATION;
export const CALL_TYPIFICATIONS = ['', SIGNAL_TYPIFICATION, DELIVERY_TYPIFICATION, 'Mala experiencia Movistar', 'Precio', 'Conforme con operador', 'Agenda / timing', 'No titular', 'Corta llamada', 'No califica scoring', 'Cliente no permite argumentar', 'Otro'];
export const SECONDARY_TYPIFICATIONS = [SECONDARY_SIGNAL_TYPIFICATION,...CALL_TYPIFICATIONS.filter(item=>item&&item!==SIGNAL_TYPIFICATION)];
export const UNTYPIFIED_LABEL = 'Sin tipificación';
const sourceLabels:Record<string,string>={
  'SEÑAL ES DEFICIENTE/NO HAY SEÑAL':SIGNAL_TYPIFICATION,
  'NO HAY COBERTURA (FACILIDADES TÉCNICAS)':SIGNAL_TYPIFICATION,
  'NO HAY DELIVERY':DELIVERY_TYPIFICATION,
  'CLIENTE MALA EXPERIENCIA CON MOVISTAR':'Mala experiencia Movistar',
  'CLIENTE NO ACEPTA OFERTA/MUY CARO':'Precio',
  'NO CALIFICA SCORING (EQUIPO/CHIP/EQUIPO)':'No califica scoring',
  'CLIENTE NO PERMITE ARGUMENTAR':'Cliente no permite argumentar',
  'CLIENTE CORTA LLAMADA':'Corta llamada',
};
export const sourceTypification = (evaluation:Pick<Evaluation,'qualityForm'>):string => {
  if(evaluation.qualityForm?.id!==TECHCENTER_MOVISTAR_FORM_ID)return '';
  const raw=String(evaluation.qualityForm.fields?.[evaluation.qualityForm.flow==='No Venta Fija Out'?'31':'30']||'').trim();
  return !raw||raw==='NO APLICA'?'':sourceLabels[raw]||raw;
};
export const inferredSourceTypification = (raw:string):string => sourceLabels[raw]||'';
export const evaluationTypificationLabel = (evaluation:Evaluation):string =>
  evaluation.typification?.trim()||(evaluation.geoAnalysis?.primaryMotive==='Cobertura / señal'?SIGNAL_TYPIFICATION:evaluation.geoAnalysis?.primaryMotive?.trim())||sourceTypification(evaluation)||evaluation.noSaleReason?.trim()||
  ({PREFIERE_PREPAGO:'Prefiere mantenerse en prepago',NO_ES_TITULAR:'No es titular',CORTA_LLAMADA:'Corta llamada'} as Record<string,string>)[evaluation.speechTypification||'']||UNTYPIFIED_LABEL;
export type CallClassification = { typification: string; secondaryTypification?: string; department: string; province?: string; districtCode: string };
export const EMPTY_CLASSIFICATION: CallClassification = {typification:'',secondaryTypification:'',department:'',province:'',districtCode:''};
export const PERU_DISTRICTS = districts as Array<{code:string;department:string;province:string;district:string}>;
export const PERU_DEPARTMENTS = [...new Set(PERU_DISTRICTS.map(item=>item.department))].sort((a,b)=>a.localeCompare(b,'es-PE'));
export const districtsForDepartment = (department:string) => PERU_DISTRICTS.filter(item=>item.department===department);
export const provincesForDepartment = (department:string) => [...new Set(districtsForDepartment(department).map(item=>item.province))].sort((a,b)=>a.localeCompare(b,'es-PE'));
export const secondaryIsCoverage = (value:string) => value===SECONDARY_SIGNAL_TYPIFICATION||value===SIGNAL_TYPIFICATION;
const geoMotive = (value:string) => value===SIGNAL_TYPIFICATION||secondaryIsCoverage(value)?'Cobertura / señal':value;
export const classificationError = (value:CallClassification) => {
  if(requiresLocation(value.typification)&&(!value.department||!PERU_DISTRICTS.some(item=>item.department===value.department&&item.code===value.districtCode)))return `Selecciona departamento y distrito para ${value.typification}.`;
  if(secondaryIsCoverage(value.secondaryTypification||'')&&!requiresLocation(value.typification)){
    if(value.department&&!PERU_DEPARTMENTS.includes(value.department))return 'Selecciona un departamento válido.';
    if(value.province&&!provincesForDepartment(value.department).includes(value.province))return 'Selecciona una provincia válida para el departamento.';
  }
  return '';
};
export const classificationFromEvaluation = (evaluation:Evaluation):CallClassification => ({typification:evaluation.typification||'',secondaryTypification:evaluation.geoAnalysis?.secondaryMotive==='Cobertura / señal'?SECONDARY_SIGNAL_TYPIFICATION:evaluation.geoAnalysis?.secondaryMotive||'',department:evaluation.geoAnalysis?.department||'',province:evaluation.geoAnalysis?.province||'',districtCode:evaluation.geoAnalysis?.districtCode||PERU_DISTRICTS.find(item=>item.department===evaluation.geoAnalysis?.department&&item.district===evaluation.geoAnalysis?.district)?.code||''});
export const classificationPayload = (value:CallClassification):Pick<Evaluation,'typification'|'geoAnalysis'> => {
  const primary=value.typification?geoMotive(value.typification):undefined;
  const secondary=value.secondaryTypification?geoMotive(value.secondaryTypification):undefined;
  if(!requiresLocation(value.typification)&&!secondary)return {typification:value.typification,geoAnalysis:undefined};
  const district=requiresLocation(value.typification)?PERU_DISTRICTS.find(item=>item.department===value.department&&item.code===value.districtCode):undefined;
  const province=district?.province||(secondaryIsCoverage(value.secondaryTypification||'')?value.province||undefined:undefined);
  const department=requiresLocation(value.typification)||secondaryIsCoverage(value.secondaryTypification||'')?value.department:'';
  return {typification:value.typification,geoAnalysis:{department,province,district:district?.district,districtCode:district?.code,primaryMotive:primary,secondaryMotive:secondary,mentionedMotives:[...new Set([primary,secondary].filter((item):item is string=>Boolean(item)))],fallResponsibility:primary==='Cobertura / señal'||primary===DELIVERY_TYPIFICATION||secondary==='Cobertura / señal'?'NEGOCIO':undefined,outcomeKnown:true,source:'MANUAL'}};
};
