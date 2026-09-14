import React, { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUp, BarChart3, CheckSquare, Filter, Info, ListChecks, Plus, ShieldCheck, TrendingUp, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KpiCard, PageHeader, Select, TableSkeleton, Tabs, Tooltip } from '../ui';
import { CompanyDistributionCard, EvaluationStatusCard, QualityTrendCard } from './ExecutiveCharts';
import { ExecutiveFilters, useExecutiveFilterSummary } from './ExecutiveFilters';
import { type CampaignRank, type ExecutiveMode, useExecutiveHome } from './useExecutiveHome';

const scoreLabel = (value: number | null | undefined) => value === null || value === undefined ? 'Sin datos' : `${value}%`;
const detailInfo = (text: string, definition: string) => <span className="cm-metric-detail">{text}<Tooltip content={definition}><button aria-label="Definición de la métrica"><Info /></button></Tooltip></span>;

export const HomeView: React.FC<{ onOpenNewEvaluation?: () => void }> = ({ onOpenNewEvaluation }) => {
  const { currentUser, isAuthReady, setCurrentSection, platformLoadError } = useApp();
  const [mode, setMode] = useState<ExecutiveMode>('D3C');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSummary = useExecutiveFilterSummary();
  const data = useExecutiveHome(mode);
  const canCreateEvaluation = Boolean(onOpenNewEvaluation) && ['ADMINISTRADOR', 'CONSULTOR', 'MONITOR'].includes(currentUser.role);
  const firstName = currentUser.name.trim().split(/\s+/)[0] || currentUser.role;
  const hardError = Boolean(platformLoadError && !data.scopedEvaluations.length);
  const loading = !isAuthReady;
  const methodologyName = mode === 'D3C' ? 'D+3C' : 'PUE';
  const scoreCount = data.scopedEvaluations.filter(item => mode === 'QUALITY' ? (item.technicalScore !== null && item.technicalScore !== undefined) || item.scoreTotal !== null : item.scoreTotal !== null).length;
  const kpis = [
    { label: `Resultado global ${methodologyName}`, value: scoreLabel(data.scoreAverage), detail: detailInfo(data.scoreAverage === null ? 'Sin evaluaciones con score' : `${scoreCount} evaluaciones con score`, `Promedio calculado sobre evaluaciones ${methodologyName} con score del periodo seleccionado.`), icon: <Activity />, className: data.scoreAverage === null ? undefined : data.scoreAverage < data.criticalThreshold ? 'is-danger' : 'is-success' },
    { label: 'Evaluaciones realizadas', value: String(data.scopedEvaluations.length), detail: detailInfo('Registros del periodo', `Cantidad de evaluaciones ${methodologyName} dentro de los filtros actuales.`), icon: <CheckSquare /> },
    { label: 'Asesores críticos', value: data.scopedEvaluations.length ? String(data.criticalAdvisorCount) : 'Sin datos', detail: detailInfo(data.scopedEvaluations.length ? `Resultado bajo ${data.criticalThreshold}%` : 'Sin evaluaciones para clasificar', 'Asesores únicos con al menos una evaluación bajo el umbral crítico configurado.'), icon: <UsersRound />, className: data.criticalAdvisorCount ? 'is-danger' : undefined },
    { label: 'Planes pendientes', value: String(data.pendingPlans.length), detail: detailInfo(data.pendingPlans.length ? 'Pendientes, en curso o vencidos' : 'Sin seguimientos pendientes', 'Planes de acción reales, en alcance, que aún no están completados.'), icon: <ListChecks />, className: data.pendingPlans.some(plan => plan.status === 'VENCIDO') ? 'is-danger' : data.pendingPlans.length ? 'is-warning' : 'is-success' },
    { label: 'Impacto operacional', value: data.operationalMeasurementCount ? `${data.operationalMeasurementCount}` : 'Sin datos', detail: detailInfo(data.operationalMeasurementCount ? 'Mediciones operacionales' : 'Sin mediciones en el periodo', 'Cantidad de mediciones operacionales disponibles bajo los filtros actuales.'), icon: <BarChart3 /> },
  ];

  return <div className="cm-page cm-home-executive">
    <PageHeader breadcrumbs={['Inicio']} title={`Hola, ${firstName}`} description={`Resumen ejecutivo de Calidad y Mejora Continua · ${currentUser.role.toLocaleLowerCase('es-PE')}.`} actions={canCreateEvaluation ? <Button leadingIcon={<Plus />} onClick={onOpenNewEvaluation}>Nueva evaluación</Button> : undefined} context={<div className="cm-home-dashboard-controls"><Tabs value={mode} onChange={value => setMode(value as ExecutiveMode)} items={[{ value: 'D3C', label: 'Mejora Continua', count: data.totalByMode.D3C }, { value: 'QUALITY', label: 'Calidad', count: data.totalByMode.QUALITY }]} /><Button type="button" variant="secondary" size="sm" leadingIcon={<Filter />} className="cm-exec-filters-toggle" aria-expanded={filtersOpen} aria-controls="home-executive-filters" aria-label={`${filtersOpen ? 'Ocultar' : 'Mostrar'} filtros${filterSummary.activeCount > 0 ? `, ${filterSummary.activeCount} activos` : ''}`} onClick={() => setFiltersOpen(open => !open)}>{`Filtros${filterSummary.activeCount > 0 ? ` · ${filterSummary.activeCount}` : ''}`}</Button></div>} />
    <section className="cm-exec-filters-region" aria-label="Controles de filtrado">
      <div id="home-executive-filters" className={`cm-exec-filters-collapse ${filtersOpen ? 'is-open' : ''}`} aria-hidden={!filtersOpen} inert={!filtersOpen}>
        <div><ExecutiveFilters activeCount={filterSummary.activeCount} /></div>
      </div>
      {!filtersOpen && <p className="cm-exec-filters-summary" aria-live="polite">{filterSummary.context}</p>}
    </section>
    {platformLoadError && <div className="cm-data-warning" role="status"><Info /> <span><b>Información parcial.</b> {platformLoadError}</span><button onClick={() => window.location.reload()}>Reintentar</button></div>}

    <section className="cm-kpi-grid" aria-label="Indicadores ejecutivos">{kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} loading={loading} />)}</section>

    <section className="cm-exec-grid cm-exec-grid--overview">
      <QualityTrendCard data={data.trend} threshold={data.threshold} granularity={data.granularity} error={hardError ? platformLoadError : undefined} loading={loading} />
      <CompanyDistributionCard data={data.companyDistribution} error={hardError ? platformLoadError : undefined} loading={loading} />
      <EvaluationStatusCard data={data.evaluationStatus} error={hardError ? platformLoadError : undefined} loading={loading} />
    </section>

    {(data.unresolvedEvaluations > 0 || data.advisorsWithoutCompany > 0) && <aside className="cm-data-quality" aria-label="Calidad de datos"><span><Info /></span><div><b>Calidad de datos</b><p>{data.unresolvedEvaluations > 0 && `${data.unresolvedEvaluations} evaluaciones sin empresa resuelta.`} {data.advisorsWithoutCompany > 0 && `${data.advisorsWithoutCompany} asesores requieren asignación de empresa.`}</p></div><button onClick={() => setCurrentSection('advisors')}>Revisar dotación <ArrowRight /></button></aside>}

    <section aria-labelledby="operational-priorities"><div className="cm-section-heading"><div><p>PRIORIDADES OPERATIVAS</p><h2 id="operational-priorities">Dónde dirigir la atención</h2></div><span>Datos del alcance actual</span></div>
      <div className="cm-exec-grid cm-exec-grid--priorities">
        <CampaignRanking data={data.campaignRanking} error={hardError ? platformLoadError : undefined} loading={loading} />
        <Card><CardHeader title="Supervisores que requieren atención" description={`Resultado promedio bajo ${data.criticalThreshold}%`} />{loading ? <TableSkeleton rows={4} /> : hardError ? <PanelError description="No pudimos cargar el seguimiento de supervisores." /> : data.supervisorsAttention.length ? <div className="cm-attention-list">{data.supervisorsAttention.map(item => <div key={item.id}><Avatar name={item.name} /><span><b title={item.name}>{item.name}</b><small title={item.context}>{item.context}</small></span><strong>{item.score}%<small>{item.evaluations} eval.</small></strong></div>)}</div> : <EmptyState description="No hay supervisores bajo el umbral crítico en este alcance." />}</Card>
        <Card><CardHeader title="Asesores con menor resultado" description={`Ranking por nota promedio ${mode === 'D3C' ? 'D+3C' : 'PUE'}`} action={<button className="cm-link" onClick={() => setCurrentSection('evaluations')}>Ver evaluaciones →</button>} />{loading ? <TableSkeleton rows={4} /> : hardError ? <PanelError description="No pudimos calcular el ranking de asesores." /> : data.lowestAdvisors.length ? <div className="cm-attention-list">{data.lowestAdvisors.map((item, index) => <button key={item.id} onClick={() => setCurrentSection('evaluations')}><Avatar name={item.name} /><span><b title={item.name}>{index + 1}. {item.name}</b><small title={item.context}>{item.context}</small></span><strong>{item.score}%<small>{item.evaluations} eval.</small></strong></button>)}</div> : <EmptyState description={`No hay asesores con evaluaciones ${mode === 'D3C' ? 'D+3C' : 'PUE'} en este alcance.`} />}</Card>
      </div>
    </section>

    <section aria-labelledby="methodology-insights"><div className="cm-section-heading"><div><p>{mode === 'D3C' ? 'MEJORA CONTINUA' : 'CALIDAD'}</p><h2 id="methodology-insights">Brechas y dominio</h2></div></div>
      <div className="cm-exec-grid cm-exec-grid--methodology">
        <ParetoCard data={data.pareto} mode={mode} onDetail={() => setCurrentSection('pareto')} error={hardError ? platformLoadError : undefined} loading={loading} />
        <Card><CardHeader title={mode === 'D3C' ? 'Dominio D+3C' : 'Criterios PUE'} description="Promedio por dimensión real" action={<button className="cm-link" onClick={() => setCurrentSection(mode === 'D3C' ? 'dashboard' : 'methodology')}>Ver detalle →</button>} />{loading ? <TableSkeleton rows={4} /> : hardError ? <PanelError description="No pudimos cargar el dominio por dimensión." /> : <div className="cm-dimension-list">{data.dimensions.map(item => <div key={item.code}><span>{item.code}</span><i><b>{item.label}</b><em>{item.value !== null && <u style={{ width: `${item.value}%` }} />}</em></i><strong>{scoreLabel(item.value)}</strong></div>)}</div>}</Card>
      </div>
    </section>

    <section className="cm-exec-grid cm-exec-grid--closing">
      <FeatureCard image="improvement" icon={<TrendingUp />} title="Mejora Continua" description="Identifica brechas, prioriza acciones y realiza seguimiento." action="Ir a Mejora Continua" onClick={() => setCurrentSection('dashboard')} />
      <FeatureCard image="quality" icon={<ShieldCheck />} title="Calidad" description="Gestiona evaluaciones, cumplimiento y consistencia." action="Ir a Calidad" onClick={() => setCurrentSection('dashboard_quality')} />
      <Card><CardHeader title="Evaluaciones recientes" description={`Últimos registros ${methodologyName}`} action={<button className="cm-link" onClick={() => setCurrentSection('evaluations')}>Ver todas →</button>} />{loading ? <TableSkeleton rows={5} /> : hardError ? <PanelError description="No pudimos cargar las evaluaciones recientes." /> : data.recentEvaluations.length ? <div className="cm-recent-list">{data.recentEvaluations.map(evaluation => <button onClick={() => setCurrentSection('evaluations')} key={evaluation.id}><span>{evaluation.initials}</span><i><b title={evaluation.advisor}>{evaluation.advisor}</b><small title={evaluation.operation}>{evaluation.date} · {evaluation.operation}</small></i><div><strong>{scoreLabel(evaluation.score)}</strong><Badge variant={evaluation.status.tone}>{evaluation.status.label}</Badge></div></button>)}</div> : <EmptyState description="No hay evaluaciones recientes en este alcance." />}</Card>
    </section>
  </div>;
};

