import type { Evaluation } from '../types';

export type SpeechTypification = NonNullable<Evaluation['speechTypification']>;
export type SpeechTypificationFilter = 'ALL' | SpeechTypification | 'SIN_TIPIFICACION';

export const SPEECH_TYPIFICATIONS: { value: SpeechTypification; label: string }[] = [
  { value: 'CORTA_LLAMADA', label: 'Corta llamada' },
  { value: 'PREFIERE_PREPAGO', label: 'Prefiere mantenerse en prepago' },
  { value: 'NO_ES_TITULAR', label: 'No es titular' },
];

export const isQualityEvaluable = (evaluation: Evaluation) => evaluation.origin !== 'SPEECH_ANALYTICS' || evaluation.speechTypification !== 'CORTA_LLAMADA';

export const matchesSpeechTypification = (evaluation: Evaluation, filter: SpeechTypificationFilter) =>
  filter === 'ALL' || (filter === 'SIN_TIPIFICACION' ? !evaluation.speechTypification : evaluation.speechTypification === filter);
