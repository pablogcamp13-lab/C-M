import React, { useEffect, useMemo, useState } from 'react';
import { Card, Modal } from '../ui';
import { aggregateDepartments, GEO_MOTIVES, matchesGeoMotive, normalizeDepartment, PERU_GEOJSON, type GeoCall, type GeoMetric, type GeoMode, type GeoMotive } from '../../utils/movistarGeo';

const point = ([lon,lat]:number[]) => `${((lon+82)*30).toFixed(1)},${((0.5-lat)*26).toFixed(1)}`;
const polygonPath = (rings:number[][][]) => rings.map(ring => `M${ring.map(point).join('L')}Z`).join('');
const featurePath = (geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]}) => geometry.type === 'Polygon'
  ? polygonPath(geometry.coordinates as number[][][])
  : (geometry.coordinates as number[][][][]).map(polygonPath).join('');
const paths = PERU_GEOJSON.features.map(feature => ({department:normalizeDepartment(feature.properties.NM_DEPA),path:featurePath(feature.geometry)}));
const counts=(values:string[])=>[...values.reduce((result,value)=>result.set(value,(result.get(value)||0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`${name}: ${count}`).join(' · ')||'Sin clasificar';
const responsibilityName=(value:GeoCall['responsibility'])=>value==='NEGOCIO'?'Negocio':value==='CLIENTE'?'Cliente':value==='ASESOR'?'Asesor':'Sin clasificar';

export const MovistarGeoCard:React.FC<{calls:GeoCall[]; demo:boolean; selectedDepartment:string; onDepartmentChange:(department:string)=>void; dateFrom:string; dateTo:string; advisorId:string}> = ({calls,demo,selectedDepartment,onDepartmentChange,dateFrom,dateTo,advisorId}) => {
  const [motive,setMotive] = useState<GeoMotive>('Cobertura / señal');
  const [metric,setMetric] = useState<GeoMetric>('PERCENT');
  const [mode,setMode] = useState<GeoMode>('PRIMARY');
  const [responsibility,setResponsibility] = useState('ALL');
  const [hovered,setHovered] = useState('');
  const scoped = useMemo(() => calls.filter(call => (!dateFrom||call.date>=dateFrom)&&(!dateTo||call.date<=dateTo)&&(!advisorId||call.advisorId===advisorId)&&matchesGeoMotive(call,motive,mode)&&(responsibility==='ALL'||(motive==='Todos'||call.primaryMotive===motive)&&call.responsibility===responsibility)),[calls,dateFrom,dateTo,advisorId,motive,mode,responsibility]);
  const stats = useMemo(() => aggregateDepartments(scoped,'Todos','PRIMARY'),[scoped]);
  const byDepartment = useMemo(() => new Map(stats.map(item => [item.department,item])),[stats]);
  useEffect(()=>{if(selectedDepartment&&!byDepartment.get(selectedDepartment)?.selectedCases)onDepartmentChange('');},[selectedDepartment,byDepartment,onDepartmentChange]);
  const ranked = useMemo(() => stats.filter(item => item.selectedCases > 0).sort((a,b) => b.selectedCases-a.selectedCases || a.department.localeCompare(b.department,'es-PE')),[stats]);
  const maxCount = Math.max(1,...stats.map(item=>item.selectedCases));
  const maxParticipation=Math.max(1,...stats.map(item=>item.participation||0));
  const inspected = byDepartment.get(hovered || selectedDepartment);
  const departmentCalls = useMemo(() => selectedDepartment ? scoped.filter(call => normalizeDepartment(call.department) === selectedDepartment) : [],[scoped,selectedDepartment]);
  const districts=useMemo(()=>{
    const groups=new Map<string,{district:string;province:string;calls:GeoCall[]}>();
    for(const call of departmentCalls){
      const district=call.district?.trim()||'Distrito no identificado';
      const province=call.district?.trim()?call.province?.trim()||'':'';
      const key=`${district.toLocaleUpperCase('es-PE')}|${province.toLocaleUpperCase('es-PE')}`;
      const group=groups.get(key)||{district,province,calls:[]};
      group.calls.push(call);groups.set(key,group);
    }
    return [...groups.values()].sort((a,b)=>b.calls.length-a.calls.length||a.district.localeCompare(b.district,'es-PE'));
  },[departmentCalls]);
  const fill = (department:string) => {
    const item=byDepartment.get(department);
    if (!item?.selectedCases) return '#183046';
    const ratio=metric==='PERCENT' ? (item.participation||0)/maxParticipation : item.selectedCases/maxCount;
    if (ratio===0) return '#194668';
    if (ratio<.15) return '#1769ae';
    if (ratio<.3) return '#168bd5';
    if (ratio<.5) return '#269ff0';
    return '#5bc4ff';
  };
  const formatValue=(item:typeof stats[number])=>metric==='PERCENT'?`${item.participation?.toFixed(1)??'—'}%`:`${item.selectedCases}`;

  return <section className="cm-geo-grid" aria-label="Mapa geográfico de participación de No Ventas – Perú">
    <Card className="cm-geo-map-card">
      <div className="cm-geo-card-head"><div><h2>Mapa geográfico de No Ventas – Perú</h2><p>Participación por departamento · evaluaciones manuales y Speech Analytics</p></div>{demo&&<span className="cm-geo-demo-badge">Datos de ejemplo</span>}</div>
      {demo&&<p className="cm-geo-demo-note">Muestra sintética temporal: no representa llamadas ni indicadores reales.</p>}
      <div className="cm-geo-controls">
        <label>Motivo<select value={motive} onChange={event=>{setMotive(event.target.value as GeoMotive);setResponsibility('ALL');setHovered('');onDepartmentChange('');}}>{GEO_MOTIVES.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Métrica<select value={metric} onChange={event=>setMetric(event.target.value as GeoMetric)}><option value="PERCENT">% de participación</option><option value="COUNT">Cantidad de casos</option></select></label>
        <label>Modo<select value={mode} onChange={event=>{setMode(event.target.value as GeoMode);setHovered('');onDepartmentChange('');}}><option value="PRIMARY">Motivo principal</option><option value="MENTIONED">Mencionado en llamada</option></select></label>
        <label>Responsabilidad<select value={responsibility} onChange={event=>{setResponsibility(event.target.value);setHovered('');onDepartmentChange('');}}><option value="ALL">Todas</option><option value="CLIENTE">Cliente</option><option value="NEGOCIO">Negocio</option><option value="ASESOR">Asesor</option></select></label>
      </div>
      <div className="cm-geo-map-layout"><div className="cm-geo-map-frame"><svg viewBox="0 0 440 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa interactivo de departamentos del Perú">
        {paths.map(({department,path}) => {const item=byDepartment.get(department);return <path key={department} d={path} fill={fill(department)} fillRule="evenodd" className={`cm-geo-department ${selectedDepartment===department?'is-selected':''}`} role="button" tabIndex={0} aria-label={`${department}: ${item?.selectedCases?`${formatValue(item)}; ${item.selectedCases} casos de ${motive}`:'Sin casos del motivo seleccionado'}`} onMouseEnter={()=>setHovered(department)} onMouseLeave={()=>setHovered('')} onFocus={()=>setHovered(department)} onBlur={()=>setHovered('')} onClick={()=>{if(item?.selectedCases)onDepartmentChange(selectedDepartment===department?'':department);}} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&item?.selectedCases){event.preventDefault();onDepartmentChange(selectedDepartment===department?'':department);}}}/>;})}
      </svg>{inspected&&<div className="cm-geo-tooltip" role="status"><b>{inspected.department}</b>{inspected.selectedCases ? <><span>{motive}: {inspected.selectedCases} casos</span><span>Participación nacional: {inspected.participation?.toFixed(1)??'—'}%</span></> : <span>Sin casos de {motive.toLocaleLowerCase('es-PE')}</span>}</div>}</div>
      <div className="cm-geo-legend"><span>Sin casos</span><i/><span>Baja participación</span><em/><span>Alta participación</span></div></div>
      <div className="cm-geo-map-foot"><span>{scoped.filter(call=>normalizeDepartment(call.department)!=='No identificado').length} casos de {motive.toLocaleLowerCase('es-PE')} con ubicación · {scoped.filter(call=>normalizeDepartment(call.department)==='No identificado').length} sin departamento</span>{selectedDepartment&&<button onClick={()=>onDepartmentChange('')}>Ver todo Perú</button>}</div>
      {!stats.some(item=>item.selectedCases)&&<p className="cm-geo-empty">No hay casos de {motive.toLocaleLowerCase('es-PE')} con ubicación para estos filtros.</p>}
      <small className="cm-geo-source">Límites departamentales: INGEMMET / INEI (referenciales).</small>
    </Card>
    <Card className="cm-geo-ranking-card"><div className="cm-geo-card-head"><div><h2>Departamentos con mayor participación</h2><p>Ordenados por {metric==='PERCENT'?'porcentaje':'cantidad'} de casos de {motive.toLocaleLowerCase('es-PE')}.</p></div></div>
      {ranked.length?<ol className="cm-geo-ranking">{ranked.map((item,index)=><li key={item.department}><button className={selectedDepartment===item.department?'is-selected':''} onClick={()=>onDepartmentChange(selectedDepartment===item.department?'':item.department)}><span>{index+1}</span><b>{item.department}</b><strong>{formatValue(item)}</strong><i><em style={{width:`${metric==='PERCENT'?item.participation||0:item.selectedCases/maxCount*100}%`}}/></i></button></li>)}</ol>:<p className="cm-geo-empty">Sin departamentos con casos para este alcance.</p>}
    </Card>
    <Modal open={Boolean(selectedDepartment&&departmentCalls.length)} title={`${selectedDepartment} · ${departmentCalls.length} casos`} description={`Detalle por distrito de ${motive.toLocaleLowerCase('es-PE')} · ${districts.filter(group=>group.district!=='Distrito no identificado').length} distritos identificados`} onClose={()=>onDepartmentChange('')} size="lg">
      <div className="cm-geo-detail"><ul>{districts.map(group=><li key={`${group.district}|${group.province}`}><strong>{group.district}{group.province?` · ${group.province}`:''}</strong><span>{group.calls.length} {group.calls.length===1?'evaluación':'evaluaciones'} · {motive}</span><small><b>Responsabilidad:</b> {counts(group.calls.map(call=>responsibilityName(motive==='Todos'||call.primaryMotive===motive?call.responsibility:undefined)))}</small></li>)}</ul><p>% participación = casos del motivo en el departamento ÷ casos del motivo con departamento identificado.</p></div>
    </Modal>
  </section>;
};
