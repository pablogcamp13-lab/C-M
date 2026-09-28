import departments from '../data/peruDepartments.json';
import provinces from '../data/peruProvinces.json';
import type { Evaluation } from '../types';

export const GEO_MOTIVES = [
  'Todos', 'Cobertura / señal', 'No hay delivery', 'Mala experiencia Movistar',
  'Precio', 'Conforme con operador', 'Agenda / timing', 'No titular',
  'No califica scoring', 'Cliente no permite argumentar', 'Otro',
] as const;
export type GeoMotive = typeof GEO_MOTIVES[number];
export type GeoMetric = 'PERCENT' | 'COUNT';
export type GeoMode = 'PRIMARY' | 'MENTIONED';
export type GeoAnalysis = NonNullable<Evaluation['geoAnalysis']>;
export type GeoCall = { id:string; department:string; province?:string; district?:string; sale:boolean|null; primaryMotive?:string; mentionedMotives?:string[]; responsibility?:GeoAnalysis['fallResponsibility']; advisorId?:string; date:string; audioId:string };

const clean = (value:unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/[^a-z0-9]+/g,' ').trim();
const departmentNames = (departments.features as Array<{properties:{NM_DEPA:string}}>).map(item => item.properties.NM_DEPA);
const departmentByKey = new Map(departmentNames.map(name => [clean(name), name]));
const provinceDepartments = new Map<string,Set<string>>();
for (const item of provinces.features as Array<{attributes:{NM_PROV:string;NM_DEPA:string}}>) {
  const key = clean(item.attributes.NM_PROV);
  const department = departmentByKey.get(clean(item.attributes.NM_DEPA));
  if (department) provinceDepartments.set(key, (provinceDepartments.get(key) || new Set()).add(department));
}

export const normalizeDepartment = (value:unknown):string => {
  const key = clean(value).replace(/^departamento (de |del )?/,'').replace(/^region (de |del )?/,'').replace(/^lima provincia$/,'lima');
  return departmentByKey.get(key) || 'No identificado';
};

const uniqueProvinceDepartment = (value:unknown) => {
  const matches = provinceDepartments.get(clean(value));
  return matches?.size === 1 ? [...matches][0] : 'No identificado';
};

export const normalizeMotive = (value:unknown):GeoMotive | undefined => {
  const key = clean(value);
  if (!key) return undefined;
  if (/cobertura|senal/.test(key)) return 'Cobertura / señal';
  if (/delivery|reparto|entrega/.test(key)) return 'No hay delivery';
  if (/mala experiencia|problema anterior con movistar/.test(key)) return 'Mala experiencia Movistar';
  if (/precio|costo|caro|tarifa/.test(key)) return 'Precio';
  if (/conforme con (su |el )?operador|satisfecho con (su |el )?operador/.test(key)) return 'Conforme con operador';
  if (/agenda|timing|otro momento|no tiene tiempo/.test(key)) return 'Agenda / timing';
  if (/no (es |soy )?titular/.test(key)) return 'No titular';
  if (/scoring|no califica/.test(key)) return 'No califica scoring';
  if (/no permite argumentar|no deja argumentar/.test(key)) return 'Cliente no permite argumentar';
  return 'Otro';
};

