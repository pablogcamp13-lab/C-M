import React, { useState } from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MoreFiltersDrawer } from './MoreFiltersDrawer';

export const FiltersBar: React.FC = () => {
  const { filters, setFilters, resetFilters, users, advisors, campaigns, filteredEvaluations, evaluations } = useApp();
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);
  const secondaryFilterKeys = ['campaignId', 'supervisorId', 'advisorId', 'dateFrom', 'dateTo'];
  const secondaryActiveCount = secondaryFilterKeys.filter(key => Boolean((filters as Record<string, unknown>)[key])).length;

  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filters.supervisorId) activeChips.push({ key: 'supervisor', label: `Supervisor: ${users.find(user => user.id === filters.supervisorId)?.name || 'Supervisor'}`, onRemove: () => setFilters(previous => ({ ...previous, supervisorId: '' })) });
  if (filters.advisorId) activeChips.push({ key: 'advisor', label: advisors.find(advisor => advisor.id === filters.advisorId)?.name || 'Asesor', onRemove: () => setFilters(previous => ({ ...previous, advisorId: '' })) });
  if (filters.campaignId) activeChips.push({ key: 'campaign', label: campaigns.find(campaign => campaign.id === filters.campaignId)?.name || 'Campaña', onRemove: () => setFilters(previous => ({ ...previous, campaignId: '' })) });
  if (filters.dateFrom || filters.dateTo) activeChips.push({ key: 'dates', label: `${filters.dateFrom || 'Inicio'} a ${filters.dateTo || 'Hoy'}`, onRemove: () => setFilters(previous => ({ ...previous, dateFrom: '', dateTo: '' })) });

  return <div className="cm-filterbar">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <button onClick={() => setIsMoreDrawerOpen(true)} className={`cm-button-secondary cm-filterbar__trigger ${secondaryActiveCount > 0 ? 'is-active' : ''}`}><SlidersHorizontal className="h-3.5 w-3.5" /><span>Filtros</span>{secondaryActiveCount > 0 && <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--cm-primary)] text-[10px] font-bold text-[#031326]">{secondaryActiveCount}</span>}</button>
      </div>
      <div className="cm-filterbar__text-muted text-xs font-medium"><span className="font-semibold text-[var(--cm-text)] font-kpi">{filteredEvaluations.length}</span> evaluaciones{filteredEvaluations.length !== evaluations.length && <span className="ml-1 text-[11px]">de {evaluations.length}</span>}</div>
    </div>
    {activeChips.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--cm-border)] pt-2.5"><span className="cm-filterbar__text-muted mr-1 text-[11px]">Filtros:</span>{activeChips.map(chip => <span key={chip.key} className="cm-filterbar__chip"><span>{chip.label}</span><button onClick={chip.onRemove} className="rounded p-0.5 text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]" title="Quitar filtro"><X className="h-3 w-3" /></button></span>)}<button onClick={resetFilters} className="cm-filterbar__text-muted ml-2 inline-flex items-center gap-1 text-[11px] font-medium hover:text-[var(--cm-text)]"><RotateCcw className="h-2.5 w-2.5" />Limpiar todo</button></div>}
    <MoreFiltersDrawer isOpen={isMoreDrawerOpen} onClose={() => setIsMoreDrawerOpen(false)} />
  </div>;
};
