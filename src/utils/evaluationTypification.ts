import districts from '../data/peruDistricts.json';
import type { Evaluation } from '../types';

export const SIGNAL_TYPIFICATION = 'Señal deficiente / No hay señal';
export const CALL_TYPIFICATIONS = ['', SIGNAL_TYPIFICATION, 'No hay delivery', 'Mala experiencia Movistar', 'Precio', 'Conforme con operador', 'Agenda / timing', 'No titular', 'No califica scoring', 'Cliente no permite argumentar', 'Otro'];
export type CallClassification = { typification: string; department: string; districtCode: string };
export const EMPTY_CLASSIFICATION: CallClassification = {typification:'',department:'',districtCode:''};
export const PERU_DISTRICTS = districts as Array<{code:string;department:string;province:string;district:string}>;
export const PERU_DEPARTMENTS = [...new Set(PERU_DISTRICTS.map(item=>item.department))].sort((a,b)=>a.localeCompare(b,'es-PE'));
export const districtsForDepartment = (department:string) => PERU_DISTRICTS.filter(item=>item.department===department);
export const classificationError = (value:CallClassification) => value.typification===SIGNAL_TYPIFICATION && (!value.department || !PERU_DISTRICTS.some(item=>item.department===value.department&&item.code===value.districtCode)) ? 'Selecciona departamento y distrito para la tipificación de señal.' : '';
export const classificationFromEvaluation = (evaluation:Evaluation):CallClassification => ({typification:evaluation.typification||'',department:evaluation.geoAnalysis?.department||'',districtCode:evaluation.geoAnalysis?.districtCode||PERU_DISTRICTS.find(item=>item.department===evaluation.geoAnalysis?.department&&item.district===evaluation.geoAnalysis?.district)?.code||''});
export const classificationPayload = (value:CallClassification):Pick<Evaluation,'typification'|'geoAnalysis'> => {
  if(value.typification!==SIGNAL_TYPIFICATION)return {typification:value.typification,geoAnalysis:undefined};
  const district=PERU_DISTRICTS.find(item=>item.department===value.department&&item.code===value.districtCode);
  return {typification:value.typification,geoAnalysis:{department:value.department,province:district?.province,district:district?.district,districtCode:district?.code,primaryMotive:'Cobertura / señal',mentionedMotives:['Cobertura / señal'],fallResponsibility:'NEGOCIO',outcomeKnown:true,source:'MANUAL'}};
};
