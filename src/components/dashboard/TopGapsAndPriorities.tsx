import React from 'react';
import { useApp } from '../../context/AppContext';
import { calculatePareto, classifyPriority } from '../../utils/calculations';
import { StatusBadge } from '../common/StatusBadge';
import { AlertCircle, Users, ArrowRight } from 'lucide-react';

interface TopGapsAndPrioritiesProps {
  onSelectAdvisor?: (advisorId: string) => void;
}

export const TopGapsAndPriorities: React.FC<TopGapsAndPrioritiesProps> = ({ onSelectAdvisor }) => {
  const { filteredEvaluations, filteredAdvisors, config, setCurrentSection } = useApp();

  const paretoGaps = calculatePareto(filteredEvaluations, 'ALL').slice(0, 4);

  // Group advisors by priority
  const advisorAvgScores: Record<string, number[]> = {};
  filteredEvaluations.forEach(e => {
    if (!advisorAvgScores[e.advisorId]) advisorAvgScores[e.advisorId] = [];
    advisorAvgScores[e.advisorId].push(e.scoreTotal);
  });

  const priorityGroups: {
    ALTA: { count: number; advisors: { id: string; name: string; score: number; supervisorId: string }[] };
    MEDIA: { count: number; advisors: { id: string; name: string; score: number; supervisorId: string }[] };
    ESPERADO: { count: number; advisors: { id: string; name: string; score: number; supervisorId: string }[] };
    DOMINADO: { count: number; advisors: { id: string; name: string; score: number; supervisorId: string }[] };
  } = {
    ALTA: { count: 0, advisors: [] },
    MEDIA: { count: 0, advisors: [] },
    ESPERADO: { count: 0, advisors: [] },
    DOMINADO: { count: 0, advisors: [] }
  };

  filteredAdvisors.forEach(adv => {
    const scores = advisorAvgScores[adv.id] || [];
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 55;
    const prio = classifyPriority(avg, config);
    priorityGroups[prio].count += 1;
    priorityGroups[prio].advisors.push({ id: adv.id, name: adv.name, score: avg, supervisorId: adv.supervisorId });
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
      
      {/* 1. Top Critical Gaps */}
      <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-[#E7E9ED] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-[#031E3C] uppercase tracking-wider font-heading">
                Top Brechas Críticas Operativas
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#475467] bg-[#F2F4F7] px-2 py-0.5 rounded border border-[#E7E9ED]">
              Mayor Frecuencia
            </span>
          </div>

          <div className="mt-3.5 space-y-2">
            {paretoGaps.map((gap, idx) => (
              <div 
                key={gap.criterionId}
                className="p-2.5 rounded-lg border border-[#E7E9ED] hover:border-[#031E3C]/30 bg-[#F7F8FA] flex items-center justify-between transition-colors"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-[#667085]">#{idx + 1}</span>
                    <span className="text-xs font-semibold text-[#031E3C] truncate">{gap.name}</span>
                  </div>
                  <p className="text-[10px] text-[#667085] truncate mt-0.5">
                    Frecuencia: <strong className="text-[#031E3C] font-kpi">{gap.frequency}</strong> ({gap.percentage}%)
                  </p>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-white text-[#475467] border border-[#E7E9ED]">
                  {gap.dimension === 'CONECTAR' ? 'C1' : gap.dimension === 'CLARIFICAR' ? 'C2' : 'C3'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#E7E9ED] text-right">
          <button
            onClick={() => setCurrentSection('pareto')}
            className="text-xs font-bold text-[#FF6B00] hover:text-[#e05e00] flex items-center justify-end gap-1 ml-auto cursor-pointer"
          >
            <span>Analizar Pareto Completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Priority Advisors */}
      <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-[#E7E9ED] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-[#031E3C] uppercase tracking-wider font-heading">
                Asesores en Nivel Crítico (&lt;60%)
              </h3>
            </div>
            <span className="text-[10px] font-medium text-[#D92D20] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
              {priorityGroups.ALTA.count} asesores
            </span>
          </div>

          <div className="mt-3.5 space-y-2">
            {priorityGroups.ALTA.advisors.length > 0 ? (
              priorityGroups.ALTA.advisors.slice(0, 4).map((adv) => (
                <div 
                  key={adv.id}
                  onClick={() => onSelectAdvisor && onSelectAdvisor(adv.id)}
                  className="p-2.5 rounded-lg border border-[#E7E9ED] bg-[#F7F8FA] hover:bg-white hover:border-[#031E3C]/30 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#031E3C] truncate">{adv.name}</p>
                    <p className="text-[10px] text-[#667085] mt-0.5">Requiere plan de acción inmediato</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold font-kpi text-[#D92D20] bg-white border border-[#E7E9ED] px-2 py-0.5 rounded">
                      {adv.score}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#039855] bg-emerald-50/50 p-3 rounded-lg border border-emerald-200/60">
                No hay asesores en rango crítico en la selección actual.
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#E7E9ED] text-right">
          <button
            onClick={() => setCurrentSection('advisors')}
            className="text-xs font-bold text-[#FF6B00] hover:text-[#e05e00] flex items-center justify-end gap-1 ml-auto cursor-pointer"
          >
            <span>Ver Gestión de Asesores</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};

