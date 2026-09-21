import type { Evaluation } from '../../types';

export const manualFeedbackCandidates = (evaluations: Evaluation[], feedbackEvaluationIds: Iterable<string>) => {
  const used = new Set(feedbackEvaluationIds);
  return evaluations.filter(evaluation => evaluation.origin !== 'SPEECH_ANALYTICS' && !used.has(evaluation.id));
};
