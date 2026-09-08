import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, CalendarDays, CheckSquare, ChevronDown, Download, Filter, Flag, Layers3, MessageCircle, PlusSquare, ShieldCheck, TrendingUp, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calculatePareto } from '../../utils/calculations';
import { QUALITY_ATTRIBUTES } from '../../data/qualityPueData';
import { FiltersBar } from '../common/FiltersBar';

const scoreLabel = (value: number | null | undefined) => value === null || value === undefined ? 'Sin datos' : `${value}%`;
const averageOf = (values: Array<number | null>) => {
  const resolved = values.filter((value): value is number => value !== null);
  return resolved.length ? Math.round(resolved.reduce((sum, value) => sum + value, 0) / resolved.length) : null;
};

export const HomeView: React.FC = () => {
  const { filteredEvaluations, advisors, actionPlans, operationalMeasurements, setCurrentSection, companies, filters, setFilters } = useApp();
  const [activeSummary, setActiveSummary] = useState<'D3C' | 'QUALITY'>('D3C');
  const initialSummaryResolved = useRef(false);
  const d3c = filteredEvaluations.filter(evaluation => evaluation.evaluationType !== 'QUALITY');
  const qualityCount = filteredEvaluations.filter(evaluation => evaluation.evaluationType === 'QUALITY').length;
  useEffect(() => {
    if (initialSummaryResolved.current || !filteredEvaluations.length) return;
    initialSummaryResolved.current = true;
    if (!d3c.length && qualityCount) setActiveSummary('QUALITY');
  }, [d3c.length, filteredEvaluations.length, qualityCount]);
  const scores = d3c.map(evaluation => evaluation.scoreTotal).filter((value): value is number => value !== null);
  const average = averageOf(scores);
  const critical = d3c.filter(evaluation => (evaluation.scoreTotal ?? 100) < 60).length;
  const activePlans = actionPlans.filter(plan => plan.status === 'EN_CURSO' || plan.status === 'PENDIENTE').length;
  const pareto = calculatePareto(d3c, 'ALL').slice(0, 6);
  const maxFrequency = Math.max(...pareto.map(item => item.frequency), 1);
  const dimensions = [
    { code: 'D', label: 'Dominio de Producto', value: null },
    { code: 'C1', label: 'Conectar', value: averageOf(d3c.map(evaluation => evaluation.scoreConnect)) },
    { code: 'C2', label: 'Clarificar', value: averageOf(d3c.map(evaluation => evaluation.scoreClarify)) },
    { code: 'C3', label: 'Convertir', value: averageOf(d3c.map(evaluation => evaluation.scoreConvert)) },
  ];
  const kpis = [
    { label: 'Resultado global D+3C', value: scoreLabel(average), detail: average === null ? 'Sin evaluaciones registradas' : `${scores.length} evaluaciones con score`, icon: <Activity /> },
    { label: 'Evaluaciones realizadas', value: d3c.length ? String(d3c.length) : 'Sin datos', detail: d3c.length ? 'Registros del período' : 'Sin registros del período', icon: <CheckSquare /> },
    { label: 'Asesores críticos', value: d3c.length ? String(critical) : 'Sin datos', detail: critical ? 'Resultado menor a 60%' : 'Sin asesores críticos', icon: <UsersRound /> },
    { label: 'Planes de acción', value: actionPlans.length ? String(actionPlans.length) : 'Sin datos', detail: activePlans ? `${activePlans} en ejecución` : 'Sin planes en ejecución', icon: <CheckSquare /> },
    { label: 'Impacto operacional', value: operationalMeasurements.length ? 'Disponible' : 'Sin datos', detail: operationalMeasurements.length ? `${operationalMeasurements.length} mediciones cargadas` : 'Sin mediciones operacionales', icon: <BarChart3 /> },
  ];

  return <main className="cm-home px-4 py-3 lg:px-7"><div className="mx-auto max-w-[1620px] space-y-3">
    {companies.filter(company=>company.status==='ACTIVA').length>0&&<section className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-[var(--cm-text-secondary)]">Empresa:</span><button onClick={()=>setFilters(previous=>({...previous,companyId:'',operationId:'',campaignId:''}))} className={`cm-button-secondary px-3 py-1.5 text-xs ${!filters.companyId?'border-[var(--cm-primary)] text-[var(--cm-primary)]':''}`}>Todas</button>{companies.filter(company=>company.status==='ACTIVA').map(company=><button key={company.id} onClick={()=>setFilters(previous=>({...previous,companyId:company.id,operationId:'',campaignId:''}))} className={`cm-button-secondary px-3 py-1.5 text-xs ${filters.companyId===company.id?'border-[var(--cm-primary)] text-[var(--cm-primary)]':''}`}>{company.name}</button>)}</section>}
    <FiltersBar />

    <section className="grid gap-2 lg:grid-cols-2">
      <HeroCard title="Mejora Continua" text="Impulsa el desempeño de tu equipo con enfoque en desarrollo y resultados." icon={<TrendingUp />} variant="improvement" active={activeSummary === 'D3C'} onClick={() => setActiveSummary('D3C')} />
      <HeroCard title="Calidad" text="Asegura experiencias excelentes con estándares y consistencia." icon={<ShieldCheck />} variant="quality" active={activeSummary === 'QUALITY'} onClick={() => setActiveSummary('QUALITY')} />
    </section>

    {activeSummary === 'D3C' && <><section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((kpi, index) => <article key={kpi.label} className="home-kpi"><span className={`home-kpi-icon icon-${index}`}>{kpi.icon}</span><div><p>{kpi.label}</p><b>{kpi.value}</b><small>{kpi.detail}</small></div><Sparkline values={scores.slice(-8)} /></article>)}</section>

    <section className="grid gap-2 xl:grid-cols-[1.23fr_.82fr_1.15fr]">
      <article className="home-panel"><PanelTitle title="Pareto de brechas (80/20)" action="Ver detalle" onClick={() => setCurrentSection('pareto')} />
        {pareto.length ? <div className="home-pareto">{pareto.map((item, index) => <div className="home-pareto-row" key={item.criterionId}><span title={item.name}>{item.name}</span><div><i style={{ width: `${Math.max(8, item.frequency / maxFrequency * 100)}%` }} /><em>{item.frequency}</em></div><small>{Math.round(((index + 1) / pareto.length) * 100)}%</small></div>)}</div> : <Empty />}
      </article>
      <article className="home-panel"><PanelTitle title="Dominio D+3C" action="Ver dashboard" onClick={() => setCurrentSection('dashboard')} /><div className="home-dimensions">{dimensions.map(item => <div className="home-dimension" key={item.code}><span>{item.code}</span><div><b>{item.label}</b><i><em style={{ width: `${item.value ?? 0}%` }} /></i></div><strong>{scoreLabel(item.value)}</strong></div>)}</div></article>
      <article className="home-panel"><PanelTitle title="Evaluaciones recientes" action="Ver todas" onClick={() => setCurrentSection('evaluations')} />{d3c.length ? <div className="home-recent">{d3c.slice(0, 5).map(evaluation => { const advisor = advisors.find(item => item.id === evaluation.advisorId); return <button onClick={() => setCurrentSection('evaluations')} key={evaluation.id}><span className="home-avatar">{advisor?.name.split(' ').map(word => word[0]).slice(0, 2).join('') || 'A'}</span><b>{advisor?.name || 'Asesor'}</b><strong>{scoreLabel(evaluation.scoreTotal)}</strong><small>{evaluation.date}</small></button>; })}</div> : <Empty />}</article>
    </section>

    <section className="home-quick-actions">
      <QuickAction icon={<PlusSquare />} title="Nueva evaluación" text="Crear y seleccionar tipo" onClick={() => setCurrentSection('evaluations')} />
      <QuickAction icon={<UsersRound />} title="Ver dotación" text="Gestión de equipo" onClick={() => setCurrentSection('advisors')} />
      <QuickAction icon={<CheckSquare />} title="Planes de acción" text="Gestionar planes" onClick={() => setCurrentSection('action_plans')} />
      <QuickAction icon={<MessageCircle />} title="Feedback" text="Enviar y revisar" onClick={() => setCurrentSection('feedback')} />
      <QuickAction icon={<BarChart3 />} title="Analítica avanzada" text="Explorar insights" onClick={() => setCurrentSection('pareto')} />
    </section>
    </>}
    {activeSummary === 'QUALITY' && <QualityHomeSummary />}
  </div></main>;
};