/** Only explicit places are resolved. A non-unique province is never assigned to a department. */
export const resolveGeoAnalysis = (fields: {department?:unknown; province?:unknown; district?:unknown; locality?:unknown; primaryMotive?:unknown; secondaryMotive?:unknown; mentionedMotives?:unknown; responsibility?:unknown; currentOperator?:unknown; transcript?:unknown}):GeoAnalysis => {
  const transcript = String(fields.transcript ?? '');
  const province = String(fields.province ?? '').trim() || transcript.match(/\bprovincia\s+de\s+([\p{L} ]{3,35})(?=[,.\n;]|$)/iu)?.[1]?.trim() || '';
  const explicitDepartment = normalizeDepartment(fields.department);
  const mentionedDepartments = departmentNames.filter(name => new RegExp(`\\b${clean(name).replace(/ /g,'\\s+')}\\b`,'i').test(clean(transcript)));
  const department = explicitDepartment !== 'No identificado' ? explicitDepartment : province && uniqueProvinceDepartment(province) !== 'No identificado' ? uniqueProvinceDepartment(province) : mentionedDepartments.length === 1 ? mentionedDepartments[0] : 'No identificado';
  const primaryMotive = normalizeMotive(fields.primaryMotive);
  const secondaryMotive = normalizeMotive(fields.secondaryMotive);
  const explicitMentions = String(fields.mentionedMotives ?? '').split(/[,;|]/).map(normalizeMotive).filter((value):value is GeoMotive => Boolean(value));
  const transcriptMentions = GEO_MOTIVES.slice(1,-1).filter(motive => {
    const key = clean(motive);
    return key === 'cobertura senal' ? /\bcobertura\b|\bsenal\b/i.test(clean(transcript)) : clean(transcript).includes(key);
  });
  const mentionedMotives = [...new Set([primaryMotive,secondaryMotive,...explicitMentions,...transcriptMentions].filter((value):value is GeoMotive => Boolean(value)))];
  const responsibility = clean(fields.responsibility);
  return {
    department, province:province || undefined, district:String(fields.district ?? '').trim() || undefined,
    locality:String(fields.locality ?? '').trim() || undefined,
    primaryMotive, secondaryMotive, mentionedMotives,
    fallResponsibility:primaryMotive === 'Cobertura / señal' ? 'NEGOCIO' : responsibility === 'cliente' ? 'CLIENTE' : responsibility === 'negocio' ? 'NEGOCIO' : responsibility === 'asesor' ? 'ASESOR' : undefined,
    currentOperator:String(fields.currentOperator ?? '').trim() || undefined,
    source:fields.department || fields.province || fields.primaryMotive ? 'STRUCTURED' : 'TRANSCRIPT',
  };
};

export const evaluationGeoCall = (evaluation:Evaluation):GeoCall => ({
  id:evaluation.id, department:normalizeDepartment(evaluation.geoAnalysis?.department), province:evaluation.geoAnalysis?.province, district:evaluation.geoAnalysis?.district, sale:evaluation.geoAnalysis?.outcomeKnown === false ? null : evaluation.sale,
  primaryMotive:evaluation.geoAnalysis?.primaryMotive, mentionedMotives:evaluation.geoAnalysis?.mentionedMotives,
  responsibility:evaluation.geoAnalysis?.primaryMotive==='Cobertura / señal'?'NEGOCIO':evaluation.geoAnalysis?.fallResponsibility, advisorId:evaluation.advisorId,
  date:evaluation.date, audioId:evaluation.recordingCode || evaluation.callId,
});

export interface DepartmentStats { department:string; totalAudios:number; totalNoSales:number; selectedCases:number; incidence:number|null; leadingMotive:string; }
export const aggregateDepartments = (calls:GeoCall[], motive:GeoMotive, mode:GeoMode):DepartmentStats[] => departmentNames.map(department => {
  const rows = calls.filter(call => normalizeDepartment(call.department) === department);
  const noSales = rows.filter(call => call.sale === false);
  const selected = noSales.filter(call => motive === 'Todos' || (mode === 'PRIMARY' ? call.primaryMotive === motive : call.mentionedMotives?.includes(motive)));
  const frequencies = new Map<string,number>();
  noSales.forEach(call => { if (call.primaryMotive) frequencies.set(call.primaryMotive,(frequencies.get(call.primaryMotive)||0)+1); });
  return {department,totalAudios:rows.length,totalNoSales:noSales.length,selectedCases:selected.length,incidence:rows.length ? selected.length/rows.length*100 : null,leadingMotive:[...frequencies].sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Sin motivo registrado'};
});

export const PERU_GEOJSON = departments as {features:Array<{properties:{NM_DEPA:string;CD_DEPA:string};geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]}}>};