const Avatar: React.FC<{ name: string }> = ({ name }) => <span className="cm-avatar" aria-hidden="true">{name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>;

const PanelError: React.FC<{ description: string }> = ({ description }) => <ErrorState description={description} action={<button className="cm-link" onClick={() => window.location.reload()}>Reintentar</button>} />;

const CampaignRanking: React.FC<{ data: CampaignRank[]; error?: string; loading?: boolean }> = ({ data, error, loading }) => {
  const [sort, setSort] = useState<'risk' | 'performance' | 'volume'>('risk');
  const sorted = useMemo(() => [...data].sort((a, b) => sort === 'volume' ? b.evaluations - a.evaluations : sort === 'performance' ? (b.score ?? -1) - (a.score ?? -1) : (a.score ?? 101) - (b.score ?? 101)).slice(0, 5), [data, sort]);
  return <Card><CardHeader title="Ranking de campañas" description="Identidad por operación y empresa" action={<Select aria-label="Ordenar ranking" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="risk">Mayor riesgo</option><option value="performance">Mejor resultado</option><option value="volume">Más evaluadas</option></Select>} />{loading ? <TableSkeleton rows={5} /> : error ? <PanelError description="No pudimos cargar el ranking de campañas." /> : sorted.length ? <div className="cm-ranking-table" role="table" aria-label="Ranking de campañas"><div role="row"><span>#</span><span>Campaña</span><span>Eval.</span><span>Resultado</span><span>Tend.</span></div>{sorted.map((item, index) => <div role="row" key={item.operationId}><span>{index + 1}</span><b title={item.label}>{item.label}</b><span>{item.evaluations}</span><strong>{scoreLabel(item.score)}</strong><Trend value={item.trend} /></div>)}</div> : <EmptyState description="No hay operaciones con evaluaciones en este alcance." />}</Card>;
};

const Trend: React.FC<{ value: number | null }> = ({ value }) => value === null ? <span aria-label="Sin histórico comparable">—</span> : value > 0 ? <span className="is-positive"><ArrowUp />{value}</span> : value < 0 ? <span className="is-negative"><ArrowDown />{Math.abs(value)}</span> : <span>0</span>;

const ParetoCard: React.FC<{ data: ReturnType<typeof useExecutiveHome>['pareto']; mode: ExecutiveMode; onDetail: () => void; error?: string; loading?: boolean }> = ({ data, mode, onDetail, error, loading }) => {
  const max = Math.max(...data.map(item => item.frequency), 1);
  return <Card><CardHeader title={mode === 'D3C' ? 'Pareto de brechas (80/20)' : 'Pareto de incumplimientos'} description="Top de oportunidades por frecuencia" action={<button className="cm-link" onClick={onDetail}>Ver detalle →</button>} />{loading ? <TableSkeleton rows={5} /> : error ? <PanelError description="No pudimos cargar el Pareto de brechas." /> : data.length ? <div className="cm-ranked-list">{data.map(item => <div key={item.id} title={`${item.name}: ${item.frequency} casos, ${item.percentage}%`}><span>{item.name}</span><i><em style={{ width: `${item.frequency / max * 100}%` }} /></i><b>{item.frequency}<small>{item.percentage}%</small></b></div>)}</div> : <EmptyState description="Aún no hay brechas registradas en este alcance." />}</Card>;
};

const FeatureCard: React.FC<{ image: 'improvement' | 'quality'; icon: React.ReactNode; title: string; description: string; action: string; onClick: () => void }> = ({ image, icon, title, description, action, onClick }) => <Card className={`cm-feature-card cm-feature-card--${image}`} interactive><span>{icon}</span><div><small>C&amp;M</small><h2>{title}</h2><p>{description}</p><button onClick={onClick}>{action} <ArrowRight /></button></div></Card>;