const FilterButton: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => <button className="home-filter-button"><span>{icon}</span><i><small>{label}</small><b>{value}</b></i><ChevronDown /></button>;
const HeroCard: React.FC<{ title: string; text: string; icon: React.ReactNode; variant: 'improvement' | 'quality'; active: boolean; onClick: () => void }> = ({ title, text, icon, variant, active, onClick }) => <button onClick={onClick} aria-pressed={active} className={`home-hero hero-${variant} ${active ? 'is-active' : 'is-inactive'}`}><span className="home-hero-icon">{icon}</span><div><h1>{title}</h1><p>{text}</p><b>{active ? 'Resumen activo' : `Ver resumen de ${title}`} <span>→</span></b></div></button>;
const PanelTitle: React.FC<{ title: string; action: string; onClick: () => void }> = ({ title, action, onClick }) => <header className="home-panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></header>;
const Empty = () => <p className="home-empty">Sin datos</p>;
const QuickAction: React.FC<{ icon: React.ReactNode; title: string; text: string; onClick: () => void }> = ({ icon, title, text, onClick }) => <button onClick={onClick}><span>{icon}</span><i><b>{title}</b><small>{text}</small></i></button>;
const Sparkline: React.FC<{ values: number[] }> = ({ values }) => values.length > 1 ? <svg className="home-spark" viewBox="0 0 100 28" aria-hidden="true"><polyline points={values.map((value, index) => `${index / (values.length - 1) * 100},${27 - value / 100 * 23}`).join(' ')} /></svg> : null;

