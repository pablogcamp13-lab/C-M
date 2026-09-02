import React from 'react';
import { useApp } from '../../context/AppContext';
import { calculateBiPayAnalytics } from '../../utils/calculations';
import { Smartphone, AlertCircle, TrendingUp, ArrowRight } from 'lucide-react';

interface BiPayDeepDiveWidgetProps {
  onSelectAdvisor?: (advisorId: string) => void;
}

export const BiPayDeepDiveWidget: React.FC<BiPayDeepDiveWidgetProps> = ({ onSelectAdvisor }) => {
  const { filteredEvaluations, filteredAdvisors } = useApp();

  const biPay = calculateBiPayAnalytics(filteredEvaluations, filteredAdvisors);

  return (
    <div className="cm-card cm-bipay p-4 sm:p-5 flex flex-col justify-between">
      
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E9ED] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-[#031E3C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider font-heading">
                  Análisis Específico de BiPay (Foco C2 - Clarificar)
                </h3>
                <span className="text-[10px] bg-[#F2F4F7] text-[#475467] font-semibold px-2 py-0.5 rounded border border-[#E7E9ED]">
                  Producto Clave
                </span>
              </div>
              <p className="text-xs text-[#667085] mt-0.5">
                Evaluación del paso de Característica → Beneficio → Utilidad cotidiana en llamadas outbound
              </p>
            </div>
          </div>

          <div className="text-[11px] font-medium text-[#667085] font-mono">
            {biPay.totalEvaluations} evaluaciones analizadas
          </div>
        </div>

        {/* 4 Stat Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          
          <div className="bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg p-3">
            <span className="text-[11px] font-semibold text-[#667085] block uppercase">Explicación Correcta</span>
            <div className="text-2xl font-bold text-[#039855] font-kpi mt-1">
              {biPay.correctExplanationPct}%
            </div>
            <span className="text-[10px] text-[#667085]">Nivel Esperado/Dominado</span>
          </div>

          <div className="bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg p-3">
            <span className="text-[11px] font-semibold text-[#667085] block uppercase">Conocimiento Parcial</span>
            <div className="text-2xl font-bold text-[#D97706] font-kpi mt-1">
              {biPay.incompleteKnowledgePct}%
            </div>
            <span className="text-[10px] text-[#667085]">Nivel 2 (En Desarrollo)</span>
          </div>

          <div className="bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg p-3">
            <span className="text-[11px] font-semibold text-[#667085] block uppercase">Generan Confusión</span>
            <div className="text-2xl font-bold text-[#D92D20] font-kpi mt-1">
              {biPay.confusingExplanationPct}%
            </div>
            <span className="text-[10px] text-[#667085]">Nivel 1 (Crítico)</span>
          </div>

          <div className="bg-[#F7F8FA] border border-[#E7E9ED] rounded-lg p-3">
            <span className="text-[11px] font-semibold text-[#667085] block uppercase">Traduce a Beneficio</span>
            <div className="text-2xl font-bold text-[#031E3C] font-kpi mt-1">
              {biPay.benefitTranslationPct}%
            </div>
            <span className="text-[10px] text-[#667085]">Nivel 4 (Dominado)</span>
          </div>

        </div>

        {/* Correlation & Action Card */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Executive Correlation Card */}
          <div className="bg-[#031E3C] text-white rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-[#FF6B00] font-bold uppercase text-[10px] tracking-wider flex items-center gap-1.5 font-heading">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Correlación Directa de Conversión
                </span>
                <span className="text-[10px] bg-white/10 text-white font-mono px-2 py-0.5 rounded">
                  Metodología 3C
                </span>
              </div>

              <div className="space-y-2.5 my-3 text-xs">
                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/10">
                  <span className="text-slate-200 font-medium">Asesores con Dominio en BiPay:</span>
                  <span className="text-sm font-bold text-white font-mono">{biPay.salesRateWithBiPayDominance}% Conversión</span>
                </div>

                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/10">
                  <span className="text-slate-200 font-medium">Asesores con Brecha / Confusión:</span>
                  <span className="text-sm font-bold text-[#D92D20] font-mono">{biPay.salesRateWithBiPayGap}% Conversión</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>Impacto directo en Cierre de Venta</span>
                  <span className="text-[#FF6B00] font-bold">+{biPay.salesLiftPoints} pts</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#FF6B00] rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (biPay.salesRateWithBiPayDominance / Math.max(1, biPay.salesRateWithBiPayGap || 1)) * 50)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Critical Advisors to Train in BiPay */}
          <div className="bg-[#F7F8FA] border border-[#E7E9ED] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#031E3C] uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-heading">
                  <AlertCircle className="w-3.5 h-3.5 text-[#D92D20]" />
                  Asesores Prioritarios para Taller BiPay
                </span>
                <span className="text-[10px] bg-red-50 text-[#D92D20] font-semibold px-2 py-0.5 rounded border border-red-200">
                  {biPay.topGapAdvisors.length} identificados
                </span>
              </div>

              <p className="text-xs text-[#667085] mb-3">
                Asesores cuya brecha principal es no saber explicar la utilidad de BiPay o confundir el saldo de recarga:
              </p>

              <div className="space-y-2 max-h-36 overflow-y-auto">
                {biPay.topGapAdvisors.slice(0, 4).map(adv => (
                  <div 
                    key={adv.advisorId}
                    onClick={() => onSelectAdvisor && onSelectAdvisor(adv.advisorId)}
                    className="flex items-center justify-between p-2.5 bg-white border border-[#E7E9ED] rounded-lg hover:border-[#031E3C]/40 cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#031E3C] text-white flex items-center justify-center font-bold text-[10px] font-mono">
                        {adv.advisorName.charAt(0)}
                      </span>
                      <span className="font-semibold text-[#031E3C]">{adv.advisorName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#667085]">
                      <span className="text-[10px] bg-[#F2F4F7] text-[#475467] px-1.5 py-0.5 rounded font-mono border border-[#E7E9ED]">
                        {adv.teamName}
                      </span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-[#E7E9ED] text-[11px] text-[#667085] flex items-center justify-between">
              <span>Módulo sugerido: <strong className="text-[#031E3C]">INT-003 Taller BiPay</strong></span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
