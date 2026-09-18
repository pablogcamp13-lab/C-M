import type { ActionPlan, Advisor } from '../../types';

const measured = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function actionPlanProgress(plan: ActionPlan, advisors: Advisor[], selectedAdvisorId = '') {
  const ids = [...new Set(plan.advisorIds?.length ? plan.advisorIds : [plan.advisorId])].filter(Boolean);
  const visibleIds = selectedAdvisorId ? ids.filter(id => id === selectedAdvisorId) : ids;
  const metrics = visibleIds.map(id => plan.advisorMetrics?.find(item => item.advisorId === id));
  const stages = [
    { key: 'sphInitial', dateKey: 'sphInitialDate', label: 'Inicial' },
    { key: 'sphRetraining', dateKey: 'sphRetrainingDate', label: 'Reentrenamiento' },
    { key: 'sphUpdated', dateKey: 'sphUpdatedDate', label: 'Actual' },
  ] as const;
  const trend = stages.map(stage => {
    const values = metrics.map(item => item?.[stage.key]).filter(measured);
    const dates = metrics.filter(item => measured(item?.[stage.key])).map(item => item?.[stage.dateKey]).filter((date): date is string => Boolean(date)).sort();
    return { stage: stage.label, sph: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null, count: values.length, dateFrom: dates[0] || null, dateTo: dates.at(-1) || null, datedCount: dates.length };
  });
  const status = { active: 0, ceased: 0, missing: 0 };
  for (const id of visibleIds) {
    const advisor = advisors.find(item => item.id === id);
    if (!advisor) status.missing++;
    else if (advisor.status === 'INACTIVO' || advisor.active === false || Boolean(advisor.terminationDate && advisor.terminationDate <= new Date().toISOString().slice(0, 10))) status.ceased++;
    else status.active++;
  }
  return { ids, visibleIds, trend, status };
}
