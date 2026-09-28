import React, { useMemo } from 'react';
import { CALL_TYPIFICATIONS, PERU_DEPARTMENTS, SECONDARY_TYPIFICATIONS, districtsForDepartment, provincesForDepartment, requiresLocation, secondaryIsCoverage, type CallClassification } from '../../utils/evaluationTypification';

export const CallTypificationFields:React.FC<{value:CallClassification;onChange:(value:CallClassification)=>void;allowSecondary?:boolean}> = ({value,onChange,allowSecondary=false})=>{
  const districts=useMemo(()=>districtsForDepartment(value.department),[value.department]);
  const provinces=useMemo(()=>provincesForDepartment(value.department),[value.department]);
  const required=requiresLocation(value.typification);
  const optionalCoverage=allowSecondary&&secondaryIsCoverage(value.secondaryTypification||'')&&!required;
  return <div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs font-semibold">Tipificación principal<select className="cm-select mt-1 w-full p-2 font-normal" value={value.typification} onChange={event=>onChange({...value,typification:event.target.value,secondaryTypification:value.secondaryTypification===event.target.value?'':value.secondaryTypification,department:'',province:'',districtCode:''})}><option value="">Sin tipificar</option>{CALL_TYPIFICATIONS.filter(Boolean).map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    {allowSecondary&&<label className="text-xs font-semibold">Motivo 2 (opcional)<select className="cm-select mt-1 w-full p-2 font-normal" value={value.secondaryTypification||''} onChange={event=>onChange({...value,secondaryTypification:event.target.value,...(!required?{department:'',province:'',districtCode:''}:{})})}><option value="">Sin motivo secundario</option>{SECONDARY_TYPIFICATIONS.filter(item=>item!==value.typification).map(item=><option key={item} value={item}>{item=== 'Mala señal'?'Mala señal (cobertura)':item}</option>)}</select></label>}
    {(required||optionalCoverage)&&<label className="text-xs font-semibold">Departamento {required?'*':'(opcional)'}<select className="cm-select mt-1 w-full p-2 font-normal" value={value.department} onChange={event=>onChange({...value,department:event.target.value,province:'',districtCode:''})} required={required}><option value="">Seleccionar departamento</option>{PERU_DEPARTMENTS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>}
    {required&&<>
    <label className="text-xs font-semibold">Distrito *<select className="cm-select mt-1 w-full p-2 font-normal" value={value.districtCode} onChange={event=>onChange({...value,districtCode:event.target.value})} disabled={!value.department} required><option value="">Seleccionar distrito</option>{districts.map(item=><option key={item.code} value={item.code}>{item.district} — {item.province}</option>)}</select></label></>}
    {optionalCoverage&&<label className="text-xs font-semibold">Provincia (opcional)<select className="cm-select mt-1 w-full p-2 font-normal" value={value.province||''} onChange={event=>onChange({...value,province:event.target.value})} disabled={!value.department}><option value="">Sin provincia</option>{provinces.map(item=><option key={item} value={item}>{item}</option>)}</select></label>}
  </div>;
};
