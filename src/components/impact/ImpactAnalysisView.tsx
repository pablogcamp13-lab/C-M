import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateImpactAnalysis, calculateGlobalOperationalSummary, calculateAdvisorOperationalAnalysis, formatMinutesToHuman, formatMinutesDelta, formatSphDelta } from '../../utils/calculations';
import { FiltersBar } from '../common/FiltersBar';
import { 
  TrendingUp, 
  Award, 
  ArrowDownRight, 
  CheckCircle2, 
  Users, 
  Lightbulb, 
  Layers,
  Gauge,
  Clock,
  Activity,
  BarChart2,
  ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';

interface ImpactAnalysisViewProps {
  onSelectAdvisor?: (advisorId: string) => void;
}

export const ImpactAnalysisView: React.FC<ImpactAnalysisViewProps> = ({ onSelectAdvisor }) => {
  const { filteredEvaluations, filteredAdvisors, operationalMeasurements } = useApp();
  const [activeLevel, setActiveLevel] = useState<'NIVEL_1' | 'NIVEL_2'>('NIVEL_1');

  // Level 1: 3C Behavioral Impact Analysis
  const impact = calculateImpactAnalysis(filteredEvaluations, filteredAdvisors);
  const cohortComparisons = impact.comparisons;
  const count = cohortComparisons.length || 1;

  const initialTotalAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.initialScores.total, 0) / count);
  const lastTotalAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.lastScores.total, 0) / count);

  const initialConnectAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.initialScores.connect, 0) / count);
  const lastConnectAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.lastScores.connect, 0) / count);

  const initialClarifyAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.initialScores.clarify, 0) / count);
  const lastClarifyAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.lastScores.clarify, 0) / count);

  const initialConvertAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.initialScores.convert, 0) / count);
  const lastConvertAvg = Math.round(cohortComparisons.reduce((a, b) => a + b.lastScores.convert, 0) / count);

  // Top improved vs stagnant (Level 1)
  const sortedByDelta = [...cohortComparisons].sort((a, b) => b.delta.total - a.delta.total);
  const topImproved = sortedByDelta.slice(0, 5);
  const stagnant = [...cohortComparisons].sort((a, b) => a.delta.total - b.delta.total).slice(0, 5);

  // Level 2: Operational Impact Analysis
  const opSummary = calculateGlobalOperationalSummary(filteredAdvisors, operationalMeasurements);

  const globalConnDelta = formatMinutesDelta(opSummary.deltaAvgMinutes);
  const globalSphDelta = formatSphDelta(opSummary.deltaAvgSph);

  // Correlation analysis between 3C improvement and SPH gain
  const correlationData = opSummary.advisorsAnalysis.map(a => {
    const matchingCohort = cohortComparisons.find(c => c.advisorId === a.advisorId);
    return {
      name: a.advisorName,
      deltaScore3C: matchingCohort ? matchingCohort.delta.total : 0,
      deltaSph: a.delta.sph,
      latestSph: a.latest.sph,
      connectionGainMinutes: a.delta.connectionMinutes
    };
  });

  // Prepare dimension chart data for Level 1
  const dimensionChartData = [
    {
      dimension: 'Promedio 3C Global',
      'Antes (Diagnóstico)': initialTotalAvg,
      'Después (Reevaluación)': lastTotalAvg,
      incremento: impact.cohortAverageDelta.total
    },
    {
      dimension: '1. Conectar',
      'Antes (Diagnóstico)': initialConnectAvg,
      'Después (Reevaluación)': lastConnectAvg,
      incremento: impact.cohortAverageDelta.connect
    },
    {
      dimension: '2. Clarificar',
      'Antes (Diagnóstico)': initialClarifyAvg,
      'Después (Reevaluación)': lastClarifyAvg,
      incremento: impact.cohortAverageDelta.clarify
    },
    {
      dimension: '3. Convertir',
      'Antes (Diagnóstico)': initialConvertAvg,
      'Después (Reevaluación)': lastConvertAvg,
      incremento: impact.cohortAverageDelta.convert
    }
  ];

  // Prepare Operational Bar Chart Data for Level 2 (SPH by Advisor)
  const opSphChartData = opSummary.advisorsAnalysis.map(a => ({
    name: a.advisorName.split(' ')[0],
    'Línea Base SPH': Number(a.baseline.sph.toFixed(2)),
    'Actual SPH': Number(a.latest.sph.toFixed(2)),
    delta: a.delta.sph
  }));

  return (
    <div className="cm-workspace cm-impact flex-1 overflow-y-auto bg-[#F6F7F9]">
      
      {/* Global Filters */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Navigation Tabs for Level 1 vs Level 2 */}
        <div className="flex items-center justify-between border-b border-[#E7E9ED] -mb-1">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveLevel('NIVEL_1')}
              className={`text-xs font-semibold pb-3 flex items-center gap-2 transition-colors cursor-pointer relative ${
                activeLevel === 'NIVEL_1'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Layers className="w-4 h-4 text-[#031E3C]" />
              <span>NIVEL 1 – Desempeño 3C (Conductual)</span>
              {activeLevel === 'NIVEL_1' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveLevel('NIVEL_2')}
              className={`text-xs font-semibold pb-3 flex items-center gap-2 transition-colors cursor-pointer relative ${
                activeLevel === 'NIVEL_2'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Gauge className="w-4 h-4 text-[#FF7A00]" />
              <span>NIVEL 2 – Impacto Operacional (Negocio)</span>
              {activeLevel === 'NIVEL_2' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00] rounded-full" />
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#667085]">
            <span>Metodología 3C</span>
            <span className="text-[#98A2B3]">·</span>
            <span className="font-medium text-[#031E3C]">C&M Impact Suite</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* LEVEL 1: 3C BEHAVIORAL IMPACT                             */}
        {/* ========================================================= */}
        {activeLevel === 'NIVEL_1' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header Hero Banner */}
            <div className="bg-[#031E3C] text-white rounded-2xl p-6 sm:p-7 border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF7A00] bg-white/10 px-2.5 py-1 rounded-full border border-white/15">
                  Nivel 1: Retorno Metodológico 3C
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-3 tracking-tight">
                  Evolución de Habilidades 3C: Antes vs Después
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  ¿Dónde estaba la brecha del asesor y cuánto avanzó tras el entrenamiento? Comparativa entre diagnóstico inicial y última evaluación.
                </p>
              </div>

              <div className="bg-white/10 border border-white/15 rounded-xl p-4 text-center shrink-0 min-w-[210px]">
                <span className="text-[10px] uppercase font-bold text-slate-300 block">Ganancia Promedio de Cohorte</span>
                <div className="text-3xl font-black text-emerald-400 mt-1 flex items-center justify-center gap-1 font-mono">
                  <TrendingUp className="w-6 h-6" />
                  <span>+{impact.cohortAverageDelta.total} pts</span>
                </div>
                <span className="text-[11px] text-slate-300 mt-0.5 block">
                  De {initialTotalAvg}% a {lastTotalAvg}%
                </span>
              </div>
            </div>

            {/* 4 Cards: Dimension Gains */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] block">Puntaje Global 3C</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-[#031E3C] font-mono">+{impact.cohortAverageDelta.total} pts</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {initialTotalAvg}% → {lastTotalAvg}%
                  </span>
                </div>
                <div className="text-[11px] text-[#667085] mt-2">
                  {cohortComparisons.length} asesores reevaluados
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#031E3C] block">1. Conectar (C1)</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-[#031E3C] font-mono">+{impact.cohortAverageDelta.connect} pts</span>
                  <span className="text-xs font-bold text-[#031E3C] bg-slate-100 px-2 py-0.5 rounded">
                    {initialConnectAvg}% → {lastConnectAvg}%
                  </span>
                </div>
                <div className="text-[11px] text-[#667085] mt-2">
                  Apertura y tono consultivo
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 block">2. Clarificar (C2)</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-slate-800 font-mono">+{impact.cohortAverageDelta.clarify} pts</span>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {initialClarifyAvg}% → {lastClarifyAvg}%
                  </span>
                </div>
                <div className="text-[11px] text-[#667085] mt-2">
                  Indagación y propuesta de valor
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7A00] block">3. Convertir (C3)</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-[#FF7A00] font-mono">+{impact.cohortAverageDelta.convert} pts</span>
                  <span className="text-xs font-bold text-[#FF7A00] bg-orange-50 px-2 py-0.5 rounded">
                    {initialConvertAvg}% → {lastConvertAvg}%
                  </span>
                </div>
                <div className="text-[11px] text-[#667085] mt-2">
                  Cierre y manejo de objeciones
                </div>
              </div>

            </div>

            {/* Group Comparison Chart */}
            <div className="bg-white border border-[#E7E9ED] rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-[#031E3C]">
                    Comparativa de Medias por Pilar 3C (Antes vs Después)
                  </h3>
                  <p className="text-xs text-[#667085]">
                    Demostración cuantitativa del crecimiento en habilidades conductuales
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dimensionChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dimension" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#031E3C',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f8fafc'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="Antes (Diagnóstico)" fill="var(--cm-chart-baseline)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Después (Reevaluación)" fill="var(--cm-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Improved vs Stagnant Advisors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Top Improved */}
              <div className="bg-white border border-[#E7E9ED] rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider">
                        Asesores con Mayor Evolución (+Pts)
                      </h3>
                    </div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                      Casos de Éxito
                    </span>
                  </div>

                  <div className="space-y-2">
                    {topImproved.map((item, idx) => (
                      <button
                        key={item.advisorId}
                        onClick={() => onSelectAdvisor && onSelectAdvisor(item.advisorId)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 transition-all text-left text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-[#031E3C]">{item.advisorName}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.initialScores.total}% → {item.lastScores.total}%
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-sm text-emerald-700 font-mono">+{item.delta.total} pts</span>
                          <span className="block text-[10px] text-slate-400 font-medium">Incremento</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                  Asesores que aplicaron con éxito las intervenciones de la consultoría.
                </div>
              </div>

              {/* Stagnant Advisors */}
              <div className="bg-white border border-[#E7E9ED] rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-4 h-4 text-rose-600" />
                      <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider">
                        Asesores con Menor Avance o Estancamiento
                      </h3>
                    </div>
                    <span className="text-[10px] bg-rose-50 text-rose-800 font-bold px-2 py-0.5 rounded border border-rose-200">
                      Refuerzo Urgente
                    </span>
                  </div>

                  <div className="space-y-2">
                    {stagnant.map((item, idx) => (
                      <button
                        key={item.advisorId}
                        onClick={() => onSelectAdvisor && onSelectAdvisor(item.advisorId)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-rose-50/60 border border-slate-200 hover:border-rose-300 transition-all text-left text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px] flex items-center justify-center font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-[#031E3C]">{item.advisorName}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.initialScores.total}% → {item.lastScores.total}%
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`font-black text-sm font-mono ${item.delta.total >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                            {item.delta.total >= 0 ? `+${item.delta.total}` : item.delta.total} pts
                          </span>
                          <span className="block text-[10px] text-slate-400 font-medium">Variación</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                  Recomendación: Programar sesión de feedback 1 a 1 y reevaluación en 5 días.
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* LEVEL 2: OPERATIONAL IMPACT (BUSINESS METRICS)            */}
        {/* ========================================================= */}
        {activeLevel === 'NIVEL_2' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header Hero Banner Level 2 */}
            <div className="bg-[#031E3C] text-white rounded-2xl p-6 sm:p-7 border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF7A00] bg-white/10 px-2.5 py-1 rounded-full border border-white/15">
                  Nivel 2: Impacto Operacional de Negocio
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-3 tracking-tight">
                  Medición Operacional: Tiempo de Conexión & SPH
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  ¿La intervención sobre las habilidades 3C está generando una mejora real en el desempeño operacional? Medición aislada del Score 3C.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 text-center min-w-[130px]">
                  <span className="text-[10px] uppercase font-bold text-slate-300 block">Δ Conexión Prom.</span>
                  <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                    {globalConnDelta.text}
                  </div>
                  <span className="text-[10px] text-slate-300 mt-0.5 block">
                    {opSummary.connectionPctGain > 0 ? `+${opSummary.connectionPctGain}%` : `${opSummary.connectionPctGain}%`}
                  </span>
                </div>

                <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 text-center min-w-[130px]">
                  <span className="text-[10px] uppercase font-bold text-slate-300 block">Δ SPH Prom.</span>
                  <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                    {globalSphDelta.text}
                  </div>
                  <span className="text-[10px] text-slate-300 mt-0.5 block">
                    {opSummary.sphPctGain > 0 ? `+${opSummary.sphPctGain}%` : `${opSummary.sphPctGain}%`}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Operational KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Conexión Línea Base</span>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-2xl font-black text-slate-800 font-mono mt-2">
                  {formatMinutesToHuman(opSummary.baselineAvgMinutes)}
                </div>
                <div className="text-[11px] text-[#667085] mt-1">
                  Promedio de inicio de cohorte
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#031E3C]">Conexión Actual</span>
                  <Clock className="w-3.5 h-3.5 text-[#031E3C]" />
                </div>
                <div className="text-2xl font-black text-[#031E3C] font-mono mt-2">
                  {formatMinutesToHuman(opSummary.currentAvgMinutes)}
                </div>
                <div className="text-[11px] font-bold text-emerald-700 mt-1 font-mono">
                  {globalConnDelta.text} vs. Línea Base
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">SPH Línea Base</span>
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-2xl font-black text-slate-800 font-mono mt-2">
                  {opSummary.baselineAvgSph.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#667085] mt-1">
                  Ventas / Hora promedio inicial
                </div>
              </div>

              <div className="bg-white border border-[#E7E9ED] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7A00]">SPH Actual</span>
                  <TrendingUp className="w-3.5 h-3.5 text-[#FF7A00]" />
                </div>
                <div className="text-2xl font-black text-[#FF7A00] font-mono mt-2">
                  {opSummary.currentAvgSph.toFixed(2)}
                </div>
                <div className="text-[11px] font-bold text-emerald-700 mt-1 font-mono">
                  {globalSphDelta.text} ({opSummary.sphPctGain > 0 ? `+${opSummary.sphPctGain}%` : `${opSummary.sphPctGain}%`})
                </div>
              </div>

            </div>

            {/* SPH Comparison Bar Chart */}
            <div className="bg-white border border-[#E7E9ED] rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-[#031E3C]">
                    Impacto en SPH por Asesor (Línea Base vs Actual)
                  </h3>
                  <p className="text-xs text-[#667085]">
                    Incremento en la tasa de conversión y ventas por hora trabajada
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opSphChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" domain={[0, 'dataMax + 0.05']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#031E3C',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f8fafc'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="Línea Base SPH" fill="var(--cm-chart-baseline)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Actual SPH" fill="var(--cm-chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Advisor Operational Comparison Master Table */}
            <div className="bg-white border border-[#E7E9ED] rounded-xl overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-[#031E3C]">
                    Matriz de Medición Operacional por Asesor ({opSummary.cohortCount})
                  </h3>
                  <p className="text-[11px] text-[#667085]">
                    Desglose de Línea Base vs Última Medición Registrada
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Asesor</th>
                      <th className="px-4 py-3">T. Conexión Base</th>
                      <th className="px-4 py-3">T. Conexión Actual</th>
                      <th className="px-4 py-3">Δ Conexión</th>
                      <th className="px-4 py-3">SPH Base</th>
                      <th className="px-4 py-3">SPH Actual</th>
                      <th className="px-4 py-3">Δ SPH</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {opSummary.advisorsAnalysis.map(a => {
                      const dConn = formatMinutesDelta(a.delta.connectionMinutes);
                      const dSph = formatSphDelta(a.delta.sph);
                      return (
                        <tr key={a.advisorId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-[#031E3C]">{a.advisorName}</div>
                            <div className="text-[10px] text-slate-400">Ref: {a.baseline.period}</div>
                          </td>

                          <td className="px-4 py-3 font-mono font-medium text-slate-600">
                            {a.baseline.connectionTime}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-[#031E3C]">
                            {a.latest.connectionTime}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold">
                            <span className={dConn.isPositive ? 'text-emerald-700' : dConn.isNegative ? 'text-rose-600' : 'text-slate-500'}>
                              {dConn.text}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-mono font-medium text-slate-600">
                            {a.baseline.sph.toFixed(2)}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-[#FF7A00]">
                            {a.latest.sph.toFixed(2)}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold">
                            <span className={dSph.isPositive ? 'text-emerald-700' : dSph.isNegative ? 'text-rose-600' : 'text-slate-500'}>
                              {dSph.text} ({a.delta.sphPct > 0 ? `+${a.delta.sphPct}%` : `${a.delta.sphPct}%`})
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => onSelectAdvisor && onSelectAdvisor(a.advisorId)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-[#031E3C] hover:text-white rounded-lg font-semibold text-slate-700 transition-colors"
                            >
                              Ver Perfil
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
