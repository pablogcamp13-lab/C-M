import React from 'react';
import { useApp } from '../../context/AppContext';
import { Layers, AlertCircle, CheckCircle2 } from 'lucide-react';

export const ProgressionLadder: React.FC = () => {
  const { filteredEvaluations } = useApp();

  const totalEvals = filteredEvaluations.length || 1;
  const avgConnect = Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreConnect, 0) / totalEvals);
  const avgClarify = Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreClarify, 0) / totalEvals);
  const avgConvert = Math.round(filteredEvaluations.reduce((a, e) => a + e.scoreConvert, 0) / totalEvals);

  let primaryGap = 'CONVERTIR (C3)';
  let diagnosisText = 'Cuello de botella en Conversión (C3): El equipo conecta y explica adecuadamente, pero pierde efectividad en el cierre comercial y manejo de objeciones.';

  if (avgConnect < 60 && avgConnect <= avgClarify && avgConnect <= avgConvert) {
    primaryGap = 'CONECTAR (C1)';
    diagnosisText = 'La base de comunicación (fluidez y modulación) presenta el mayor rezago. Se debe corregir antes de exigir técnicas avanzadas de cierre.';
  } else if (avgClarify < 60 && avgClarify <= avgConnect && avgClarify <= avgConvert) {
    primaryGap = 'CLARIFICAR (C2)';
    diagnosisText = 'Los asesores comunican adecuadamente pero confunden la información de planes/BiPay o no logran traducir características en beneficios cotidianos.';
  }

  const steps = [
    { code: 'C1', name: 'Conectar', desc: 'Fluidez, modulación y seguridad', score: avgConnect },
    { code: 'C2', name: 'Clarificar', desc: 'Dominio de plan, BiPay y beneficios', score: avgClarify },
    { code: 'C3', name: 'Convertir', desc: 'Manejo de objeciones y cierre', score: avgConvert },
  ];

  return (
    <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full">
      
      {/* Header */}
      <div>
        <div className="flex items-center justify-between border-b border-[#E7E9ED] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[#031E3C] uppercase tracking-wider font-heading">
              Dominio 3C
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#667085] bg-[#F7F8FA] border border-[#E7E9ED] px-2 py-0.5 rounded">
            Secuencia Metodológica
          </span>
        </div>

        {/* 3C Step Rows with Uniform Styling */}
        <div className="mt-3.5 space-y-2.5">
          {steps.map(step => {
            const isCritical = step.score < 60;
            return (
              <div 
                key={step.code} 
                className="p-3 rounded-lg border border-[#E7E9ED] bg-[#F7F8FA] flex flex-col gap-2 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#031E3C] text-white font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                      {step.code}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#031E3C] leading-tight">{step.name}</p>
                      <p className="text-[10px] text-[#667085]">{step.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold font-kpi ${isCritical ? 'text-[#D92D20]' : 'text-[#031E3C]'}`}>
                      {step.score}%
                    </span>
                    {isCritical && (
                      <AlertCircle className="w-3 h-3 text-[#D92D20]" title="Nivel crítico (<60%)" />
                    )}
                  </div>
                </div>

                {/* Progress bar in uniform Tech Navy */}
                <div className="w-full bg-[#E7E9ED] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#031E3C] h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, step.score)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Insight Diagnosis */}
      <div className="mt-3.5 pt-3 border-t border-[#E7E9ED]">
        <div className="p-3 bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#031E3C] mb-1 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]" />
            <span>Diagnóstico Metodológico</span>
          </div>
          <p className="text-[11px] text-[#667085] leading-relaxed">
            {diagnosisText}
          </p>
        </div>
      </div>

    </div>
  );
};

