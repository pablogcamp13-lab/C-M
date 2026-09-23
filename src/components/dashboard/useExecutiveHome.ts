import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { QUALITY_ATTRIBUTES } from '../../data/qualityPueData';
import type { ActionPlan, Advisor, Campaign, Company, Evaluation, Operation, PlatformEvaluationType, User } from '../../types';
import { calculatePareto } from '../../utils/calculations';
import type { EvaluationOriginFilterValue } from './EvaluationOriginFilter';
import { isQualityEvaluable, matchesSpeechTypification, type SpeechTypificationFilter } from '../../utils/speechTypification';

export type ExecutiveMode = PlatformEvaluationType;

export interface TrendPoint { key: string; label: string; score: number; count: number; }
export interface DistributionItem { id: string; name: string; count: number; percentage: number; }
export interface StatusItem { id: string; label: string; count: number; tone: 'success' | 'warning' | 'neutral'; }
export interface CampaignRank { operationId: string; label: string; evaluations: number; score: number | null; trend: number | null; }
export interface AttentionSupervisor { id: string; name: string; context: string; score: number; evaluations: number; }
export interface PendingAdvisor { id: string; name: string; reason: string; count: number; status: ActionPlan['status']; }
export interface AdvisorRank { id: string; name: string; context: string; score: number; evaluations: number; }

const scoredValue = (evaluation: Evaluation, mode: ExecutiveMode) => mode === 'QUALITY'
  ? evaluation.technicalScore ?? evaluation.scoreTotal
  : evaluation.scoreTotal;

const average = (values: Array<number | null | undefined>) => {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

const startOfWeek = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
};

const formatDate = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', ...options }).format(new Date(`${value}T00:00:00Z`));

const trendKey = (date: string, granularity: 'day' | 'week' | 'month') => granularity === 'day' ? date : granularity === 'week' ? startOfWeek(date) : date.slice(0, 7);

const trendLabel = (key: string, granularity: 'day' | 'week' | 'month') => granularity === 'month'
  ? new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
  : granularity === 'week'
    ? `Sem. ${formatDate(key, { day: '2-digit', month: 'short' })}`
    : formatDate(key, { day: '2-digit', month: 'short' });

function inferGranularity(evaluations: Evaluation[], dateFrom: string, dateTo: string): 'day' | 'week' | 'month' {
  const dates = evaluations.map(item => item.date).filter(Boolean).sort();
  const from = dateFrom || dates[0];
  const to = dateTo || dates.at(-1);
  if (!from || !to) return 'day';
  const days = Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';
}

