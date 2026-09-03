import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { ActionPlan, ActionPlanStatus } from '../../types';
import { CRITERIA_DEFINITIONS } from '../../data/criteriaData';
import { FiltersBar } from '../common/FiltersBar';
import { StatusBadge } from '../common/StatusBadge';
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

  const leaders = useMemo(() => users.filter(u => u.role !== 'ASESOR'), [users]);

  const [viewMode, setViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(!!initialEvaluationForPlan);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<ActionPlan | null>(null);

  // New Plan form state
  const [advisorId, setAdvisorId] = useState<string>(initialEvaluationForPlan?.advisorId || advisors[0]?.id || '');
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

  const filteredPlans = actionPlans.filter(p => {
    if (isAdvisor && p.advisorId !== currentUser.advisorId) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorId || !objective.trim() || !action.trim()) return;

    addActionPlan({
      advisorId,
      evaluationId: initialEvaluationForPlan?.id,
      criterionId,
      objective: objective.trim(),
      action: action.trim(),
      targetDate,
      followUpDate,
      responsibleId,
      status: 'PENDIENTE',
      notes
    });

    setIsNewModalOpen(false);
    if (onClearInitialEvaluation) onClearInitialEvaluation();
  };

  const handleUpdateStatus = (planId: string, status: ActionPlanStatus) => {
    updateActionPlan(planId, { status });
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
                              {advisor?.name || 'Asesor'}
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

                          <div className="pt-2 border-t border-[#E5E8EC] flex items-center justify-between text-[10px] text-[#667085]">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-[#667085]" />
                              <span>Meta: {plan.targetDate}</span>
                            </div>
                            <span className="font-medium text-[#031E3C]">{resp?.name || 'Supervisor'}</span>
                          </div>

                          {/* Quick Status Action Buttons */}
                          <div className="pt-2 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {plan.status !== 'EN_CURSO' && plan.status !== 'COMPLETADO' && (
                              <button
                                onClick={() => handleUpdateStatus(plan.id, 'EN_CURSO')}
                                className="text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                              >
                                Iniciar
                              </button>
                            )}

                            {plan.status !== 'COMPLETADO' && (
                              <button
                                onClick={() => handleUpdateStatus(plan.id, 'COMPLETADO')}
                                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                              >
                                Cumplir
                              </button>
                            )}

                            <button
                              onClick={() => deleteActionPlan(plan.id)}
                              className="text-[10px] text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
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
                        {advisor?.name || 'Asesor'}
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
                        <button
                          onClick={() => deleteActionPlan(plan.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
          <div className="cm-modal max-w-md w-full p-5 animate-in fade-in zoom-in-95">
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
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Asesor</label>
                <select
                  value={advisorId}
                  onChange={(e) => setAdvisorId(e.target.value)}
                  className="w-full bg-[#F6F7F9] border border-[#E5E8EC] text-[#031E3C] rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  required
                >
                  {advisors.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

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
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  Guardar Plan
                </button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

    </div>
  );
};
