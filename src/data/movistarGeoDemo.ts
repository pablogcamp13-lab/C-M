import type { GeoCall, GeoMotive } from '../utils/movistarGeo';

// Datos sintéticos y temporales. Nunca se persisten ni se mezclan con auditorías reales.
const sample = [
  {department:'ANCASH',audios:20,noSales:15,coverage:12},
  {department:'CAJAMARCA',audios:18,noSales:12,coverage:9},
  {department:'SAN MARTIN',audios:22,noSales:14,coverage:8},
  {department:'LA LIBERTAD',audios:25,noSales:16,coverage:7},
  {department:'AREQUIPA',audios:21,noSales:13,coverage:5},
] as const;
const alternatives:GeoMotive[] = ['No hay delivery','Precio','Conforme con operador','Agenda / timing','No titular','Mala experiencia Movistar'];

export const MOVISTAR_GEO_DEMO:GeoCall[] = sample.flatMap(group => Array.from({length:group.audios},(_,index) => {
  const sale = index >= group.noSales;
  const primaryMotive = sale ? undefined : index < group.coverage ? 'Cobertura / señal' : alternatives[(index-group.coverage)%alternatives.length];
  return {
    id:`demo-${group.department}-${index}`,department:group.department,sale,primaryMotive,
    mentionedMotives:primaryMotive ? [primaryMotive,...(index%4===0 && primaryMotive!=='Cobertura / señal' ? ['Cobertura / señal'] : [])] : [],
    responsibility:index%3===0?'CLIENTE':index%3===1?'NEGOCIO':'ASESOR',
    date:`2026-09-${String(18+index%7).padStart(2,'0')}`,audioId:`DEMO-${group.department}-${index}`,
  } satisfies GeoCall;
}));
