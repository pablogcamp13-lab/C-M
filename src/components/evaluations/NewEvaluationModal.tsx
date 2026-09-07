import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  EvaluationType, 
  DimensionId, 
  EvaluationItem, 
  Evaluation,
  Advisor,
  ComplianceStatus
} from '../../types';
import { 
  CRITERIA_DEFINITIONS, 
  SCALE_LEVELS, 
  AUTOMATIC_RECOMMENDATIONS 
} from '../../data/criteriaData';
import { 
  X, 
  Save, 
  Sparkles,
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle,
  ArrowRight,
  ListTodo,
  FileAudio,
  Clock,
  Music,
  Upload,
  Plus,
  Check,
  MessageSquareText
} from 'lucide-react';
import { calculateEvaluationSummary } from '../../utils/calculations';
import { AudioPlayer } from '../common/AudioPlayer';
import { COMMERCIAL_PLANS } from '../../data/plansData';
import { filesApi } from '../../api/sharedRepository';

interface NewEvaluationModalProps {
  onClose: () => void;
  onSuccess?: (evaluation: Evaluation) => void;
  onOpenActionPlanWithEval?: (evaluation: Evaluation) => void;
  preselectedCampaignId?: string;
  preselectedOperationId?: string | null;
  preselectedAdvisor?: Advisor | null;
}

