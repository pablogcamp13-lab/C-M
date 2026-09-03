import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ClipboardCheck, Clock3, ListChecks, MessageSquare, TrendingUp } from 'lucide-react';
import { qualityAlertsApi } from '../../api/sharedRepository';
import { useApp } from '../../context/AppContext';
import type { Evaluation, NavigationSection, QualityAlert } from '../../types';

type Feedback = { feedback_id:string; evaluation_id:string; evaluation_type:'QUALITY'|'D3C'; status:string; created_at:string };
const auth = () => ({ Authorization:`Bearer ${sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN') || ''}` });

export const AdvisorHomeView: React.FC = () => {
  const { currentUser, evaluations, actionPlans, setCurrentSection } = useApp();
  const [dashboardEvaluations,setDashboardEvaluations] = useState<Evaluation[]>(evaluations); const [feedbacks,setFeedbacks] = useState<Feedback[]>([]); const [alerts,setAlerts] = useState<QualityAlert[]>([]);
  useEffect(() => { setDashboardEvaluations(evaluations); }, [evaluations]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [feedbackResult,stateResult,alertResult] = await Promise.all([
        fetch('/api/feedbacks',{headers:auth()}).then(r=>r.ok?r.json():{feedbacks:[]}),
        fetch('/api/platform-state',{headers:auth()}).then(r=>r.ok?r.json():{state:null}),
        qualityAlertsApi.list().catch(()=>({alerts:[]}))
      ]);
      if (!active) return;
      setFeedbacks(feedbackResult.feedbacks||[]); setAlerts(alertResult.alerts||[]);
      if (Array.isArray(stateResult.state?.evaluations)) setDashboardEvaluations(stateResult.state.evaluations);
    };
    const refresh = () => { void load(); };
    const interval = window.setInterval(refresh,30000);
    void load(); window.addEventListener('focus',refresh); window.addEventListener('cm:data-changed',refresh);
    return () => { active=false; window.clearInterval(interval); window.removeEventListener('focus',refresh); window.removeEventListener('cm:data-changed',refresh); };
  }, [currentUser.id]);
  const ownEvaluations = dashboardEvaluations.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const ownPlans = actionPlans.filter(plan=>plan.advisorId===currentUser.advisorId);
  const quality = ownEvaluations.filter(e=>e.evaluationType==='QUALITY');
  const improvement = ownEvaluations.filter(e=>e.evaluationType==='D3C');
  const pendingFeedbacks = feedbacks.filter(f=>f.status==='PENDIENTE');
  const openPlans = ownPlans.filter(p=>['PENDIENTE','EN_CURSO','VENCIDO'].includes(p.status)); const activeAlerts = alerts.filter(a=>a.status!=='CERRADA');
  const average = ownEvaluations.length ? Math.round(ownEvaluations.reduce((s,e)=>s+(e.technicalScore??e.scoreTotal??0),0)/ownEvaluations.length) : null; const last=ownEvaluations[0];
  const attention = useMemo(() => [
    ...pendingFeedbacks.map(f=>({id:f.feedback_id,text:'Feedback pendiente de responder',target:'feedback' as NavigationSection,priority:1})),
    ...ownEvaluations.filter(e=>!(e as any).reviewedAt).map(e=>({id:e.id,text:`Evaluación pendiente de revisión · ${e.evaluationType==='QUALITY'?'Calidad':'Mejora Continua'}`,target:'evaluations' as NavigationSection,priority:e.evaluationType==='D3C'?3:2})),
    ...openPlans.map(p=>({id:p.id,text:p.status==='VENCIDO'?'Compromiso vencido':`Compromiso abierto · ${p.targetDate||'sin fecha'}`,target:'action_plans' as NavigationSection,priority:4})),
    ...activeAlerts.map(a=>({id:a.id,text:`Alerta activa · ${a.title}`,target:'quality_alerts' as NavigationSection,priority:2}))
  ].sort((a,b)=>a.priority-b.priority).slice(0,8),[pendingFeedbacks,ownEvaluations,openPlans,activeAlerts]);
  const cards: Array<[string,string|number,React.ReactNode,NavigationSection]> = [
    ['Nota acumulada',average===null?'—':`${average}%`,<TrendingUp/>,'evaluations'], ['Última evaluación',last?`${last.technicalScore??last.scoreTotal}%`:'—',<ClipboardCheck/>,'evaluations'],
    ['Evaluaciones de Calidad',quality.length,<ClipboardCheck/>,'evaluations'], ['Mejora Continua',improvement.length,<ClipboardCheck/>,'evaluations'], ['Feedback pendientes',pendingFeedbacks.length,<MessageSquare/>,'feedback'],
    ['Compromisos abiertos',openPlans.length,<ListChecks/>,'action_plans'], ['Alertas activas',activeAlerts.length,<AlertTriangle/>,'quality_alerts']
  ];
  return <main className="cm-workspace min-h-full px-5 py-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-5">
    <header className="cm-page-heading"><p className="cm-eyebrow">MI CALIDAD</p><h1 className="text-2xl font-bold">Hola, {currentUser.name.split(' ')[0]}</h1><p className="text-sm text-[var(--cm-text-secondary)]">Tu evolución, evaluaciones y compromisos en un solo lugar.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{cards.map(([name,value,icon,target])=><button key={name} onClick={()=>setCurrentSection(target)} className="cm-card p-4 text-left"><span className="text-[var(--cm-primary)]">{icon}</span><p className="mt-3 text-xs text-[var(--cm-text-secondary)]">{name}</p><b className="text-2xl">{value}</b></button>)}</section>
    <section className="cm-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-[var(--cm-primary)]"/>Evolución de evaluaciones</h2><div className="flex gap-3 text-[10px] text-[var(--cm-text-secondary)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--cm-primary)]"/>Calidad</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-400"/>MC</span></div></div><div className="mt-4 flex h-44 items-end gap-2">{ownEvaluations.length?ownEvaluations.slice(0,10).reverse().map(e=><div key={e.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><b className="text-[10px]">{e.technicalScore??e.scoreTotal??0}%</b><div className={`w-full max-w-14 rounded-t ${e.evaluationType==='QUALITY'?'bg-[var(--cm-primary)]':'bg-violet-400'}`} style={{height:`${Math.max(5,e.technicalScore??e.scoreTotal??0)}%`}}/><span className="text-center text-[9px] text-[var(--cm-text-secondary)]">{e.evaluationType==='QUALITY'?'CAL':'MC'}<br/>{e.date.slice(5)}</span></div>):<p className="m-auto text-sm text-[var(--cm-text-secondary)]">Aún no hay evaluaciones validadas.</p>}</div></section>
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"><section className="cm-card p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><BellRing className="h-5 w-5 text-[var(--cm-primary)]"/>Requiere mi atención</h2>{pendingFeedbacks.length>0&&<button onClick={()=>setCurrentSection('feedback')} className="cm-button-primary px-3 py-2 text-xs">Responder feedback</button>}</div><div className="mt-3 divide-y divide-[var(--cm-border)]">{attention.length?attention.map(item=><button key={item.id} onClick={()=>setCurrentSection(item.target)} className="flex w-full items-center gap-2 py-3 text-left text-xs"><Clock3 className="h-4 w-4 text-[var(--cm-warning)]"/>{item.text}<span className="ml-auto">Ver →</span></button>):<p className="flex items-center gap-2 py-5 text-sm text-[var(--cm-text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--cm-success)]"/>No tienes pendientes.</p>}</div></section>
      <section className="cm-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--cm-border)] p-4"><h2 className="font-bold">Historial de evaluaciones</h2><button onClick={()=>setCurrentSection('evaluations')} className="text-xs text-[var(--cm-primary)]">Ver todas →</button></div><div className="divide-y divide-[var(--cm-border)]">{ownEvaluations.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(e=><button key={e.id} onClick={()=>setCurrentSection('evaluations')} className="grid w-full grid-cols-[1fr_auto_auto] gap-3 p-3 text-left text-xs"><span>{e.evaluationType==='QUALITY'?'Calidad':'Mejora Continua'} · {e.callId}</span><span>{e.date}</span><b>{e.technicalScore??e.scoreTotal}%</b></button>)}</div></section></div>
  </div></main>;
};