const QualityHomeSummary: React.FC = () => {
  const { filteredEvaluations, advisors, actionPlans, setCurrentSection } = useApp();
  const quality = filteredEvaluations.filter(evaluation => evaluation.evaluationType === 'QUALITY');
  const scores = quality.map(evaluation => evaluation.scoreTotal).filter((value): value is number => value !== null);
  const average = averageOf(scores);
  const coverage = quality.length ? new Set(quality.map(evaluation => evaluation.advisorId)).size : null;
  const critical = quality.length ? quality.filter(evaluation => evaluation.scoreTotal === 0 || Boolean(evaluation.qualityCriticalErrorIds?.length)).length : null;
  const activePlans = actionPlans.filter(plan => plan.status === 'EN_CURSO' || plan.status === 'PENDIENTE').length;
  const failures = QUALITY_ATTRIBUTES.map(attribute => ({ id: attribute.id, name: attribute.name, frequency: quality.reduce((total, evaluation) => total + Number(evaluation.items.some(item => item.criterionId === attribute.id && item.compliance === 'NO_CUMPLE')), 0) })).sort((a, b) => b.frequency - a.frequency).slice(0, 6);
  const maxFailure = Math.max(...failures.map(item => item.frequency), 1);
  const criteria = ['C1', 'C2', 'C3', 'C4'].map((criterion, index) => {
    const attributes = QUALITY_ATTRIBUTES.filter(attribute => attribute.criterion === criterion);
    const items = quality.flatMap(evaluation => evaluation.items.filter(item => attributes.some(attribute => attribute.id === item.criterionId) && item.compliance !== 'NO_APLICA'));
    return { code: criterion, label: ['Conexión y diagnóstico', 'Oferta y condiciones', 'Cierre y formalización', 'Cumplimiento transversal'][index], value: items.length ? Math.round(items.filter(item => item.compliance === 'CUMPLE').length / items.length * 100) : null };
  });
  const kpis = [
    { label: 'Resultado global PUE', value: scoreLabel(average), detail: average === null ? 'Sin evaluaciones PUE' : `${scores.length} evaluaciones con score`, icon: <Activity /> },
    { label: 'Cobertura de Calidad', value: coverage === null ? 'Sin datos' : `${coverage}/${advisors.length}`, detail: coverage === null ? 'Sin asesores evaluados' : 'Asesores con PUE', icon: <UsersRound /> },
    { label: 'Errores críticos', value: critical === null ? 'Sin datos' : String(critical), detail: critical ? 'PUE anuladas por crítico' : 'Sin errores críticos', icon: <ShieldCheck /> },
    { label: 'Evaluaciones PUE', value: quality.length ? String(quality.length) : 'Sin datos', detail: quality.length ? 'Registros del período' : 'Sin registros del período', icon: <CheckSquare /> },
    { label: 'Planes de acción', value: actionPlans.length ? String(actionPlans.length) : 'Sin datos', detail: activePlans ? `${activePlans} en ejecución` : 'Sin planes en ejecución', icon: <CheckSquare /> },
  ];
  return <><section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((kpi, index) => <article key={kpi.label} className="home-kpi"><span className={`home-kpi-icon icon-${index}`}>{kpi.icon}</span><div><p>{kpi.label}</p><b>{kpi.value}</b><small>{kpi.detail}</small></div><Sparkline values={scores.slice(-8)} /></article>)}</section>
    <section className="grid gap-2 xl:grid-cols-[1.23fr_.82fr_1.15fr]">
      <article className="home-panel"><PanelTitle title="Pareto de incumplimientos (80/20)" action="Ver detalle" onClick={() => setCurrentSection('pareto')} />{quality.length ? <div className="home-pareto">{failures.map((item, index) => <div className="home-pareto-row" key={item.id}><span title={item.name}>{item.name}</span><div><i style={{ width: `${Math.max(8, item.frequency / maxFailure * 100)}%` }} /><em>{item.frequency}</em></div><small>{Math.round((index + 1) / failures.length * 100)}%</small></div>)}</div> : <Empty />}</article>
      <article className="home-panel"><PanelTitle title="Criterios PUE" action="Ver pauta" onClick={() => setCurrentSection('methodology')} /><div className="home-dimensions">{criteria.map(item => <div className="home-dimension" key={item.code}><span>{item.code}</span><div><b>{item.label}</b><i><em style={{ width: `${item.value ?? 0}%` }} /></i></div><strong>{scoreLabel(item.value)}</strong></div>)}</div></article>
      <article className="home-panel"><PanelTitle title="Evaluaciones recientes" action="Ver todas" onClick={() => setCurrentSection('evaluations')} />{quality.length ? <div className="home-recent">{quality.slice(0, 5).map(evaluation => { const advisor = advisors.find(item => item.id === evaluation.advisorId); return <button onClick={() => setCurrentSection('evaluations')} key={evaluation.id}><span className="home-avatar">{advisor?.name.split(' ').map(word => word[0]).slice(0, 2).join('') || 'A'}</span><b>{advisor?.name || 'Asesor'}</b><strong>{scoreLabel(evaluation.scoreTotal)}</strong><small>{evaluation.date}</small></button>; })}</div> : <Empty />}</article>
    </section>
    <section className="home-quick-actions"><QuickAction icon={<PlusSquare />} title="Nueva evaluación" text="Crear y seleccionar tipo" onClick={() => setCurrentSection('evaluations')} /><QuickAction icon={<UsersRound />} title="Ver dotación" text="Gestión de equipo" onClick={() => setCurrentSection('advisors')} /><QuickAction icon={<CheckSquare />} title="Planes de acción" text="Gestionar planes" onClick={() => setCurrentSection('action_plans')} /><QuickAction icon={<MessageCircle />} title="Feedback" text="Enviar y revisar" onClick={() => setCurrentSection('feedback')} /><QuickAction icon={<BarChart3 />} title="Analítica avanzada" text="Explorar insights" onClick={() => setCurrentSection('pareto')} /></section>
  </>;
};
