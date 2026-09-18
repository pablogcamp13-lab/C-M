import React, { useMemo } from 'react';
import { BarChart3, ChevronRight, FileSpreadsheet, Folder, Users } from 'lucide-react';
import type { Evaluation } from '../../types';

export const batchDate = (item: Evaluation) => item.sourceBatchDate || item.createdAt?.slice(0, 10) || item.date;
export const displayBatchDate = (value: string) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));

export const SpeechAnalyticsBatches: React.FC<{ evaluations: Evaluation[]; onOpen: (date: string) => void }> = ({ evaluations, onOpen }) => {
  const groups = useMemo(() => {
    const byDate = new Map<string, Evaluation[]>();
    evaluations.filter(item => item.origin === 'SPEECH_ANALYTICS').forEach(item => {
      const date = batchDate(item);
      byDate.set(date, [...(byDate.get(date) || []), item]);
    });
    return [...byDate.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [evaluations]);
  if (!groups.length) return null;
  return <section className="space-y-2" aria-label="Importaciones de Speech Analytics">
    <div className="flex items-center gap-2 px-1"><Folder className="h-4 w-4 text-cyan-500"/><h3 className="text-xs font-bold">Cargas de Speech Analytics</h3><span className="cm-badge">SA</span></div>
    {groups.map(([date, items]) => <button key={date} type="button" onClick={() => onOpen(date)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-4 text-left hover:border-cyan-500 focus-visible:outline-2 focus-visible:outline-cyan-500"><span className="flex items-center gap-3"><Folder className="h-6 w-6 text-cyan-500"/><span><b className="block text-sm">{displayBatchDate(date)}</b><small className="text-[var(--cm-text-secondary)]">{items.length} evaluaciones · {new Set(items.map(item => item.sourceFileName).filter(Boolean)).size} archivos</small></span></span><ChevronRight className="h-4 w-4 text-cyan-500"/></button>)}
  </section>;
};

export const SpeechAnalyticsBatchSummary: React.FC<{ evaluations: Evaluation[] }> = ({ evaluations: items }) => {
  const pending = items.filter(item => item.validationStatus === 'AUTOMATIC_PENDING' || item.validationStatus === 'PENDIENTE_AUTOMATICO').length;
  const linked = items.filter(item => item.advisorResolutionStatus !== 'PENDING').length;
  const scores = items.map(item => item.technicalScore ?? item.scoreTotal ?? item.speechScore).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const advisorCount = new Set(items.map(item => item.advisorResolutionStatus === 'PENDING' ? item.sourceAdvisorDni || item.sourceAdvisorName : item.advisorId).filter(Boolean)).size;
  const companyCounts: Record<string, number> = {};
  items.forEach(item => { const name = item.sourceCompanyName || 'Por relacionar'; companyCounts[name] = (companyCounts[name] || 0) + 1; });
  const files = [...new Set(items.map(item => item.sourceFileName).filter(Boolean))];
  return <section className="space-y-3" aria-label="Resumen de la carga">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric icon={<FileSpreadsheet/>} label="Evaluaciones" value={items.length}/><Metric icon={<Users/>} label="Asesores" value={advisorCount}/><Metric icon={<BarChart3/>} label="Promedio" value={average === null ? 'Sin nota' : `${average}%`}/><Metric icon={<span>✓</span>} label="Validadas" value={items.length - pending}/></div>
    <div className="grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-3"><b>Estado</b><p className="mt-1 text-[var(--cm-text-secondary)]">{linked} relacionadas · {items.length - linked} con alerta · {pending} pendientes de validación</p></div><div className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-3"><b>Distribución por empresa</b><p className="mt-1 text-[var(--cm-text-secondary)]">{Object.entries(companyCounts).map(([name, count]) => `${name}: ${count}`).join(' · ')}</p></div></div>
    {files.length > 0 && <p className="text-xs text-[var(--cm-text-secondary)]">Archivos: {files.join(', ')}</p>}
  </section>;
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: number | string }> = ({ icon, label, value }) => <div className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-3"><span className="flex items-center gap-1.5 text-[10px] uppercase text-[var(--cm-text-secondary)]">{React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'h-3.5 w-3.5' }) : icon}{label}</span><b className="mt-1 block text-lg">{value}</b></div>;
