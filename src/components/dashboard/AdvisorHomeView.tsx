import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, ClipboardCheck, Clock3, ListChecks, MessageSquare, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Feedback = { feedback_id: string; evaluation_id: string; evaluation_type: 'QUALITY' | 'D3C'; status: 'PENDIENTE' | 'VALIDADO_ASESOR' | 'OBSERVADO_ASESOR' | 'CERRADO_SUPERVISOR'; created_at: string };
const auth = () => ({ Authorization: `Bearer ${sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN') || ''}` });

export const AdvisorHomeView: React.FC = () => {
  const { currentUser, filteredEvaluations, actionPlans, setCurrentSection } = useApp();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  useEffect(() => { void fetch('/api/feedbacks', { headers: auth() }).then(response => response.ok ? response.json() : { feedbacks: [] }).then(data => setFeedbacks(data.feedbacks || [])); }, []);
  const ownPlans = actionPlans.filter(plan => plan.advisorId === currentUser.advisorId);
  const quality = filteredEvaluations.filter(evaluation => evaluation.evaluationType === 'QUALITY');
  const improvement = filteredEvaluations.filter(evaluation => evaluation.evaluationType === 'D3C');
  const pendingFeedbacks = feedbacks.filter(feedback => feedback.status === 'PENDIENTE');
  const attention = useMemo(() => {
    return [
    ...pendingFeedbacks.map(feedback => ({ id: feedback.feedback_id, text: `Feedback pendiente · ${feedback.evaluation_type === 'QUALITY' ? 'Calidad' : 'Mejora Continua'}`, target: 'feedback' as const, priority: 1 })),
    ...filteredEvaluations.filter(evaluation => !(evaluation as any).reviewedAt).map(evaluation => ({ id: evaluation.id, text: `Evaluación pendiente de revisión · ${evaluation.evaluationType === 'QUALITY' ? 'Calidad' : 'Mejora Continua'}`, target: 'evaluations' as const, priority: evaluation.evaluationType === 'D3C' ? 3 : 2 })),
    ...ownPlans.filter(plan => ['PENDIENTE', 'EN_CURSO', 'VENCIDO'].includes(plan.status)).map(plan => ({ id: plan.id, text: plan.status === 'VENCIDO' ? 'Plan de acción vencido' : `Plan de acción próximo a vencer · ${plan.targetDate || 'sin fecha'}`, target: 'action_plans' as const, priority: 4 })),
    ...ownPlans.filter(plan => !(plan as any).evidence && ['PENDIENTE', 'EN_CURSO'].includes(plan.status)).map(plan => ({ id: `${plan.id}-evidence`, text: 'Evidencia pendiente en plan de acción', target: 'action_plans' as const, priority: 5 }))
    ].sort((a, b) => a.priority - b.priority).slice(0, 6);
  }, [filteredEvaluations, ownPlans, pendingFeedbacks]);
  const cards = [
    { label: 'Evaluaciones de Calidad', value: quality.length, icon: <ClipboardCheck />, target: 'evaluations' as const },
    { label: 'Evaluaciones de Mejora Continua', value: improvement.length, icon: <TrendingUp />, target: 'evaluations' as const },
    { label: 'Feedbacks pendientes', value: pendingFeedbacks.length, icon: <MessageSquare />, target: 'feedback' as const },
    { label: 'Planes de acción pendientes', value: ownPlans.filter(plan => ['PENDIENTE', 'EN_CURSO', 'VENCIDO'].includes(plan.status)).length, icon: <ListChecks />, target: 'action_plans' as const }
  ];
  return <main className="cm-workspace min-h-full px-5 py-6 lg:px-8"><div className="mx-auto max-w-6xl space-y-5"><header className="cm-page-heading"><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--cm-primary)]">Mi espacio</p><h1 className="mt-1 text-2xl font-bold">Hola, {currentUser.name.split(' ')[0]}</h1><p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Consulta tus evaluaciones, responde feedbacks y da seguimiento a tus planes.</p></header><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <button key={card.label} onClick={() => setCurrentSection(card.target)} className="cm-card p-4 text-left transition hover:border-[var(--cm-primary)]"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[rgba(31,214,255,.12)] text-[var(--cm-primary)]">{card.icon}</span><p className="mt-3 text-xs font-semibold text-[var(--cm-text-secondary)]">{card.label}</p><strong className="mt-1 block text-3xl font-black">{card.value}</strong></button>)}</section><section className="cm-card p-5"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-bold"><BellRing className="h-5 w-5 text-[var(--cm-primary)]" />Requiere mi atención</h2><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">Priorizado por pendientes y fechas de seguimiento.</p></div>{pendingFeedbacks.length > 0 && <button onClick={() => setCurrentSection('feedback')} className="cm-button-primary px-3 py-2 text-xs">Responder feedback</button>}</div><div className="mt-4 divide-y divide-[var(--cm-border)]">{attention.length ? attention.map(item => <button key={item.id} onClick={() => setCurrentSection(item.target)} className="flex w-full items-center gap-3 py-3 text-left text-sm hover:text-[var(--cm-primary)]"><Clock3 className="h-4 w-4 shrink-0 text-[var(--cm-warning)]" /><span>{item.text}</span><span className="ml-auto text-xs">Ver →</span></button>) : <div className="flex items-center gap-2 py-4 text-sm text-[var(--cm-text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--cm-success)]" />No tienes pendientes por atender.</div>}</div></section></div></main>;
};
