import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { ActionPlan, ActionPlanAdvisorMetric, ActionPlanStatus } from '../../types';
import { CRITERIA_DEFINITIONS } from '../../data/criteriaData';
import { FiltersBar } from '../common/FiltersBar';
import { StatusBadge } from '../common/StatusBadge';
import { ActionPlanProgressModal } from './ActionPlanProgressModal';
import { 
  ListTodo, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  User, 
  X, 
  Save, 
  Pencil,
  Trash2, 
  LayoutGrid,
  List,
  Sparkles,
  ArrowRight,
  RotateCcw
} from 'lucide-react';

interface ActionPlansManagerProps {
  initialEvaluationForPlan?: any;
  onClearInitialEvaluation?: () => void;
  onNavigateToEvaluation?: (advisorId?: string) => void;
}

export const ActionPlansManager: React.FC<ActionPlansManagerProps> = ({
  initialEvaluationForPlan,
  onClearInitialEvaluation,
  onNavigateToEvaluation
}) => {
  const { actionPlans, advisors, users, currentUser, addActionPlan, updateActionPlan, deleteActionPlan } = useApp();
  const isAdvisor = currentUser.role === 'ASESOR';
  const isAdmin = currentUser.role === 'ADMINISTRADOR';

  const leaders = useMemo(() => users.filter(u => u.role !== 'ASESOR'), [users]);

  const [viewMode, setViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(!!initialEvaluationForPlan);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<ActionPlan | null>(null);
  const [progressPlan, setProgressPlan] = useState<ActionPlan | null>(null);
  const [requestState, setRequestState] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // New Plan form state
  const [advisorMetrics, setAdvisorMetrics] = useState<ActionPlanAdvisorMetric[]>(initialEvaluationForPlan?.advisorId ? [{ advisorId: initialEvaluationForPlan.advisorId, sphInitial: null, sphUpdated: null, sphRetraining: null, followUpType: 'SEGUIMIENTO_FEEDBACK', observations: '' }] : []);
  const [advisorSearch, setAdvisorSearch] = useState('');
  const [editMetrics, setEditMetrics] = useState<ActionPlanAdvisorMetric[]>([]);
  const [adminEditPlan, setAdminEditPlan] = useState<ActionPlan | null>(null);
  const [adminEditAdvisorIds, setAdminEditAdvisorIds] = useState<string[]>([]);
  const [adminEditMetrics, setAdminEditMetrics] = useState<ActionPlanAdvisorMetric[]>([]);
  const [criterionId, setCriterionId] = useState<string>(
    initialEvaluationForPlan ? CRITERIA_DEFINITIONS.find(c => c.name.toLowerCase().includes(initialEvaluationForPlan.primaryGap.toLowerCase().substring(0, 5)))?.id || 'crit_1_1' : 'crit_1_1'
  );
  const [objective, setObjective] = useState<string>(
    initialEvaluationForPlan ? `Superar brecha en ${initialEvaluationForPlan.primaryGap}` : 'Eliminar muletillas y modular tono de voz en apertura'
  );
  const [action, setAction] = useState<string>(
    initialEvaluationForPlan?.recommendation || 'Microentrenamiento de 15 minutos en técnica de modulación y escucha activa.'
  );
  const [targetDate, setTargetDate] = useState<string>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [followUpDate, setFollowUpDate] = useState<string>(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [responsibleId, setResponsibleId] = useState<string>(() => {
    return users.find(u => u.role === 'SUPERVISOR')?.id || leaders[0]?.id || users[0]?.id || '';
  });
  const [notes, setNotes] = useState<string>('');
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftKey = `cm:action-plan-draft:${currentUser.id}:${initialEvaluationForPlan?.id || 'new'}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (Array.isArray(draft.advisorMetrics)) setAdvisorMetrics(draft.advisorMetrics);
        if (typeof draft.criterionId === 'string') setCriterionId(draft.criterionId);
        if (typeof draft.objective === 'string') setObjective(draft.objective);
        if (typeof draft.action === 'string') setAction(draft.action);
        if (typeof draft.targetDate === 'string') setTargetDate(draft.targetDate);
        if (typeof draft.followUpDate === 'string') setFollowUpDate(draft.followUpDate);
        if (typeof draft.responsibleId === 'string') setResponsibleId(draft.responsibleId);
        if (typeof draft.notes === 'string') setNotes(draft.notes);
        setDraftRestored(true);
        setIsNewModalOpen(true);
      }
    } catch { /* El formulario sigue disponible si el almacenamiento local falla. */ }
    setDraftReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || !isNewModalOpen) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ advisorMetrics, criterionId, objective, action, targetDate, followUpDate, responsibleId, notes })); }
    catch { /* La sesión sigue funcionando aunque el navegador no permita borradores. */ }
  }, [draftReady, isNewModalOpen, draftKey, advisorMetrics, criterionId, objective, action, targetDate, followUpDate, responsibleId, notes]);

  const anchorAdvisor = advisors.find(a => a.id === advisorMetrics[0]?.advisorId);
  const eligibleAdvisors = advisors.filter(a => a.status === 'ACTIVO' && (!anchorAdvisor || (a.campaignId === anchorAdvisor.campaignId && a.operationId === anchorAdvisor.operationId && a.supervisorId === anchorAdvisor.supervisorId)));
  const adminAnchor = advisors.find(a => a.id === adminEditAdvisorIds[0]);
  const adminEligibleAdvisors = advisors.filter(a => a.status === 'ACTIVO' && (!adminAnchor || (a.campaignId === adminAnchor.campaignId && a.operationId === adminAnchor.operationId && a.supervisorId === adminAnchor.supervisorId)));
  const planIds = (plan: ActionPlan) => plan.advisorIds?.length ? plan.advisorIds : [plan.advisorId];
  const planLabel = (plan: ActionPlan) => planIds(plan).map(id => advisors.find(a => a.id === id)?.name || 'Asesor').join(', ');
  const openMetricsEdit = (plan: ActionPlan) => {
    let draft: ActionPlanAdvisorMetric[] | null = null;
    try { draft = JSON.parse(localStorage.getItem(`cm:action-plan-metrics:${currentUser.id}:${plan.id}`) || 'null'); } catch {}
    setSelectedPlanForEdit(plan);
    setEditMetrics(Array.isArray(draft) ? draft : plan.advisorMetrics || planIds(plan).map(advisorId => ({ advisorId, sphInitial: null, sphUpdated: null, sphRetraining: null, followUpType: 'SEGUIMIENTO_FEEDBACK', observations: '' })));
  };
  useEffect(() => {
    if (!selectedPlanForEdit) return;
    try { localStorage.setItem(`cm:action-plan-metrics:${currentUser.id}:${selectedPlanForEdit.id}`, JSON.stringify(editMetrics)); } catch {}
  }, [selectedPlanForEdit, editMetrics, currentUser.id]);
  const openAdminEdit = (plan: ActionPlan) => {
    const ids = planIds(plan);
    let draft: { plan?: ActionPlan; ids?: string[]; metrics?: ActionPlanAdvisorMetric[] } = {};
    try { draft = JSON.parse(localStorage.getItem(`cm:action-plan-edit:${currentUser.id}:${plan.id}`) || '{}'); } catch {}
    setAdminEditPlan(draft.plan?.id === plan.id ? draft.plan : plan);
    setAdminEditAdvisorIds(draft.ids?.length ? draft.ids : ids);
    setAdminEditMetrics(draft.metrics || plan.advisorMetrics || ids.map(advisorId => ({ advisorId, sphInitial: null, sphUpdated: null, sphRetraining: null, followUpType: 'SEGUIMIENTO_FEEDBACK', observations: '' })));
  };
  useEffect(() => {
    if (!adminEditPlan) return;
    try { localStorage.setItem(`cm:action-plan-edit:${currentUser.id}:${adminEditPlan.id}`, JSON.stringify({ plan: adminEditPlan, ids: adminEditAdvisorIds, metrics: adminEditMetrics })); } catch {}
  }, [adminEditPlan, adminEditAdvisorIds, adminEditMetrics, currentUser.id]);
  const metricFields = (rows: ActionPlanAdvisorMetric[], setRows: React.Dispatch<React.SetStateAction<ActionPlanAdvisorMetric[]>>, readOnly = false) => rows.map((row, index) => (
    <div key={row.advisorId} className="rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] p-3 space-y-2">
      <div className="font-semibold text-[#031E3C]">{advisors.find(a => a.id === row.advisorId)?.name || 'Asesor'}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([
          ['sphInitial', 'sphInitialDate', 'inicial'],
          ['sphRetraining', 'sphRetrainingDate', 'reentrenamiento'],
          ['sphUpdated', 'sphUpdatedDate', 'actualizado'],
        ] as const).map(([valueKey, dateKey, label]) => <div key={valueKey} className="space-y-2">
          <label className="block">SPH {label}<input type="number" min="0" step="any" required={valueKey === 'sphInitial' && !readOnly} disabled={readOnly} value={row[valueKey] ?? ''} onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, [valueKey]: e.target.value === '' ? null : Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-white px-3 py-2" /></label>
          <label className="block">Fecha SPH {label}<input type="date" disabled={readOnly} value={row[dateKey] || ''} onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, [dateKey]: e.target.value } : item))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-white px-3 py-2" /></label>
        </div>)}
      </div>
      <label className="flex items-center gap-2 text-[#031E3C]"><input type="checkbox" disabled={readOnly} checked={row.followUpType === 'REENTRENAMIENTO'} onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, followUpType: e.target.checked ? 'REENTRENAMIENTO' : 'SEGUIMIENTO_FEEDBACK' } : item))} />{row.followUpType === 'REENTRENAMIENTO' ? 'Tuvo reentrenamiento' : 'Solo seguimiento por feedback'}</label>
      <label className="block">Observaciones<textarea rows={2} disabled={readOnly} value={row.observations} onChange={e => setRows(prev => prev.map((item, i) => i === index ? { ...item, observations: e.target.value } : item))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-white px-3 py-2" /></label>
    </div>
  ));

  const filteredPlans = actionPlans.filter(p => {
    if (isAdvisor && !planIds(p).includes(currentUser.advisorId || '')) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorMetrics.length || advisorMetrics.some(row => row.sphInitial === null || !Number.isFinite(row.sphInitial) || row.sphInitial < 0) || !objective.trim() || !action.trim()) { setRequestState({ type: 'error', text: 'Selecciona asesores y registra el SPH inicial de cada uno.' }); return; }
    setSaving(true); setRequestState(null);
    try {
      await addActionPlan({ advisorId: advisorMetrics[0].advisorId, advisorIds: advisorMetrics.map(row => row.advisorId), advisorMetrics, evaluationId: initialEvaluationForPlan?.id, criterionId, objective: objective.trim(), action: action.trim(), targetDate, followUpDate, responsibleId, status: 'PENDIENTE', notes });
      try { localStorage.removeItem(draftKey); } catch {}
      setDraftRestored(false);
      setIsNewModalOpen(false); setRequestState({ type: 'success', text: 'Plan de acción guardado correctamente.' });
      if (onClearInitialEvaluation) onClearInitialEvaluation();
    } catch (error) { const message = error instanceof Error ? error.message : 'No fue posible guardar el plan.'; setRequestState({ type: 'error', text: /sesi[oó]n no v[aá]lida|expirada/i.test(message) ? 'La sesión expiró. Vuelve a iniciar sesión: el borrador del plan quedó guardado en este navegador.' : message }); }
    finally { setSaving(false); }
  };

  const handleUpdateStatus = async (planId: string, status: ActionPlanStatus) => {
    setRequestState(null);
    try { await updateActionPlan(planId, { status }); setRequestState({ type: 'success', text: 'Estado actualizado.' }); }
    catch (error) { setRequestState({ type: 'error', text: error instanceof Error ? error.message : 'No fue posible actualizar el plan.' }); }
  };

  const handleSaveMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForEdit) return;
    setSaving(true); setRequestState(null);
    try {
      await updateActionPlan(selectedPlanForEdit.id, { advisorMetrics: editMetrics });
      try { localStorage.removeItem(`cm:action-plan-metrics:${currentUser.id}:${selectedPlanForEdit.id}`); } catch {}
      setSelectedPlanForEdit(null);
      setRequestState({ type: 'success', text: 'SPH y observaciones guardados.' });
    } catch (error) { setRequestState({ type: 'error', text: error instanceof Error ? error.message : 'No fue posible actualizar el plan.' }); }
    finally { setSaving(false); }
  };

  const handleSaveAdminPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditPlan || !adminEditAdvisorIds.length) return;
    setSaving(true); setRequestState(null);
    try {
      await updateActionPlan(adminEditPlan.id, {
        ...adminEditPlan,
        advisorId: adminEditAdvisorIds[0],
        advisorIds: adminEditAdvisorIds,
        advisorMetrics: adminEditMetrics.map(row => ({ ...row, advisorId: row.advisorId })).filter(row => adminEditAdvisorIds.includes(row.advisorId)),
      });
      try { localStorage.removeItem(`cm:action-plan-edit:${currentUser.id}:${adminEditPlan.id}`); } catch {}
      setAdminEditPlan(null);
      setRequestState({ type: 'success', text: 'Plan actualizado correctamente.' });
    } catch (error) { setRequestState({ type: 'error', text: error instanceof Error ? error.message : 'No fue posible actualizar el plan.' }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (planId: string) => {
    if (!window.confirm('¿Eliminar este plan de acción?')) return;
    setRequestState(null);
    try { await deleteActionPlan(planId); setRequestState({ type: 'success', text: 'Plan eliminado.' }); }
    catch (error) { setRequestState({ type: 'error', text: error instanceof Error ? error.message : 'No fue posible eliminar el plan.' }); }
  };

  const statusColumns: { id: ActionPlanStatus; label: string; bg: string; dot: string }[] = [
    { id: 'PENDIENTE', label: 'Pendientes', bg: 'bg-amber-500/10 border-amber-200', dot: 'bg-amber-500' },
    { id: 'EN_CURSO', label: 'En Curso', bg: 'bg-blue-500/10 border-blue-200', dot: 'bg-blue-500' },
    { id: 'COMPLETADO', label: 'Cumplidos', bg: 'bg-emerald-500/10 border-emerald-200', dot: 'bg-emerald-500' },
    { id: 'VENCIDO', label: 'Vencidos', bg: 'bg-rose-500/10 border-rose-200', dot: 'bg-rose-500' }
  ];

  return (
    <div className="cm-workspace cm-plans flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F6F7F9]">
      
      {/* Global Filters */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-4">
        
        {/* Compact Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#031E3C] tracking-tight font-heading">
              PDA
            </h2>
            <p className="text-xs text-[#667085] mt-0.5 font-medium">
              Compromisos de mejora, microentrenamientos y seguimiento
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex items-center bg-white border border-[#E5E8EC] p-0.5 rounded-lg text-xs text-[#667085]">
              <button
                onClick={() => setViewMode('KANBAN')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'KANBAN' ? 'bg-[#031E3C] text-white font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'TABLE' ? 'bg-[#031E3C] text-white font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabla</span>
              </button>
            </div>

            {!isAdvisor && <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#FF6B00] hover:bg-[#e05e00] text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Plan</span>
            </button>}
          </div>
        </div>

        {requestState && <div role="status" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${requestState.type === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{requestState.text}</div>}

        {/* View Content */}
        {viewMode === 'KANBAN' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statusColumns.map(col => {
              const plansInCol = filteredPlans.filter(p => p.status === col.id);

              return (
                <div 
                  key={col.id}
                  className="bg-white border border-[#E5E8EC] rounded-xl p-3.5 flex flex-col min-h-[480px] shadow-2xs"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E5E8EC]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                      <h3 className="font-bold text-xs text-[#031E3C] uppercase tracking-wider font-heading">
                        {col.label}
                      </h3>
                    </div>
                    <span className="text-xs font-bold text-[#667085] bg-[#F6F7F9] px-2 py-0.5 rounded-md border border-[#E5E8EC]">
                      {plansInCol.length}
                    </span>
                  </div>

                  {/* Cards in Column */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {plansInCol.map(plan => {
                      const advisor = advisors.find(a => a.id === plan.advisorId);
                      const resp = users.find(u => u.id === plan.responsibleId);
                      const crit = CRITERIA_DEFINITIONS.find(c => c.id === plan.criterionId);

                      return (
                        <div 
                          key={plan.id}
                          className="p-3 bg-[#F6F7F9] hover:bg-white border border-[#E5E8EC] hover:border-[#FF6B00]/40 rounded-lg transition-all space-y-2 group shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-bold text-xs text-[#031E3C]">
                              {planIds(plan).length > 1 ? `${planIds(plan).length} asesores` : advisor?.name || 'Asesor'}
                            </p>
                            <span className="text-[9px] font-semibold text-[#667085] bg-white px-1.5 py-0.5 rounded border border-[#E5E8EC]">
                              {crit?.dimension || '3C'}
                            </span>
                          </div>

                          <p className="text-xs text-[#031E3C] font-medium line-clamp-2">
                            {plan.objective}
                          </p>

                          <p className="text-[11px] text-[#667085] bg-white p-2 rounded border border-[#E5E8EC]/80 italic">
                            "{plan.action}"
                          </p>
                          <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setProgressPlan(plan)} className="text-[11px] font-semibold text-[#007EA8] hover:underline text-left">Ver avance</button><button type="button" onClick={() => openMetricsEdit(plan)} className="text-[11px] font-semibold text-[#007EA8] hover:underline text-left">Ver SPH y seguimiento</button>{isAdmin && <button type="button" onClick={() => openAdminEdit(plan)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF6B00] hover:underline"><Pencil className="h-3 w-3" />Editar todo</button>}</div>

                          <div className="pt-2 border-t border-[#E5E8EC] flex items-center justify-between text-[10px] text-[#667085]">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-[#667085]" />
                              <span>Meta: {plan.targetDate}</span>
                            </div>
                            <span className="font-medium text-[#031E3C]">{resp?.name || 'Supervisor'}</span>
                          </div>

                          {/* Quick Status Action Buttons */}
                          <div className="pt-2 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {(!isAdvisor || planIds(plan).length === 1) && plan.status !== 'EN_CURSO' && plan.status !== 'COMPLETADO' && (
                              <button
                                onClick={() => handleUpdateStatus(plan.id, 'EN_CURSO')}
                                className="text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                              >
                                Iniciar
                              </button>
                            )}

                            {(!isAdvisor || planIds(plan).length === 1) && plan.status !== 'COMPLETADO' && (
                              <button
                                onClick={() => handleUpdateStatus(plan.id, 'COMPLETADO')}
                                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                              >
                                Cumplir
                              </button>
                            )}

                            {!isAdvisor && <button
                              onClick={() => void handleDelete(plan.id)}
                              className="text-[10px] text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>}
                          </div>

                        </div>
                      );
                    })}

                    {plansInCol.length === 0 && (
                      <div className="h-32 border border-dashed border-[#E5E8EC] rounded-lg flex items-center justify-center text-center p-3">
                        <span className="text-[11px] text-[#667085]">Sin planes en este estado</span>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="bg-white border border-[#E5E8EC] rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[#F6F7F9] border-b border-[#E5E8EC] text-[11px] font-bold text-[#667085] uppercase tracking-wider font-heading">
                <tr>
                  <th className="py-3 px-4">Asesor</th>
                  <th className="py-3 px-3">Objetivo</th>
                  <th className="py-3 px-3">Acción de Mejora</th>
                  <th className="py-3 px-3">Fecha Meta</th>
                  <th className="py-3 px-3">Responsable</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8EC]">
                {filteredPlans.map(plan => {
                  const advisor = advisors.find(a => a.id === plan.advisorId);
                  const resp = users.find(u => u.id === plan.responsibleId);

                  return (
                    <tr key={plan.id} className="hover:bg-[#F6F7F9]/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#031E3C]">
                        {planIds(plan).length > 1 ? `${planIds(plan).length} asesores: ${planLabel(plan)}` : advisor?.name || 'Asesor'}
                      </td>
                      <td className="py-3 px-3 text-[#031E3C] max-w-xs truncate">
                        {plan.objective}
                      </td>
                      <td className="py-3 px-3 text-[#667085] max-w-xs truncate">
                        {plan.action}
                      </td>
                      <td className="py-3 px-3 text-[#031E3C] font-mono text-[11px]">
                        {plan.targetDate}
                      </td>
                      <td className="py-3 px-3 text-[#667085]">
                        {resp?.name || 'Supervisor'}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={plan.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button type="button" onClick={() => setProgressPlan(plan)} className="mr-2 text-[#007EA8] hover:underline">Ver avance</button>
                        <button type="button" onClick={() => openMetricsEdit(plan)} className="mr-2 text-[#007EA8] hover:underline">SPH</button>
                        {isAdmin && <button type="button" onClick={() => openAdminEdit(plan)} className="mr-2 inline-flex items-center gap-1 text-[#FF6B00] hover:underline"><Pencil className="h-3 w-3" />Editar todo</button>}
                        {!isAdvisor && <button
                          onClick={() => void handleDelete(plan.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* New Plan Modal */}
      {isNewModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#031E3C]/60 p-4 backdrop-blur-xs">
          <div className="cm-modal max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E8EC]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center">
                  <ListTodo className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#031E3C] font-heading">
                  Nuevo Plan de Acción 3C
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsNewModalOpen(false);
                  if (onClearInitialEvaluation) onClearInitialEvaluation();
                }}
                className="p-1 text-[#667085] hover:text-[#031E3C] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 pt-4 text-xs">
              {draftRestored && <p role="status" className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sky-800">Se recuperó tu borrador guardado en este navegador.</p>}
              {requestState?.type === 'error' && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">{requestState.text}</p>}
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Grupo de asesores</label>
                <input type="search" value={advisorSearch} onChange={e => setAdvisorSearch(e.target.value)} placeholder="Buscar asesor" className="w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" />
                <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] p-2 space-y-1">
                  {eligibleAdvisors.filter(a => a.name.toLowerCase().includes(advisorSearch.toLowerCase())).map(a => <label key={a.id} className="flex items-center gap-2 p-1"><input type="checkbox" checked={advisorMetrics.some(row => row.advisorId === a.id)} disabled={a.id === initialEvaluationForPlan?.advisorId} onChange={e => setAdvisorMetrics(prev => e.target.checked ? [...prev, { advisorId: a.id, sphInitial: null, sphUpdated: null, sphRetraining: null, followUpType: 'SEGUIMIENTO_FEEDBACK', observations: '' }] : prev.filter(row => row.advisorId !== a.id))} />{a.name}</label>)}
                </div>
                <p className="mt-1 text-[#667085]">El grupo debe compartir campaña, operación y supervisor.</p>
              </div>
              {advisorMetrics.length > 0 && <div className="space-y-2"><p className="font-semibold text-[#031E3C]">Seguimiento por asesor</p>{metricFields(advisorMetrics, setAdvisorMetrics)}</div>}

              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Criterio 3C a Trabajar</label>
                <select
                  value={criterionId}
                  onChange={(e) => setCriterionId(e.target.value)}
                  className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  required
                >
                  {CRITERIA_DEFINITIONS.map(c => (
                    <option key={c.id} value={c.id}>[{c.dimension}] {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Objetivo Específico</label>
                <input
                  type="text"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Ej. Modular voz y asegurar beneficios de BiPay"
                  className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Acción / Intervención</label>
                <textarea
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  rows={3}
                  placeholder="Detalla el microentrenamiento o práctica guiada..."
                  className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#031E3C] mb-1">Fecha Meta</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#031E3C] mb-1">Responsable</label>
                  <select
                    value={responsibleId}
                    onChange={(e) => setResponsibleId(e.target.value)}
                    className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2"
                  >
                    {leaders.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="block font-semibold text-[#031E3C]">Observaciones generales<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>

              <div className="pt-3 border-t border-[#E5E8EC] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-[#667085] hover:bg-[#F6F7F9] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  {saving ? 'Guardando…' : 'Guardar Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {adminEditPlan && isAdmin && createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#031E3C]/60 p-4 backdrop-blur-xs"><div className="cm-modal max-w-3xl w-full max-h-[92vh] overflow-y-auto p-5"><div className="flex justify-between items-center border-b border-[#E5E8EC] pb-3"><div><p className="text-[10px] font-bold uppercase text-[#FF6B00]">Administración</p><h3 className="font-bold text-[#031E3C]">Editar plan de acción completo</h3></div><button type="button" onClick={() => setAdminEditPlan(null)} aria-label="Cerrar"><X className="w-5 h-5" /></button></div><form onSubmit={handleSaveAdminPlan} className="space-y-3 pt-4 text-xs">
        <div><label className="block font-semibold text-[#031E3C]">Grupo de asesores</label><div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] p-2">{adminEligibleAdvisors.map(a => <label key={a.id} className="flex items-center gap-2 p-1"><input type="checkbox" checked={adminEditAdvisorIds.includes(a.id)} onChange={e => { setAdminEditAdvisorIds(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id)); setAdminEditMetrics(rows => e.target.checked ? [...rows, { advisorId: a.id, sphInitial: null, sphUpdated: null, sphRetraining: null, followUpType: 'SEGUIMIENTO_FEEDBACK', observations: '' }] : rows.filter(row => row.advisorId !== a.id)); }} />{a.name}</label>)}</div></div>
        <div><label className="block font-semibold text-[#031E3C]">Criterio 3C</label><select value={adminEditPlan.criterionId || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, criterionId: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2">{CRITERIA_DEFINITIONS.map(c => <option key={c.id} value={c.id}>[{c.dimension}] {c.name}</option>)}</select></div>
        <label className="block font-semibold text-[#031E3C]">Objetivo<input value={adminEditPlan.objective || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, objective: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <label className="block font-semibold text-[#031E3C]">Acción / Intervención<textarea rows={3} value={adminEditPlan.action || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, action: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <div className="grid grid-cols-2 gap-2"><label className="font-semibold text-[#031E3C]">Fecha meta<input type="date" value={adminEditPlan.targetDate || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, targetDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label><label className="font-semibold text-[#031E3C]">Fecha de seguimiento<input type="date" value={adminEditPlan.followUpDate || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, followUpDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label><label className="font-semibold text-[#031E3C]">Fecha límite<input type="date" value={adminEditPlan.dueDate || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, dueDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label><label className="font-semibold text-[#031E3C]">Fecha completado<input type="date" value={adminEditPlan.completedDate || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, completedDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label></div>
        <div className="grid grid-cols-2 gap-2"><label className="font-semibold text-[#031E3C]">Responsable<select value={adminEditPlan.responsibleId || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, responsibleId: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2">{leaders.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label><label className="font-semibold text-[#031E3C]">Estado<select value={adminEditPlan.status} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, status: e.target.value as ActionPlanStatus }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2">{statusColumns.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label></div>
        {adminEditMetrics.length > 0 && <div className="space-y-2"><p className="font-semibold text-[#031E3C]">SPH y seguimiento por asesor</p>{metricFields(adminEditMetrics, setAdminEditMetrics)}</div>}
        <label className="block font-semibold text-[#031E3C]">Observaciones generales<textarea rows={2} value={adminEditPlan.notes || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, notes: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <label className="block font-semibold text-[#031E3C]">Comentarios<textarea rows={2} value={adminEditPlan.comments || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, comments: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <label className="block font-semibold text-[#031E3C]">Evidencia<textarea rows={2} value={adminEditPlan.evidence || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, evidence: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <label className="block font-semibold text-[#031E3C]">Resultado<textarea rows={2} value={adminEditPlan.result || ''} onChange={e => setAdminEditPlan(prev => prev && ({ ...prev, result: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-3 py-2" /></label>
        <div className="flex justify-end gap-2 border-t border-[#E5E8EC] pt-3"><button type="button" onClick={() => setAdminEditPlan(null)} className="px-3 py-2 font-semibold text-[#667085]">Cancelar</button><button disabled={saving || !adminEditAdvisorIds.length} type="submit" className="rounded-lg bg-[#FF6B00] px-4 py-2 font-semibold text-white">{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </form></div></div>, document.body)}

      {selectedPlanForEdit && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#031E3C]/60 p-4 backdrop-blur-xs"><div className="cm-modal max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5"><div className="flex justify-between items-center border-b border-[#E5E8EC] pb-3"><h3 className="font-bold text-[#031E3C]">SPH y observaciones · {planIds(selectedPlanForEdit).length} asesor(es)</h3><button onClick={() => setSelectedPlanForEdit(null)} aria-label="Cerrar"><X className="w-5 h-5" /></button></div><p className="text-xs text-[#667085] my-3">{selectedPlanForEdit.objective}</p><form onSubmit={handleSaveMetrics} className="space-y-3 text-xs">{editMetrics.length ? metricFields(editMetrics, setEditMetrics, isAdvisor) : <p className="text-[#667085]">Este plan anterior no tiene SPH registrado.</p>}{!isAdvisor && editMetrics.length > 0 && <div className="flex justify-end"><button disabled={saving} type="submit" className="rounded-lg bg-[#FF6B00] px-4 py-2 font-semibold text-white">{saving ? 'Guardando…' : 'Guardar seguimiento'}</button></div>}</form></div></div>, document.body)}
      {progressPlan && <ActionPlanProgressModal plan={actionPlans.find(plan => plan.id === progressPlan.id) || progressPlan} advisors={advisors} onlyAdvisorId={isAdvisor ? currentUser.advisorId : undefined} onClose={() => setProgressPlan(null)} />}

    </div>
  );
};
