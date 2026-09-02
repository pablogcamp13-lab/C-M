import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CRITERIA_DEFINITIONS } from '../../data/criteriaData';
import { Grid, ArrowUpDown, Info, Eye } from 'lucide-react';

interface HeatmapWidgetProps {
  onSelectAdvisor?: (advisorId: string) => void;
}

type SortKey = 'WORST_SCORE' | 'BEST_SCORE' | 'SUPERVISOR' | 'NAME' | 'CONNECT' | 'CLARIFY' | 'CONVERT';

export const HeatmapWidget: React.FC<HeatmapWidgetProps> = ({ onSelectAdvisor }) => {
  const { filteredEvaluations, filteredAdvisors, users } = useApp();
  const [sortBy, setSortBy] = useState<SortKey>('WORST_SCORE');

  // Build matrix data for each advisor: latest or average score per criterion
  const matrixData = filteredAdvisors.map(adv => {
    const advEvals = filteredEvaluations.filter(e => e.advisorId === adv.id);
    const supervisor = users.find(u => u.id === adv.supervisorId);

    // Calculate score per criterion
    const criteriaScores: Record<string, { level: number; percentage: number; count: number }> = {};
    CRITERIA_DEFINITIONS.forEach(c => {
      criteriaScores[c.id] = { level: 3, percentage: 75, count: 0 };
    });

    let totalScoreSum = 0;
    let connectSum = 0;
    let clarifySum = 0;
    let convertSum = 0;

    if (advEvals.length > 0) {
      // Use latest evaluation or average of all items
      const latest = advEvals[advEvals.length - 1];
      totalScoreSum = latest.scoreTotal;
      connectSum = latest.scoreConnect;
      clarifySum = latest.scoreClarify;
      convertSum = latest.scoreConvert;

      latest.items.forEach(item => {
        criteriaScores[item.criterionId] = {
          level: item.level,
          percentage: item.percentage,
          count: 1
        };
      });
    }

    return {
      advisor: adv,
      supervisorName: supervisor?.name || 'Supervisor',
      evalCount: advEvals.length,
      totalScore: totalScoreSum,
      connectScore: connectSum,
      clarifyScore: clarifySum,
      convertScore: convertSum,
      criteriaScores
    };
  });

  // Sort matrix data
  const sortedData = [...matrixData].sort((a, b) => {
    switch (sortBy) {
      case 'WORST_SCORE':
        return a.totalScore - b.totalScore;
      case 'BEST_SCORE':
        return b.totalScore - a.totalScore;
      case 'NAME':
        return a.advisor.name.localeCompare(b.advisor.name);
      case 'SUPERVISOR':
        return a.supervisorName.localeCompare(b.supervisorName);
      case 'CONNECT':
        return a.connectScore - b.connectScore;
      case 'CLARIFY':
        return a.clarifyScore - b.clarifyScore;
      case 'CONVERT':
        return a.convertScore - b.convertScore;
      default:
        return a.totalScore - b.totalScore;
    }
  });

  const getCellColor = (level: number) => {
    switch (level) {
      case 1:
        return 'bg-red-100 text-[#D92D20] font-bold border border-red-200';
      case 2:
        return 'bg-amber-50 text-amber-900 font-medium border border-amber-200';
      case 3:
        return 'bg-slate-100 text-[#031E3C] font-semibold border border-[#E7E9ED]';
      case 4:
        return 'bg-[#031E3C] text-white font-bold';
      default:
        return 'bg-[#F2F4F7] text-[#667085]';
    }
  };

  return (
    <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      
      {/* Header & Controls */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E9ED] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#031E3C]" />
              <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider font-heading">
                Matriz de Desempeño 3C (Heatmap por Criterio)
              </h3>
            </div>
            <p className="text-xs text-[#667085] mt-0.5">
              Diagnóstico visual de los 9 criterios por cada asesor evaluado
            </p>
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#667085] font-medium flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Ordenar por:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="text-xs bg-[#F7F8FA] border border-[#E7E9ED] text-[#031E3C] rounded-lg px-2.5 py-1 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#031E3C] cursor-pointer"
            >
              <option value="WORST_SCORE">Menor Resultado 3C</option>
              <option value="BEST_SCORE">Mayor Resultado 3C</option>
              <option value="CONNECT">Menor Conectar (C1)</option>
              <option value="CLARIFY">Menor Clarificar (C2)</option>
              <option value="CONVERT">Menor Convertir (C3)</option>
              <option value="SUPERVISOR">Supervisor / Equipo</option>
              <option value="NAME">Nombre Asesor</option>
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 my-3 text-[11px] font-medium text-[#667085] bg-[#F7F8FA] p-2 rounded-lg border border-[#E7E9ED]">
          <span className="font-semibold text-[#031E3C]">Escala 3C:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-300"></span> 1 - Crítico (25%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-300"></span> 2 - En Desarrollo (50%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300"></span> 3 - Esperado (75%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-[#031E3C]"></span> 4 - Dominado (100%)
          </span>
        </div>

        {/* Heatmap Table */}
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-lg border border-[#E7E9ED]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#F7F8FA] text-[#031E3C] font-semibold sticky top-0 z-10 text-[11px]">
              <tr className="border-b border-[#E7E9ED]">
                <th className="py-2.5 px-3 min-w-[170px] bg-[#F7F8FA]">Asesor</th>
                <th className="py-2.5 px-2 text-center bg-[#F7F8FA]">Total</th>
                
                {/* 3 Columns for Conectar */}
                <th colSpan={3} className="py-1.5 px-1 text-center bg-[#031E3C]/5 text-[#031E3C] border-l border-r border-[#E7E9ED]">
                  C1 CONECTAR
                </th>

                {/* 3 Columns for Clarificar */}
                <th colSpan={3} className="py-1.5 px-1 text-center bg-[#031E3C]/5 text-[#031E3C] border-r border-[#E7E9ED]">
                  C2 CLARIFICAR
                </th>

                {/* 3 Columns for Convertir */}
                <th colSpan={3} className="py-1.5 px-1 text-center bg-[#031E3C]/5 text-[#031E3C]">
                  C3 CONVERTIR
                </th>
                <th className="py-2.5 px-2 text-center bg-[#F7F8FA]">Ficha</th>
              </tr>
              <tr className="border-b border-[#E7E9ED] text-[10px] text-[#667085] bg-white">
                <th className="py-1 px-3">Nombre & Supervisor</th>
                <th className="py-1 px-2 text-center">3C</th>
                {CRITERIA_DEFINITIONS.map((c) => (
                  <th key={c.id} className="py-1 px-1 text-center font-medium truncate max-w-[65px] text-[#667085]" title={c.name}>
                    {c.shortName}
                  </th>
                ))}
                <th className="py-1 px-2 text-center">Ver</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F2F4F7] bg-white">
              {sortedData.map((row) => (
                <tr key={row.advisor.id} className="hover:bg-[#F7F8FA] transition-colors">
                  
                  {/* Advisor Name */}
                  <td className="py-2 px-3 font-medium text-[#031E3C]">
                    <div className="flex flex-col">
                      <span className="font-semibold text-[#031E3C] leading-tight">{row.advisor.name}</span>
                      <span className="text-[10px] text-[#667085]">{row.advisor.employeeCode} · {row.supervisorName}</span>
                    </div>
                  </td>

                  {/* 3C Total */}
                  <td className="py-2 px-2 text-center font-bold">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${
                      row.totalScore < 60 ? 'bg-red-50 text-[#D92D20] border border-red-200' :
                      'bg-[#F2F4F7] text-[#031E3C] border border-[#E7E9ED]'
                    }`}>
                      {row.totalScore}%
                    </span>
                  </td>

                  {/* 9 Criteria Cells */}
                  {CRITERIA_DEFINITIONS.map(c => {
                    const score = row.criteriaScores[c.id];
                    return (
                      <td key={c.id} className="py-1 px-1 text-center">
                        <div 
                          className={`w-6 h-6 mx-auto rounded flex items-center justify-center text-[10px] cursor-help transition-transform hover:scale-110 ${getCellColor(score?.level || 1)}`}
                          title={`${c.name}: Nivel ${score?.level || 1} (${score?.percentage || 25}%)`}
                        >
                          {score?.level || 1}
                        </div>
                      </td>
                    );
                  })}

                  {/* Action Link */}
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => onSelectAdvisor && onSelectAdvisor(row.advisor.id)}
                      className="text-[#667085] hover:text-[#031E3C] p-1 rounded hover:bg-[#F2F4F7] cursor-pointer"
                      title="Ver Perfil 3C del Asesor"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer notes */}
      <div className="mt-3 pt-2 border-t border-[#E7E9ED] flex items-center justify-between text-xs text-[#667085]">
        <span className="text-[11px]">{sortedData.length} asesores mapeados</span>
        <span className="text-[11px] text-[#FF6B00] font-semibold">Clic en el icono para ver la ficha del asesor</span>
      </div>

    </div>
  );
};
