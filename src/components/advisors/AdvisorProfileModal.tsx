import React, { useState } from 'react';
import { Advisor, Evaluation } from '../../types';
import { useApp } from '../../context/AppContext';
import { 
  classifyPriority, 
  calculateAdvisorOperationalAnalysis, 
  formatMinutesToHuman, 
  formatMinutesDelta, 
  formatSphDelta, 
  parseTimeToMinutes, 
  formatMinutesToHHMM,
  calculateDualAdvisorTenure
} from '../../utils/calculations';
import { 
  X, 
  User, 
  Phone, 
  Calendar, 
  PlusCircle, 
  TrendingUp, 
  CheckCircle2, 
  ShieldAlert,
  Gauge,
  Clock,
  Activity,
  Layers,
  Save,
  Plus,
  Briefcase,
  FileSpreadsheet,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

interface AdvisorProfileModalProps {
  advisorId: string | null;
  onClose: () => void;
  onOpenNewEvaluationForAdvisor?: (advisor: Advisor) => void;
  onOpenNewActionPlanForAdvisor?: (advisor: Advisor) => void;
  onSelectEvaluation?: (evaluation: Evaluation) => void;
}

export const AdvisorProfileModal: React.FC<AdvisorProfileModalProps> = ({
  advisorId,
  onClose,
  onOpenNewEvaluationForAdvisor,
  onOpenNewActionPlanForAdvisor,
  onSelectEvaluation
}) => {
  if (!advisorId) return null;

  const { advisors, users, teams, evaluations, actionPlans, config, operationalMeasurements, addOperationalMeasurement, deleteAdvisor } = useApp();
  const [activeTab, setActiveTab] = useState<'3C' | 'OPERATIONAL'>('3C');
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // New Measurement Form State
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newMeasurementDate, setNewMeasurementDate] = useState(new Date().toISOString().split('T')[0]);
  const [newConnectionTime, setNewConnectionTime] = useState('06:30');
  const [newSph, setNewSph] = useState('0.25');
  const [newSource, setNewSource] = useState('CRM Telefonía / Operaciones');
  const [newComments, setNewComments] = useState('');

  const advisor = advisors.find(a => a.id === advisorId);
  if (!advisor) return null;

  const supervisor = users.find(u => u.id === advisor.supervisorId);
  const team = teams.find(t => t.id === advisor.teamId);

  const dualTenure = calculateDualAdvisorTenure(advisor);

  const advisorEvals = evaluations
    .filter(e => e.advisorId === advisor.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const advisorPlans = actionPlans.filter(p => p.advisorId === advisor.id);

  // Latest evaluation
  const latestEval = advisorEvals[advisorEvals.length - 1];
  const initialEval = advisorEvals[0];

  // Calculate 3C scores
  const avgScore = advisorEvals.length > 0 
    ? Math.round(advisorEvals.reduce((a, b) => a + b.scoreTotal, 0) / advisorEvals.length) 
    : 0;

  const connectScore = latestEval ? latestEval.scoreConnect : 0;
  const clarifyScore = latestEval ? latestEval.scoreClarify : 0;
  const convertScore = latestEval ? latestEval.scoreConvert : 0;

  const deltaTotal = (latestEval && initialEval && advisorEvals.length > 1) 
    ? latestEval.scoreTotal - initialEval.scoreTotal 
    : 0;

  const priority = classifyPriority(latestEval?.scoreTotal || avgScore, config);

  // Operational Analysis (Level 2)
  const opAnalysis = calculateAdvisorOperationalAnalysis(advisor, operationalMeasurements);

  // Measurements associated with advisor
  const advisorMeasurements = operationalMeasurements.filter(m => m.advisorId === advisor.id);
  const latestOpMeasurement = advisorMeasurements[advisorMeasurements.length - 1];

  // Radar Data for 3C
  const radarData = [
    { dimension: 'Conectar (C1)', score: connectScore, fullMark: 100 },
    { dimension: 'Clarificar (C2)', score: clarifyScore, fullMark: 100 },
    { dimension: 'Convertir (C3)', score: convertScore, fullMark: 100 }
  ];

  // Operational Timeline Data for Line Chart
  const opTimelineData = [
    {
      period: 'Línea Base',
      date: opAnalysis.baseline.date,
      connectionMinutes: opAnalysis.baseline.connectionMinutes,
      connectionHours: Number((opAnalysis.baseline.connectionMinutes / 60).toFixed(2)),
      sph: opAnalysis.baseline.sph
    },
    ...opAnalysis.history.map(h => ({
      period: h.periodName,
      date: h.date,
      connectionMinutes: h.connectionMinutes,
      connectionHours: Number((h.connectionMinutes / 60).toFixed(2)),
      sph: h.sph
    }))
  ];

  const handleSaveMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    const sphNum = parseFloat(newSph) || 0;
    const connMin = parseTimeToMinutes(newConnectionTime) || 360;

    addOperationalMeasurement({
      advisorId: advisor.id,
      periodName: newPeriodName.trim() || `Medición ${opAnalysis.history.length + 1}`,
      measurementDate: newMeasurementDate,
      connectionTime: newConnectionTime.trim() || formatMinutesToHHMM(connMin),
      connectionMinutes: connMin,
      sph: Number(sphNum.toFixed(2)),
      source: newSource.trim(),
      comments: newComments.trim()
    });

    setShowAddMeasurement(false);
    setNewPeriodName('');
    setNewComments('');
  };

  const connDelta = formatMinutesDelta(opAnalysis.delta.connectionMinutes);
  const sphDelta = formatSphDelta(opAnalysis.delta.sph);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="cm-modal max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-[#031E3C] text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-xl text-white">
              {advisor.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white font-heading">{advisor.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  priority === 'ALTA' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                  priority === 'MEDIA' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                  priority === 'ESPERADO' ? 'bg-sky-950 text-sky-300 border border-sky-800' :
                  'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  Prioridad {priority}
                </span>
                {advisor.status === 'INACTIVO' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Inactivo / Cesado
                  </span>
                )}
              </div>

              {/* Subtitle with exact DNI & Supervisor */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                <span>DNI: <strong className="text-white font-mono">{advisor.dni}</strong></span>
                <span>·</span>
                <span>Supervisor: <strong className="text-white">{advisor.supervisor || supervisor?.name || 'Supervisor'}</strong></span>
                <span>·</span>
                <span>Horario: <strong className="text-white">{advisor.schedule || 'Completo'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-slate-300 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="Eliminar asesor"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tenure & Master Data Details Strip */}
        <div className="bg-[#F6F7F9] border-b border-[#E5E8EC] px-6 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-[#667085] font-semibold block uppercase">Antigüedad Empresa:</span>
            <div className="flex items-center gap-1 font-semibold text-[#031E3C] mt-0.5">
              <span>{dualTenure.company.formatted}</span>
              {!dualTenure.company.isPending && (
                <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${dualTenure.company.isNew ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>
                  {dualTenure.company.category}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              F. Ingreso: {advisor.hireDate || 'Pendiente'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[#667085] font-semibold block uppercase">Antigüedad Campaña:</span>
            <div className="font-semibold text-[#031E3C] mt-0.5">
              {dualTenure.campaign.formatted}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              F. Campaña: {advisor.campaignStartDate || 'Pendiente'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[#667085] font-semibold block uppercase">Etiqueta Excel:</span>
            <div className="font-semibold text-[#031E3C] mt-0.5">
              {advisor.importedTenureLabel || 'No informada'}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Columna ANTIGÜEDAD</span>
          </div>

          <div>
            <span className="text-[10px] text-[#667085] font-semibold block uppercase">SPH Operacional:</span>
            <div className="font-semibold text-[#031E3C] font-mono mt-0.5">
              {latestOpMeasurement ? latestOpMeasurement.sph.toFixed(2) : (advisor.baselineSph !== undefined ? advisor.baselineSph.toFixed(2) : '-')} SPH
            </div>
            <span className="text-[10px] text-slate-400">
              {latestOpMeasurement ? latestOpMeasurement.periodName : (advisor.baselinePeriod || 'Línea Base')}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-slate-50 border-b border-slate-200 text-xs">
          <button
            onClick={() => setActiveTab('3C')}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === '3C'
                ? 'border-[#031E3C] text-[#031E3C] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Nivel 1: Desempeño 3C</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full font-mono">
              {latestEval?.scoreTotal || avgScore}%
            </span>
          </button>

          <button
            onClick={() => setActiveTab('OPERATIONAL')}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'OPERATIONAL'
                ? 'border-[#031E3C] text-[#031E3C] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Gauge className="w-4 h-4 text-[#FF7A00]" />
            <span>Nivel 2: Impacto Operacional</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              opAnalysis.delta.sph > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
            }`}>
              SPH: {opAnalysis.latest.sph.toFixed(2)}
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: DESEMPEÑO 3C */}
          {activeTab === '3C' && (
            <>
              {/* Top Performance Overview Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 3C Overall Score Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Puntaje 3C Actual</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-slate-900">{latestEval?.scoreTotal || avgScore}%</span>
                      <span className="text-xs text-slate-500 font-medium">({advisorEvals.length} fichas)</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Evolución Conductual:</span>
                    <span className={`font-bold ${deltaTotal >= 0 ? 'text-teal-700' : 'text-rose-600'}`}>
                      {deltaTotal >= 0 ? `+${deltaTotal}` : deltaTotal} pts vs inicial
                    </span>
                  </div>
                </div>

                {/* Dimension Breakdown Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Desempeño por Dimensión</span>
                  
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                        <span>Conectar (C1)</span>
                        <span className="font-mono font-bold">{connectScore}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#031E3C] h-full rounded-full" style={{ width: `${connectScore}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                        <span>Clarificar (C2)</span>
                        <span className="font-mono font-bold">{clarifyScore}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-slate-600 h-full rounded-full" style={{ width: `${clarifyScore}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-semibold text-slate-700 mb-0.5">
                        <span>Convertir (C3)</span>
                        <span className="font-mono font-bold">{convertScore}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#FF7A00] h-full rounded-full" style={{ width: `${convertScore}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Radar Mini Chart */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-center h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="#cbd5e1" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#475569' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar name="Asesor" dataKey="score" stroke="#031E3C" fill="#031E3C" fillOpacity={0.3} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

              </div>

              {/* Primary & Secondary Gap Diagnosis */}
              {latestEval && (
                <div className="bg-[#031E3C] text-white rounded-xl p-4 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 mb-2 font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#FF7A00]" />
                    Diagnóstico Metodológico 3C del Asesor
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                      <span className="text-[10px] text-rose-300 font-bold uppercase block">Brecha Principal:</span>
                      <span className="font-semibold text-white">{latestEval.primaryGap}</span>
                    </div>
                    <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                      <span className="text-[10px] text-amber-300 font-bold uppercase block">Brecha Secundaria:</span>
                      <span className="font-semibold text-white">{latestEval.secondaryGap}</span>
                    </div>
                    <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                      <span className="text-[10px] text-emerald-300 font-bold uppercase block">Fortaleza:</span>
                      <span className="font-semibold text-white">{latestEval.strongestPillar}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluations History Timeline */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Historial de Evaluaciones 3C ({advisorEvals.length})
                  </h4>
                  {onOpenNewEvaluationForAdvisor && (
                    <button
                      onClick={() => onOpenNewEvaluationForAdvisor(advisor)}
                      className="flex items-center gap-1 text-xs font-bold text-[#031E3C] hover:underline"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Nueva Evaluación
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {advisorEvals.map((ev, idx) => (
                    <div 
                      key={ev.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-100 font-bold text-[11px] text-slate-600 flex items-center justify-center font-mono">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-slate-800">{ev.type}</div>
                          <div className="text-[10px] text-slate-500">{ev.date} · Llamada {ev.callId}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="font-black text-sm text-slate-900 font-mono">{ev.scoreTotal}%</span>
                          <div className="text-[10px] text-slate-400">
                            C1: {ev.scoreConnect}% | C2: {ev.scoreClarify}% | C3: {ev.scoreConvert}%
                          </div>
                        </div>

                        <button
                          onClick={() => onSelectEvaluation && onSelectEvaluation(ev)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs"
                        >
                          Ver Ficha
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Plans for this Advisor */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Planes de Acción Asignados ({advisorPlans.length})
                  </h4>
                  {onOpenNewActionPlanForAdvisor && (
                    <button
                      onClick={() => onOpenNewActionPlanForAdvisor(advisor)}
                      className="flex items-center gap-1 text-xs font-bold text-[#031E3C] hover:underline"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Asignar Plan
                    </button>
                  )}
                </div>

                {advisorPlans.length > 0 ? (
                  <div className="space-y-2">
                    {advisorPlans.map(plan => (
                      <div key={plan.id} className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{plan.objective}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            plan.status === 'COMPLETADO' ? 'bg-emerald-100 text-emerald-800' :
                            plan.status === 'EN_CURSO' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {plan.status}
                          </span>
                        </div>
                        <div className="text-slate-600 text-[11px]">{plan.action}</div>
                        <div className="text-[10px] text-slate-400 flex justify-between pt-1">
                          <span>Criterio: {plan.criterionId}</span>
                          <span>Compromiso: {plan.targetDate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">
                    No tiene planes de acción pendientes.
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: IMPACTO OPERACIONAL (NIVEL 2) */}
          {activeTab === 'OPERATIONAL' && (
            <div className="space-y-6">
              
              {/* Baseline vs Actual Operational Impact Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Connection Time Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-200/80 text-[#031E3C]">
                        <Clock className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Tiempo de Conexión</span>
                    </div>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      connDelta.isPositive ? 'bg-emerald-100 text-emerald-800' :
                      connDelta.isNegative ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {connDelta.text} ({opAnalysis.delta.connectionPct > 0 ? `+${opAnalysis.delta.connectionPct}%` : `${opAnalysis.delta.connectionPct}%`})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Línea Base</span>
                      <div className="font-mono font-bold text-base text-slate-700 mt-0.5">
                        {opAnalysis.baseline.connectionTime} <span className="text-xs font-normal text-slate-500">({formatMinutesToHuman(opAnalysis.baseline.connectionMinutes)})</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{opAnalysis.baseline.period}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Actual / Última</span>
                      <div className="font-mono font-bold text-base text-slate-900 mt-0.5">
                        {opAnalysis.latest.connectionTime} <span className="text-xs font-normal text-slate-500">({formatMinutesToHuman(opAnalysis.latest.connectionMinutes)})</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{opAnalysis.latest.period}</span>
                    </div>
                  </div>
                </div>

                {/* SPH Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#FF7A00]/10 text-[#FF7A00]">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">SPH (Ventas / Hora)</span>
                    </div>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      sphDelta.isPositive ? 'bg-emerald-100 text-emerald-800' :
                      sphDelta.isNegative ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {sphDelta.text} ({opAnalysis.delta.sphPct > 0 ? `+${opAnalysis.delta.sphPct}%` : `${opAnalysis.delta.sphPct}%`})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Línea Base</span>
                      <div className="font-mono font-bold text-base text-slate-700 mt-0.5">
                        {opAnalysis.baseline.sph.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-400">{opAnalysis.baseline.period}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Actual / Última</span>
                      <div className="font-mono font-bold text-base text-slate-900 mt-0.5">
                        {opAnalysis.latest.sph.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-400">{opAnalysis.latest.period}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Operational Trend Evolution Chart */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#031E3C]" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Evolución Temporal del Impacto Operacional
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#031E3C]" />
                      <span className="text-slate-600">Horas Conexión</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A00]" />
                      <span className="text-slate-600">SPH</span>
                    </div>
                  </div>
                </div>

                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={opTimelineData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748b' }} domain={['dataMin - 1', 'dataMax + 1']} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 'dataMax + 0.1']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '11px' }}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="connectionHours" name="Horas Conexión (hrs)" stroke="#031E3C" strokeWidth={2} dot={{ r: 4 }} />
                      <Line yAxisId="right" type="monotone" dataKey="sph" name="SPH" stroke="#FF7A00" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Operational Measurements Table & Form */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Registro de Mediciones de Impacto ({opAnalysis.history.length})
                  </h4>
                  <button
                    onClick={() => setShowAddMeasurement(!showAddMeasurement)}
                    className="flex items-center gap-1 text-xs font-bold text-[#031E3C] hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddMeasurement ? 'Cancelar Registro' : 'Registrar Nueva Medición'}
                  </button>
                </div>

                {/* Inline New Measurement Form */}
                {showAddMeasurement && (
                  <form onSubmit={handleSaveMeasurement} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3 animate-in fade-in text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-[#FF7A00]" />
                      <span>Ingresar Nueva Medición Operacional</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Nombre del Período *</label>
                        <input
                          type="text"
                          required
                          value={newPeriodName}
                          onChange={(e) => setNewPeriodName(e.target.value)}
                          placeholder="Ej: Semana 4 - Feb 2026"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fecha de Medición</label>
                        <input
                          type="date"
                          value={newMeasurementDate}
                          onChange={(e) => setNewMeasurementDate(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Tiempo de Conexión (HH:MM) *</label>
                        <input
                          type="text"
                          required
                          value={newConnectionTime}
                          onChange={(e) => setNewConnectionTime(e.target.value)}
                          placeholder="06:30"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">SPH (Ventas/Hora) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          required
                          value={newSph}
                          onChange={(e) => setNewSph(e.target.value)}
                          placeholder="0.25"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fuente de Datos</label>
                        <input
                          type="text"
                          value={newSource}
                          onChange={(e) => setNewSource(e.target.value)}
                          placeholder="CRM Telefonía"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Observaciones / Notas</label>
                        <input
                          type="text"
                          value={newComments}
                          onChange={(e) => setNewComments(e.target.value)}
                          placeholder="Ej: Posterior al refuerzo en Convertir C3"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setShowAddMeasurement(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#031E3C] text-white font-bold hover:bg-[#02152b]"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Guardar Medición</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* History Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Período</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Tiempo Conexión</th>
                        <th className="px-3 py-2">Δ Conexión</th>
                        <th className="px-3 py-2">SPH</th>
                        <th className="px-3 py-2">Δ SPH</th>
                        <th className="px-3 py-2">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Baseline Row */}
                      <tr className="bg-slate-50/80 font-medium">
                        <td className="px-3 py-2 font-bold text-slate-800">{opAnalysis.baseline.period}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono">{opAnalysis.baseline.date}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{opAnalysis.baseline.connectionTime}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">Ref. Base</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{opAnalysis.baseline.sph.toFixed(2)}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">Ref. Base</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">Punto de partida de medición</td>
                      </tr>

                      {/* Subsequent Measurements */}
                      {opAnalysis.history.map((h, i) => {
                        const dConn = formatMinutesDelta(h.deltaConnectionMinutes);
                        const dSph = formatSphDelta(h.deltaSph);
                        return (
                          <tr key={h.id || i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-800">{h.periodName}</td>
                            <td className="px-3 py-2 text-slate-500 font-mono">{h.date}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{h.connectionTime}</td>
                            <td className="px-3 py-2 font-mono font-bold">
                              <span className={dConn.isPositive ? 'text-emerald-700' : dConn.isNegative ? 'text-rose-600' : 'text-slate-500'}>
                                {dConn.text}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{h.sph.toFixed(2)}</td>
                            <td className="px-3 py-2 font-mono font-bold">
                              <span className={dSph.isPositive ? 'text-emerald-700' : dSph.isNegative ? 'text-rose-600' : 'text-slate-500'}>
                                {dSph.text}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px] truncate max-w-xs">{h.comments || h.source || '-'}</td>
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

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar Asesor</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#031E3C] hover:bg-[#02152b] rounded-lg transition-colors cursor-pointer"
          >
            Cerrar Perfil
          </button>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-[#031E3C] font-heading">
                  ¿Eliminar a {advisor.name}?
                </h4>
                <p className="text-xs text-slate-600">
                  DNI: <span className="font-mono font-bold text-[#031E3C]">{advisor.dni}</span> · Supervisor: <strong>{advisor.supervisor || supervisor?.name || 'Supervisor'}</strong>
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold">Se eliminarán permanentemente:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>El perfil del asesor y su cuenta de usuario generada.</li>
                <li>Todas sus mediciones operacionales de SPH y conexión.</li>
                <li>Historial de evaluaciones 3C y planes de acción.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAdvisor(advisor.id);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar Eliminación</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
