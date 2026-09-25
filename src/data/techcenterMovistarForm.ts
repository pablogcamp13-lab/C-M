import sourceFields from './techcenterMovistarFields.json';
export { TECHCENTER_MOVISTAR_FORM_ID, TECHCENTER_MOVISTAR_CAMPAIGN, isTechcenterMovistarCampaign } from './techcenterMovistarScope';

export const TECHCENTER_MOVISTAR_FLOWS = ['No Venta Movil Out', 'No Venta Fija Out', 'Venta Movil Out', 'Venta Fija Out'] as const;
export type TechcenterMovistarFlow = typeof TECHCENTER_MOVISTAR_FLOWS[number];
export type TechcenterMovistarField = { id:number; section:string; flow:string; label:string; sourceField:string; kind:string; options:string[]; required:string };
export const TECHCENTER_MOVISTAR_FIELDS:TechcenterMovistarField[] = sourceFields;

export const isTechcenterCriterion = (field:TechcenterMovistarField) => field.kind==='Criterio de auditoría';
const reverseCriterionIds = new Set([57,59,60,61,83,84]);
export const isReverseTechcenterCriterion = (id:number) => reverseCriterionIds.has(id);

export function techcenterFieldsForFlow(flow:TechcenterMovistarFlow):TechcenterMovistarField[]{
  return TECHCENTER_MOVISTAR_FIELDS.filter(field=>{
    if(field.flow==='Todos')return true;
    if(field.section==='No Venta Out'){
      if(!flow.startsWith('No Venta'))return false;
      if(flow==='No Venta Fija Out'&&[18,20,27,28,30].includes(field.id))return false;
      if(flow==='No Venta Movil Out'&&field.id===31)return false;
      return true;
    }
    if(field.section==='Venta Móvil Out')return flow==='Venta Movil Out';
    if(field.section==='Venta Fija Out')return flow==='Venta Fija Out';
    return false;
  });
}

export function scoreTechcenterMovistar(fields:TechcenterMovistarField[],answers:Record<number,string>){
  const criteria=fields.filter(isTechcenterCriterion);
  const answered=criteria.filter(field=>answers[field.id]==='Sí'||answers[field.id]==='No');
  const earned=answered.filter(field=>answers[field.id]===(isReverseTechcenterCriterion(field.id)?'No':'Sí')).length;
  return {earned,possible:answered.length,missing:criteria.filter(field=>!answers[field.id]).length,percent:answered.length?Math.round(earned/answered.length*100):null};
}
