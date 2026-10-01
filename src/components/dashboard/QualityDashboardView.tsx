import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Link2, ListChecks, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QUALITY_ATTRIBUTES } from '../../data/qualityPueData';
import { FiltersBar } from '../common/FiltersBar';
import { EvaluationOriginFilter, type EvaluationOriginFilterValue } from './EvaluationOriginFilter';
import { isQualityEvaluable } from '../../utils/speechTypification';
import { evaluationGeoCall } from '../../utils/movistarGeo';
import { evaluationTypificationLabel } from '../../utils/evaluationTypification';
import { TECHCENTER_MOVISTAR_FIELDS, TECHCENTER_MOVISTAR_FORM_ID, techcenterCriterionPresentation } from '../../data/techcenterMovistarForm';
import { PublicDashboardLinksModal } from './PublicDashboardLinksModal';

const MovistarGeoCard=React.lazy(()=>import('./MovistarGeoCard').then(module=>({default:module.MovistarGeoCard})));
const movistarFieldsByCriterion=new Map(TECHCENTER_MOVISTAR_FIELDS.map(field=>[`tc_mov_${field.id}`,field]));
const COVERAGE_TYPIFICATION='Señal deficiente / No hay señal';

const value = (number: number | null, suffix = '%') => number === null ? 'Sin datos' : `${number}${suffix}`;
export const QualityDashboardView: React.FC = () => {
  const { filteredEvaluations, advisors, operations, users, campaigns, currentUser, filters, actionPlans, setCurrentSection, setFilters } = useApp();
  const [originFilter, setOriginFilter] = useState<EvaluationOriginFilterValue>('ALL');
  const [geographicDepartment,setGeographicDepartment]=useState('');
  const [sharingOpen,setSharingOpen]=useState(false);
  useEffect(() => { setFilters(previous => ({ ...previous, evaluationType: 'QUALITY' })); return () => setFilters(previous => previous.evaluationType === 'QUALITY' ? { ...previous, evaluationType: '' } : previous); }, [setFilters]);
  const quality = useMemo(()=>filteredEvaluations.filter(e => e.evaluationType === 'QUALITY' && isQualityEvaluable(e) && (originFilter === 'ALL' || (originFilter === 'SPEECH_ANALYTICS' ? e.origin === 'SPEECH_ANALYTICS' : e.origin !== 'SPEECH_ANALYTICS'))),[filteredEvaluations,originFilter]);
  const geoCalls=useMemo(()=>quality.map(evaluationGeoCall),[quality]);
  useEffect(()=>setGeographicDepartment(''),[filters.companyId,filters.campaignId,filters.operationId]);
  const scores = quality.map(e => e.scoreTotal).filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const scopedAdvisors=advisors.filter(advisor=>{
    const operation=operations.find(item=>item.id===advisor.operationId);
    return advisor.status==='ACTIVO'&&(!filters.campaignId||advisor.campaignId===filters.campaignId)&&(!filters.operationId||advisor.operationId===filters.operationId)&&(!filters.companyId||operation?.companyId===filters.companyId)&&(!filters.supervisorId||advisor.supervisorId===filters.supervisorId)&&(!filters.advisorId||advisor.id===filters.advisorId);
  });
  const scopedAdvisorIds=new Set(scopedAdvisors.map(advisor=>advisor.id));
  const selectedPlans=actionPlans.filter(plan=>!filters.companyId&&!filters.campaignId&&!filters.operationId&&!filters.supervisorId&&!filters.advisorId||[...(plan.advisorIds||[]),plan.advisorId].some(id=>scopedAdvisorIds.has(id)));
  const coverage = new Set(quality.map(e => e.advisorId).filter(id=>scopedAdvisorIds.has(id))).size;
  const critical = quality.length ? quality.filter(e => Boolean(e.qualityCriticalErrorIds?.length)||e.items.some(item=>item.compliance==='NO_CUMPLE'&&(item.qualityGuideline?.critical||String(item.classification||'').startsWith('CRITICO_')))).length : null;
  const activePlans = selectedPlans.filter(p => p.status === 'EN_CURSO' || p.status === 'PENDIENTE').length;
  const overdue = selectedPlans.filter(p => p.status === 'VENCIDO').length;
  const selectedOperation=operations.find(operation=>operation.id===filters.operationId);
  const selectedCampaign = campaigns.find(campaign => campaign.id === (filters.campaignId||selectedOperation?.campaignId));
  const shareCompanyId=filters.companyId||selectedOperation?.companyId||(()=>{const matches=operations.filter(operation=>operation.campaignId===selectedCampaign?.id&&operation.status==='ACTIVA'&&!operation.legacy);return matches.length===1?matches[0].companyId:'';})();
  const guidelineCatalog = selectedCampaign?.qualityGuidelines?.length ? selectedCampaign.qualityGuidelines : campaigns.filter(campaign => campaign.status === 'ACTIVA').flatMap(campaign => campaign.qualityGuidelines || []);
  const activeGuidelines = guidelineCatalog.length ? guidelineCatalog.filter(attribute => attribute.active) : [...QUALITY_ATTRIBUTES];
  const standardCriteria = ['C1', 'C2', 'C3', 'C4'].map((criterion, index) => {
    const items = activeGuidelines.filter(attribute => attribute.criterion === criterion);
    const results = quality.flatMap(evaluation => evaluation.items.filter(item => items.some(attribute => attribute.id === item.criterionId) && item.compliance !== 'NO_APLICA'));
    const score = results.length ? Math.round((results.filter(item => item.compliance === 'CUMPLE').length / results.length) * 100) : null;
    return { criterion, label: ['Conexión y diagnóstico', 'Oferta y condiciones', 'Cierre y formalización', 'Cumplimiento transversal'][index], score };
  });
  const techcenterEvaluations=quality.filter(evaluation=>evaluation.qualityForm?.id===TECHCENTER_MOVISTAR_FORM_ID);
  const customCriteria=new Map<string,{criterion:string;label:string;passed:number;total:number}>();
  for(const evaluation of techcenterEvaluations)for(const item of evaluation.items){
    if(item.compliance!=='CUMPLE'&&item.compliance!=='NO_CUMPLE')continue;
    const field=movistarFieldsByCriterion.get(item.criterionId);
    const prior=customCriteria.get(item.criterionId)||{criterion:field?String(field.id):item.criterionId,label:field?techcenterCriterionPresentation(field).criterion:item.qualityGuideline?.name||item.attribute||item.criterionId,passed:0,total:0};
    prior.total++;if(item.compliance==='CUMPLE')prior.passed++;customCriteria.set(item.criterionId,prior);
  }
  const criteria=customCriteria.size?[...customCriteria.values()].sort((a,b)=>a.passed/a.total-b.passed/b.total||b.total-a.total).slice(0,4).map(item=>({criterion:item.criterion,label:item.label,score:Math.round(item.passed/item.total*100)})):standardCriteria;
  const failuresById=new Map<string,{id:string;code:string;name:string;count:number}>();
  for(const evaluation of quality){
    const counted=new Set<string>();
    for(const item of evaluation.items){
      if(item.compliance!=='NO_CUMPLE'||!item.criterionId||counted.has(item.criterionId))continue;
      counted.add(item.criterionId);
      const field=movistarFieldsByCriterion.get(item.criterionId);
      const guideline=activeGuidelines.find(attribute=>attribute.id===item.criterionId);
      const prior=failuresById.get(item.criterionId)||{id:item.criterionId,code:field?String(field.id):item.qualityGuideline?.code||guideline?.code||item.criterionId,name:field?techcenterCriterionPresentation(field).criterion:item.qualityGuideline?.name||item.attribute||guideline?.name||item.criterionId,count:0};
      prior.count++;failuresById.set(item.criterionId,prior);
    }
  }
  const failureTotal = [...failuresById.values()].reduce((sum,item)=>sum+item.count,0);
  const failures=[...failuresById.values()].sort((a,b)=>b.count-a.count).slice(0,6);
  const maxFailureCount = Math.max(...failures.map(item => item.count), 1);
  let runningFailureTotal = 0;
  const paretoFailures = failures.map(item => {
    runningFailureTotal += item.count;
    return { ...item, cumulative: failureTotal ? Math.round(runningFailureTotal / failureTotal * 100) : 0 };
  });
  const typificationCounts=new Map<string,number>();
  for(const evaluation of quality){
    const raw=evaluationTypificationLabel(evaluation);
    const label=raw==='Cobertura / señal'?COVERAGE_TYPIFICATION:raw;
    typificationCounts.set(label,(typificationCounts.get(label)||0)+1);
  }
  const typifications=[...typificationCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es-PE'));
  const movistarOnly=quality.length>0&&techcenterEvaluations.length===quality.length;
  const cards = [{ label: movistarOnly?'Resultado global Movistar':'Resultado global PUE', display: value(average), detail: average === null ? 'Sin evaluaciones con nota' : `${scores.length} evaluaciones con nota`, icon: <ClipboardCheck /> }, { label: 'Cobertura de Calidad', display: `${coverage}/${scopedAdvisors.length}`, detail: 'Asesores activos evaluados del alcance', icon: <Users /> }, { label: 'Errores críticos', display: movistarOnly?'No configurado':critical === null ? 'Sin datos' : String(critical), detail: movistarOnly?'La ficha Movistar no clasifica errores críticos':critical === null ? 'Sin evaluaciones PUE' : critical ? 'Evaluaciones con error crítico' : 'Sin errores críticos', icon: <AlertTriangle /> }, { label: movistarOnly?'Evaluaciones Movistar':'Evaluaciones PUE', display: quality.length || 'Sin datos', detail: quality.length ? 'Registros del período' : 'Sin registros del período', icon: <CheckCircle2 /> }, { label: 'Planes de acción', display: selectedPlans.length || 'Sin datos', detail: activePlans ? `${activePlans} en ejecución` : 'Sin planes en ejecución', icon: <ListChecks /> }];
  return <div className="cm-workspace cm-dashboard-legacy quality-dashboard flex-1 overflow-y-auto bg-[#F7F9F9]"><FiltersBar /><div className="w-full space-y-4 px-5 py-5 sm:px-7"><div className="cm-page-heading flex items-center justify-between gap-3"><div><span className="cm-eyebrow">CALIDAD · {selectedCampaign?.name || 'Todas las campañas'}</span><h2 className="text-lg font-bold">Dashboard Calidad</h2><p className="text-xs text-[#66767A]">Cumplimiento, cobertura y riesgos críticos de Calidad.</p></div><div className="flex flex-wrap gap-2">{currentUser.role==='ADMINISTRADOR'&&<button onClick={()=>setSharingOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#00B8B0] px-3 py-1.5 text-xs font-bold text-[#006B6B] hover:bg-[#E8F5F4]"><Link2 className="h-3.5 w-3.5"/>Compartir dashboard</button>}<button onClick={() => setCurrentSection('evaluations')} className="rounded-lg border border-[#00B8B0] px-3 py-1.5 text-xs font-bold text-[#006B6B] hover:bg-[#E8F5F4]">Ver evaluaciones →</button></div></div>
    {sharingOpen&&<PublicDashboardLinksModal onClose={()=>setSharingOpen(false)} initialCompanyId={shareCompanyId} initialCampaignId={shareCompanyId?selectedCampaign?.id:''} initialDashboardType="QUALITY"/>}
    <EvaluationOriginFilter value={originFilter} onChange={setOriginFilter}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(card => <article key={card.label} className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E2E9E9]"><div className="flex items-start justify-between"><span className="text-[10px] font-bold uppercase tracking-wide text-[#66767A]">{card.label}</span><span className="rounded-xl bg-[#E8F5F4] p-1.5 text-[#008B88]">{card.icon}</span></div><b className="mt-3 block text-2xl tracking-tight">{card.display}</b><p className="mt-1 text-[11px] text-[#66767A]">{card.detail}</p></article>)}</div>
    <React.Suspense fallback={<p role="status" className="text-sm">Cargando mapa de Perú…</p>}><MovistarGeoCard calls={geoCalls} demo={false} selectedDepartment={geographicDepartment} onDepartmentChange={setGeographicDepartment} dateFrom={filters.dateFrom} dateTo={filters.dateTo} advisorId={filters.advisorId}/></React.Suspense>
    <div className="grid gap-3 xl:grid-cols-[1.25fr_.85fr_.9fr]"><section className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E9E9]"><PanelHeader title="Pareto de incumplimientos (80/20)" action="Ver detalle →" onClick={() => setCurrentSection('pareto')} />{quality.length && paretoFailures.length ? <div className="cm-quality-pareto" role="img" aria-label="Gráfico de Pareto de incumplimientos por atributo, con frecuencia y porcentaje acumulado"><svg className="cm-quality-pareto__line" viewBox={`0 0 ${paretoFailures.length * 100} 174`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="35" x2={paretoFailures.length * 100} y2="35" className="cm-quality-pareto__threshold" /><polyline points={paretoFailures.map((item, index) => `${index * 100 + 50},${170 - item.cumulative * 1.6}`).join(' ')} className="cm-quality-pareto__curve" />{paretoFailures.map((item, index) => <circle key={item.id} cx={index * 100 + 50} cy={170 - item.cumulative * 1.6} r="4" />)}</svg>{paretoFailures.map(item => <div className="cm-quality-pareto__column" key={item.id} title={`${item.code} · ${item.name}: ${item.count} incumplimientos · ${item.cumulative}% acumulado`}><div className="cm-quality-pareto__plot"><b>{item.count}</b><i style={{ height: `${Math.max(10, item.count / maxFailureCount * 100)}%` }} /></div><strong>{item.code}</strong><small>{item.name}</small></div>)}</div> : <Empty label={quality.length ? 'No hay incumplimientos registrados' : 'Sin datos'} />}</section>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E9E9]"><PanelHeader title={customCriteria.size?'Criterios de la ficha Movistar':'Criterios PUE'} action="Ver pauta →" onClick={() => setCurrentSection('methodology')} /><div className="mt-3 space-y-2">{criteria.map(item => <div key={item.criterion} className="rounded-xl border border-[#E2E9E9] p-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-[#004F50] text-xs font-bold text-white">{item.criterion}</span><span className="flex-1 text-xs font-semibold">{item.label}</span><b className="text-xs">{value(item.score)}</b></div><div className="mt-2 h-1.5 overflow-hidden rounded bg-[#E8EEEE]"><div className="h-full rounded bg-[#00B8B0]" style={{ width: `${item.score || 0}%` }} /></div></div>)}</div></section>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E9E9]"><PanelHeader title="Participación por tipificación" action="" onClick={() => {}} />{quality.length ? <div className="mt-2 max-h-80 space-y-3 overflow-y-auto" aria-label={`Tipificaciones de ${quality.length} evaluaciones`}>{typifications.map(([label,count])=><div key={label} className="border-b border-[#EAF0F0] pb-2 text-xs"><div className="flex items-start justify-between gap-2"><span className="min-w-0 font-semibold" title={label}>{label}</span><b className="shrink-0 text-[#006B6B]">{(count/quality.length*100).toFixed(1)}%</b></div><div className="mt-1 h-1.5 overflow-hidden rounded bg-[#E8EEEE]"><div className="h-full rounded bg-[#00B8B0]" style={{width:`${count/quality.length*100}%`}}/></div><small className="text-[#66767A]">{count} de {quality.length} evaluaciones</small></div>)}</div> : <Empty />}</section></div>
    <section className="flex flex-wrap items-center gap-5 rounded-2xl bg-white p-4 ring-1 ring-[#E2E9E9]"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#008B88]" /><b className="text-sm">Planes de acción</b></div><Plan label="En ejecución" value={activePlans} /><Plan label="Completados" value={selectedPlans.filter(p => p.status === 'COMPLETADO').length} /><Plan label="Vencidos" value={overdue} critical /><Plan label="Total" value={selectedPlans.length} /><button onClick={() => setCurrentSection('action_plans')} className="ml-auto rounded-lg bg-[#004F50] px-4 py-2 text-xs font-bold text-white hover:bg-[#006B6B]">Ver planes de acción →</button></section>
    {quality.length > 0 && <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E9E9]"><PanelHeader title="Resultados por supervisor" action="" onClick={() => {}} /><div className="mt-3 grid gap-2 md:grid-cols-3">{(Object.entries(quality.reduce((groups: Record<string, number[]>, evaluation) => { if(typeof evaluation.scoreTotal!=='number'||!Number.isFinite(evaluation.scoreTotal))return groups;const key = users.find(user => user.id === evaluation.supervisorId)?.name || 'Sin supervisor'; (groups[key] ||= []).push(evaluation.scoreTotal); return groups; }, {})) as Array<[string, number[]]>).map(([name, group]) => <div key={name} className="rounded-xl bg-[#F0F7F7] p-3"><b className="text-xs">{name}</b><span className="mt-1 block text-xl font-bold text-[#006B6B]">{Math.round(group.reduce((a,b) => a + b, 0) / group.length)}%</span></div>)}</div></section>}
  </div></div>;
};
const PanelHeader: React.FC<{ title: string; action: string; onClick: () => void }> = ({ title, action, onClick }) => <div className="flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>{action && <button onClick={onClick} className="text-xs font-bold text-[#008B88]">{action}</button>}</div>;
const Empty: React.FC<{ label?: string }> = ({ label = 'Sin datos' }) => <p className="grid h-52 place-items-center text-sm text-[#66767A]">{label}</p>;
const Plan: React.FC<{ label: string; value: number; critical?: boolean }> = ({ label, value, critical }) => <div className="min-w-28"><b className={critical && value ? 'text-[#FF4D4F]' : 'text-[#004F50]'}>{value}</b><span className="ml-2 text-xs text-[#66767A]">{label}</span><div className="mt-1 h-1 rounded bg-[#E8EEEE]"><div className={`h-full rounded ${critical ? 'bg-[#FF4D4F]' : 'bg-[#00B8B0]'}`} style={{ width: `${value ? Math.min(100, value * 10) : 0}%` }} /></div></div>;
