import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Evaluation } from '../../types';
import { FiltersBar } from '../common/FiltersBar';
import { ThreeScore } from '../common/ThreeScore';
import { StatusBadge } from '../common/StatusBadge';
import { 
  Eye, 
  Trash2, 
  ArrowUpDown, 
  Phone, 
  Calendar,
  AlertCircle,
  Sparkles
} from 'lucide-react';

interface EvaluationsListProps {
  onOpenNewEvaluation: () => void;
  onSelectEvaluation: (evaluation: Evaluation) => void;
}

export const EvaluationsList: React.FC<EvaluationsListProps> = ({ 
  onSelectEvaluation, onOpenNewEvaluation
}) => {
  const { filteredEvaluations, advisors, users, currentUser, deleteEvaluation } = useApp();
  const [sortField, setSortField] = useState<'date' | 'score' | 'advisor'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'QUALITY' | 'D3C'>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'VENTA' | 'NO_VENTA'>('ALL');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'PENDIENTE' | 'FINALIZADA'>('ALL');
  const isAdvisor = currentUser.role === 'ASESOR';
  const visibleEvaluations = filteredEvaluations.filter(ev => {
    if (typeFilter !== 'ALL' && ev.evaluationType !== typeFilter) return false;
    if (resultFilter !== 'ALL' && (ev.sale ? 'VENTA' : 'NO_VENTA') !== resultFilter) return false;
    const state = (ev as any).reviewedAt ? 'FINALIZADA' : 'PENDIENTE';
    return stateFilter === 'ALL' || state === stateFilter;
  });

  // Sorting
  const sortedEvaluations = [...visibleEvaluations].sort((a, b) => {
    if (sortField === 'date') {
      const cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'score') {
      const cmp = a.scoreTotal - b.scoreTotal;
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'advisor') {
      const nameA = advisors.find(adv => adv.id === a.advisorId)?.name || '';
      const nameB = advisors.find(adv => adv.id === b.advisorId)?.name || '';
      const cmp = nameA.localeCompare(nameB);
      return sortAsc ? cmp : -cmp;
    }
    return 0;
  });

  const getScoreBadgeClass = (score: number) => {
    if (score < 60) return 'bg-red-50 text-red-700 border-red-200';
    if (score < 80) return 'bg-amber-50 text-amber-800 border-amber-200';
    if (score < 90) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  return (
    <div className="cm-workspace cm-evaluations flex-1 flex flex-col min-h-0 overflow-y-auto">
      
      {/* Global Filter Bar with Progressive Disclosure */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-4">
        
        {/* Compact Page Header (No redundant big cards) */}
        <div className="cm-page-heading flex items-center justify-between pb-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#031E3C] tracking-tight font-heading">
              {isAdvisor ? 'Mis evaluaciones' : 'Evaluaciones'}
            </h2>
            <p className="text-xs text-[#667085] mt-0.5 font-medium">
              {visibleEvaluations.length} {visibleEvaluations.length === 1 ? 'registro encontrado' : 'registros encontrados'}
            </p>
          </div><div className="flex flex-wrap items-center justify-end gap-2"><select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="cm-select px-2 py-1.5 text-xs"><option value="ALL">Todas</option><option value="QUALITY">Calidad</option><option value="D3C">Mejora Continua</option></select><select value={resultFilter} onChange={event => setResultFilter(event.target.value as typeof resultFilter)} className="cm-select px-2 py-1.5 text-xs"><option value="ALL">Todo resultado</option><option value="VENTA">Venta</option><option value="NO_VENTA">No venta</option></select><select value={stateFilter} onChange={event => setStateFilter(event.target.value as typeof stateFilter)} className="cm-select px-2 py-1.5 text-xs"><option value="ALL">Todo estado</option><option value="PENDIENTE">Pendiente de revisión</option><option value="FINALIZADA">Finalizada</option></select>{!isAdvisor && <button onClick={onOpenNewEvaluation} className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#1FD6FF] to-[#2E7BFF] px-3 py-2 text-xs font-bold text-[#031326]"><Phone className="h-4 w-4" />Nueva evaluación</button>}</div>
        </div>

        {/* Evaluations Table */}
        <div className="bg-white border border-[#E5E8EC] rounded-xl overflow-hidden shadow-2xs">
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[#F6F7F9] border-b border-[#E5E8EC] text-[11px] font-bold text-[#667085] uppercase tracking-wider font-heading">
                <tr>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:text-[#031E3C] transition-colors"
                    onClick={() => { setSortField('advisor'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Asesor</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th className="py-3 px-3"><span>Tipo</span></th>

                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-[#031E3C] transition-colors"
                    onClick={() => { setSortField('date'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Evaluación</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-[#031E3C] transition-colors text-center"
                    onClick={() => { setSortField('score'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Score 3C</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th className="py-3 px-4">
                    <span>Desempeño 3C</span>
                  </th>

                  <th className="py-3 px-3">
                    <span>Resultado</span>
                  </th>

                  <th className="py-3 px-3">
                    <span>Brecha Principal</span>
                  </th>

                  <th className="py-3 px-4 text-right">
                    <span>Acciones</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E5E8EC]">
                {sortedEvaluations.length > 0 ? (
                  sortedEvaluations.map((ev) => {
                    const advisor = advisors.find(a => a.id === ev.advisorId);
                    const supervisor = users.find(u => u.id === ev.supervisorId);

                    return (
                      <tr 
                        key={ev.id} 
                        className="hover:bg-[#F6F7F9]/80 transition-colors group cursor-pointer"
                        onClick={() => onSelectEvaluation(ev)}
                      >
                        
                        {/* 1. Asesor (Name + Subtitle: Supervisor · ID llamada) */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#031E3C] text-xs">
                            {advisor?.name || 'Asesor'}
                          </div>
                          <div className="text-[11px] text-[#667085] flex items-center gap-1.5 mt-0.5">
                            <span>{supervisor?.name || 'Supervisor'}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-[10px] text-slate-500">{ev.callId}</span>
                            {(ev.aiAnalysis || ev.aiAlerts) && (
                              <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5" title="Auditada con IA 3C (Gemini)">
                                <Sparkles className="w-2.5 h-2.5 text-[#FF6B00]" /> IA 3C
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. Evaluación (Date + Type badge) */}
                        <td className="py-3 px-3">
                          <div className="text-[11px] font-medium text-[#031E3C]">{ev.date}</div>
                          <div className="mt-0.5">
                            <StatusBadge status={ev.type} size="sm" showIcon={false} />
                          </div>
                        </td>

                        <td className="py-3 px-3"><span className="cm-badge">{ev.evaluationType === 'QUALITY' ? 'Calidad' : 'Mejora Continua'}</span></td>

                        {/* 3. Score 3C (Numeric Badge) */}
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block text-xs font-bold font-kpi px-2.5 py-1 rounded-md border ${getScoreBadgeClass(ev.scoreTotal)}`}>
                            {ev.scoreTotal}%
                          </span>
                        </td>

                        {/* 4. Desempeño 3C (ThreeScore Component in one cell) */}
                        <td className="py-3 px-4">
                          <ThreeScore 
                            connect={ev.scoreConnect}
                            clarify={ev.scoreClarify}
                            convert={ev.scoreConvert}
                          />
                        </td>

                        {/* 5. Resultado Comercial */}
                        <td className="py-3 px-3">
                          <StatusBadge 
                            status={ev.sale ? 'VENTA' : 'NO_VENTA'} 
                            label={ev.sale ? 'Venta' : (ev.saleResult || 'No Venta')}
                          />
                        </td>

                        {/* 6. Brecha Principal */}
                        <td className="py-3 px-3">
                          <span 
                            className="inline-block text-[10px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 truncate max-w-[150px]"
                            title={ev.primaryGap}
                          >
                            {ev.primaryGap}
                          </span>
                        </td>

                        {/* 7. Acciones */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {!isAdvisor && <button
                              onClick={() => onSelectEvaluation(ev)}
                              className="p-1.5 text-[#667085] hover:text-[#FF6B00] hover:bg-[#FF6B00]/10 rounded-lg transition-colors"
                              title="Ver ficha de evaluación"
                            >
                              <Eye className="w-4 h-4" />
                            </button>}
                            <button
                              onClick={() => setDeleteConfirmId(ev.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar evaluación"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#667085]">
                      <div className="max-w-xs mx-auto space-y-2">
                        <AlertCircle className="w-6 h-6 text-[#667085] mx-auto opacity-50" />
                        <p className="font-semibold text-[#031E3C]">No se encontraron evaluaciones</p>
                        <p className="text-[11px] text-[#667085]">Ajusta los filtros seleccionados para ver más resultados.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer of the table */}
          <div className="p-3.5 border-t border-[#E5E8EC] bg-[#F6F7F9] flex items-center justify-between text-xs text-[#667085]">
            <span className="font-medium">
              Total: <strong className="text-[#031E3C] font-kpi">{sortedEvaluations.length}</strong> evaluaciones
            </span>
            <span className="text-[11px] font-medium text-[#667085]">
              C&M · Metodología D+3C y Calidad
            </span>
          </div>

        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-[#031E3C]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-[#031E3C] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#E5E8EC]">
            <h3 className="text-sm font-bold text-[#031E3C] mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              Eliminar Evaluación
            </h3>
            <p className="text-xs text-[#667085] mb-4">
              ¿Estás seguro de que deseas eliminar esta evaluación? Esta acción recalculará los promedios del dashboard en tiempo real.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-xs font-medium text-[#667085] hover:bg-[#F6F7F9] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteEvaluation(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
