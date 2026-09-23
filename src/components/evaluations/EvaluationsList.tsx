import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { Evaluation } from '../../types';
import { SpeechAnalyticsImportModal } from './SpeechAnalyticsImportModal';
import { ResolveAdvisorModal } from './ResolveAdvisorModal';
import { SpeechAnalyticsBatches, SpeechAnalyticsBatchSummary, batchDate, displayBatchDate } from './SpeechAnalyticsBatches';
import { speechImportApi } from '../../api/sharedRepository';
import { FiltersBar } from '../common/FiltersBar';
import { ThreeScore } from '../common/ThreeScore';
import { StatusBadge } from '../common/StatusBadge';
import { SPEECH_TYPIFICATIONS } from '../../utils/speechTypification';
import { 
  Eye, 
  Trash2, 
  ArrowUpDown, 
  Phone, 
  Calendar,
  AlertCircle,
  FileUp,
  Link2,
  ArrowLeft
} from 'lucide-react';

interface EvaluationsListProps {
  onOpenNewEvaluation: () => void;
  onSelectEvaluation: (evaluation: Evaluation) => void;
}

export const EvaluationsList: React.FC<EvaluationsListProps> = ({ 
  onSelectEvaluation, onOpenNewEvaluation
}) => {
  const { evaluations, filteredEvaluations, advisors, campaigns, users, currentUser, deleteEvaluation, refreshEvaluations } = useApp();
  const [sortField, setSortField] = useState<'date' | 'score' | 'advisor'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<{ id: string; name: string; count: number } | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [deleteBatchError, setDeleteBatchError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'QUALITY' | 'D3C'>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'VENTA' | 'NO_VENTA'>('ALL');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'PENDIENTE' | 'FINALIZADA'>('ALL');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedBatchDate, setSelectedBatchDate] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<Evaluation | null>(null);
  const isAdvisor = currentUser.role === 'ASESOR';
  const isReadOnly = ['ASESOR', 'SUPERVISOR'].includes(currentUser.role);
  const canDelete = ['ADMINISTRADOR', 'CONSULTOR'].includes(currentUser.role);
  const canImport = ['ADMINISTRADOR', 'CONSULTOR', 'MONITOR'].includes(currentUser.role);
  const batchEvaluations = selectedBatchDate ? filteredEvaluations.filter(ev => ev.origin === 'SPEECH_ANALYTICS' && batchDate(ev) === selectedBatchDate) : [];
  const visibleEvaluations = filteredEvaluations.filter(ev => {
    if (selectedBatchDate ? ev.origin !== 'SPEECH_ANALYTICS' || batchDate(ev) !== selectedBatchDate : ev.origin === 'SPEECH_ANALYTICS') return false;
    if (typeFilter !== 'ALL' && ev.evaluationType !== typeFilter) return false;
    if (resultFilter !== 'ALL' && (ev.sale ? 'VENTA' : 'NO_VENTA') !== resultFilter) return false;
    const state = ev.validationStatus === 'AUTOMATIC_PENDING' || ev.validationStatus === 'PENDIENTE_AUTOMATICO' ? 'PENDIENTE' : 'FINALIZADA';
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
      <FiltersBar
        visibleCount={visibleEvaluations.length}
        extraFilterCount={Number(typeFilter !== 'ALL') + Number(resultFilter !== 'ALL') + Number(stateFilter !== 'ALL')}
        onResetExtraFilters={() => { setTypeFilter('ALL'); setResultFilter('ALL'); setStateFilter('ALL'); }}
        extraFilters={<div className="space-y-3">
          <label className="block text-xs font-semibold">Tipo<select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="cm-select mt-1.5 w-full px-3 py-2"><option value="ALL">Todas</option><option value="QUALITY">Calidad</option><option value="D3C">Mejora Continua</option></select></label>
          <label className="block text-xs font-semibold">Resultado<select value={resultFilter} onChange={event => setResultFilter(event.target.value as typeof resultFilter)} className="cm-select mt-1.5 w-full px-3 py-2"><option value="ALL">Todo resultado</option><option value="VENTA">Venta</option><option value="NO_VENTA">No venta</option></select></label>
          <label className="block text-xs font-semibold">Estado<select value={stateFilter} onChange={event => setStateFilter(event.target.value as typeof stateFilter)} className="cm-select mt-1.5 w-full px-3 py-2"><option value="ALL">Todo estado</option><option value="PENDIENTE">Pendiente de revisión</option><option value="FINALIZADA">Finalizada</option></select></label>
        </div>}
      />

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-4">
        {selectedBatchDate && <button type="button" onClick={() => setSelectedBatchDate(null)} className="cm-button-secondary px-3 py-2 text-xs font-bold"><ArrowLeft className="h-4 w-4"/>Volver a evaluaciones manuales</button>}
        
        {/* Compact Page Header (No redundant big cards) */}
        <div className="cm-page-heading flex items-center justify-between pb-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#031E3C] tracking-tight font-heading">
              {selectedBatchDate ? `Speech Analytics · ${displayBatchDate(selectedBatchDate)}` : isAdvisor ? 'Mis evaluaciones manuales' : 'Evaluaciones manuales'}
            </h2>
            <p className="text-xs text-[#667085] mt-0.5 font-medium">
              {visibleEvaluations.length} {visibleEvaluations.length === 1 ? 'registro encontrado' : 'registros encontrados'}
            </p>
          </div><div className="flex flex-wrap items-center justify-end gap-2">{canImport&&<button onClick={()=>setImportOpen(true)} className="cm-button-secondary px-3 py-2 text-xs font-bold"><FileUp className="h-4 w-4"/>IMPORTAR</button>}{!isReadOnly && <button onClick={onOpenNewEvaluation} className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#1FD6FF] to-[#2E7BFF] px-3 py-2 text-xs font-bold text-[#031326]"><Phone className="h-4 w-4" />Nueva evaluación</button>}</div>
        </div>

        {selectedBatchDate ? <SpeechAnalyticsBatchSummary evaluations={batchEvaluations} onDeleteBatch={currentUser.role === 'ADMINISTRADOR' ? batch => { setDeleteBatchError(null); setDeleteBatchTarget({...batch,count:evaluations.filter(item => item.origin === 'SPEECH_ANALYTICS' && item.sourceBatchId === batch.id).length}); } : undefined}/> : <SpeechAnalyticsBatches evaluations={filteredEvaluations} campaigns={campaigns} onOpen={setSelectedBatchDate}/>}

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
                    const nonEvaluable = ev.origin === 'SPEECH_ANALYTICS' && ev.speechTypification === 'CORTA_LLAMADA';
                    const advisor = advisors.find(a => a.id === ev.advisorId);
                    const supervisor = users.find(u => u.id === ev.supervisorId);
                    const rawScore = ev.evaluationType === 'QUALITY' ? (ev.technicalScore ?? ev.scoreTotal) : ev.scoreTotal;
                    const hasScore = rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore));
                    const displayedScore = hasScore ? Number(rawScore) : null;

                    return (
                      <tr 
                        key={ev.id} 
                        className="hover:bg-[#F6F7F9]/80 transition-colors group cursor-pointer"
                        onClick={() => onSelectEvaluation(ev)}
                      >
                        
                        {/* 1. Asesor (Name + Subtitle: Supervisor · ID llamada) */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#031E3C] text-xs">
                            {advisor?.name || ev.sourceAdvisorName || 'Asesor por relacionar'}
                          </div>
                          {ev.advisorResolutionStatus==='PENDING'&&<div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700"><AlertCircle className="h-3 w-3"/>Asesor no se encuentra en rotación</div>}
                          <div className="text-[11px] text-[#667085] flex items-center gap-1.5 mt-0.5">
                            <span>{supervisor?.name || 'Supervisor'}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-[10px] text-slate-500">{ev.callId}</span>
                          </div>
                        </td>

                        {/* 2. Evaluación (Date + Type badge) */}
                        <td className="py-3 px-3">
                          <div className="text-[11px] font-medium text-[#031E3C]">{ev.date}</div>
                          <div className="mt-0.5">
                            <StatusBadge status={ev.type} size="sm" showIcon={false} />
                          </div>
                        </td>

                        <td className="py-3 px-3"><div className="flex flex-wrap gap-1"><span className="cm-badge">{ev.evaluationType === 'QUALITY' ? 'Calidad' : 'Mejora Continua'}</span>{ev.origin==='SPEECH_ANALYTICS'&&<><span className="cm-badge cm-badge--info" title="Speech Analytics">SA</span><span className="cm-badge">{SPEECH_TYPIFICATIONS.find(item=>item.value===ev.speechTypification)?.label||'Sin tipificación'}</span></>}</div></td>

                        {/* 3. Score 3C (Numeric Badge) */}
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block text-xs font-bold font-kpi px-2.5 py-1 rounded-md border ${nonEvaluable || displayedScore === null ? 'bg-slate-50 text-slate-600 border-slate-200' : getScoreBadgeClass(displayedScore)}`}>
                            {nonEvaluable ? 'No evaluable' : displayedScore === null ? 'N/A' : `${displayedScore}%`}
                          </span>
                          {ev.qualityResult && !nonEvaluable && <div className={`mt-1 text-[9px] font-bold ${ev.qualityResult === 'REPROBADA' ? 'text-red-600' : 'text-emerald-600'}`}>{ev.qualityResult}</div>}
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
                            <button
                              onClick={() => onSelectEvaluation(ev)}
                              className="p-1.5 text-[#667085] hover:text-[#FF6B00] hover:bg-[#FF6B00]/10 rounded-lg transition-colors"
                              title="Ver ficha de evaluación"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {ev.advisorResolutionStatus==='PENDING'&&canImport&&<button onClick={()=>setLinkTarget(ev)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Relacionar con asesor"><Link2 className="h-4 w-4"/></button>}
                            {canDelete && <button
                              onClick={() => { setDeleteError(null); setDeleteConfirmId(ev.id); }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar evaluación"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>}
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

      {deleteBatchTarget && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-batch-title">
          <div className="cm-modal w-full max-w-sm rounded-xl border border-rose-400/30 p-5 shadow-2xl">
            <h3 id="delete-batch-title" className="flex items-center gap-2 text-sm font-bold"><Trash2 className="h-4 w-4 text-rose-600"/>¿Eliminar esta carga SA?</h3>
            <p className="mt-2 text-xs text-[var(--cm-text-secondary)]">Se eliminarán definitivamente las {deleteBatchTarget.count} evaluaciones de <b>{deleteBatchTarget.name}</b> y sus feedbacks asociados. Las otras cargas de la carpeta permanecerán intactas.</p>
            {deleteBatchError && <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">{deleteBatchError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={deletingBatch} onClick={() => setDeleteBatchTarget(null)} className="cm-button-secondary px-3 py-2 text-xs">Cancelar</button><button type="button" disabled={deletingBatch} onClick={async () => {
              if (!deleteBatchTarget) return;
              setDeletingBatch(true); setDeleteBatchError(null);
              try {
                const { deleted } = await speechImportApi.deleteBatch(deleteBatchTarget.id);
                const refreshed = await refreshEvaluations();
                if (selectedBatchDate && !refreshed.some(item => item.origin === 'SPEECH_ANALYTICS' && batchDate(item) === selectedBatchDate)) setSelectedBatchDate(null);
                setDeleteBatchTarget(null);
                setDeleteSuccess(`La carga ${deleteBatchTarget.name} fue eliminada correctamente (${deleted} evaluaciones).`);
              } catch (error) { setDeleteBatchError(error instanceof Error ? error.message : 'No fue posible eliminar la carga.'); }
              finally { setDeletingBatch(false); }
            }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60">{deletingBatch ? 'Eliminando…' : 'Sí, eliminar carga'}</button></div>
          </div>
        </div>, document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && createPortal(
        <div className="fixed inset-0 z-[300] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-evaluation-title">
          <div className="cm-modal text-[#031E3C] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-red-400/30">
            <h3 className="text-sm font-bold text-[#031E3C] mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              <span id="delete-evaluation-title">¿Eliminar esta evaluación?</span>
            </h3>
            <p className="text-xs text-[#667085] mb-4">
              Esta acción eliminará definitivamente la evaluación y sus registros asociados. Los promedios del dashboard se recalcularán automáticamente.
            </p>
            {deleteError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={Boolean(deletingId)}
                className="px-3 py-1.5 text-xs font-medium text-[#667085] hover:bg-[#F6F7F9] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (deletingId) return;
                  setDeletingId(deleteConfirmId);
                  setDeleteError(null);
                  try {
                    const target = filteredEvaluations.find(evaluation => evaluation.id === deleteConfirmId);
                    const advisorName = advisors.find(advisor => advisor.id === target?.advisorId)?.name;
                    await deleteEvaluation(deleteConfirmId);
                    setDeleteConfirmId(null);
                    setDeleteSuccess(advisorName ? `La evaluación de ${advisorName} fue eliminada correctamente.` : 'La evaluación fue eliminada correctamente.');
                  } catch (error) {
                    setDeleteError(error instanceof Error ? error.message : 'No fue posible eliminar la evaluación.');
                  } finally {
                    setDeletingId(null);
                  }
                }}
                disabled={Boolean(deletingId)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteSuccess && createPortal(
        <div className="fixed inset-0 z-[310] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-success-title">
          <div className="cm-modal max-w-sm w-full rounded-xl border border-emerald-400/30 p-5 shadow-2xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <span className="text-xl" aria-hidden="true">✓</span>
            </div>
            <h3 id="delete-success-title" className="text-sm font-bold text-[#031E3C]">{deleteSuccess.startsWith('La carga') ? 'Carga eliminada' : 'Evaluación eliminada'}</h3>
            <p className="mt-2 text-xs text-[#667085]">{deleteSuccess}</p>
            <div className="mt-5 flex justify-end border-t border-[#E5E8EC] pt-4">
              <button autoFocus onClick={() => setDeleteSuccess(null)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">Entendido</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {importOpen&&<SpeechAnalyticsImportModal onClose={()=>setImportOpen(false)} onImported={refreshEvaluations}/>}

      {linkTarget&&<ResolveAdvisorModal key={linkTarget.id} evaluation={linkTarget} onClose={()=>setLinkTarget(null)}/>}

    </div>
  );
};
