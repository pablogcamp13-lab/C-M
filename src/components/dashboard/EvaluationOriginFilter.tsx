import React from 'react';

export type EvaluationOriginFilterValue = 'ALL' | 'MANUAL' | 'SPEECH_ANALYTICS';

export const EvaluationOriginFilter: React.FC<{ value: EvaluationOriginFilterValue; onChange: (value: EvaluationOriginFilterValue) => void }> = ({ value, onChange }) => <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-1" role="group" aria-label="Filtrar evaluaciones por origen">
  {([['ALL', 'Todas'], ['MANUAL', 'Manuales'], ['SPEECH_ANALYTICS', 'Speech Analytics']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === key ? 'bg-cyan-500 text-slate-950' : 'text-[var(--cm-text-secondary)] hover:bg-cyan-500/10'}`}>{label}</button>)}
</div>;
