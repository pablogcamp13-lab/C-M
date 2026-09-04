import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FiltersBar } from '../common/FiltersBar';
import { ThreeScore } from '../common/ThreeScore';
import { StatusBadge } from '../common/StatusBadge';
import { classifyPriority, calculateAdvisorTenure } from '../../utils/calculations';
import { ImportAdvisorsModal } from './ImportAdvisorsModal';
import { 
  Users, 
  UserPlus, 
  FileSpreadsheet,
  ArrowUpDown, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Calendar,
  Clock,
  History,
  Activity,
  Trash2,
  AlertTriangle
} from 'lucide-react';

interface AdvisorsListProps {
  onSelectAdvisor: (advisorId: string) => void;
  onOpenNewAdvisor: () => void;
}

export const AdvisorsList: React.FC<AdvisorsListProps> = ({ 
  onSelectAdvisor, 
  onOpenNewAdvisor 
}) => {
  const { filteredAdvisors, filteredEvaluations, users, teams, campaigns, config, actionPlans, importHistory, operationalMeasurements, updateAdvisor, deleteAdvisor } = useApp();
  const [sortField, setSortField] = useState<'name' | 'score' | 'supervisor' | 'evals' | 'tenure' | 'sph'>('score');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [advisorToDelete, setAdvisorToDelete] = useState<{ id: string; name: string; dni: string } | null>(null);

  // Compute stats for each advisor
  const advisorStats = filteredAdvisors.map(adv => {
    const evals = filteredEvaluations.filter(e => e.advisorId === adv.id);
    const supervisor = users.find(u => u.id === adv.supervisorId);
    const team = teams.find(t => t.id === adv.teamId);
    const activePlans = actionPlans.filter(p => p.advisorId === adv.id && (p.status === 'EN_CURSO' || p.status === 'PENDIENTE'));

    const latestEval = evals[evals.length - 1];
    const initialEval = evals[0];

    const currentScore = latestEval ? latestEval.scoreTotal : (evals.length === 0 ? 0 : 50);
    const connectScore = latestEval ? latestEval.scoreConnect : 0;
    const clarifyScore = latestEval ? latestEval.scoreClarify : 0;
    const convertScore = latestEval ? latestEval.scoreConvert : 0;

    const delta = (latestEval && initialEval && evals.length > 1) 
      ? latestEval.scoreTotal - initialEval.scoreTotal 
      : 0;

    const priority = classifyPriority(currentScore, config);
    const tenureInfo = calculateAdvisorTenure(adv.hireDatePending ? undefined : adv.hireDate);

    // Get latest SPH from operational measurements or fallback to baseline
    const advisorMeasures = operationalMeasurements.filter(m => m.advisorId === adv.id);
    const latestMeasure = advisorMeasures.length > 0 ? advisorMeasures[advisorMeasures.length - 1] : null;
    const computedSph = latestMeasure?.sph ?? adv.baselineSph ?? null;

    return {
      advisor: adv,
      supervisorName: adv.supervisor || supervisor?.name || 'Supervisor',
      teamName: team?.name || 'Operaciones',
      evalsCount: evals.length,
      activePlansCount: activePlans.length,
      currentScore,
      connectScore,
      clarifyScore,
      convertScore,
      delta,
      priority,
      tenureInfo,
      sph: computedSph
    };
  });

  // Sorting
  const sortedStats = [...advisorStats].sort((a, b) => {
    if (sortField === 'name') {
      const cmp = a.advisor.name.localeCompare(b.advisor.name);
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'score') {
      const cmp = a.currentScore - b.currentScore;
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'supervisor') {
      const cmp = a.supervisorName.localeCompare(b.supervisorName);
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'evals') {
      const cmp = a.evalsCount - b.evalsCount;
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'tenure') {
      const cmp = a.tenureInfo.days - b.tenureInfo.days;
      return sortAsc ? cmp : -cmp;
    }
    if (sortField === 'sph') {
      const sphA = a.sph ?? -1;
      const sphB = b.sph ?? -1;
      const cmp = sphA - sphB;
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
    <div className="cm-workspace cm-advisors flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F6F7F9]">
      
      {/* Global Filter Bar with Progressive Disclosure */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-4">
        
        {/* Compact Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#031E3C] tracking-tight font-heading">
              Dotación de asesores
            </h2>
            <p className="text-xs text-[#667085] mt-0.5 font-medium">
              Alta individual o masiva por Excel · {filteredAdvisors.length} asesores activos · {importHistory.length} importaciones registradas
            </p>
          </div>

          {/* Action Buttons: Importar Excel (Secundaria) + Nuevo Asesor (Principal) */}
          <div className="flex items-center gap-2">
            
            {/* Historial de Cargas Button */}
            {importHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-[#E5E8EC] px-3 py-2 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title="Ver historial de cargas masivas"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Historial</span>
                <span className="bg-slate-100 text-slate-700 font-mono text-[10px] px-1.5 py-0.2 rounded font-bold">
                  {importHistory.length}
                </span>
              </button>
            )}

            {/* Importar Excel (Acción Secundaria) */}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-[#031E3C] border border-[#E5E8EC] hover:border-[#031E3C] px-3.5 py-2 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>Carga masiva Excel</span>
            </button>

            {/* Nuevo Asesor (Acción Principal CTA) */}
            <button
              type="button"
              onClick={onOpenNewAdvisor}
              className="flex items-center gap-1.5 bg-[#031E3C] hover:bg-[#0B2B50] text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>Agregar asesor</span>
            </button>
          </div>
        </div>

        {/* Advisors Table */}
        <div className="bg-white border border-[#E5E8EC] rounded-xl overflow-hidden shadow-2xs">
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[#F6F7F9] border-b border-[#E5E8EC] text-[11px] font-bold text-[#667085] uppercase tracking-wider font-heading">
                <tr>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:text-[#031E3C] transition-colors"
                    onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Asesor / DNI</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th className="py-3 px-3">
                    <span>Campaña</span>
                  </th>

                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-[#031E3C] transition-colors"
                    onClick={() => { setSortField('supervisor'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Supervisor</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-[#031E3C] transition-colors"
                    onClick={() => { setSortField('tenure'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Antigüedad (Empresa)</span>
                      <ArrowUpDown className="w-3 h-3 text-[#667085]" />
                    </div>
                  </th>

                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-[#031E3C] transition-colors text-center"
                    onClick={() => { setSortField('sph'); setSortAsc(!sortAsc); }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>SPH</span>
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
                    <span>Prioridad</span>
                  </th>

                  <th className="py-3 px-3 text-center">
                    <span>Planes Activos</span>
                  </th>

                  <th className="py-3 px-4 text-right">
                    <span>Acción</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E5E8EC]">
                {sortedStats.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No se encontraron asesores con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  sortedStats.map((stat) => (
                    <tr 
                      key={stat.advisor.id}
                      className="hover:bg-[#F6F7F9]/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectAdvisor(stat.advisor.id)}
                    >
                      
                      {/* 1. Asesor (Name + DNI exacto) */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#031E3C] text-xs flex items-center gap-1.5">
                          <span>{stat.advisor.name}</span>
                          {stat.advisor.status === 'INACTIVO' && (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#667085] flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] font-semibold text-[#031E3C]">
                            DNI: {stat.advisor.dni}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>{stat.evalsCount} evals</span>
                          {stat.advisor.schedule && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-[10px] text-slate-500 font-mono">{stat.advisor.schedule}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Campaña visible y editable */}
                      <td className="py-3 px-3" onClick={(event) => event.stopPropagation()}>
                        <select
                          aria-label={`Campaña de ${stat.advisor.name}`}
                          value={stat.advisor.campaignId || ''}
                          onChange={(event) => {
                            const campaignId = event.target.value;
                            const firstTeam = teams.find(team => team.campaignId === campaignId);
                            updateAdvisor(stat.advisor.id, { campaignId, teamId: firstTeam?.id || '', supervisorId: firstTeam?.supervisorId || stat.advisor.supervisorId });
                          }}
                          className="w-40 rounded-lg border border-[#D7E2E2] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#031E3C] focus:border-cyan-500 focus:outline-none"
                        >
                          <option value="" disabled>Asignar campaña</option>
                          {campaigns.filter(campaign => campaign.status === 'ACTIVA').map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                        </select>
                      </td>

                      {/* 2. Supervisor */}
                      <td className="py-3 px-3">
                        <span className="text-xs font-medium text-[#031E3C]">{stat.supervisorName}</span>
                        <div className="text-[10px] text-[#667085]">{stat.teamName}</div>
                      </td>

                      {/* 3. Antigüedad en Empresa (Calculada de F. INGRESO) */}
                      <td className="py-3 px-3">
                        {stat.tenureInfo.isPending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                            <Clock className="w-3 h-3" />
                            <span>Fecha Pendiente</span>
                          </span>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[#031E3C]">
                                {stat.tenureInfo.formatted}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                stat.tenureInfo.isNew 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {stat.tenureInfo.category}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Ingreso: {stat.advisor.hireDate}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. SPH Operacional */}
                      <td className="py-3 px-3 text-center">
                        {stat.sph !== null ? (
                          <span className="font-mono text-xs font-bold text-[#031E3C] bg-slate-50 px-2 py-1 rounded border border-slate-200">
                            {stat.sph.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">-</span>
                        )}
                      </td>

                      {/* 5. Score 3C */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-xs font-bold font-kpi px-2.5 py-0.5 rounded-md border ${getScoreBadgeClass(stat.currentScore)}`}>
                            {stat.currentScore}%
                          </span>
                          {stat.delta !== 0 && (
                            <span className={`text-[9px] font-bold mt-0.5 flex items-center gap-0.5 ${
                              stat.delta > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {stat.delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                              {stat.delta > 0 ? `+${stat.delta}%` : `${stat.delta}%`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. Desempeño 3C */}
                      <td className="py-3 px-4">
                        <ThreeScore 
                          connect={stat.connectScore}
                          clarify={stat.clarifyScore}
                          convert={stat.convertScore}
                        />
                      </td>

                      {/* 7. Nivel de Prioridad */}
                      <td className="py-3 px-3">
                        <StatusBadge status={stat.priority} size="sm" />
                      </td>

                      {/* 8. Planes Activos */}
                      <td className="py-3 px-3 text-center">
                        {stat.activePlansCount > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/30 rounded-md font-bold text-[11px]">
                            {stat.activePlansCount} plan{stat.activePlansCount > 1 ? 'es' : ''}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#667085]">0 activos</span>
                        )}
                      </td>

                      {/* 9. Botones: Ver perfil y Eliminar */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => onSelectAdvisor(stat.advisor.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#031E3C] hover:text-[#FF6B00] hover:bg-[#FF6B00]/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Ver Perfil 3C y Operacional"
                          >
                            <span>Ver Perfil</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdvisorToDelete({
                                id: stat.advisor.id,
                                name: stat.advisor.name,
                                dni: stat.advisor.dni
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title={`Eliminar asesor ${stat.advisor.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <ImportAdvisorsModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => setIsImportModalOpen(false)}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-[#E5E8EC] overflow-hidden">
            <div className="bg-[#031E3C] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-[#FF6B00]" />
                <h3 className="font-bold text-sm text-white font-heading">
                  Historial de Cargas Excel
                </h3>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {importHistory.map((log) => (
                <div key={log.id} className="bg-[#F6F7F9] border border-[#E5E8EC] rounded-xl p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs text-[#031E3C] flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#FF6B00]" />
                      <span>{log.fileName}</span>
                    </div>
                    <span className="text-[11px] text-[#667085] font-mono">
                      {new Date(log.date).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-[#667085] block">Campaña:</span>
                      <strong className="text-[#031E3C]">{log.campaign}</strong>
                    </div>
                    <div>
                      <span className="text-[#667085] block">Periodo:</span>
                      <strong className="text-[#031E3C]">{log.period}</strong>
                    </div>
                    <div>
                      <span className="text-[#667085] block">Usuario:</span>
                      <strong className="text-[#031E3C]">{log.user}</strong>
                    </div>
                    <div>
                      <span className="text-[#667085] block">Resultado:</span>
                      <strong className="text-emerald-700">
                        {log.newAdvisorsCount} nuevos · {log.updatedAdvisorsCount} actualizados
                      </strong>
                    </div>
                  </div>

                  {log.warningsList && log.warningsList.length > 0 && (
                    <div className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
                      ⚠️ {log.warningsList.length} advertencias registradas (ej. fechas pendientes normalizadas).
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-[#F6F7F9] border-t border-[#E5E8EC] px-6 py-3 text-right">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-[#031E3C] text-white text-xs font-semibold rounded-lg hover:bg-[#0B2B50] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Advisor Confirmation Modal */}
      {advisorToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-[#031E3C] font-heading">
                  ¿Eliminar asesor de la base?
                </h4>
                <p className="text-xs text-slate-600">
                  Estás a punto de eliminar a <strong className="text-[#031E3C]">{advisorToDelete.name}</strong> (DNI: <span className="font-mono font-semibold">{advisorToDelete.dni}</span>).
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold">Esta acción removerá:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>El registro del asesor y su cuenta de usuario vinculada.</li>
                <li>Sus mediciones operacionales (SPH, tiempos de conexión).</li>
                <li>Sus evaluaciones 3C y planes de acción asociados.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdvisorToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAdvisor(advisorToDelete.id);
                  setAdvisorToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, eliminar asesor</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
