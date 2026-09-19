import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import type { ActionPlan, Advisor } from '../../types';
import { actionPlanProgress } from './actionPlanProgress';

interface Props { plan: ActionPlan; advisors: Advisor[]; onClose: () => void; onlyAdvisorId?: string; }
const displayDate = (date: string) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const dateLabel = (point: { dateFrom: string | null; dateTo: string | null; datedCount: number; count: number }) => !point.dateFrom ? 'Fecha no registrada' : point.dateFrom === point.dateTo ? displayDate(point.dateFrom) : `${displayDate(point.dateFrom)} – ${displayDate(point.dateTo)}`;

export const ActionPlanProgressModal: React.FC<Props> = ({ plan, advisors, onClose, onlyAdvisorId }) => {
  const [selectedAdvisorId, setSelectedAdvisorId] = useState(onlyAdvisorId || '');
  const { ids, visibleIds, trend, observations } = actionPlanProgress(plan, advisors, selectedAdvisorId);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(<div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-progress-title">
    <div className="cm-modal flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--cm-border)] px-5 py-4 sm:px-6">
        <div><p className="cm-eyebrow">PLAN DE ACCIÓN</p><h2 id="plan-progress-title" className="text-lg font-bold">Avance de SPH y observaciones</h2><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">{plan.objective || plan.action}</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar avance" className="rounded-lg p-2 text-[var(--cm-text-secondary)] hover:bg-white/10 hover:text-[var(--cm-text)]"><X className="h-5 w-5" /></button>
      </header>
      <main className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs text-[var(--cm-text-secondary)]">{visibleIds.length} de {ids.length} asesores del plan</p>
          <label className="text-xs font-semibold">Asesor
            <select value={selectedAdvisorId} onChange={event => setSelectedAdvisorId(event.target.value)} disabled={Boolean(onlyAdvisorId)} className="cm-select mt-1 block min-w-64 max-w-full p-2.5">
              {!onlyAdvisorId && <option value="">Todos los asesores</option>}
              {ids.filter(id => !onlyAdvisorId || id === onlyAdvisorId).map(id => <option key={id} value={id}>{advisors.find(item => item.id === id)?.name || `Asesor sin registro (${id})`}</option>)}
            </select>
          </label>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">{trend.map(point => <div key={point.stage} className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-4"><span className="text-xs text-[var(--cm-text-secondary)]">SPH {point.stage.toLowerCase()}</span><strong className="mt-1 block text-2xl">{point.sph === null ? '—' : point.sph.toFixed(2)}</strong><small className="block text-[var(--cm-text-muted)]">{point.count} con dato</small><small className="mt-1 block text-cyan-300">Fecha: {dateLabel(point)}</small>{point.datedCount > 0 && point.datedCount < point.count && <small className="block text-[var(--cm-text-muted)]">{point.datedCount} de {point.count} con fecha</small>}</div>)}</div>
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <section className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-4" aria-label="Tendencia de SPH">
            <h3 className="font-bold">Tendencia de SPH</h3><p className="mb-3 text-xs text-[var(--cm-text-secondary)]">Promedio por etapa entre quienes tienen un valor registrado.</p>
            {trend.some(point => point.sph !== null) ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 14, right: 20, left: -18, bottom: 8 }} accessibilityLayer><CartesianGrid stroke="rgba(143,167,192,.18)" vertical={false}/><XAxis dataKey="stage" tick={{ fill: '#b9cce0', fontSize: 11 }} tickLine={false} axisLine={false}/><YAxis domain={[0, 'auto']} tick={{ fill: '#8fa7c0', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={value => Number(value).toFixed(2)}/><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="cm-chart-tooltip"><b>{payload[0].payload.stage}</b><span>SPH: {Number(payload[0].payload.sph).toFixed(2)}</span><span>Fecha: {dateLabel(payload[0].payload)}</span><span>{payload[0].payload.count} con dato</span></div> : null}/><Line type="monotone" dataKey="sph" connectNulls stroke="#1fd6ff" strokeWidth={3} dot={{ r: 5, fill: '#0d2037', stroke: '#1fd6ff', strokeWidth: 2 }} activeDot={{ r: 7 }}/></LineChart></ResponsiveContainer></div> : <p className="grid h-64 place-items-center text-sm text-[var(--cm-text-secondary)]">Aún no hay valores de SPH registrados.</p>}
            {trend.some(point => point.sph === null) && <p className="mt-2 text-xs text-[var(--cm-text-muted)]">Las etapas sin medición no se consideran como cero.</p>}
          </section>
          <section className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] p-4" aria-label="Observaciones de asesores del plan">
            <h3 className="font-bold">Observaciones</h3><p className="mb-3 text-xs text-[var(--cm-text-secondary)]">{selectedAdvisorId ? 'Detalle completo del asesor seleccionado.' : 'Resumen por asesor. Pasa el cursor sobre un comentario para leerlo completo.'}</p>
            <div className="space-y-2">{observations.map(item => <div key={item.advisorId} className="rounded-lg border border-[var(--cm-border)] bg-[var(--cm-surface)] p-3 text-xs">
              <b className="mb-1 block text-cyan-300">{item.advisorName}</b>
              {selectedAdvisorId ? <p className="whitespace-pre-wrap break-words leading-relaxed text-[var(--cm-text-secondary)]">{item.text}</p> : <div className="group relative" title={item.text} tabIndex={0}><p className="truncate text-[var(--cm-text-secondary)]">{item.text}</p><div role="tooltip" className="pointer-events-none invisible absolute bottom-[calc(100%+.4rem)] right-0 z-20 w-max max-w-[min(32rem,75vw)] rounded-lg border border-cyan-400/30 bg-slate-950 px-3 py-2 text-left leading-relaxed text-slate-100 opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">{item.text}</div></div>}
            </div>)}</div>
          </section>
        </div>
      </main>
    </div>
  </div>, document.body);
};
