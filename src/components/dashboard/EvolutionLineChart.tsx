import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TrendingUp, Calendar } from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

export const EvolutionLineChart: React.FC = () => {
  const { filteredEvaluations } = useApp();
  const [timeGranularity, setTimeGranularity] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');

  // Sort evaluations by date ascending
  const sortedEvals = [...filteredEvaluations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group by date or week
  const groupedData: Record<string, { totalSum: number; connectSum: number; clarifySum: number; convertSum: number; count: number; dateLabel: string }> = {};

  sortedEvals.forEach(ev => {
    let key = ev.date;
    let label = ev.date.substring(5); // MM-DD

    if (timeGranularity === 'WEEK') {
      const d = new Date(ev.date);
      const weekNum = Math.ceil((d.getDate() + 6 - d.getDay()) / 7);
      key = `Sem ${weekNum} (${d.toLocaleString('es-ES', { month: 'short' })})`;
      label = key;
    } else if (timeGranularity === 'MONTH') {
      const d = new Date(ev.date);
      key = d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
      label = key;
    }

    if (!groupedData[key]) {
      groupedData[key] = { totalSum: 0, connectSum: 0, clarifySum: 0, convertSum: 0, count: 0, dateLabel: label };
    }

    groupedData[key].totalSum += ev.scoreTotal;
    groupedData[key].connectSum += ev.scoreConnect;
    groupedData[key].clarifySum += ev.scoreClarify;
    groupedData[key].convertSum += ev.scoreConvert;
    groupedData[key].count += 1;
  });

  const chartData = Object.entries(groupedData).map(([k, v]) => ({
    period: v.dateLabel,
    'Score 3C': Math.round(v.totalSum / v.count),
    'Conectar (C1)': Math.round(v.connectSum / v.count),
    'Clarificar (C2)': Math.round(v.clarifySum / v.count),
    'Convertir (C3)': Math.round(v.convertSum / v.count),
    evaluaciones: v.count
  }));

  return (
    <div className="bg-white border border-[#E5E8EC] rounded-xl p-4 sm:p-5 shadow-2xs">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E8EC]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#031E3C]/10 text-[#031E3C] flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[#031E3C] uppercase tracking-wider font-heading">
              Evolución Histórica 3C
            </h3>
            <p className="text-[11px] text-[#667085] mt-0.5 font-medium">
              Tendencia de puntajes y madurez en el tiempo
            </p>
          </div>
        </div>

        {/* Granularity Controls */}
        <div className="flex items-center bg-[#F6F7F9] border border-[#E5E8EC] p-0.5 rounded-lg text-xs font-medium text-[#667085]">
          <button
            onClick={() => setTimeGranularity('DAY')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              timeGranularity === 'DAY' ? 'bg-white text-[#031E3C] font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
            }`}
          >
            Día
          </button>
          <button
            onClick={() => setTimeGranularity('WEEK')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              timeGranularity === 'WEEK' ? 'bg-white text-[#031E3C] font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setTimeGranularity('MONTH')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              timeGranularity === 'MONTH' ? 'bg-white text-[#031E3C] font-semibold shadow-2xs' : 'hover:text-[#031E3C]'
            }`}
          >
            Mes
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 sm:h-72 w-full pt-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#244563" />
              <XAxis 
                dataKey="period" 
                tick={{ fill: '#9DB5CF', fontSize: 11, fontFamily: 'Poppins' }} 
                axisLine={{ stroke: '#244563' }} 
                tickLine={false}
              />
              <YAxis 
                domain={[40, 100]} 
                tick={{ fill: '#9DB5CF', fontSize: 11, fontFamily: 'Poppins' }} 
                axisLine={{ stroke: '#244563' }} 
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#031E3C', 
                  borderRadius: '10px', 
                  border: 'none', 
                  color: '#FFFFFF', 
                  fontSize: '12px',
                  fontFamily: 'Poppins'
                }}
                itemStyle={{ color: '#FFFFFF' }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontFamily: 'Poppins' }}
              />
              <Line 
                type="monotone" 
                dataKey="Score 3C" 
                stroke="#1FD6FF" 
                strokeWidth={3} 
                dot={{ fill: '#1FD6FF', r: 4 }} 
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                dataKey="Conectar (C1)" 
                stroke="#2E7BFF" 
                strokeWidth={1.5} 
                strokeDasharray="4 4" 
                dot={{ fill: '#2E7BFF', r: 2 }} 
              />
              <Line 
                type="monotone" 
                dataKey="Clarificar (C2)" 
                stroke="#53E5DF" 
                strokeWidth={1.5} 
                strokeDasharray="3 3" 
                dot={{ fill: '#53E5DF', r: 2 }} 
              />
              <Line 
                type="monotone" 
                dataKey="Convertir (C3)" 
                stroke="#7FA4C7" 
                strokeWidth={1.5} 
                strokeDasharray="2 2" 
                dot={{ fill: '#7FA4C7', r: 2 }} 
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[#667085]">
            No hay evaluaciones en el periodo seleccionado.
          </div>
        )}
      </div>

    </div>
  );
};
