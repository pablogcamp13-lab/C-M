import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, FileSpreadsheet, Folder, FolderOpen, Users } from 'lucide-react';
import type { Evaluation } from '../../types';

interface Props { evaluations: Evaluation[]; }

const displayDate = (value: string) => new Intl.DateTimeFormat('es-PE', { day:'2-digit', month:'long', year:'numeric' }).format(new Date(`${value}T12:00:00`));

export const SpeechAnalyticsBatches: React.FC<Props> = ({ evaluations }) => {
  const groups = useMemo(() => {
    const byDate = new Map<string, Evaluation[]>();
    evaluations.filter(item => item.origin === 'SPEECH_ANALYTICS').forEach(item => {
      const date = item.sourceBatchDate || item.createdAt?.slice(0,10) || item.date;
      byDate.set(date, [...(byDate.get(date) || []), item]);
    });
    return [...byDate.entries()].sort(([left],[right]) => right.localeCompare(left));
  }, [evaluations]);
  const [openDate, setOpenDate] = useState<string | null>(groups[0]?.[0] || null);
  if (!groups.length) return null;
  return <section className="space-y-2" aria-label="Importaciones de Speech Analytics">
    <div className="flex items-center gap-2 px-1"><Folder className="h-4 w-4 text-cyan-500"/><h3 className="text-xs font-bold text-[#031E3C]">Cargas de Speech Analytics</h3><span className="cm-badge">SA</span></div>
    {groups.map(([date, items]) => {
      const open = openDate === date;
      const pending = items.filter(item => item.validationStatus === 'AUTOMATIC_PENDING' || item.validationStatus === 'PENDIENTE_AUTOMATICO').length;
      const linked = items.filter(item => item.advisorResolutionStatus !== 'PENDING').length;
      const scores = items.map(item => item.technicalScore ?? item.scoreTotal ?? item.speechScore).filter(value => value !== null && value !== undefined).map(Number).filter(Number.isFinite);
      const average = scores.length ? Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length) : null;
      const files = [...new Set(items.map(item => item.sourceFileName).filter(Boolean))];
      const advisorCount = new Set(items.map(item => item.advisorResolutionStatus === 'PENDING' ? item.sourceAdvisorDni || item.sourceAdvisorName : item.advisorId).filter(Boolean)).size;
      const companyCounts:Record<string,number>={};
      items.forEach(item=>{const name=item.sourceCompanyName||'Por relacionar';companyCounts[name]=(companyCounts[name]||0)+1;});
      const companies = Object.entries(companyCounts).sort((left,right)=>right[1]-left[1]);
      return <div key={date} className="overflow-hidden rounded-xl border border-[#E5E8EC] bg-white">
        <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-[#F6F7F9]" aria-expanded={open} onClick={()=>setOpenDate(open?null:date)}><span className="flex min-w-0 items-center gap-3">{open?<FolderOpen className="h-5 w-5 shrink-0 text-cyan-500"/>:<Folder className="h-5 w-5 shrink-0 text-cyan-500"/>}<span><b className="block text-xs text-[#031E3C]">{displayDate(date)}</b><span className="text-[11px] text-[#667085]">{items.length} evaluaciones · {files.length} {files.length===1?'archivo':'archivos'}</span></span></span><ChevronDown className={`h-4 w-4 shrink-0 text-[#667085] transition ${open?'rotate-180':''}`}/></button>
        {open&&<div className="border-t border-[#E5E8EC] bg-[#F6F7F9] p-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric icon={<FileSpreadsheet/>} label="Evaluaciones" value={items.length}/><Metric icon={<Users/>} label="Asesores" value={advisorCount}/><Metric icon={<BarChart3/>} label="Promedio" value={average===null?'Pendiente':`${average}%`}/><Metric icon={<span className="text-xs font-black">✓</span>} label="Validadas" value={items.length-pending}/></div><div className="mt-3 grid gap-2 text-[11px] text-[#667085] sm:grid-cols-2"><div className="rounded-lg border border-[#E5E8EC] bg-white p-3"><b className="text-[#031E3C]">Estado</b><p className="mt-1">{linked} relacionadas · {items.length-linked} con alerta · {pending} pendientes de validación</p></div><div className="rounded-lg border border-[#E5E8EC] bg-white p-3"><b className="text-[#031E3C]">Distribución por empresa</b><p className="mt-1">{companies.map(([name,count])=>`${name}: ${count}`).join(' · ')}</p></div></div>{files.length>0&&<p className="mt-2 truncate text-[10px] text-[#667085]" title={files.join(', ')}>Archivos: {files.join(', ')}</p>}</div>}
      </div>;
    })}
  </section>;
};

const Metric:React.FC<{icon:React.ReactNode;label:string;value:number|string}>=({icon,label,value})=><div className="rounded-lg border border-[#E5E8EC] bg-white p-3"><span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[#667085]">{React.isValidElement(icon)?React.cloneElement(icon as React.ReactElement<{className?:string}>,{className:'h-3.5 w-3.5'}):icon}{label}</span><b className="mt-1 block text-lg text-[#031E3C]">{value}</b></div>;
