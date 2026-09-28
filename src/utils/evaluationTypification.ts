import districts from '../data/peruDistricts.json';
import type { Evaluation } from '../types';

export const SIGNAL_TYPIFICATION = 'Señal deficiente / No hay señal';
export const DELIVERY_TYPIFICATION = 'No hay delivery';
export const requiresLocation = (typification:string) => typification===SIGNAL_TYPIFICATION||typification===DELIVERY_TYPIFICATION;
export const CALL_TYPIFICATIONS = ['', SIGNAL_TYPIFICATION, DELIVERY_TYPIFICATION, 'Mala experiencia Movistar', 'Precio', 'Conforme con operador', 'Agenda / timing', 'No titular', 'No califica scoring', 'Cliente no permite argumentar', 'Otro'];
export type CallClassification = { typification: string; department: string; districtCode: string };
export const EMPTY_CLASSIFICATION: CallClassification = {typification:'',department:'',districtCode:''};
export const PERU_DISTRICTS = districts as Array<{code:string;department:string;province:string;district:string}>;
export const PERU_DEPARTMENTS = [...new Set(PERU_DISTRICTS.map(item=>item.department))].sort((a,b)=>a.localeCompare(b,'es-PE'));
export const districtsForDepartment = (department:string) => PERU_DISTRICTS.filter(item=>item.department===department);
export const classificationError = (value:CallClassification) => requiresLocation(value.typification) && (!value.department || !PERU_DISTRICTS.some(item=>item.department===value.department&&item.code===value.districtCode)) ? `Selecciona departamento y distrito para ${value.typification}.` : '';
export const classificationFromEvaluation = (evaluation:Evaluation):CallClassification => ({typification:evaluation.typification||'',department:evaluation.geoAnalysis?.department||'',districtCode:evaluation.geoAnalysis?.districtCode||PERU_DISTRICTS.find(item=>item.department===evaluation.geoAnalysis?.department&&item.district===evaluation.geoAnalysis?.district)?.code||''});
export const classificationPayload = (value:CallClassification):Pick<Evaluation,'typification'|'geoAnalysis'> => {
  if(!requiresLocation(value.typification))return {typification:value.typification,geoAnalysis:undefined};
  const district=PERU_DISTRICTS.find(item=>item.department===value.department&&item.code===value.districtCode);
  const motive=value.typification===SIGNAL_TYPIFICATION?'Cobertura / señal':DELIVERY_TYPIFICATION;
  return {typification:value.typification,geoAnalysis:{department:value.department,province:district?.province,district:district?.district,districtCode:district?.code,primaryMotive:motive,mentionedMotives:[motive],fallResponsibility:'NEGOCIO',outcomeKnown:true,source:'MANUAL'}};
};
