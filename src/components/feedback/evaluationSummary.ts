import type { Evaluation } from '../../types';

export function evaluationSummary(evaluation: Evaluation) {
  const itemComments = (evaluation.items || [])
    .filter(item => item.finding?.trim())
    .map(item => ({
      id: item.criterionId,
      label: item.qualityGuideline?.name || item.attribute || item.criterionId,
      text: item.finding.trim(),
    }));
  const itemIds = new Set(itemComments.map(item => item.id));
  const formComments = Object.entries(evaluation.qualityForm?.comments || {})
    .filter(([id, text]) => text?.trim() && !itemIds.has(`tc_mov_${id}`))
    .map(([id, text]) => ({ id: `tc_mov_${id}`, label: `Ítem ${id}`, text: text.trim() }));
  const incidentDetail = evaluation.qualityForm?.fields?.['33']?.trim();

  return {
    description: evaluation.callDescription?.trim() || '',
    comments: evaluation.comments?.trim() || '',
    findings: [...itemComments, ...formComments, ...(incidentDetail ? [{ id: 'tc_mov_33', label: 'Detalle de incumplimiento', text: incidentDetail }] : [])],
  };
}
