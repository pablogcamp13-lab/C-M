import React, { useMemo } from 'react';
import { CALL_TYPIFICATIONS, PERU_DEPARTMENTS, SIGNAL_TYPIFICATION, districtsForDepartment, type CallClassification } from '../../utils/evaluationTypification';

export const CallTypificationFields:React.FC<{value:CallClassification;onChange:(value:CallClassification)=>void}> = ({value,onChange})=>{
  const districts=useMemo(()=>districtsForDepartment(value.department),[value.department]);
  return <div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs font-semibold">Tipificación<select className="cm-select mt-1 w-full p-2 font-normal" value={value.typification} onChange={event=>onChange({typification:event.target.value,department:'',districtCode:''})}><option value="">Sin tipificar</option>{CALL_TYPIFICATIONS.filter(Boolean).map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    {value.typification===SIGNAL_TYPIFICATION&&<><label className="text-xs font-semibold">Departamento de venta *<select className="cm-select mt-1 w-full p-2 font-normal" value={value.department} onChange={event=>onChange({...value,department:event.target.value,districtCode:''})} required><option value="">Seleccionar departamento</option>{PERU_DEPARTMENTS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    <label className="text-xs font-semibold">Distrito *<select className="cm-select mt-1 w-full p-2 font-normal" value={value.districtCode} onChange={event=>onChange({...value,districtCode:event.target.value})} disabled={!value.department} required><option value="">Seleccionar distrito</option>{districts.map(item=><option key={item.code} value={item.code}>{item.district} — {item.province}</option>)}</select></label></>}
  </div>;
};
