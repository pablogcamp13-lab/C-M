import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles } from 'lucide-react';
import { generateExecutiveInsights } from '../../utils/calculations';

export const InsightsBanner: React.FC = () => {
  const { filteredEvaluations, filteredAdvisors } = useApp();

  const insights = generateExecutiveInsights(filteredEvaluations, filteredAdvisors);

  if (insights.length === 0) return null;

  return (
    <div className="bg-[#031E3C] border border-[#031E3C] rounded-xl p-4 text-white shadow-2xs">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#FF6B00]/20 text-[#FF6B00] flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white font-heading">
              Hallazgos Ejecutivos & Diagnóstico 3C
            </h3>
            <p className="text-[11px] text-slate-300">
              Generación analítica calculada a partir de los datos registrados en la plataforma.
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 px-2 py-0.5 rounded font-mono">
          Insights 3C
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {insights.map((insight, idx) => (
          <div 
            key={idx} 
            className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-start gap-2.5 hover:bg-white/10 transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-[#FF6B00] text-white flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold font-mono">
              {idx + 1}
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {insight}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