export const NewEvaluationModal: React.FC<NewEvaluationModalProps> = ({ 
  onClose, 
  onSuccess,
  onOpenActionPlanWithEval,
  preselectedCampaignId,
  preselectedOperationId,
  preselectedAdvisor
}) => {
  const { advisors, users, campaigns, teams, currentUser, config, addEvaluation } = useApp();

  // Evaluators (exclude ASESOR role)
  const evaluators = useMemo(() => currentUser.role === 'MONITOR' ? [currentUser] : users.filter(u => u.role !== 'ASESOR'), [users, currentUser]);

  // Form State
  const campaignAdvisors = advisors.filter(advisor => advisor.status === 'ACTIVO' && advisor.active !== false && (!preselectedCampaignId || advisor.campaignId === preselectedCampaignId) && (!preselectedOperationId || advisor.operationId === preselectedOperationId));
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>(preselectedAdvisor?.id || campaignAdvisors[0]?.id || '');
  const [selectedCampaignId] = useState<string>(preselectedCampaignId || preselectedAdvisor?.campaignId || campaigns[0]?.id || 'camp_bitel_migra');
  const [product, setProduct] = useState<string>(COMMERCIAL_PLANS[1]?.name || 'Plan Ilimitado S/ 39.90');
  const [evaluatorId, setEvaluatorId] = useState<string>(() => {
    if (currentUser && currentUser.role !== 'ASESOR') return currentUser.id;
    return users.find(u => u.role !== 'ASESOR')?.id || currentUser.id;
  });
  const [evalDate, setEvalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [evalTime, setEvalTime] = useState<string>('10:30');
  const [callId, setCallId] = useState<string>(`LLAM-${Math.floor(10000 + Math.random() * 90000)}`);
  const [recordingCode, setRecordingCode] = useState<string>(`REC-2025-${Math.floor(1000 + Math.random() * 9000)}`);
  const [evalType, setEvalType] = useState<EvaluationType>('DIAGNOSTICO_INICIAL');
  const [sale, setSale] = useState<boolean>(false);
  const [saleResult, setSaleResult] = useState<string>('No Venta - Dudas sobre recarga BiPay');
  const [comments, setComments] = useState<string>('');

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioFileSize, setAudioFileSize] = useState<number>(0);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number>(380);
  const [currentPlaybackSeconds, setCurrentPlaybackSeconds] = useState<number>(0);
  const [formattedTimestamp, setFormattedTimestamp] = useState<string>('00:00');
  const [saveError, setSaveError] = useState<string | null>(null);

  // A criterion starts unanswered. It only enters the score after the evaluator
  // records a result; "No aplica" is explicitly excluded from the denominator.
  const [criteriaScores, setCriteriaScores] = useState<Record<string, {
    compliance?: ComplianceStatus;
    level: 0 | 1 | 2 | 3 | 4;
    percentage: number;
    finding: string;
    evidence: string;
    recommendedAction: string;
  }>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [openGuides, setOpenGuides] = useState<Record<string, boolean>>({});
  const [draftSaved, setDraftSaved] = useState(false);

  // Accordion open states
  const [openDimensions, setOpenDimensions] = useState<Record<DimensionId, boolean>>({
    CONECTAR: true,
    CLARIFICAR: true,
    CONVERTIR: true
  });

  // Result screen modal step
  const [savedEvaluation, setSavedEvaluation] = useState<Evaluation | null>(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedAdvisor = advisors.find(a => a.id === selectedAdvisorId);
  const selectedSupervisor = users.find(u => u.id === selectedAdvisor?.supervisorId);
  const selectedTeam = teams.find(t => t.id === selectedAdvisor?.teamId);

  // Compute live score preview
  const currentItemsList: EvaluationItem[] = CRITERIA_DEFINITIONS.map(c => {
    const s = criteriaScores[c.id] || {
      compliance: undefined,
      level: 0,
      percentage: 0,
      finding: '',
      evidence: '',
      recommendedAction: ''
    };
    return {
      id: `score_${c.id}`,
      criterionId: c.id,
      dimension: c.dimensionId,
      compliance: s.compliance,
      level: s.compliance === 'CUMPLE' ? 4 : s.compliance === 'NO_CUMPLE' ? 1 : 0,
      percentage: s.compliance === 'CUMPLE' ? 100 : 0,
      finding: s.finding,
      evidence: s.evidence,
      recommendedAction: s.recommendedAction
    };
  });

  const liveSummary = calculateEvaluationSummary(currentItemsList.filter(item => item.compliance !== undefined), config);
  const d3cScore = useMemo(() => {
    const answered = currentItemsList.filter(item => item.compliance !== undefined);
    const evaluable = answered.filter(item => item.compliance !== 'NO_APLICA');
    const fulfilled = evaluable.filter(item => item.compliance === 'CUMPLE');
    return {
      answered: answered.length,
      evaluable: evaluable.length,
      fulfilled: fulfilled.length,
      total: evaluable.length ? Math.round((fulfilled.length / evaluable.length) * 100) : null
    };
  }, [currentItemsList]);

  const configuredWeights = `C1 ${config.weights.CONECTAR}% · C2 ${config.weights.CLARIFICAR}% · C3 ${config.weights.CONVERTIR}%`;

  const handleComplianceChange = (criterionId: string, compliance: ComplianceStatus) => {
    const autoRec = compliance === 'NO_CUMPLE' ? (AUTOMATIC_RECOMMENDATIONS[criterionId]?.[1] || '') : '';
    const pct = compliance === 'CUMPLE' ? 100 : 0;
    const lvl = compliance === 'CUMPLE' ? 4 : compliance === 'NO_CUMPLE' ? 1 : 0;

    setCriteriaScores(prev => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        compliance,
        level: lvl,
        percentage: pct,
        recommendedAction: compliance === 'NO_CUMPLE' && (!prev[criterionId]?.recommendedAction || prev[criterionId]?.recommendedAction === '')
          ? autoRec
          : prev[criterionId]?.recommendedAction || ''
      }
    }));
  };

  const handleApplyAutoRec = (criterionId: string) => {
    const autoRec = AUTOMATIC_RECOMMENDATIONS[criterionId]?.[1] || 'Reforzar coaching focalizado en este criterio.';
    setCriteriaScores(prev => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        recommendedAction: autoRec
      }
    }));
  };

  const handleAudioUpload = (file: File, objectUrl: string, durationSeconds: number) => {
    setAudioFile(file);
    setAudioUrl(objectUrl);
    setAudioFileName(file.name);
    setAudioFileSize(file.size);
    setAudioDurationSeconds(durationSeconds || 380);
    // Suggest recording code from file name
    if (file.name) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
      setRecordingCode(cleanName);
    }
  };

  const handleRemoveAudio = () => {
    setAudioFile(null);
    setAudioUrl('');
    setAudioFileName('');
    setAudioFileSize(0);
  };

  const handleInsertTimestampToCriterion = (criterionId: string) => {
    const ts = formattedTimestamp;
    setCriteriaScores(prev => {
      const currentEvidence = prev[criterionId]?.evidence || '';
      const prefix = currentEvidence ? `${currentEvidence} · ` : '';
      return {
        ...prev,
        [criterionId]: {
          ...prev[criterionId],
          evidence: `${prefix}Min ${ts}`
        }
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvisor || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    let persistedAudioUrl = audioUrl;
    if (audioFile) {
      try { persistedAudioUrl = (await filesApi.upload(audioFile)).url || audioUrl; }
      catch (error: any) { setSaveError(error.message || 'No fue posible guardar el audio.'); savingRef.current = false; setIsSaving(false); return; }
    }

    const evaluationToSave = {
      advisorId: selectedAdvisor.id,
      supervisorId: selectedAdvisor.supervisorId,
      teamId: selectedAdvisor.teamId,
      campaignId: selectedCampaignId,
      evaluatorId: evaluatorId,
      date: evalDate,
      time: evalTime,
      callId: callId,
      recordingCode: recordingCode,
      type: evalType,
      sale: sale,
      saleResult: sale ? 'Venta Concretada' : saleResult,
      product: product,
      comments: comments,
      audioUrl: persistedAudioUrl || undefined,
      audioFileName: audioFileName || undefined,
      audioFileSize: audioFileSize || undefined,
      audioDurationSeconds: audioDurationSeconds || undefined,
      items: currentItemsList
    };

    try {
      const result = await addEvaluation(evaluationToSave);
      setSavedEvaluation(result);
      if (onSuccess) onSuccess(result);
    } catch (error: any) {
      setSaveError(error.message || 'No fue posible guardar el registro de Mejora Continua.');
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // If already saved, show Instant Result Screen (Section 8)
  if (savedEvaluation) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="cm-modal cm-evaluation-modal max-w-2xl w-full p-6 sm:p-8 animate-in fade-in zoom-in-95">
          
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              ¡Evaluación 3C Guardada con Éxito!
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ficha procesada para {selectedAdvisor?.name} ({evalType})
            </p>
          </div>

          {/* Result Card */}
          <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
                  Puntaje Global de Calidad 3C
                </span>
                <span className="text-4xl font-black text-white">
                  {savedEvaluation.scoreTotal !== null && savedEvaluation.scoreTotal !== undefined ? `${savedEvaluation.scoreTotal}%` : 'N/A'}
                </span>
              </div>

              <div className="flex gap-2">
                <div className="text-center bg-sky-950/70 border border-sky-800 px-3 py-1.5 rounded-lg">
                  <span className="text-[10px] text-sky-400 font-bold uppercase block">Comunicar</span>
                  <span className="text-base font-bold text-sky-200">
                    {savedEvaluation.scoreConnect !== null && savedEvaluation.scoreConnect !== undefined ? `${savedEvaluation.scoreConnect}%` : 'N/A'}
                  </span>
                </div>
                <div className="text-center bg-amber-950/70 border border-amber-800 px-3 py-1.5 rounded-lg">
                  <span className="text-[10px] text-amber-400 font-bold uppercase block">Clarificar</span>
                  <span className="text-base font-bold text-amber-200">
                    {savedEvaluation.scoreClarify !== null && savedEvaluation.scoreClarify !== undefined ? `${savedEvaluation.scoreClarify}%` : 'N/A'}
                  </span>
                </div>
                <div className="text-center bg-emerald-950/70 border border-emerald-800 px-3 py-1.5 rounded-lg">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase block">Convertir</span>
                  <span className="text-base font-bold text-emerald-200">
                    {savedEvaluation.scoreConvert !== null && savedEvaluation.scoreConvert !== undefined ? `${savedEvaluation.scoreConvert}%` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] font-bold text-rose-400 uppercase block">Brecha Principal:</span>
                <span className="font-semibold text-slate-200">{savedEvaluation.primaryGap}</span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] font-bold text-amber-400 uppercase block">Brecha Secundaria:</span>
                <span className="font-semibold text-slate-200">{savedEvaluation.secondaryGap}</span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] font-bold text-emerald-400 uppercase block">Fortaleza:</span>
                <span className="font-semibold text-slate-200">{savedEvaluation.strongestPillar}</span>
              </div>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 text-xs">
              <span className="font-bold text-teal-300 block mb-1">Recomendación de Calidad:</span>
              <p className="text-slate-300 leading-relaxed">{savedEvaluation.recommendation}</p>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cerrar y Ver Listado
            </button>
            {onOpenActionPlanWithEval && (
              <button
                onClick={() => {
                  onClose();
                  onOpenActionPlanWithEval(savedEvaluation);
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors"
              >
                <ListTodo className="w-4 h-4" />
                <span>Generar Plan de Acción Inmediato</span>
              </button>
            )}
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="cm-modal cm-evaluation-modal max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-white text-[#102A2E] px-6 py-4 flex items-center justify-between border-b border-[#E2E9E9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004F50] text-white flex items-center justify-center font-black text-sm">
              D+3C
            </div>
            <div>
              <h3 className="font-bold text-lg">Evaluación MEJORA CONTINUA · D+3C</h3>
              <p className="text-xs text-[#66767A]">{configuredWeights}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#102A2E] p-1.5 rounded-lg hover:bg-[#F1F6F6] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* Section 1: Header / Metadata Fields */}
          <div className="bg-[#FBFCFC] border border-[#E2E9E9] rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
              1. Datos Generales de la Llamada y Asesor
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              
              {/* Asesor Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Asesor a Evaluar *
                </label>
                <select
                  value={selectedAdvisorId}
                  onChange={(e) => setSelectedAdvisorId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium text-slate-800"
                  required
                >
                  {campaignAdvisors.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.employeeCode})
                    </option>
                  ))}
                </select>
                {selectedAdvisor && (
                  <div className="text-[10px] text-slate-500 mt-1 font-medium">
                    DNI: {selectedAdvisor.dni} · Sup: {selectedSupervisor?.name || 'Supervisor'}
                  </div>
                )}
              </div>

              {/* Evaluador */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Evaluador / Consultor *
                </label>
                <select
                  value={evaluatorId}
                  onChange={(e) => setEvaluatorId(e.target.value)}
                  disabled={currentUser.role === 'MONITOR'}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium text-slate-800"
                  required
                >
                  {evaluators.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Evaluación */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tipo de Evaluación *
                </label>
                <select
                  value={evalType}
                  onChange={(e) => setEvalType(e.target.value as EvaluationType)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium text-slate-800"
                  required
                >
                  <option value="DIAGNOSTICO_INICIAL">Diagnóstico Inicial</option>
                  <option value="SEGUIMIENTO">Seguimiento</option>
                  <option value="COACHING">Coaching</option>
                  <option value="REEVALUACION">Reevaluación</option>
                  <option value="CERTIFICACION">Certificación</option>
                </select>
              </div>

              {/* Producto / Plan Ofrecido */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Producto / Plan Ofrecido *
                </label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium text-slate-800"
                  required
                >
                  {COMMERCIAL_PLANS.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} — BiPay: S/ {p.bipayPayment.toFixed(2)} (Retorno: S/ {p.bipayReturn.toFixed(2)})
                    </option>
                  ))}
                </select>

                {/* Selected Plan Details Card */}
                {(() => {
                  const selectedPlan = COMMERCIAL_PLANS.find(p => p.name === product);
                  if (!selectedPlan) return null;
                  return (
                    <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px] grid grid-cols-3 gap-1 text-center">
                      <div className="bg-white p-1 rounded border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Cargo Fijo</span>
                        <span className="font-mono font-bold text-[#031E3C]">S/ {selectedPlan.fixedFee.toFixed(2)}</span>
                      </div>
                      <div className="bg-emerald-50/70 p-1 rounded border border-emerald-100">
                        <span className="text-emerald-700 block text-[9px] uppercase font-bold">Pago BiPay</span>
                        <span className="font-mono font-bold text-emerald-800">S/ {selectedPlan.bipayPayment.toFixed(2)}</span>
                      </div>
                      <div className="bg-amber-50/70 p-1 rounded border border-amber-100">
                        <span className="text-amber-700 block text-[9px] uppercase font-bold">Retorno BiPay</span>
                        <span className="font-mono font-bold text-[#FF6B00]">S/ {selectedPlan.bipayReturn.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Fecha */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Fecha de Llamada
                </label>
                <input
                  type="date"
                  value={evalDate}
                  onChange={(e) => setEvalDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                  required
                />
              </div>

              {/* Hora */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Hora de Llamada
                </label>
                <input
                  type="time"
                  value={evalTime}
                  onChange={(e) => setEvalTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                  required
                />
              </div>

              {/* ID Llamada */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ID de Llamada
                </label>
                <input
                  type="text"
                  value={callId}
                  onChange={(e) => setCallId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                  required
                />
              </div>

              {/* Código de Grabación */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Código de Grabación
                </label>
                <input
                  type="text"
                  value={recordingCode}
                  onChange={(e) => setRecordingCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800"
                  required
                />
              </div>

            </div>

            {/* Commercial Result Row */}
            <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-center">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ¿Resultado Comercial (Venta)? *
                </label>
                <div className="flex items-center gap-4 mt-1">
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      checked={sale === true}
                      onChange={() => {
                        setSale(true);
                        setSaleResult('Venta Concretada');
                      }}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-emerald-700 font-bold">Sí (Venta)</span>
                  </label>
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      checked={sale === false}
                      onChange={() => {
                        setSale(false);
                        setSaleResult('No Venta - Objeción no rebatida');
                      }}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-rose-700 font-bold">No Venta</span>
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Detalle / Motivo del Resultado Comercial
                </label>
                <input
                  type="text"
                  value={saleResult}
                  onChange={(e) => setSaleResult(e.target.value)}
                  placeholder="Ej: Cliente dudó por recarga BiPay, no se cerró objeción..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 text-xs"
                />
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
            <div className="rounded-xl border border-[#E2E9E9] bg-white p-4">
              <h4 className="text-sm font-bold text-[#102A2E]">Contexto de la evaluación</h4>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><span className="block text-[#66767A]">Asesor</span><strong>{selectedAdvisor?.name || 'Sin asesor'}</strong></div>
                <div><span className="block text-[#66767A]">Cuartil</span><strong className="text-[#006B6B]">{selectedAdvisor?.quartile || 'Sin cuartil'}</strong></div>
                <div><span className="block text-[#66767A]">Supervisor</span><strong>{selectedSupervisor?.name || 'Sin supervisor'}</strong></div>
                <div><span className="block text-[#66767A]">Campaña</span><strong>{campaigns.find(c => c.id === selectedCampaignId)?.name || 'Sin campaña'}</strong></div>
              </div>
            </div>
            <aside className="rounded-xl border border-[#DCEAE8] bg-[#FBFDFD] p-4">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#43565A]">PROMEDIO D+3C ACTUAL</p><p className="mt-1 text-3xl font-black text-[#008B88]">{d3cScore.total === null ? '—' : `${d3cScore.total}%`}</p><p className="text-xs text-[#66767A]">{d3cScore.fulfilled} cumplidos de {d3cScore.evaluable} evaluables</p></div><div className="flex h-14 w-14 items-center justify-center rounded-full border-[8px] border-[#00B8B0] text-xs font-bold text-[#006B6B]">{d3cScore.total === null ? '—' : `${d3cScore.total}%`}</div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">{[['Conectar', liveSummary.scoreConnect], ['Clarificar', liveSummary.scoreClarify], ['Convertir', liveSummary.scoreConvert]].map(([label, score]) => <span key={label as string} className="text-[#43565A]">{label} <strong className="text-[#008B88]">{score === null ? '—' : `${score}%`}</strong></span>)}</div>
            </aside>
          </div>

          {/* AUDIO PLAYER & UPLOAD SECTION */}
          <div className="bg-white text-[#102A2E] rounded-xl p-4 shadow-sm border border-[#E2E9E9] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
                  <FileAudio className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-wider">
                    Grabación de Audio de la Llamada
                  </h4>
                  <p className="text-[11px] text-[#66767A]">
                    Sube el archivo de audio en formato <strong className="text-teal-300">MP3</strong> o <strong className="text-teal-300">MPEG</strong> (.mp3, .mpeg, .mpg) para reproducirlo y registrar marcas de tiempo
                  </p>
                </div>
              </div>

              {audioUrl && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono bg-slate-800 text-teal-400 px-2 py-0.5 rounded border border-slate-700">
                    ⏱️ Posición: {formattedTimestamp}
                  </span>
                </div>
              )}
            </div>

            <AudioPlayer
              audioUrl={audioUrl}
              audioFileName={audioFileName}
              audioDurationSeconds={audioDurationSeconds}
              onAudioUpload={handleAudioUpload}
              onRemoveAudio={handleRemoveAudio}
              onTimeUpdate={(seconds, formatted) => {
                setCurrentPlaybackSeconds(seconds);
                setFormattedTimestamp(formatted);
              }}
            />
          </div>

          {/* Section 2: The 3 Dimensions and 9 Criteria */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Evaluación de Criterios Metodología 3C
              </h4>
              <span className="text-xs text-slate-500">
                Selecciona el nivel para cada criterio (1 a 4)
              </span>
            </div>

            {/* DIMENSION ACCORDIONS */}
            {(['CONECTAR', 'CLARIFICAR', 'CONVERTIR'] as const).map(dim => {
              const isOpen = openDimensions[dim];
              const dimCriteria = CRITERIA_DEFINITIONS.filter(c => c.dimensionId === dim);
              
              // Calculate live score for this dimension using QA Rubric logic
              const evaluableCriteria = dimCriteria.filter(c => (criteriaScores[c.id]?.compliance || 'CUMPLE') !== 'NO_APLICA');
              const fulfilledCriteria = evaluableCriteria.filter(c => (criteriaScores[c.id]?.compliance || 'CUMPLE') === 'CUMPLE');
              const dimAvg = evaluableCriteria.length > 0
                ? Math.round((fulfilledCriteria.length / evaluableCriteria.length) * 100)
                : null;

              const dimColor = 
                dim === 'CONECTAR' ? 'border-sky-300 bg-sky-50/30' :
                dim === 'CLARIFICAR' ? 'border-amber-300 bg-amber-50/30' : 'border-emerald-300 bg-emerald-50/30';

              const dimBadgeColor = 
                dim === 'CONECTAR' ? 'bg-sky-100 text-sky-800' :
                dim === 'CLARIFICAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';

              const dimTitle =
                dim === 'CONECTAR' ? 'Comunicar: Fluidez, Tono y Escucha Activa' :
                dim === 'CLARIFICAR' ? 'Clarificar: Propuesta de Valor y BiPay' :
                'Convertir: Cierre y Manejo de Objeciones';

              return (
                <div key={dim} className={`border rounded-xl overflow-hidden transition-all ${dimColor}`}>
                  
                  {/* Dimension Header Accordion Bar */}
                  <button
                    type="button"
                    onClick={() => setOpenDimensions(prev => ({ ...prev, [dim]: !prev[dim] }))}
                    className="w-full px-4 py-3 flex items-center justify-between bg-white border-b border-slate-200 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${dimBadgeColor}`}>
                        {dim === 'CONECTAR' ? 'COMUNICAR' : dim}
                      </span>
                      <span className="font-bold text-xs text-slate-900">
                        {dimTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700">
                        Parcial: <strong className="text-slate-900">{dimAvg !== null ? `${dimAvg}%` : 'N/A'}</strong>
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {/* Criteria in this dimension */}
                  {isOpen && (
                    <div className="p-4 space-y-4">
                      {dimCriteria.map(criterion => {
                        const currentScore = criteriaScores[criterion.id] || {
                          compliance: undefined,
                          level: 0,
                          percentage: 0,
                          finding: '',
                          evidence: '',
                          recommendedAction: ''
                        };

                        return (
                          <div key={criterion.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                            
                            {/* Criterion Title & QA Rubric Buttons */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="font-bold text-xs text-slate-900">
                                    {criterion.name}
                                  </h5>
                                  {criterion.shortName.includes('BiPay') && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                                      BiPay
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {criterion.description}
                                </p>
                              </div>

                              {/* 3 QA Buttons: Cumple, No cumple, No aplica */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleComplianceChange(criterion.id, 'CUMPLE')}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                    currentScore.compliance === 'CUMPLE'
                                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                  title="Cumple con el estándar de calidad (100% del peso)"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Cumple</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleComplianceChange(criterion.id, 'NO_CUMPLE')}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                    currentScore.compliance === 'NO_CUMPLE'
                                      ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                  title="No cumple con el estándar (0% del peso - brecha)"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>No cumple</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleComplianceChange(criterion.id, 'NO_APLICA')}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                    currentScore.compliance === 'NO_APLICA'
                                      ? 'bg-slate-700 text-white border-slate-800 shadow-xs'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                  title="No aplica a esta llamada (Excluye y redistribuye peso)"
                                >
                                  <span>No aplica</span>
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <button type="button" onClick={() => setOpenGuides(prev => ({ ...prev, [criterion.id]: !prev[criterion.id] }))} className="text-xs font-semibold text-[#008B88]">
                                {openGuides[criterion.id] ? 'Ocultar pauta' : 'Ver criterio, malas prácticas y exclusión'}
                              </button>
                              <button type="button" onClick={() => setOpenComments(prev => ({ ...prev, [criterion.id]: !prev[criterion.id] }))} className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${currentScore.finding ? 'border-[#00B8B0] bg-[#E7F4F3] text-[#006B6B]' : 'border-[#D7E2E2] text-[#66767A]'}`}>
                                <MessageSquareText className="inline h-4 w-4" /> Comentario
                              </button>
                            </div>
                            {openGuides[criterion.id] && <div className="rounded-lg border border-[#BFE5E1] bg-[#F3FAF9] p-3 text-xs text-[#43565A]"><p className="font-bold">Comportamiento esperado</p><p className="mt-1">{criterion.expectedBehavior}</p><ul className="mt-2 list-disc pl-4">{criterion.evaluationGuide.map(g => <li key={g}>{g}</li>)}</ul></div>}
                            {openComments[criterion.id] && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-[#B9D9D6] bg-[#EDF7F6] p-3 text-xs">
                              
                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Hallazgo / Oportunidad
                                </label>
                                <textarea
                                  rows={2}
                                  value={currentScore.finding}
                                  onChange={(e) => setCriteriaScores(prev => ({
                                    ...prev,
                                    [criterion.id]: { ...prev[criterion.id], finding: e.target.value }
                                  }))}
                                  placeholder="Agregar comentario sobre este criterio..."
                                  className="w-full bg-white border border-[#9BCAC5] rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs"
                                />
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="block text-[11px] font-semibold text-slate-600">
                                    Evidencia / Minuto
                                  </label>
                                  {audioUrl && (
                                    <button
                                      type="button"
                                      onClick={() => handleInsertTimestampToCriterion(criterion.id)}
                                      className="text-[10px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-0.5 hover:underline bg-teal-50 px-1.5 py-0.2 rounded"
                                      title="Insertar minuto de reproducción actual"
                                    >
                                      <Clock className="w-3 h-3" />
                                      <span>+ Min {formattedTimestamp}</span>
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={currentScore.evidence}
                                  onChange={(e) => setCriteriaScores(prev => ({
                                    ...prev,
                                    [criterion.id]: { ...prev[criterion.id], evidence: e.target.value }
                                  }))}
                                  placeholder="Ej: Min 00:45 a 01:10..."
                                  className="w-full bg-white border border-[#9BCAC5] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs"
                                />
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="block text-[11px] font-semibold text-slate-600">
                                    Acción Recomendada
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAutoRec(criterion.id)}
                                    className="text-[10px] text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-0.5 hover:underline"
                                    title="Restablecer sugerencia automática 3C"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Auto-sugerir
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={currentScore.recommendedAction}
                                  onChange={(e) => setCriteriaScores(prev => ({
                                    ...prev,
                                    [criterion.id]: { ...prev[criterion.id], recommendedAction: e.target.value }
                                  }))}
                                  placeholder="Acción a realizar..."
                                  className="w-full bg-white border border-[#9BCAC5] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium text-slate-800"
                                />
                              </div>

                            </div>}

                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Evaluator conclusions */}
          <div className="bg-[#F6F7F9] border border-[#E5E8EC] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#031E3C] font-heading">
                3. Conclusiones y Observaciones Generales del Evaluador
              </label>
            </div>
            <textarea
              rows={2}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Añade retroalimentación adicional para el asesor o su supervisor..."
              className="w-full bg-white border border-[#E5E8EC] rounded-lg p-2.5 text-xs text-[#031E3C] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          {saveError && (
            <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/35 px-4 py-3 text-xs text-rose-200">
              <strong className="block">No se pudo guardar el registro.</strong>
              <span>{saveError}</span>
            </div>
          )}

          {/* Live Preview Floating Footer Bar */}
          <div className="sticky bottom-0 bg-white text-[#102A2E] rounded-xl p-4 border border-[#E2E9E9] shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#006B6B] block font-heading">Score total D+3C</span>
                <span className="text-2xl font-black text-[#008B88] font-kpi">
                  {d3cScore.total === null ? '—' : `${d3cScore.total}%`}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-3 text-xs text-[#66767A] border-l border-[#E2E9E9] pl-4">
                <span>Conectar: <strong className="text-[#008B88]">{liveSummary.scoreConnect === null ? '—' : `${liveSummary.scoreConnect}%`}</strong></span>
                <span>Clarificar: <strong className="text-[#008B88]">{liveSummary.scoreClarify === null ? '—' : `${liveSummary.scoreClarify}%`}</strong></span>
                <span>Convertir: <strong className="text-[#008B88]">{liveSummary.scoreConvert === null ? '—' : `${liveSummary.scoreConvert}%`}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 sm:w-auto px-4 py-2 text-xs font-semibold text-[#66767A] hover:bg-[#F1F6F6] rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button type="button" onClick={() => setDraftSaved(true)} className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-[#006B6B] border border-[#00B8B0] rounded-lg">
                <Save className="w-4 h-4" /><span>{draftSaved ? 'Borrador guardado' : 'Guardar borrador'}</span>
              </button>
              <button
                type="submit" disabled={!selectedAdvisor || !d3cScore.answered || isSaving}
                className="w-1/2 sm:w-auto flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#008B88] hover:bg-[#006B6B] rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Guardando…' : 'Guardar y finalizar'}</span>
              </button>
            </div>

          </div>

        </form>

      </div>
    </div>
  );
};
