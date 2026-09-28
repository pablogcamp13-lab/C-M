import React, { useMemo, useState } from 'react';
import { Card } from '../ui';
import { aggregateDepartments, GEO_MOTIVES, normalizeDepartment, PERU_GEOJSON, type GeoCall, type GeoMetric, type GeoMode, type GeoMotive } from '../../utils/movistarGeo';

const point = ([lon,lat]:number[]) => `${((lon+82)*30).toFixed(1)},${((0.5-lat)*26).toFixed(1)}`;
const polygonPath = (rings:number[][][]) => rings.map(ring => `M${ring.map(point).join('L')}Z`).join('');
const featurePath = (geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]}) => geometry.type === 'Polygon'
  ? polygonPath(geometry.coordinates as number[][][])
  : (geometry.coordinates as number[][][][]).map(polygonPath).join('');
const paths = PERU_GEOJSON.features.map(feature => ({department:normalizeDepartment(feature.properties.NM_DEPA),path:featurePath(feature.geometry)}));

export const MovistarGeoCard:React.FC<{calls:GeoCall[]; demo:boolean; selectedDepartment:string; onDepartmentChange:(department:string)=>void; dateFrom:string; dateTo:string; advisorId:string; advisorNames:Map<string,string>}> = ({calls,demo,selectedDepartment,onDepartmentChange,dateFrom,dateTo,advisorId,advisorNames}) => {
  const [motive,setMotive] = useState<GeoMotive>('Cobertura / señal');
  const [metric,setMetric] = useState<GeoMetric>('PERCENT');
  const [mode,setMode] = useState<GeoMode>('PRIMARY');
  const [responsibility,setResponsibility] = useState('ALL');
  const [hovered,setHovered] = useState('');
  const scoped = useMemo(() => calls.filter(call => (!dateFrom||call.date>=dateFrom)&&(!dateTo||call.date<=dateTo)&&(!advisorId||call.advisorId===advisorId)&&(responsibility==='ALL'||call.responsibility===responsibility)),[calls,dateFrom,dateTo,advisorId,responsibility]);
  const stats = useMemo(() => aggregateDepartments(scoped,motive,mode),[scoped,motive,mode]);
  const byDepartment = useMemo(() => new Map(stats.map(item => [item.department,item])),[stats]);
  const ranked = useMemo(() => stats.filter(item => item.incidence !== null).sort((a,b) => metric==='PERCENT' ? (b.incidence||0)-(a.incidence||0) || b.selectedCases-a.selectedCases : b.selectedCases-a.selectedCases || (b.incidence||0)-(a.incidence||0)).slice(0,5),[stats,metric]);
  const maxCount = Math.max(1,...stats.map(item=>item.selectedCases));
  const inspected = byDepartment.get(hovered || selectedDepartment);
  const departmentCalls = useMemo(() => selectedDepartment ? scoped.filter(call => normalizeDepartment(call.department) === selectedDepartment) : [],[scoped,selectedDepartment]);
  const noSales = departmentCalls.filter(call => call.sale === false);
  const motiveCounts = new Map<string,number>();
  const responsibilityCounts = new Map<string,number>();
  noSales.forEach(call => {if(call.primaryMotive)motiveCounts.set(call.primaryMotive,(motiveCounts.get(call.primaryMotive)||0)+1);const key=call.responsibility||'Sin clasificar';responsibilityCounts.set(key,(responsibilityCounts.get(key)||0)+1);});
  const fill = (department:string) => {
    const item=byDepartment.get(department);
    if (!item?.totalAudios) return '#183046';
    const ratio=metric==='PERCENT' ? (item.incidence||0)/100 : item.selectedCases/maxCount;
    if (ratio===0) return '#194668';
    if (ratio<.15) return '#1769ae';
    if (ratio<.3) return '#168bd5';
    if (ratio<.5) return '#269ff0';
    return '#5bc4ff';
  };
  const formatValue=(item:typeof stats[number])=>metric==='PERCENT'?`${item.incidence?.toFixed(1)??'—'}%`:`${item.selectedCases}`;

  return <section className="cm-geo-grid" aria-label="Mapa geográfico de No Ventas – Perú">
    <Card className="cm-geo-map-card">
      <div className="cm-geo-card-head"><div><h2>Mapa geográfico de No Ventas – Perú</h2><p>Incidencia por departamento · evaluaciones manuales y Speech Analytics</p></div>{demo&&<span className="cm-geo-demo-badge">Datos de ejemplo</span>}</div>
      {demo&&<p className="cm-geo-demo-note">Muestra sintética temporal: no representa llamadas ni indicadores reales.</p>}
      <div className="cm-geo-controls">
        <label>Motivo<select value={motive} onChange={event=>setMotive(event.target.value as GeoMotive)}>{GEO_MOTIVES.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Métrica<select value={metric} onChange={event=>setMetric(event.target.value as GeoMetric)}><option value="PERCENT">% de incidencia</option><option value="COUNT">Cantidad de casos</option></select></label>
        <label>Modo<select value={mode} onChange={event=>setMode(event.target.value as GeoMode)}><option value="PRIMARY">Motivo principal</option><option value="MENTIONED">Mencionado en llamada</option></select></label>
        <label>Responsabilidad<select value={responsibility} onChange={event=>setResponsibility(event.target.value)}><option value="ALL">Todas</option><option value="CLIENTE">Cliente</option><option value="NEGOCIO">Negocio</option><option value="ASESOR">Asesor</option></select></label>
      </div>
      <div className="cm-geo-map-layout"><div className="cm-geo-map-frame"><svg viewBox="0 0 440 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa interactivo de departamentos del Perú">
        {paths.map(({department,path}) => {const item=byDepartment.get(department);return <path key={department} d={path} fill={fill(department)} fillRule="evenodd" className={`cm-geo-department ${selectedDepartment===department?'is-selected':''}`} role="button" tabIndex={0} aria-label={`${department}: ${item?.totalAudios?`${formatValue(item)}; ${item.totalAudios} evaluaciones`:'Sin datos'}`} onMouseEnter={()=>setHovered(department)} onMouseLeave={()=>setHovered('')} onFocus={()=>setHovered(department)} onBlur={()=>setHovered('')} onClick={()=>onDepartmentChange(selectedDepartment===department?'':department)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onDepartmentChange(selectedDepartment===department?'':department);}}}/>;})}
      </svg>{inspected&&<div className="cm-geo-tooltip" role="status"><b>{inspected.department}</b>{inspected.totalAudios ? <><span>Evaluaciones analizadas: {inspected.totalAudios}</span><span>No Ventas: {inspected.totalNoSales}</span><span>{motive}: {inspected.selectedCases}</span><span>Incidencia: {inspected.incidence?.toFixed(1)}%</span><span>Principal motivo: {inspected.leadingMotive}</span></> : <span>Sin datos</span>}</div>}</div>
      <div className="cm-geo-legend"><span>Sin datos</span><i/><span>Baja incidencia</span><em/><span>Alta incidencia</span></div></div>
      <div className="cm-geo-map-foot"><span>{scoped.filter(call=>normalizeDepartment(call.department)!=='No identificado').length} evaluaciones con ubicación de {scoped.length} en el alcance · {scoped.filter(call=>normalizeDepartment(call.department)==='No identificado').length} sin departamento</span>{selectedDepartment&&<button onClick={()=>onDepartmentChange('')}>Ver todo Perú</button>}</div>
      {!stats.some(item=>item.totalAudios)&&<p className="cm-geo-empty">No hay llamadas con ubicación para los filtros seleccionados.</p>}
      <small className="cm-geo-source">Límites departamentales: INGEMMET / INEI (referenciales).</small>
    </Card>
    <Card className="cm-geo-ranking-card"><div className="cm-geo-card-head"><div><h2>Departamentos con mayor incidencia</h2><p>Top 5 por {metric==='PERCENT'?'porcentaje':'cantidad'} de {motive.toLocaleLowerCase('es-PE')}.</p></div></div>
      {ranked.length?<ol className="cm-geo-ranking">{ranked.map((item,index)=><li key={item.department}><button className={selectedDepartment===item.department?'is-selected':''} onClick={()=>onDepartmentChange(selectedDepartment===item.department?'':item.department)}><span>{index+1}</span><b>{item.department}</b><strong>{formatValue(item)}</strong><i><em style={{width:`${metric==='PERCENT'?item.incidence||0:item.selectedCases/maxCount*100}%`}}/></i></button></li>)}</ol>:<p className="cm-geo-empty">Sin departamentos con datos para este alcance.</p>}
      {selectedDepartment&&<div className="cm-geo-detail"><h3>{selectedDepartment} · {departmentCalls.length} audios</h3><p><b>Motivos de No Venta:</b> {[...motiveCounts].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,count])=>`${name} ${count}`).join(' · ')||'Sin clasificar'}</p><p><b>Responsabilidad:</b> {[...responsibilityCounts].map(([name,count])=>`${name} ${count}`).join(' · ')||'Sin clasificar'}</p><p><b>Asesores:</b> {new Set(departmentCalls.map(call=>call.advisorId).filter(Boolean)).size || 'Sin datos en la muestra'}</p><h4>Auditorías de la selección</h4>{noSales.length?<ul>{noSales.slice(0,5).map(call=><li key={call.id}><span>{call.date} · {call.audioId}</span><small>{advisorNames.get(call.advisorId||'')||'Asesor no identificado'} · {call.primaryMotive||'Motivo sin clasificar'}</small></li>)}</ul>:<p>No hay No Ventas registradas.</p>}</div>}
      <p className="cm-geo-ranking-note">% incidencia = casos del motivo ÷ todos los audios del departamento. Sin llamadas no equivale a 0%.</p>
    </Card>
  </section>;
};
