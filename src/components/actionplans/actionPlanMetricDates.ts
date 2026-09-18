import type { ActionPlanAdvisorMetric } from '../../types';

export type SphDateKey = 'sphInitialDate' | 'sphRetrainingDate' | 'sphUpdatedDate';

export const sharedMetricDate = (rows: ActionPlanAdvisorMetric[], key: SphDateKey) => {
  if (!rows.length) return '';
  const first = rows[0][key] || '';
  return rows.every(row => (row[key] || '') === first) ? first : '';
};

export const applySharedMetricDate = (rows: ActionPlanAdvisorMetric[], key: SphDateKey, date: string) => rows.map(row => ({ ...row, [key]: date }));

export const inheritedMetricDates = (rows: ActionPlanAdvisorMetric[]) => ({
  sphInitialDate: sharedMetricDate(rows, 'sphInitialDate'),
  sphRetrainingDate: sharedMetricDate(rows, 'sphRetrainingDate'),
  sphUpdatedDate: sharedMetricDate(rows, 'sphUpdatedDate'),
});
