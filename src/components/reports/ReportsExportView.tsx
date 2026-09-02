import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FiltersBar } from '../common/FiltersBar';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  FileText, 
  CheckCircle2, 
  Calendar,
  Sparkles,
  Layers,
  Award
} from 'lucide-react';
import { calculateImpactAnalysis, generateExecutiveInsights, calculatePareto } from '../../utils/calculations';

export const ReportsExportView: React.FC = () => {
  const { filteredEvaluations, filteredAdvisors, actionPlans, interventions, config } = useApp();
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const impact = calculateImpactAnalysis(filteredEvaluations, filteredAdvisors);
  const insights = generateExecutiveInsights(filteredEvaluations, filteredAdvisors);
  const paretoGaps = calculatePareto(filteredEvaluations, 'ALL');

  const triggerCsvDownload = (filename: string, csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(filename);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  // Export 1: Evaluations CSV
  const exportEvaluationsCsv = () => {
    const headers = ['ID', 'Fecha', 'Hora', 'ID_Llamada', 'Codigo_Grabacion', 'Tipo', 'Asesor_ID', 'Supervisor_ID', 'Producto', 'Puntaje_3C', 'Puntaje_Conectar', 'Puntaje_Clarificar', 'Puntaje_Convertir', 'Venta', 'Resultado_Comercial', 'Brecha_Principal', 'Brecha_Secundaria'];
    const rows = filteredEvaluations.map(e => [
      e.id,
      e.date,
      e.time,
      e.callId,
      e.recordingCode,
      e.type,
      e.advisorId,
      e.supervisorId,
      `"${e.product}"`,
      e.scoreTotal,
      e.scoreConnect,
      e.scoreClarify,
      e.scoreConvert,
      e.sale ? 'SI' : 'NO',
      `"${e.saleResult}"`,
      `"${e.primaryGap}"`,
      `"${e.secondaryGap}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerCsvDownload(`Evaluaciones_3C_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  // Export 2: Pareto CSV
  const exportParetoCsv = () => {
    const headers = ['Ranking', 'Criterio_ID', 'Nombre_Criterio', 'Dimension', 'Frecuencia_Brechas', 'Porcentaje_Relativo', 'Porcentaje_Acumulado', 'Foco_Pareto_80'];
    const rows = paretoGaps.map((p, idx) => [
      idx + 1,
      p.criterionId,
      `"${p.name}"`,
      p.dimension,
      p.frequency,
      `${p.percentage}%`,
      `${p.cumulativePercentage}%`,
      p.isPareto80 ? 'SI' : 'NO'
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerCsvDownload(`Pareto_Brechas_3C_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  // Export 3: Action Plans CSV
  const exportActionPlansCsv = () => {
    const headers = ['ID_Plan', 'Asesor_ID', 'Criterio_ID', 'Objetivo', 'Accion_Concreta', 'Fecha_Meta', 'Fecha_Seguimiento', 'Responsable_ID', 'Estado', 'Notas'];
    const rows = actionPlans.map(p => [
      p.id,
      p.advisorId,
      p.criterionId,
      `"${p.objective}"`,
      `"${p.action}"`,
      p.targetDate,
      p.followUpDate,
      p.responsibleId,
      p.status,
      `"${p.notes || ''}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerCsvDownload(`Planes_Accion_3C_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="cm-workspace cm-reports flex-1 overflow-y-auto bg-slate-100/70">
      
      {/* Global Filters */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-700" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Generador de Reportes y Exportación de Datos
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Descarga bases de datos tabulares en formato CSV o imprime el informe ejecutivo.
            </p>
          </div>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Informe Ejecutivo</span>
          </button>
        </div>

        {downloadSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Archivo descargado exitosamente: <strong>{downloadSuccess}</strong></span>
          </div>
        )}

        {/* CSV Export Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 1: Evaluations CSV */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                <h3 className="font-bold text-xs text-slate-900">Base Completa de Evaluaciones</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Todas las fichas 3C con desglose de puntajes, dimensiones, llamadas, códigos y resultado comercial.
              </p>
              <div className="mt-3 text-[11px] text-slate-400">
                {filteredEvaluations.length} registros listos
              </div>
            </div>

            <button
              onClick={exportEvaluationsCsv}
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Evaluaciones (CSV)</span>
            </button>
          </div>

          {/* Card 2: Pareto CSV */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-700" />
                <h3 className="font-bold text-xs text-slate-900">Matriz de Pareto y Brechas</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Frecuencia de errores en nivel Crítico / En Desarrollo, porcentajes relativos y regla del 80/20.
              </p>
              <div className="mt-3 text-[11px] text-slate-400">
                9 criterios jerarquizados
              </div>
            </div>

            <button
              onClick={exportParetoCsv}
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Pareto (CSV)</span>
            </button>
          </div>

          {/* Card 3: Action Plans CSV */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-sky-700" />
                <h3 className="font-bold text-xs text-slate-900">Seguimiento de Planes de Acción</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Bitácora de compromisos, intervenciones asignadas, responsables y fechas de cumplimiento.
              </p>
              <div className="mt-3 text-[11px] text-slate-400">
                {actionPlans.length} planes registrados
              </div>
            </div>

            <button
              onClick={exportActionPlansCsv}
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-bold transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Planes (CSV)</span>
            </button>
          </div>

        </div>

        {/* Printable Executive Report Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 print:shadow-none print:border-none">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white font-black text-sm flex items-center justify-center">
                  3C
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Informe Ejecutivo de Consultoría Comercial & Comunicativa
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Campaña: Bitel Outbound Migraciones · Metodología 3C (Conectar - Clarificar - Convertir)
              </p>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>Fecha de Emisión: <strong>{new Date().toLocaleDateString('es-ES')}</strong></div>
              <div>Evaluaciones: <strong>{filteredEvaluations.length}</strong></div>
            </div>
          </div>

          {/* Executive Summary Scorecard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 font-medium block">Promedio 3C</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {Math.round(filteredEvaluations.reduce((a, b) => a + b.scoreTotal, 0) / (filteredEvaluations.length || 1))}%
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 font-medium block">Ganancia Impacto</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                +{impact.cohortAverageDelta.total} pts
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 font-medium block">Asesores Evaluados</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {filteredAdvisors.length}
              </span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 font-medium block">Efectividad de Venta</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {Math.round((filteredEvaluations.filter(e => e.sale).length / (filteredEvaluations.length || 1)) * 100)}%
              </span>
            </div>
          </div>

          {/* Key Findings List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
              Conclusiones Clave de la Consultoría
            </h3>
            <div className="space-y-2 text-xs text-slate-700">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[11px]">
                    {i + 1}
                  </span>
                  <p className="leading-relaxed">{ins}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
