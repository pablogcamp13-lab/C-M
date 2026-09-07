import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ClipboardCheck, Eye, MessageSquare, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Evaluation } from '../../types';

type Feedback={evaluation_id:string;status:string;created_at:string};
const auth=()=>({Authorization:`Bearer ${sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN')||''}`});
const feedbackLabel:Record<string,string>={PENDIENTE:'Pendiente',VALIDADO_ASESOR:'Validado por asesor',OBSERVADO_ASESOR:'Observado por asesor',CERRADO_SUPERVISOR:'Cerrado'};
const evaluationScore=(evaluation:Evaluation)=>evaluation.technicalScore??evaluation.scoreTotal??0;
// Nota acumulada = promedio aritmético de la nota técnica de todas las evaluaciones validadas visibles.
const accumulatedScore=(evaluations:Evaluation[])=>evaluations.length?Math.round(evaluations.reduce((total,evaluation)=>total+evaluationScore(evaluation),0)/evaluations.length):null;
const isoWeek=(dateValue:string)=>{const date=new Date(`${dateValue}T12:00:00`),day=(date.getDay()+6)%7;date.setDate(date.getDate()-day+3);const first=new Date(date.getFullYear(),0,4);return `Semana ${1+Math.round(((date.getTime()-first.getTime())/86400000-3+(first.getDay()+6)%7)/7)}`;};

export const AdvisorHomeView:React.FC<{onSelectEvaluation:(evaluation:Evaluation)=>void}>=({onSelectEvaluation})=>{
  const {currentUser,evaluations}=useApp(); const [feedbacks,setFeedbacks]=useState<Feedback[]>([]); const [alerts,setAlerts]=useState<any[]>([]);
  useEffect(()=>{let active=true;const load=()=>Promise.all([fetch('/api/feedbacks',{headers:auth()}).then(r=>r.ok?r.json():{feedbacks:[]}),fetch('/api/quality-alerts',{headers:auth()}).then(r=>r.ok?r.json():{alerts:[]})]).then(([f,a])=>{if(active){setFeedbacks(f.feedbacks||[]);setAlerts(a.alerts||[]);}});void load();const refresh=()=>void load();window.addEventListener('focus',refresh);window.addEventListener('cm:data-changed',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('cm:data-changed',refresh);};},[currentUser.id]);
  const own=useMemo(()=>evaluations.filter(e=>!e.validationStatus||['VALIDATED','VALIDADO','AJUSTADO_VALIDADO'].includes(e.validationStatus)).sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),[evaluations]);
  const average=accumulatedScore(own),last=own[0],pending=feedbacks.filter(f=>f.status==='PENDIENTE').length,lastFeedback=[...feedbacks].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  const feedbackFor=(id:string)=>feedbacks.find(f=>f.evaluation_id===id);
  const metrics=[
    {label:'Nota acumulada',value:average===null?'—':`${average}%`,icon:<TrendingUp/>},
    {label:'Última evaluación',value:last?.date||'—',icon:<CalendarDays/>},
    {label:'Cantidad de evaluaciones',value:own.length,icon:<ClipboardCheck/>},
    {label:'Estado del feedback',value:pending?`${pending} pendiente${pending===1?'':'s'}`:(feedbackLabel[lastFeedback?.status]||'Sin feedback'),icon:<MessageSquare/>},
    {label:'Alertas activas',value:alerts.length,icon:<AlertTriangle/>},
  ];
  return <main className="cm-workspace min-h-full px-5 py-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-5"><header className="cm-page-heading"><p className="cm-eyebrow">MI CALIDAD</p><h1 className="text-2xl font-bold">Hola, {currentUser.name.split(' ')[0]}</h1><p className="text-sm text-[var(--cm-text-secondary)]">Consulta tus evaluaciones, feedback y compromisos.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(metric=><article key={metric.label} className="cm-card p-4"><span className="text-[var(--cm-primary)]">{metric.icon}</span><p className="mt-3 text-xs text-[var(--cm-text-secondary)]">{metric.label}</p><b className="mt-1 block text-xl">{metric.value}</b></article>)}</section>
    <section className="cm-card overflow-hidden"><header className="border-b border-[var(--cm-border)] p-4"><h2 className="font-bold">Historial de evaluaciones</h2><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">Ordenado desde la evaluación más reciente.</p></header><div className="overflow-x-auto"><table className="cm-table min-w-[720px] text-left text-xs"><thead><tr><th>Fecha de evaluación</th><th>Semana evaluada</th><th>Nota obtenida</th><th>Estado del feedback</th><th>Acción</th></tr></thead><tbody>{own.map(evaluation=>{const feedback=feedbackFor(evaluation.id);return <tr key={evaluation.id}><td>{evaluation.date}</td><td>{isoWeek(evaluation.date)}</td><td><b className="text-[var(--cm-primary)]">{evaluationScore(evaluation)}%</b></td><td><span className="cm-badge">{feedback?feedbackLabel[feedback.status]||feedback.status:'Sin feedback'}</span></td><td><button onClick={()=>onSelectEvaluation(evaluation)} className="cm-button-secondary px-3 py-1.5"><Eye className="h-4 w-4"/> Ver detalle</button></td></tr>})}</tbody></table>{!own.length&&<p className="p-8 text-center text-sm text-[var(--cm-text-secondary)]">Aún no tienes evaluaciones validadas.</p>}</div></section>
  </div></main>;
};
