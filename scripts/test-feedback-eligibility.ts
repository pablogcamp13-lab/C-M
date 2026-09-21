import assert from 'node:assert/strict';
import type { Evaluation } from '../src/types';
import { manualFeedbackCandidates } from '../src/components/feedback/feedbackEligibility';

const evaluations = [
  { id: 'manual-free', origin: 'MANUAL' },
  { id: 'manual-used', origin: 'MANUAL' },
  { id: 'speech-free', origin: 'SPEECH_ANALYTICS' },
] as Evaluation[];

assert.deepEqual(manualFeedbackCandidates(evaluations, ['manual-used']).map(item => item.id), ['manual-free']);
assert.deepEqual(manualFeedbackCandidates(evaluations.filter(item => item.id !== 'speech-free'), []).map(item => item.id), ['manual-free', 'manual-used']);
console.log('Feedback: el selector general excluye SA, evaluaciones usadas y registros eliminados.');
