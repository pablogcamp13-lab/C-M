import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculatePareto } from '../../utils/calculations';
import { DimensionId } from '../../types';
import { FiltersBar } from '../common/FiltersBar';
import { BarChart2, CheckCircle2, AlertCircle, Info, Sparkles, ArrowRight } from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

export const ParetoDeepDive: React.FC = () => {
  const { filteredEvaluations } = useApp();
  const [activeDimension, setActiveDimension] = useState<'ALL' | DimensionId>('ALL');

  const paretoData = calculatePareto(filteredEvaluations, activeDimension);
  const totalGaps = paretoData.reduce((a, b) => a + b.frequency, 0);

  // Transform data for ComposedChart (Bar = frequency, Line = cumulativePercentage)
  const chartData = paretoData.map(d => ({
    name: d.name,
    shortName: d.criterionId.replace('crit_', 'C'),
    frequency: d.frequency,
    cumulativePercentage: d.cumulativePercentage,
    dimension: d.dimension,
    isPareto80: d.isPareto80
  }));

  return (
    <div className="cm-workspace cm-pareto flex-1 overflow-y-auto bg-slate-100/70">
      
      {/* Global Filters */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-teal-700" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Análisis de Pareto de Brechas Operativas (80/20)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Priorización matemática de las fallas más recurrentes en nivel Crítico o En Desarrollo.
            </p>
          </div>

          {/* Dimension Selector Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setActiveDimension('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeDimension === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Pareto General
            </button>
            <button
              onClick={() => setActiveDimension('CONECTAR')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeDimension === 'CONECTAR' ? 'bg-sky-600 text-white shadow-xs' : 'hover:text-sky-700'}`}
            >
              Pareto Conectar
            </button>
            <button
              onClick={() => setActiveDimension('CLARIFICAR')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeDimension === 'CLARIFICAR' ? 'bg-amber-600 text-white shadow-xs' : 'hover:text-amber-700'}`}
            >
              Pareto Clarificar
            </button>
            <button
              onClick={() => setActiveDimension('CONVERTIR')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${activeDimension === 'CONVERTIR' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:text-emerald-700'}`}
            >
              Pareto Convertir
            </button>
          </div>
        </div>

        {/* Dual-Axis Pareto Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Gráfico Dual de Pareto ({activeDimension === 'ALL' ? 'Todos los Criterios' : `Dimensión ${activeDimension}`})
              </h3>
              <p className="text-xs text-slate-500">
                Barras: Frecuencia de casos observados · Línea: Porcentaje acumulado (Línea de corte en 80%)
              </p>
            </div>
            <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              {totalGaps} brechas totales
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#475569' }} 
                  interval={0} 
                  angle={-15} 
                  textAnchor="end" 
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" label={{ value: 'Frecuencia', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar yAxisId="left" dataKey="frequency" name="Frecuencia de Brechas" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name="% Acumulado" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, fill: '#e11d48' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Complete Pareto Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
              Tabla Detallada de Priorización Pareto
            </h3>
            <span className="text-xs text-slate-500">
              Criterios ordenados de mayor a menor impacto
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4"># Ranking</th>
                  <th className="py-3 px-4">Criterio Evaluado</th>
                  <th className="py-3 px-3">Dimensión</th>
                  <th className="py-3 px-3 text-center">Frecuencia (Casos)</th>
                  <th className="py-3 px-3 text-center">% Relativo</th>
                  <th className="py-3 px-3 text-center">% Acumulado</th>
                  <th className="py-3 px-4">Prioridad / Foco 80%</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paretoData.map((row, idx) => (
                  <tr key={row.criterionId} className="hover:bg-slate-50 transition-colors">
                    
                    <td className="py-3 px-4 font-bold text-slate-500">
                      #{idx + 1}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {row.name}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        row.dimension === 'CONECTAR' ? 'bg-sky-100 text-sky-800' :
                        row.dimension === 'CLARIFICAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {row.dimension}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-black text-rose-600">
                      {row.frequency}
                    </td>

                    <td className="py-3 px-3 text-center font-semibold text-slate-700">
                      {row.percentage}%
                    </td>

                    <td className="py-3 px-3 text-center font-bold text-slate-900">
                      {row.cumulativePercentage}%
                    </td>

                    <td className="py-3 px-4">
                      {row.isPareto80 ? (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1 w-max">
                          <AlertCircle className="w-3 h-3" />
                          Vital (Top 80%)
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Secundario (20%)
                        </span>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};
