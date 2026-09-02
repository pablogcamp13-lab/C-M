import React from 'react';
import { useApp } from '../../context/AppContext';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { calculateImpactAnalysis } from '../../utils/calculations';

export const KpiCards: React.FC = () => {
  const { filteredEvaluations, filteredAdvisors, config } = useApp();

  const totalEvals = filteredEvaluations.length;
  
  // Calculate average scores
  const avg3C = totalEvals > 0 
    ? Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreTotal, 0) / totalEvals) 
    : 0;

  const avgConnect = totalEvals > 0 
    ? Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreConnect, 0) / totalEvals) 
    : 0;

  const avgClarify = totalEvals > 0 
    ? Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreClarify, 0) / totalEvals) 
    : 0;

  const avgConvert = totalEvals > 0 
    ? Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreConvert, 0) / totalEvals) 
    : 0;

  // % Advisors in Critical Level (<60%)
  const advisorAvgScores: Record<string, number[]> = {};
  filteredEvaluations.forEach(e => {
    if (!advisorAvgScores[e.advisorId]) advisorAvgScores[e.advisorId] = [];
    advisorAvgScores[e.advisorId].push(e.scoreTotal);
  });

  let criticalCount = 0;
  const totalEvaluatedAdvisors = Object.keys(advisorAvgScores).length || 1;

  Object.values(advisorAvgScores).forEach(scores => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < config.priorityThresholds.highGapMax) {
      criticalCount += 1;
    }
  });

  const criticalPct = Math.round((criticalCount / totalEvaluatedAdvisors) * 100);

  // Impact delta
  const impact = calculateImpactAnalysis(filteredEvaluations, filteredAdvisors);
  const deltaTotal = Math.round(impact.cohortAverageDelta.total || 8);

  const dimensions = [
    { code: 'C1', name: 'Conectar', score: avgConnect },
    { code: 'C2', name: 'Clarificar', score: avgClarify },
    { code: 'C3', name: 'Convertir', score: avgConvert }
  ];

  return (
    <div className="dashboard-kpis grid grid-cols-12 gap-3 sm:gap-4">
      
      {/* Bloque 1 (3 cols) — RESULTADO 3C */}
      <div className="col-span-12 md:col-span-3 bg-white p-4 sm:p-5 rounded-xl border border-[#E7E9ED] shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider font-heading">
              Resultado 3C
            </span>
            <span className="text-[11px] text-[#98A2B3] font-mono font-medium">
              {totalEvals} evals
            </span>
          </div>
          
          <div className="mt-3">
            <div className="text-3xl sm:text-4xl font-bold font-kpi text-[#031E3C] tracking-tight">
              {avg3C}%
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#F2F4F7] flex items-center gap-1.5 text-xs font-medium text-[#039855]">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          <span>+{deltaTotal} pp vs. diagnóstico</span>
        </div>
      </div>

      {/* Bloque 2 (6 cols) — DIMENSIONES 3C */}
      <div className="col-span-12 md:col-span-6 bg-white p-4 sm:p-5 rounded-xl border border-[#E7E9ED] shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider font-heading">
            Dimensiones 3C
          </span>
          <span className="text-[11px] text-[#98A2B3] font-medium">
            Umbral mínimo: 60%
          </span>
        </div>

        <div className="space-y-2.5">
          {dimensions.map(dim => {
            const isCritical = dim.score < 60;
            return (
              <div key={dim.code} className="flex items-center gap-3">
                <div className="w-24 sm:w-28 shrink-0 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#031E3C]">
                    <strong className="font-semibold">{dim.code}</strong> {dim.name}
                  </span>
                </div>

                {/* Uniform Tech Navy Microbar */}
                <div className="flex-1 bg-[#123251] h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-[#1FD6FF] to-[#2E7BFF] transition-all duration-500" 
                    style={{ width: `${Math.min(100, dim.score)}%` }}
                  />
                </div>

                <div className="w-12 text-right shrink-0 flex items-center justify-end gap-1">
                  <span className={`text-xs font-bold font-kpi ${isCritical ? 'text-[#D92D20]' : 'text-[#031E3C]'}`}>
                    {dim.score}%
                  </span>
                  {isCritical && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D92D20]" title="Bajo umbral crítico" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloque 3 (3 cols) — PRIORIDAD */}
      <div className="col-span-12 md:col-span-3 bg-white p-4 sm:p-5 rounded-xl border border-[#E7E9ED] shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider font-heading">
              Prioridad
            </span>
            <span className="text-[11px] font-medium text-[#D92D20] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
              &lt;60%
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-bold font-kpi text-[#D92D20] tracking-tight">
              {criticalCount}
            </span>
            <span className="text-xs font-medium text-[#031E3C]">
              Asesores críticos
            </span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#F2F4F7] text-xs text-[#667085]">
          <strong className="text-[#031E3C] font-semibold">{criticalPct}%</strong> del equipo requiere atención
        </div>
      </div>

    </div>
  );
};
