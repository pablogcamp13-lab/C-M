import React, { useState } from 'react';
import { Evaluation } from '../../types';
import { useApp } from '../../context/AppContext';
import { CRITERIA_DEFINITIONS, SCALE_LEVELS } from '../../data/criteriaData';
import { StatusBadge } from '../common/StatusBadge';
import { ThreeScore } from '../common/ThreeScore';
import { AudioPlayer } from '../common/AudioPlayer';
import { getItemCompliance } from '../../utils/calculations';
import { 
  X, 
  Calendar, 
  Clock, 
  Phone, 
  FileAudio, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Lightbulb, 
  Target,
  ListTodo,
  Sparkles,
  ShieldAlert,
  MessageSquareText,
  PlayCircle
} from 'lucide-react';

interface EvaluationDetailModalProps {
  evaluation: Evaluation | null;
  onClose: () => void;
  onOpenNewActionPlan?: (evaluation: Evaluation) => void;
}

export const EvaluationDetailModal: React.FC<EvaluationDetailModalProps> = ({ 
  evaluation, 
  onClose,
  onOpenNewActionPlan 
}) => {
  if (!evaluation) return null;

  const { advisors, users } = useApp();
  const [seekToSeconds, setSeekToSeconds] = useState<number | null>(null);

  const parseTimestampToSeconds = (ts?: string): number | null => {
    if (!ts) return null;
    const clean = ts.replace(/[^0-9:]/g, '');
    const parts = clean.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    }
    return null;
  };

  const advisor = advisors.find(a => a.id === evaluation.advisorId);
  const evaluator = users.find(u => u.id === evaluation.evaluatorId);
  const supervisor = users.find(u => u.id === evaluation.supervisorId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="cm-modal cm-evaluation-modal max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Modal Header */}
        <div className="bg-[#031E3C] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-[#0B2B50]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FF6B00] text-white flex items-center justify-center font-bold text-sm font-heading">
              3C
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white font-heading">
                  Ficha de Evaluación Metodología 3C
                </h3>
                <StatusBadge status={evaluation.type} size="sm" />
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {advisor?.name} · {evaluation.callId} · {evaluation.date}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#0B2B50] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-[#F6F7F9]">
          
          {/* Metadata & Scores Top Card */}
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-[#E5E8EC] shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Advisor & Call Info */}
            <div className="md:col-span-2 space-y-2 text-xs border-b md:border-b-0 md:border-r border-[#E5E8EC] pb-4 md:pb-0 md:pr-4">
              <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider font-heading block">
                Datos de la Llamada
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[#667085] block text-[11px]">Asesor:</span>
                  <span className="font-bold text-[#031E3C]">{advisor?.name}</span>
                </div>
                <div>
                  <span className="text-[#667085] block text-[11px]">Supervisor:</span>
                  <span className="font-medium text-[#031E3C]">{supervisor?.name || 'Supervisor'}</span>
                </div>
                <div>
                  <span className="text-[#667085] block text-[11px]">Evaluador:</span>
                  <span className="font-medium text-[#031E3C]">{evaluator?.name}</span>
                </div>
                <div>
                  <span className="text-[#667085] block text-[11px]">Producto:</span>
                  <span className="font-medium text-[#031E3C]">{evaluation.product}</span>
                </div>
                <div>
                  <span className="text-[#667085] block text-[11px]">Resultado:</span>
                  <StatusBadge 
                    status={evaluation.sale ? 'VENTA' : 'NO_VENTA'} 
                    label={evaluation.sale ? 'Venta Concretada' : (evaluation.saleResult || 'No Venta')}
                  />
                </div>
              </div>
            </div>

            {/* Score 3C Breakdown */}
            <div className="md:col-span-2 flex flex-col justify-between pl-0 md:pl-2">
              <div>
                <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider font-heading block mb-2">
                  Puntaje de Calidad 3C
                </span>
                <div className="flex items-center gap-4">
                  <div className="text-center px-4 py-2 bg-[#031E3C] text-white rounded-xl shadow-xs">
                    <span className="text-2xl font-bold font-kpi text-[#FF6B00]">
                      {evaluation.scoreTotal !== null && evaluation.scoreTotal !== undefined ? `${evaluation.scoreTotal}%` : 'N/A'}
                    </span>
                    <span className="block text-[10px] uppercase font-semibold text-slate-300">Puntaje Calidad</span>
                  </div>
                  <div className="flex-1">
                    <ThreeScore 
                      connect={evaluation.scoreConnect}
                      clarify={evaluation.scoreClarify}
                      convert={evaluation.scoreConvert}
                      size="md"
                    />
                  </div>
                </div>
              </div>

              {evaluation.primaryGap && (
                <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs flex items-center gap-2 text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Brecha Crítica: <strong>{evaluation.primaryGap}</strong></span>
                </div>
              )}
            </div>

          </div>

          {/* Grabación de Audio (si existe) */}
          {(evaluation.audioUrl || evaluation.audioFileName || evaluation.recordingCode) && (
            <div className="bg-[#031E3C] text-white rounded-xl p-4 shadow-sm border border-[#0B2B50] space-y-2">
              <div className="flex items-center gap-2 border-b border-[#0B2B50] pb-2">
                <FileAudio className="w-4 h-4 text-[#FF6B00]" />
                <span className="font-bold text-xs uppercase tracking-wider text-white">
                  Grabación de la Llamada ({evaluation.recordingCode})
                </span>
              </div>
              <AudioPlayer
                audioUrl={evaluation.audioUrl}
                audioFileName={evaluation.audioFileName || `${evaluation.recordingCode}.mp3`}
                audioDurationSeconds={evaluation.audioDurationSeconds || 380}
                seekToSeconds={seekToSeconds}
                readOnly={true}
              />
            </div>
          )}

          {/* AI 3C Analysis Panel (if present) */}
          {(evaluation.aiAnalysis || evaluation.aiAlerts || evaluation.aiCallDescription) && (
            <div className="bg-gradient-to-br from-[#031E3C] to-[#0A2E5C] text-white rounded-xl p-4 sm:p-5 shadow-sm border border-[#0B2B50] space-y-4">
              <div className="flex items-center justify-between border-b border-[#0B2B50] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-[#FF6B00] text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-white uppercase tracking-wider font-heading">
                    Auditoría de Audio con IA · Metodología 3C
                  </h4>
                </div>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 font-semibold px-2 py-0.5 rounded-full border border-teal-500/30">
                  Gemini 3.7 Flash
                </span>
              </div>

              {/* Call Description */}
              {(evaluation.aiAnalysis?.callDescription || evaluation.aiCallDescription) && (
                <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1 font-heading">
                    <MessageSquareText className="w-3 h-3" />
                    Descripción General de la Interacción
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {evaluation.aiAnalysis?.callDescription || evaluation.aiCallDescription}
                  </p>
                </div>
              )}

              {/* 3C Alerts */}
              {(evaluation.aiAnalysis?.alerts || evaluation.aiAlerts) && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1 font-heading">
                    <ShieldAlert className="w-3 h-3" />
                    Alertas Críticas 3C ({(evaluation.aiAnalysis?.alerts || evaluation.aiAlerts || []).length})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(evaluation.aiAnalysis?.alerts || evaluation.aiAlerts || []).map((alert, idx) => {
                      const seconds = parseTimestampToSeconds(alert.timestamp);
                      return (
                        <div
                          key={alert.id || idx}
                          className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                            alert.severity === 'ALTA'
                              ? 'bg-rose-950/40 border-rose-700/60 text-rose-100'
                              : alert.severity === 'MEDIA'
                              ? 'bg-amber-950/40 border-amber-700/60 text-amber-100'
                              : 'bg-blue-950/40 border-blue-700/60 text-blue-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                alert.severity === 'ALTA' ? 'bg-rose-600 text-white' :
                                alert.severity === 'MEDIA' ? 'bg-amber-600 text-white' :
                                'bg-blue-600 text-white'
                              }`}>
                                {alert.severity}
                              </span>
                              <span className="text-[9px] font-bold text-slate-300 bg-slate-800 px-1.5 py-0.2 rounded">
                                {alert.pillar || '3C'}
                              </span>
                            </div>

                            {alert.timestamp && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (seconds !== null) setSeekToSeconds(seconds);
                                }}
                                className="text-[10px] text-teal-300 hover:text-teal-100 font-mono font-bold flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                              >
                                <PlayCircle className="w-3 h-3" />
                                Min {alert.timestamp}
                              </button>
                            )}
                          </div>

                          <h5 className="font-bold text-white text-[11px]">
                            {alert.title}
                          </h5>
                          <p className="text-[10px] text-slate-300 leading-snug">
                            {alert.description}
                          </p>
                          {alert.recommendation && (
                            <p className="text-[10px] text-teal-300 bg-slate-950/50 p-1 rounded">
                              <strong>Acción:</strong> {alert.recommendation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dimension Summaries if available */}
              {evaluation.aiAnalysis?.methodologySummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs pt-1">
                  <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-2 space-y-0.5">
                    <span className="text-[9px] font-bold uppercase text-blue-400 block font-heading">1. Conectar</span>
                    <p className="text-[10px] text-slate-300 leading-snug">{evaluation.aiAnalysis.methodologySummary.connectObservations}</p>
                  </div>
                  <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-2 space-y-0.5">
                    <span className="text-[9px] font-bold uppercase text-amber-400 block font-heading">2. Clarificar</span>
                    <p className="text-[10px] text-slate-300 leading-snug">{evaluation.aiAnalysis.methodologySummary.clarifyObservations}</p>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-2 space-y-0.5">
                    <span className="text-[9px] font-bold uppercase text-emerald-400 block font-heading">3. Convertir</span>
                    <p className="text-[10px] text-slate-300 leading-snug">{evaluation.aiAnalysis.methodologySummary.convertObservations}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Criteria Evaluation Breakdown */}
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-[#E5E8EC] shadow-2xs space-y-4">
            <h4 className="font-bold text-xs sm:text-sm text-[#031E3C] uppercase tracking-wider font-heading border-b border-[#E5E8EC] pb-2">
              Desglose Criterio por Criterio
            </h4>

            <div className="space-y-3">
              {evaluation.items.map((item, idx) => {
                const critDef = CRITERIA_DEFINITIONS.find(c => c.id === item.criterionId);
                const compliance = getItemCompliance(item);

                const dimLabel = 
                  critDef?.dimension === 'CONECTAR' ? 'COMUNICAR' : (critDef?.dimension || '3C');

                return (
                  <div 
                    key={item.criterionId}
                    className="p-3.5 rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] space-y-2 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          critDef?.dimension === 'CONECTAR' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          critDef?.dimension === 'CLARIFICAR' ? 'bg-amber-50 text-amber-800 border-amber-200' : 
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {dimLabel}
                        </span>
                        <h5 className="font-bold text-[#031E3C] text-xs">
                          {idx + 1}. {critDef?.name}
                        </h5>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge 
                          status={compliance}
                          label={
                            compliance === 'CUMPLE' ? 'Cumple · 100%' :
                            compliance === 'NO_CUMPLE' ? 'No cumple · 0%' :
                            'No aplica · Excluido'
                          }
                          size="sm"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-[#667085] leading-relaxed">
                      {critDef?.description}
                    </p>

                    {(item.finding || item.recommendation) && (
                      <div className="pt-2 border-t border-[#E5E8EC]/80 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        {item.finding && (
                          <div>
                            <strong className="text-[#031E3C] font-semibold">Hallazgo:</strong>
                            <p className="text-[#667085] mt-0.5">{item.finding}</p>
                          </div>
                        )}
                        {item.recommendation && (
                          <div>
                            <strong className="text-[#FF6B00] font-semibold">Acción sugerida:</strong>
                            <p className="text-[#667085] mt-0.5">{item.recommendation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evaluator Notes */}
          {evaluation.comments && (
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-[#E5E8EC] shadow-2xs space-y-2 text-xs">
              <h4 className="font-bold text-xs text-[#031E3C] uppercase tracking-wider font-heading">
                Conclusiones del Evaluador
              </h4>
              <p className="text-[#667085] leading-relaxed bg-[#F6F7F9] p-3 rounded-lg border border-[#E5E8EC]">
                {evaluation.comments}
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-white border-t border-[#E5E8EC] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#667085] hover:text-[#031E3C] hover:bg-[#F6F7F9] rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          {onOpenNewActionPlan && (
            <button
              onClick={() => {
                onOpenNewActionPlan(evaluation);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <ListTodo className="w-4 h-4" />
              <span>Crear Plan de Acción a partir de esta Ficha</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
