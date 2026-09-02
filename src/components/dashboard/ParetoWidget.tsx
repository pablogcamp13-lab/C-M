import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculatePareto } from '../../utils/calculations';
import { DimensionId } from '../../types';
import { BarChart3, AlertCircle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

interface ParetoWidgetProps {
  onNavigateToPareto?: () => void;
}

export const ParetoWidget: React.FC<ParetoWidgetProps> = ({ onNavigateToPareto }) => {
  const { filteredEvaluations, setCurrentSection } = useApp();
  const [activeDimension, setActiveDimension] = useState<'ALL' | DimensionId>('ALL');
  const [showAllCriteria, setShowAllCriteria] = useState(false);

  const paretoData = calculatePareto(filteredEvaluations, activeDimension);
  const maxFrequency = Math.max(...paretoData.map(d => d.frequency), 1);
  const totalGaps = paretoData.reduce((a, b) => a + b.frequency, 0);

  // Top 80% criteria (or first 4)
  const top80Data = paretoData.filter((item, idx) => item.cumulativePercentage <= 85 || idx < 3);
  const displayData = showAllCriteria ? paretoData : (top80Data.length > 0 ? top80Data : paretoData.slice(0, 4));

  return (
    <div className="bg-white rounded-xl border border-[#E7E9ED] shadow-2xs flex flex-col justify-between h-full">
      
      {/* Header with Title & Dimension Tabs */}
      <div>
        <div className="p-4 sm:p-5 border-b border-[#E7E9ED] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-xs sm:text-sm text-[#031E3C] uppercase tracking-wider font-heading">
                Pareto de Brechas (80/20)
              </h3>
            </div>
            <p className="text-[11px] text-[#667085] mt-0.5 font-medium">
              {totalGaps} brechas en {paretoData.length} criterios analizados
            </p>
          </div>

          {/* Dimension Selector Tabs */}
          <div className="flex items-center bg-[#F7F8FA] border border-[#E7E9ED] p-0.5 rounded-lg text-xs font-medium text-[#667085]">
            <button
              onClick={() => setActiveDimension('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeDimension === 'ALL' ? 'bg-white text-[#031E3C] font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveDimension('CONECTAR')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeDimension === 'CONECTAR' ? 'bg-[#031E3C] text-white font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
              }`}
            >
              C1 Conectar
            </button>
            <button
              onClick={() => setActiveDimension('CLARIFICAR')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeDimension === 'CLARIFICAR' ? 'bg-[#031E3C] text-white font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
              }`}
            >
              C2 Clarificar
            </button>
            <button
              onClick={() => setActiveDimension('CONVERTIR')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeDimension === 'CONVERTIR' ? 'bg-[#031E3C] text-white font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
              }`}
            >
              C3 Convertir
            </button>
          </div>
        </div>

        {/* 80% Threshold reference indicator line */}
        <div className="px-4 sm:px-5 pt-3.5 pb-1 flex items-center justify-between text-[11px] text-[#667085]">
          <span className="font-medium">Criterios de mayor concentración</span>
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="flex items-center gap-1 text-[#031E3C]">
              <span className="w-2.5 h-2 rounded-xs bg-[#031E3C]" />
              Frecuencia
            </span>
            <span className="flex items-center gap-1 text-[#FF6B00]">
              <span className="w-2.5 h-1 rounded-full bg-[#FF6B00]" />
              Acumulado
            </span>
            <span className="px-1.5 py-0.2 bg-[#F2F4F7] text-[#475467] rounded border border-dashed border-[#98A2B3]">
              Límite 80%
            </span>
          </div>
        </div>

        {/* Data Bars List */}
        <div className="p-4 sm:p-5 space-y-2.5">
          {displayData.map((item, idx) => {
            const widthPct = Math.round((item.frequency / maxFrequency) * 100);

            return (
              <div key={item.criterionId} className="flex items-center gap-3 text-xs">
                
                {/* Criterion Label */}
                <div className="w-40 sm:w-52 text-[11px] font-medium text-[#031E3C] truncate" title={item.name}>
                  <span className="text-[#98A2B3] font-mono mr-1.5 text-[10px]">#{idx + 1}</span>
                  {item.name}
                </div>

                {/* Bar Container */}
                <div className="flex-1 h-6 bg-[#F7F8FA] border border-[#E7E9ED] rounded-md relative overflow-hidden flex items-center px-2.5">
                  {/* Tech Navy Frequency Bar */}
                  <div 
                    className="absolute left-0 top-0 h-full bg-[#031E3C] transition-all duration-500 rounded-r-xs opacity-90"
                    style={{ width: `${Math.max(4, widthPct)}%` }}
                  />

                  {/* Cutoff 80% guide line */}
                  <div 
                    className="absolute top-0 bottom-0 border-r border-dashed border-[#98A2B3] z-10 pointer-events-none"
                    style={{ left: '80%' }}
                  />

                  <div className="relative z-10 w-full flex items-center justify-between text-[10px]">
                    <span className="text-white font-semibold font-kpi drop-shadow-xs">
                      {item.frequency} casos
                    </span>
                    <span className="font-mono text-[#475467] bg-white/90 px-1 py-0.2 rounded text-[9px] border border-[#E7E9ED]">
                      Acum: <strong className={item.cumulativePercentage <= 80 ? 'text-[#FF6B00]' : 'text-[#031E3C]'}>{item.cumulativePercentage}%</strong>
                    </span>
                  </div>
                </div>

                {/* Neutral Dimension Badge */}
                <div className="w-10 text-right shrink-0">
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#F2F4F7] text-[#475467] border border-[#E7E9ED]">
                    {item.dimension === 'CONECTAR' ? 'C1' : item.dimension === 'CLARIFICAR' ? 'C2' : 'C3'}
                  </span>
                </div>

              </div>
            );
          })}
        </div>

        {paretoData.length > 4 && (
          <div className="px-4 sm:px-5 pb-2 text-center">
            <button
              onClick={() => setShowAllCriteria(!showAllCriteria)}
              className="text-[11px] font-medium text-[#667085] hover:text-[#031E3C] inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{showAllCriteria ? 'Mostrar solo criterios 80%' : `Ver los ${paretoData.length} criterios`}</span>
              {showAllCriteria ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Insight Footer */}
      <div className="p-4 sm:p-5 pt-0">
        <div className="p-3 bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-[#031E3C]">
            <AlertCircle className="w-3.5 h-3.5 text-[#031E3C] shrink-0 mt-0.5 sm:mt-0" />
            <span className="text-[11px] text-[#667085] leading-snug">
              El 80% de las brechas se concentra en 3 criterios clave. Priorizar intervenciones en estos puntos generará el mayor impacto operativo.
            </span>
          </div>
          <button
            onClick={() => {
              if (onNavigateToPareto) onNavigateToPareto();
              else setCurrentSection('pareto');
            }}
            className="text-xs font-bold text-[#FF6B00] hover:text-[#e05e00] flex items-center gap-1 shrink-0 ml-auto cursor-pointer"
          >
            <span>Ver análisis completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};

