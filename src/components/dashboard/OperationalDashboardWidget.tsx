import React from 'react';
import { useApp } from '../../context/AppContext';
import { calculateGlobalOperationalSummary, formatMinutesToHuman, formatMinutesDelta, formatSphDelta } from '../../utils/calculations';
import { Gauge, Clock, TrendingUp, ArrowRight, ChevronRight, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface OperationalDashboardWidgetProps {
  onSelectAdvisor?: (advisorId: string) => void;
  onNavigateToImpact?: () => void;
}

export const OperationalDashboardWidget: React.FC<OperationalDashboardWidgetProps> = ({
  onSelectAdvisor,
  onNavigateToImpact
}) => {
  const { filteredAdvisors, operationalMeasurements } = useApp();

  const opSummary = calculateGlobalOperationalSummary(filteredAdvisors, operationalMeasurements);

  const connDelta = formatMinutesDelta(opSummary.deltaAvgMinutes);
  const sphDelta = formatSphDelta(opSummary.deltaAvgSph);

  const chartData = opSummary.advisorsAnalysis.slice(0, 6).map(a => ({
    name: a.advisorName.split(' ')[0],
    'Línea Base': Number(a.baseline.sph.toFixed(2)),
    'Actual': Number(a.latest.sph.toFixed(2))
  }));

  return (
    <div className="bg-white rounded-xl border border-[#E7E9ED] p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-400/10 text-[#1FD6FF]">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#031E3C]">
              NIVEL 2 – Medición de Impacto Operacional
            </h3>
            <p className="text-[11px] text-[#667085]">
              Línea Base vs Actual · Tiempo de Conexión y SPH (Aislado de Score 3C)
            </p>
          </div>
        </div>

        {onNavigateToImpact && (
          <button
            onClick={onNavigateToImpact}
            className="flex items-center gap-1 text-xs font-semibold text-[#1FD6FF] hover:text-[#67E8F9] transition-colors"
          >
            <span>Ver Análisis Completo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2 Main Metric Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Connection Time Summary Block */}
        <div className="bg-[#0B1B30] rounded-xl p-4 border border-[#E7E9ED] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#031E3C]">
              <Clock className="w-4 h-4 text-[#031E3C]" />
              <span>Tiempo de Conexión Promedio</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
              connDelta.isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {connDelta.text} ({opSummary.connectionPctGain > 0 ? `+${opSummary.connectionPctGain}%` : `${opSummary.connectionPctGain}%`})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[#E7E9ED]">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#667085] block">Línea Base</span>
              <div className="text-xl font-bold font-mono text-[#031E3C] mt-0.5">
                {formatMinutesToHuman(opSummary.baselineAvgMinutes)}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-[#667085] block">Actual</span>
              <div className="text-xl font-bold font-mono text-[#031E3C] mt-0.5">
                {formatMinutesToHuman(opSummary.currentAvgMinutes)}
              </div>
            </div>
          </div>
        </div>

        {/* SPH Summary Block */}
        <div className="bg-[#0B1B30] rounded-xl p-4 border border-[#E7E9ED] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#031E3C]">
              <TrendingUp className="w-4 h-4 text-[#1FD6FF]" />
              <span>SPH Promedio (Ventas/Hora)</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
              sphDelta.isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {sphDelta.text} ({opSummary.sphPctGain > 0 ? `+${opSummary.sphPctGain}%` : `${opSummary.sphPctGain}%`})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[#E7E9ED]">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#667085] block">Línea Base</span>
              <div className="text-xl font-bold font-mono text-[#031E3C] mt-0.5">
                {opSummary.baselineAvgSph.toFixed(2)}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-[#667085] block">Actual</span>
              <div className="text-xl font-bold font-mono text-[#1FD6FF] mt-0.5">
                {opSummary.currentAvgSph.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Mini Advisor SPH Bar Chart */}
      <div className="pt-2">
        <span className="text-[11px] font-semibold text-[#667085] block mb-2">
          Comparativa SPH por Asesor (Muestra destacada)
        </span>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#244563" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9DB5CF' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9DB5CF' }} stroke="#244563" domain={[0, 'dataMax + 0.05']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#031E3C',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#f8fafc'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="Línea Base" fill="#607892" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Actual" fill="#1FD6FF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