function buildTrend(evaluations: Evaluation[], mode: ExecutiveMode, granularity: 'day' | 'week' | 'month'): TrendPoint[] {
  const groups = new Map<string, number[]>();
  evaluations.forEach(evaluation => {
    const score = scoredValue(evaluation, mode);
    if (score === null || score === undefined || !evaluation.date) return;
    const key = trendKey(evaluation.date, granularity);
    groups.set(key, [...(groups.get(key) || []), score]);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({
    key,
    label: trendLabel(key, granularity),
    score: average(values) ?? 0,
    count: values.length,
  }));
}

const validationLabel = (status?: Evaluation['validationStatus']) => {
  if (status === 'VALIDATED' || status === 'VALIDADO' || status === 'AJUSTADO_VALIDADO') return { id: 'validated', label: 'Validada', tone: 'success' as const };
  if (status === 'AUTOMATIC_PENDING' || status === 'PENDIENTE_AUTOMATICO') return { id: 'pending', label: 'Pendiente de validación', tone: 'warning' as const };
  return { id: 'unregistered', label: 'Sin estado registrado', tone: 'neutral' as const };
};

export const useExecutiveHome = (mode: ExecutiveMode, originFilter: EvaluationOriginFilterValue = 'ALL', speechTypification: SpeechTypificationFilter = 'ALL') => {
  const app = useApp();
  const {
    filteredEvaluations, filteredAdvisors, filteredOperationalMeasurements,
    advisors, operations, companies, campaigns, users, actionPlans, config, filters,
  } = app;

  return useMemo(() => {
    const scopedEvaluations = filteredEvaluations.filter(evaluation => (evaluation.evaluationType === 'QUALITY' ? 'QUALITY' : 'D3C') === mode && (mode !== 'QUALITY' || (isQualityEvaluable(evaluation) && (originFilter === 'ALL' || (originFilter === 'SPEECH_ANALYTICS' ? evaluation.origin === 'SPEECH_ANALYTICS' : evaluation.origin !== 'SPEECH_ANALYTICS')) && (originFilter !== 'SPEECH_ANALYTICS' || matchesSpeechTypification(evaluation,speechTypification)))));
    const scores = scopedEvaluations.map(evaluation => scoredValue(evaluation, mode));
    const scoreAverage = average(scores);
    const criticalThreshold = config.priorityThresholds.highGapMax;
    const criticalAdvisors = new Set(scopedEvaluations.filter(evaluation => {
      const score = scoredValue(evaluation, mode);
      return score !== null && score !== undefined && (mode === 'QUALITY' ? evaluation.qualityResult === 'REPROBADA' || score < criticalThreshold : score < criticalThreshold);
    }).map(evaluation => evaluation.advisorId));

    const filteredAdvisorIds = new Set(filteredAdvisors.map(advisor => advisor.id));
    const filteredEvaluationIds = new Set(scopedEvaluations.map(evaluation => evaluation.id));
    const scopedPlans = actionPlans.filter(plan => {
      if (!(plan.advisorIds?.length ? plan.advisorIds : [plan.advisorId]).some(id => filteredAdvisorIds.has(id))) return false;
      if (plan.evaluationId && !filteredEvaluationIds.has(plan.evaluationId)) return false;
      const planDate = plan.createdDate || plan.targetDate || plan.dueDate;
      if (planDate && filters.dateFrom && planDate < filters.dateFrom) return false;
      if (planDate && filters.dateTo && planDate > filters.dateTo) return false;
      return true;
    });
    const pendingPlans = scopedPlans.filter(plan => plan.status === 'PENDIENTE' || plan.status === 'EN_CURSO' || plan.status === 'VENCIDO');

    const granularity = inferGranularity(scopedEvaluations, filters.dateFrom, filters.dateTo);
    const trend = buildTrend(scopedEvaluations, mode, granularity);

    const advisorById = new Map<string, Advisor>(advisors.map(advisor => [advisor.id, advisor]));
    const operationById = new Map<string, Operation>(operations.map(operation => [operation.id, operation]));
    const companyById = new Map<string, Company>(companies.map(company => [company.id, company]));
    const campaignById = new Map<string, Campaign>(campaigns.map(campaign => [campaign.id, campaign]));
    const userById = new Map<string, User>(users.map(user => [user.id, user]));
    const resolveOperation = (evaluation: Evaluation) => operationById.get(evaluation.operationId || advisorById.get(evaluation.advisorId)?.operationId || '');
    const resolveCompany = (evaluation: Evaluation) => companyById.get(evaluation.companyId || '') || companyById.get(resolveOperation(evaluation)?.companyId || '');

    const companyCounts = new Map<string, number>();
    let unresolvedEvaluations = 0;
    scopedEvaluations.forEach(evaluation => {
      const company = resolveCompany(evaluation);
      if (!company) { unresolvedEvaluations += 1; return; }
      companyCounts.set(company.id, (companyCounts.get(company.id) || 0) + 1);
    });
    const resolvedCompanyTotal = [...companyCounts.values()].reduce((sum, count) => sum + count, 0);
    const companyDistribution: DistributionItem[] = [...companyCounts.entries()].map(([id, count]) => ({
      id,
      name: companyById.get(id)?.name || 'Empresa',
      count,
      percentage: resolvedCompanyTotal ? Math.round(count / resolvedCompanyTotal * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    const statuses = new Map<string, StatusItem>();
    scopedEvaluations.forEach(evaluation => {
      const definition = validationLabel(evaluation.validationStatus);
      const previous = statuses.get(definition.id);
      statuses.set(definition.id, { ...definition, count: (previous?.count || 0) + 1 });
    });
    const evaluationStatus = [...statuses.values()].sort((a, b) => b.count - a.count);

    const rankingGroups = new Map<string, Evaluation[]>();
    scopedEvaluations.forEach(evaluation => {
      const operation = resolveOperation(evaluation);
      if (!operation) return;
      rankingGroups.set(operation.id, [...(rankingGroups.get(operation.id) || []), evaluation]);
    });
    const campaignRanking: CampaignRank[] = [...rankingGroups.entries()].map(([operationId, items]) => {
      const operation = operationById.get(operationId)!;
      const company = companyById.get(operation.companyId);
      const points = buildTrend(items, mode, granularity);
      const latest = points.at(-1)?.score;
      const previous = points.at(-2)?.score;
      return {
        operationId,
        label: `${company?.name || 'Sin empresa'} / ${operation.name || campaignById.get(operation.campaignId)?.name || 'Campaña'}`,
        evaluations: items.length,
        score: average(items.map(item => scoredValue(item, mode))),
        trend: latest === undefined || previous === undefined ? null : Math.round((latest - previous) * 10) / 10,
      };
    });

    const supervisorGroups = new Map<string, Evaluation[]>();
    scopedEvaluations.forEach(evaluation => {
      const supervisorId = evaluation.supervisorId || advisorById.get(evaluation.advisorId)?.supervisorId;
      if (!supervisorId || scoredValue(evaluation, mode) == null) return;
      supervisorGroups.set(supervisorId, [...(supervisorGroups.get(supervisorId) || []), evaluation]);
    });
    const supervisorsAttention: AttentionSupervisor[] = [...supervisorGroups.entries()].map(([id, items]) => {
      const operationNames = [...new Set(items.map(item => {
        const operation = resolveOperation(item);
        const company = operation && companyById.get(operation.companyId);
        return operation ? `${company?.name || 'Sin empresa'} / ${operation.name}` : '';
      }).filter(Boolean))];
      return {
        id,
        name: userById.get(id)?.name || advisorById.get(items[0].advisorId)?.supervisor || 'Supervisor no identificado',
        context: operationNames.length === 1 ? operationNames[0] : `${operationNames.length} operaciones`,
        score: average(items.map(item => scoredValue(item, mode))) ?? 0,
        evaluations: items.length,
      };
    }).filter(item => item.score < criticalThreshold).sort((a, b) => a.score - b.score).slice(0, 5);

    const advisorScoreGroups = new Map<string, Evaluation[]>();
    scopedEvaluations.forEach(evaluation => {
      if (scoredValue(evaluation, mode) == null) return;
      advisorScoreGroups.set(evaluation.advisorId, [...(advisorScoreGroups.get(evaluation.advisorId) || []), evaluation]);
    });
    const lowestAdvisors: AdvisorRank[] = [...advisorScoreGroups.entries()].map(([id, items]) => {
      const advisor = advisorById.get(id);
      const operation = resolveOperation(items[0]);
      const company = operation && companyById.get(operation.companyId);
      return {
        id,
        name: advisor?.name || 'Asesor no identificado',
        context: operation ? `${company?.name || 'Sin empresa'} / ${operation.name}` : 'Operación no resuelta',
        score: average(items.map(item => scoredValue(item, mode))) ?? 0,
        evaluations: items.length,
      };
    }).sort((a, b) => a.score - b.score || b.evaluations - a.evaluations || a.name.localeCompare(b.name)).slice(0, 5);

    const planPriority: Record<ActionPlan['status'], number> = { VENCIDO: 0, PENDIENTE: 1, EN_CURSO: 2, COMPLETADO: 3 };
    const planGroups = new Map<string, ActionPlan[]>();
    pendingPlans.forEach(plan => (plan.advisorIds?.length ? plan.advisorIds : [plan.advisorId]).filter(id => filteredAdvisorIds.has(id)).forEach(id => planGroups.set(id, [...(planGroups.get(id) || []), plan])));
    const pendingAdvisors: PendingAdvisor[] = [...planGroups.entries()].map(([id, plans]) => {
      const status = [...plans].sort((a, b) => planPriority[a.status] - planPriority[b.status])[0].status;
      const reason = status === 'VENCIDO' ? 'Plan de acción vencido' : status === 'PENDIENTE' ? 'Plan de acción pendiente' : 'Plan de acción en curso';
      return { id, name: advisorById.get(id)?.name || 'Asesor no identificado', reason, count: plans.length, status };
    }).sort((a, b) => planPriority[a.status] - planPriority[b.status] || b.count - a.count).slice(0, 5);

    const qualityFailures = mode === 'QUALITY' ? QUALITY_ATTRIBUTES.map(attribute => ({
      id: attribute.id,
      name: attribute.name,
      frequency: scopedEvaluations.reduce((total, evaluation) => total + Number(evaluation.items.some(item => item.criterionId === attribute.id && item.compliance === 'NO_CUMPLE')), 0),
      percentage: 0,
      cumulative: 0,
    })).filter(item => item.frequency > 0).sort((a, b) => b.frequency - a.frequency) : [];
    const qualityFailureTotal = qualityFailures.reduce((sum, item) => sum + item.frequency, 0);
    let qualityCumulative = 0;
    qualityFailures.forEach(item => {
      item.percentage = qualityFailureTotal ? Math.round(item.frequency / qualityFailureTotal * 1000) / 10 : 0;
      qualityCumulative += item.percentage;
      item.cumulative = Math.min(100, Math.round(qualityCumulative * 10) / 10);
    });
    const pareto = mode === 'D3C'
      ? calculatePareto(scopedEvaluations, 'ALL').filter(item => item.frequency > 0).slice(0, 6).map(item => ({ id: item.criterionId, name: item.name, frequency: item.frequency, percentage: item.percentage, cumulative: item.cumulativePercentage }))
      : qualityFailures.slice(0, 6);

    const dimensions = mode === 'D3C'
      ? [
          { code: 'D', label: 'Dominio de Producto', value: null },
          { code: 'C1', label: 'Conectar', value: average(scopedEvaluations.map(item => item.scoreConnect)) },
          { code: 'C2', label: 'Clarificar', value: average(scopedEvaluations.map(item => item.scoreClarify)) },
          { code: 'C3', label: 'Convertir', value: average(scopedEvaluations.map(item => item.scoreConvert)) },
        ]
      : ['C1', 'C2', 'C3', 'C4'].map((criterion, index) => {
          const attributes = QUALITY_ATTRIBUTES.filter(attribute => attribute.criterion === criterion);
          const items = scopedEvaluations.flatMap(evaluation => evaluation.items.filter(item => attributes.some(attribute => attribute.id === item.criterionId) && item.compliance !== 'NO_APLICA'));
          return { code: criterion, label: ['Conexión y diagnóstico', 'Oferta y condiciones', 'Cierre y formalización', 'Cumplimiento transversal'][index], value: items.length ? Math.round(items.filter(item => item.compliance === 'CUMPLE').length / items.length * 100) : null };
        });

    const recentEvaluations = [...scopedEvaluations].sort((a, b) => `${b.date}T${b.time || '00:00'}${b.createdAt}`.localeCompare(`${a.date}T${a.time || '00:00'}${a.createdAt}`)).slice(0, 5).map(evaluation => {
      const advisor = advisorById.get(evaluation.advisorId);
      const operation = resolveOperation(evaluation);
      const company = operation && companyById.get(operation.companyId);
      return {
        id: evaluation.id,
        advisor: advisor?.name || 'Asesor no identificado',
        initials: initials(advisor?.name || 'Asesor'),
        date: evaluation.date,
        operation: operation ? `${company?.name || 'Sin empresa'} / ${operation.name}` : 'Operación no resuelta',
        score: scoredValue(evaluation, mode),
        status: validationLabel(evaluation.validationStatus),
      };
    });

    const advisorsWithoutCompany = filteredAdvisors.filter(advisor => !operationById.get(advisor.operationId || '')?.companyId).length;
    const totalByMode = filteredEvaluations.reduce((counts, evaluation) => {
      const key: ExecutiveMode = evaluation.evaluationType === 'QUALITY' ? 'QUALITY' : 'D3C';
      if (key !== 'QUALITY' || isQualityEvaluable(evaluation)) counts[key] += 1;
      return counts;
    }, { D3C: 0, QUALITY: 0 });

    return {
      scopedEvaluations,
      scoreAverage,
      criticalThreshold,
      criticalAdvisorCount: criticalAdvisors.size,
      pendingPlans,
      scopedPlans,
      trend,
      granularity,
      threshold: mode === 'D3C' ? config.priorityThresholds.expectedMax : null,
      companyDistribution,
      evaluationStatus,
      campaignRanking,
      supervisorsAttention,
      lowestAdvisors,
      pendingAdvisors,
      pareto,
      dimensions,
      recentEvaluations,
      unresolvedEvaluations,
      advisorsWithoutCompany,
      operationalMeasurementCount: filteredOperationalMeasurements.length,
      totalByMode,
    };
  }, [actionPlans, advisors, campaigns, companies, config, filteredAdvisors, filteredEvaluations, filteredOperationalMeasurements, filters, mode, originFilter, operations, speechTypification, users]);
};
