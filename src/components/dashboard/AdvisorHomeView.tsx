import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ClipboardCheck, Clock3, ListChecks, MessageSquare, TrendingUp } from 'lucide-react';
import { qualityAlertsApi } from '../../api/sharedRepository';
import { useApp } from '../../context/AppContext';
import type { NavigationSection, QualityAlert } from '../../types';

type Feedback = { feedback_id:string; evaluation_id:string; evaluation_type:'QUALITY'|'D3C'; status:string; created_at:string };
const auth = () => ({ Authorization:`Bearer ${sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN') || ''}` });

export const AdvisorHomeView: React.FC = () => {
  const { currentUser, filteredEvaluations, actionPlans, setCurrentSection } = useApp();
  const [feedbacks,setFeedbacks] = useState<Feedback[]>([]); const [alerts,setAlerts] = useState<QualityAlert[]>([]);
  useEffect(() => { void Promise.all([fetch('/api/feedbacks',{headers:auth()}).then(r=>r.ok?r.json():{feedbacks:[]}),qualityAlertsApi.list()]).then(([f,a])=>{setFeedbacks(f.feedbacks||[]);setAlerts(a.alerts||[]);}); }, []);
  const ownPlans = actionPlans.filter(plan=>plan.advisorId===currentUser.advisorId);
  const quality = filteredEvaluations.filter(e=>e.evaluationType==='QUALITY').sort((a,b)=>b.date.localeCompare(a.date));
  const improvement = filteredEvaluations.filter(e=>e.evaluationType==='D3C');
  const pendingFeedbacks = feedbacks.filter(f=>f.status==='PENDIENTE');
  const openPlans = ownPlans.filter(p=>['PENDIENTE','EN_CURSO','VENCIDO'].includes(p.status)); const activeAlerts = alerts.filter(a=>a.status!=='CERRADA');
  const average = quality.length ? Math.round(quality.reduce((s,e)=>s+(e.technicalScore??e.scoreTotal??0),0)/quality.length) : null; const last=quality[0];
  const attention = useMemo(() => [
    ...pendingFeedbacks.map(f=>({id:f.feedback_id,text:'Feedback pendiente de responder',target:'feedback' as NavigationSection,priority:1})),
    ...filteredEvaluations.filter(e=>!(e as any).reviewedAt).map(e=>({id:e.id,text:`Evaluación pendiente de revisión · ${e.evaluationType==='QUALITY'?'Calidad':'Mejora Continua'}`,target:'evaluations' as NavigationSection,priority:e.evaluationType==='D3C'?3:2})),
    ...openPlans.map(p=>({id:p.id,text:p.status==='VENCIDO'?'Compromiso vencido':`Compromiso abierto · ${p.targetDate||'sin fecha'}`,target:'action_plans' as NavigationSection,priority:4})),
    ...activeAlerts.map(a=>({id:a.id,text:`Alerta activa · ${a.title}`,target:'quality_alerts' as NavigationSection,priority:2}))
  ].sort((a,b)=>a.priority-b.priority).slice(0,8),[pendingFeedbacks,filteredEvaluations,openPlans,activeAlerts]);
  const cards: Array<[string,string|number,React.ReactNode,NavigationSection]> = [
    ['Nota acumulada',average===null?'—':`${average}%`,<TrendingUp/>,'evaluations'], ['Última evaluación',last?`${last.technicalScore??last.scoreTotal}%`:'—',<ClipboardCheck/>,'evaluations'],
    ['Evaluaciones de Calidad',quality.length,<ClipboardCheck/>,'evaluations'], ['Mejora Continua',improvement.length,<ClipboardCheck/>,'evaluations'], ['Feedback pendientes',pendingFeedbacks.length,<MessageSquare/>,'feedback'],
    ['Compromisos abiertos',openPlans.length,<ListChecks/>,'action_plans'], ['Alertas activas',activeAlerts.length,<AlertTriangle/>,'quality_alerts']
  ];
  return <main className="cm-workspace min-h-full px-5 py-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-5">
    <header className="cm-page-heading"><p className="cm-eyebrow">MI CALIDAD</p><h1 className="text-2xl font-bold">Hola, {currentUser.name.split(' ')[0]}</h1><p className="text-sm text-[var(--cm-text-secondary)]">Tu evolución, evaluaciones y compromisos en un solo lugar.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{cards.map(([name,value,icon,target])=><button key={name} onClick={()=>setCurrentSection(target)} className="cm-card p-4 text-left"><span className="text-[var(--cm-primary)]">{icon}</span><p className="mt-3 text-xs text-[var(--cm-text-secondary)]">{name}</p><b className="text-2xl">{value}</b></button>)}</section>
    <section className="cm-card p-5"><h2 className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-[var(--cm-primary)]"/>Evolución de calidad</h2><div className="mt-4 flex h-40 items-end gap-2">{quality.length?quality.slice(0,10).reverse().map(e=><div key={e.id} className="flex flex-1 flex-col items-center gap-1"><b className="text-[10px]">{e.technicalScore??e.scoreTotal}%</b><div className="w-full rounded-t bg-[var(--cm-primary)]" style={{height:`${Math.max(5,e.technicalScore??e.scoreTotal??0)}%`}}/><span className="text-[9px] text-[var(--cm-text-secondary)]">{e.date.slice(5)}</span></div>):<p className="m-auto text-sm text-[var(--cm-text-secondary)]">Aún no hay evaluaciones validadas.</p>}</div></section>
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"><section className="cm-card p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><BellRing className="h-5 w-5 text-[var(--cm-primary)]"/>Requiere mi atención</h2>{pendingFeedbacks.length>0&&<button onClick={()=>setCurrentSection('feedback')} className="cm-button-primary px-3 py-2 text-xs">Responder feedback</button>}</div><div className="mt-3 divide-y divide-[var(--cm-border)]">{attention.length?attention.map(item=><button key={item.id} onClick={()=>setCurrentSection(item.target)} className="flex w-full items-center gap-2 py-3 text-left text-xs"><Clock3 className="h-4 w-4 text-[var(--cm-warning)]"/>{item.text}<span className="ml-auto">Ver →</span></button>):<p className="flex items-center gap-2 py-5 text-sm text-[var(--cm-text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--cm-success)]"/>No tienes pendientes.</p>}</div></section>
      <section className="cm-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--cm-border)] p-4"><h2 className="font-bold">Historial de evaluaciones</h2><button onClick={()=>setCurrentSection('evaluations')} className="text-xs text-[var(--cm-primary)]">Ver todas →</button></div><div className="divide-y divide-[var(--cm-border)]">{filteredEvaluations.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(e=><button key={e.id} onClick={()=>setCurrentSection('evaluations')} className="grid w-full grid-cols-[1fr_auto_auto] gap-3 p-3 text-left text-xs"><span>{e.evaluationType==='QUALITY'?'Calidad':'Mejora Continua'} · {e.callId}</span><span>{e.date}</span><b>{e.technicalScore??e.scoreTotal}%</b></button>)}</div></section></div>
  </div></main>;
};
