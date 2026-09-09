import React, { useEffect, useState } from 'react';
import { Evaluation, EvaluationItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { CRITERIA_DEFINITIONS } from '../../data/criteriaData';
import { QUALITY_ATTRIBUTES } from '../../data/qualityPueData';
import { StatusBadge } from '../common/StatusBadge';
import { ThreeScore } from '../common/ThreeScore';
import { AudioPlayer } from '../common/AudioPlayer';
import { getItemCompliance } from '../../utils/calculations';
import { 
  X, 
  FileAudio, 
  AlertCircle, 
  ListTodo,
  ChevronDown,
  Pencil,
  Save
} from 'lucide-react';

interface EvaluationDetailModalProps {
  evaluation: Evaluation | null;
  onClose: () => void;
  onUpdated?: (evaluation: Evaluation) => void;
  onOpenNewActionPlan?: (evaluation: Evaluation) => void;
}

export const EvaluationDetailModal: React.FC<EvaluationDetailModalProps> = ({ 
  evaluation, 
  onClose,
  onUpdated,
  onOpenNewActionPlan 
}) => {
  const { advisors, users, currentUser, updateEvaluation } = useApp();
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null);
  const [agentDetail,setAgentDetail]=useState<any>(null); const [commitment,setCommitment]=useState(''); const [commitmentDate,setCommitmentDate]=useState(''); const [savingCommitment,setSavingCommitment]=useState(false); const [commitmentError,setCommitmentError]=useState('');
  const [isEditing,setIsEditing]=useState(false); const [savingEdit,setSavingEdit]=useState(false); const [editError,setEditError]=useState('');
  const [draftItems,setDraftItems]=useState<EvaluationItem[]>([]);
  const [draftMeta,setDraftMeta]=useState({date:'',time:'',callId:'',recordingCode:'',type:'DIAGNOSTICO_INICIAL',product:'',sale:false,saleResult:'NO_VENTA',noSaleReason:'',comments:''});

  useEffect(()=>{
    if(!evaluation)return;
    const quality=evaluation.evaluationType==='QUALITY';
    const dimensionByCriterion:Record<string,any>={C1:'CONECTAR',C2:'CLARIFICAR',C3:'CONVERTIR',C4:'CONECTAR_C4'};
    const fallback:EvaluationItem[]=quality
      ? QUALITY_ATTRIBUTES.map(attribute=>({id:`item_${attribute.id}`,criterionId:attribute.id,dimension:dimensionByCriterion[attribute.criterion],compliance:undefined,level:0,percentage:0,finding:'',evidence:'',recommendedAction:'',qualityGuideline:attribute,category:attribute.category||attribute.criterion,attribute:attribute.name,classification:attribute.classification||'NO_CRITICO'}))
      : CRITERIA_DEFINITIONS.map(criterion=>({id:`item_${criterion.id}`,criterionId:criterion.id,dimension:criterion.dimensionId,compliance:undefined,level:0,percentage:0,finding:'',evidence:'',recommendedAction:''}));
    setDraftItems((evaluation.items?.length?evaluation.items:fallback).map(item=>({
      ...item,
      compliance:item.compliance||((item.level!==undefined||item.percentage!==undefined)?getItemCompliance(item):undefined)
    })));
    setDraftMeta({date:evaluation.date||'',time:evaluation.time||'',callId:evaluation.callId||'',recordingCode:evaluation.recordingCode||'',type:evaluation.type||'DIAGNOSTICO_INICIAL',product:evaluation.product||'',sale:Boolean(evaluation.sale),saleResult:evaluation.saleResult||'NO_VENTA',noSaleReason:evaluation.noSaleReason||'',comments:evaluation.comments||''});
    setIsEditing(false);setEditError('');
  },[evaluation]);

  useEffect(()=>{
    if(!evaluation||currentUser.role!=='ASESOR')return;
    const token=sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN');
    void fetch(`/api/evaluations/${evaluation.id}/agent-detail`,{headers:token?{Authorization:`Bearer ${token}`}:{}}).then(async response=>{if(!response.ok)throw new Error((await response.json()).error);return response.json();}).then(data=>{setAgentDetail(data);setCommitment(data.commitment?.text||'');setCommitmentDate(data.commitment?.date||'');}).catch(error=>setCommitmentError(error.message));
  },[evaluation,currentUser.role]);

  if (!evaluation) return null;

  const advisor = advisors.find(a => a.id === evaluation.advisorId);
  const evaluator = users.find(u => u.id === evaluation.evaluatorId);
  const supervisor = users.find(u => u.id === evaluation.supervisorId);
  const isAgent = currentUser.role === 'ASESOR';
  const canEdit = currentUser.role === 'ADMINISTRADOR';
  const changeItem=(id:string,changes:Partial<EvaluationItem>)=>setDraftItems(items=>items.map(item=>item.id===id?{...item,...changes}:item));
  const saveEdit=async()=>{
    if(!evaluation||savingEdit)return;
    if(!draftItems.some(item=>item.compliance==='CUMPLE'||item.compliance==='NO_CUMPLE')){setEditError('Responde al menos un criterio evaluable antes de guardar.');return;}
    setSavingEdit(true);setEditError('');
    try{
      const saved=await updateEvaluation(evaluation.id,{...draftMeta,type:draftMeta.type as Evaluation['type'],saleResult:draftMeta.saleResult as Evaluation['saleResult'],items:draftItems});
      onUpdated?.(saved);setIsEditing(false);
    }catch(error){setEditError(error instanceof Error?error.message:'No fue posible actualizar la evaluación.');}
    finally{setSavingEdit(false);}
  };
  const saveCommitment=async()=>{setSavingCommitment(true);setCommitmentError('');try{const token=sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN');const response=await fetch(`/api/evaluations/${evaluation.id}/commitment`,{method:'PATCH',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({commitment,commitmentDate})});const data=await response.json();if(!response.ok)throw new Error(data.error);setAgentDetail((value:any)=>({...value,commitment:data.commitment}));}catch(error:any){setCommitmentError(error.message||'No fue posible guardar el compromiso.');}finally{setSavingCommitment(false);}};
  const isQuality = evaluation.evaluationType === 'QUALITY' || evaluation.items.some(item => QUALITY_ATTRIBUTES.some(attribute => attribute.id === item.criterionId));
  const advisorName = advisor?.name || 'Asesor no disponible';
  const qualityScores = isQuality ? ['C1', 'C2', 'C3', 'C4'].map(criterion => {
    const attributes = QUALITY_ATTRIBUTES.filter(attribute => attribute.criterion === criterion);
    const answered = attributes.filter(attribute => {
      const item = evaluation.items.find(entry => entry.criterionId === attribute.id);
      return item && getItemCompliance(item) !== 'NO_APLICA';
    });
    const denominator = answered.reduce((sum, attribute) => sum + attribute.weight, 0);
    const achieved = answered.reduce((sum, attribute) => {
      const item = evaluation.items.find(entry => entry.criterionId === attribute.id);
      return sum + (item && getItemCompliance(item) === 'CUMPLE' ? attribute.weight : 0);
    }, 0);
    return { criterion, score: denominator ? Math.round((achieved / denominator) * 100) : null };
  }) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="cm-modal cm-evaluation-modal max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Modal Header */}
        <div className="bg-[var(--cm-surface-elevated)] text-[var(--cm-text)] px-5 sm:px-6 py-4 flex items-center justify-between border-b border-[var(--cm-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--cm-primary)] text-[var(--cm-bg)] flex items-center justify-center font-bold text-xs font-heading">
              {isQuality ? 'PUE' : '3C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-[var(--cm-text)] font-heading">
                  {isQuality ? 'Ficha de Evaluación de Calidad' : 'Ficha de Evaluación Metodología 3C'}
                </h3>
                <span className="cm-badge text-[var(--cm-primary)]">{isQuality ? 'CALIDAD' : 'MEJORA CONTINUA'}</span>
              </div>
              <p className="text-xs text-[var(--cm-text-secondary)] mt-0.5">
                {advisorName} · {evaluation.callId} · {evaluation.date}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit&&!isEditing&&<button onClick={()=>setIsEditing(true)} className="cm-button-secondary px-3 py-2 text-xs"><Pencil className="h-4 w-4"/>Editar evaluación</button>}
            <button onClick={onClose} className="p-1.5 text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[var(--cm-border)] rounded-lg transition-colors cursor-pointer" aria-label="Cerrar"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-[var(--cm-bg-secondary)] text-[var(--cm-text)]">
          {isEditing&&<div className="cm-card rounded-xl p-4 sm:p-5 space-y-4">
            <div><h4 className="text-sm font-bold">Editar datos de la evaluación</h4><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">Se conserva el ID, el asesor, la campaña, el audio, el feedback y todo el histórico relacionado.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold">Fecha<input type="date" className="cm-input mt-1 p-2 font-normal" value={draftMeta.date} onChange={event=>setDraftMeta(value=>({...value,date:event.target.value}))}/></label>
              <label className="text-xs font-semibold">Hora<input type="time" className="cm-input mt-1 p-2 font-normal" value={draftMeta.time} onChange={event=>setDraftMeta(value=>({...value,time:event.target.value}))}/></label>
              <label className="text-xs font-semibold">ID de llamada<input className="cm-input mt-1 p-2 font-normal" value={draftMeta.callId} onChange={event=>setDraftMeta(value=>({...value,callId:event.target.value}))}/></label>
              <label className="text-xs font-semibold">Código de grabación<input className="cm-input mt-1 p-2 font-normal" value={draftMeta.recordingCode} onChange={event=>setDraftMeta(value=>({...value,recordingCode:event.target.value}))}/></label>
              <label className="text-xs font-semibold">Modalidad<select className="cm-select mt-1 p-2 font-normal" value={draftMeta.type} onChange={event=>setDraftMeta(value=>({...value,type:event.target.value}))}><option value="DIAGNOSTICO_INICIAL">Diagnóstico</option><option value="SEGUIMIENTO">Seguimiento</option><option value="COACHING">Coaching</option><option value="REEVALUACION">Reevaluación</option><option value="CERTIFICACION">Certificación</option></select></label>
              <label className="text-xs font-semibold">Producto<input className="cm-input mt-1 p-2 font-normal" value={draftMeta.product} onChange={event=>setDraftMeta(value=>({...value,product:event.target.value}))}/></label>
              <label className="text-xs font-semibold">Resultado<select className="cm-select mt-1 p-2 font-normal" value={draftMeta.saleResult} onChange={event=>setDraftMeta(value=>({...value,saleResult:event.target.value,sale:event.target.value==='VENTA_CONCRETADA'}))}><option value="NO_VENTA">No venta</option><option value="VENTA_CONCRETADA">Venta concretada</option><option value="VENTA_OBSERVADA">Venta observada</option><option value="VOLVER_A_LLAMAR">Volver a llamar</option></select></label>
              {!draftMeta.sale&&<label className="text-xs font-semibold">Motivo de no venta<input className="cm-input mt-1 p-2 font-normal" value={draftMeta.noSaleReason} onChange={event=>setDraftMeta(value=>({...value,noSaleReason:event.target.value}))}/></label>}
            </div>
          </div>}
          
          {/* Metadata & Scores Top Card */}
          <div className="cm-card rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Advisor & Call Info */}
            <div className="md:col-span-2 space-y-2 text-xs border-b md:border-b-0 md:border-r border-[var(--cm-border)] pb-4 md:pb-0 md:pr-4">
              <span className="text-[10px] font-bold text-[var(--cm-text-secondary)] uppercase tracking-wider font-heading block">
                Datos de la Llamada
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--cm-text-secondary)] block text-[11px]">Asesor:</span>
                  <span className="font-bold text-[var(--cm-text)]">{advisorName}</span>
                </div>
                <div>
                  <span className="text-[var(--cm-text-secondary)] block text-[11px]">Supervisor:</span>
                  <span className="font-medium text-[var(--cm-text)]">{supervisor?.name || 'Supervisor'}</span>
                </div>
                <div>
                  <span className="text-[var(--cm-text-secondary)] block text-[11px]">Evaluador:</span>
                  <span className="font-medium text-[var(--cm-text)]">{evaluator?.name || 'No disponible'}</span>
                </div>
                <div>
                  <span className="text-[var(--cm-text-secondary)] block text-[11px]">Producto:</span>
                  <span className="font-medium text-[var(--cm-text)]">{evaluation.product || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-[var(--cm-text-secondary)] block text-[11px]">Resultado:</span>
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
                <span className="text-[10px] font-bold text-[var(--cm-text-secondary)] uppercase tracking-wider font-heading block mb-2">
                  {isQuality ? 'Puntaje de Calidad' : 'Puntaje Metodología 3C'}
                </span>
                <div className="flex items-center gap-4">
                  <div className="text-center px-4 py-2 bg-[var(--cm-surface-elevated)] border border-[var(--cm-border)] rounded-xl shadow-xs">
                    <span className="text-2xl font-bold font-kpi text-[var(--cm-primary)]">
                      {isQuality && evaluation.technicalScore !== undefined ? `${evaluation.technicalScore ?? 0}%` : evaluation.scoreTotal !== null && evaluation.scoreTotal !== undefined ? `${evaluation.scoreTotal}%` : 'N/A'}
                    </span>
                    <span className="block text-[10px] uppercase font-semibold text-[var(--cm-text-secondary)]">{isQuality ? 'Calidad técnica' : 'Puntaje Calidad'}</span>
                  </div>
                  {isQuality && <div className={`rounded-xl border px-3 py-2 text-center ${evaluation.qualityResult === 'REPROBADA' ? 'border-[var(--cm-danger)] text-[var(--cm-danger)]' : 'border-[var(--cm-success)] text-[var(--cm-success)]'}`}><b className="block text-sm">{evaluation.qualityResult || (evaluation.scoreTotal === 0 && evaluation.qualityCriticalErrorIds?.length ? 'REPROBADA' : 'APROBADA')}</b><span className="text-[10px]">{evaluation.criticalReason || 'Resultado final'}</span></div>}
                  <div className="flex-1">
                    {isQuality ? (
                      <div className="grid grid-cols-4 gap-2">
                        {qualityScores.map(({ criterion, score }) => (
                          <div key={criterion} className="text-center">
                            <span className="block text-[10px] font-bold text-[var(--cm-text-secondary)]">{criterion}</span>
                            <span className="block mt-1 text-xs font-bold text-[var(--cm-primary)]">{score === null ? 'N/A' : `${score}%`}</span>
                            <span className="block mt-1 h-1 rounded-full bg-[var(--cm-border)] overflow-hidden"><span className="block h-full bg-[var(--cm-primary)]" style={{ width: `${score || 0}%` }} /></span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ThreeScore connect={evaluation.scoreConnect} clarify={evaluation.scoreClarify} convert={evaluation.scoreConvert} size="md" />
                    )}
                  </div>
                </div>
              </div>

              {evaluation.primaryGap && (
                <div className="mt-3 p-2 bg-[rgba(255,77,79,.09)] border border-[rgba(255,77,79,.42)] rounded-lg text-xs flex items-center gap-2 text-[var(--cm-danger)]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Brecha Crítica: <strong>{evaluation.primaryGap}</strong></span>
                </div>
              )}
            </div>

          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="cm-card p-4"><span className="text-[10px] font-bold uppercase text-[var(--cm-success)]">Fortalezas</span><p className="mt-2 text-xs">{evaluation.strongestPillar || 'Sin fortalezas registradas.'}</p></div>
            <div className="cm-card p-4"><span className="text-[10px] font-bold uppercase text-[var(--cm-warning)]">Oportunidades</span><p className="mt-2 text-xs">{evaluation.primaryGap || evaluation.secondaryGap || 'Sin oportunidades registradas.'}</p></div>
            <div className="cm-card p-4"><span className="text-[10px] font-bold uppercase text-[var(--cm-primary)]">Observaciones</span><p className="mt-2 text-xs">{evaluation.comments || 'Sin observaciones registradas.'}</p></div>
          </div>

          {/* Grabación de Audio (si existe) */}
          {(evaluation.audioUrl || evaluation.audioFileName || evaluation.recordingCode) && (
            <div className="bg-[var(--cm-surface-elevated)] text-[var(--cm-text)] rounded-xl p-4 shadow-sm border border-[var(--cm-border)] space-y-2">
              <div className="flex items-center gap-2 border-b border-[var(--cm-border)] pb-2">
                <FileAudio className="w-4 h-4 text-[var(--cm-primary)]" />
                <span className="font-bold text-xs uppercase tracking-wider text-[var(--cm-text)]">
                  Grabación de la Llamada ({evaluation.recordingCode})
                </span>
              </div>
              <AudioPlayer
                audioUrl={isAgent ? `/api/evaluations/${evaluation.id}/audio` : evaluation.audioUrl}
                audioFileName={evaluation.audioFileName || `${evaluation.recordingCode}.mp3`}
                audioDurationSeconds={evaluation.audioDurationSeconds || 380}
                readOnly={true}
              />
            </div>
          )}

          {isAgent && (
            <div className="cm-card rounded-xl p-4 sm:p-5">
              <h4 className="font-bold text-xs uppercase tracking-wider">Compromiso y conformidad</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]"><label className="text-xs font-semibold">Mi compromiso<textarea value={commitment} onChange={event=>setCommitment(event.target.value)} maxLength={2000} rows={3} className="cm-input mt-1 p-3 font-normal" placeholder="Describe la acción concreta que realizarás."/></label><label className="text-xs font-semibold">Fecha compromiso<input type="date" value={commitmentDate} onChange={event=>setCommitmentDate(event.target.value)} className="cm-input mt-1 p-3 font-normal"/></label></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--cm-text-secondary)]">Firma de conformidad: <b>{agentDetail?.signature?.signedAt ? `Registrada el ${String(agentDetail.signature.signedAt).replace('T',' ').slice(0,16)}` : 'Pendiente'}</b> · Feedback: <b>{agentDetail?.feedback?.status?.replaceAll('_',' ') || 'Sin feedback'}</b></p><button disabled={savingCommitment||commitment.trim().length<3||!commitmentDate} onClick={()=>void saveCommitment()} className="cm-button-primary px-4 py-2 text-xs disabled:opacity-50">{savingCommitment?'Guardando…':'Guardar compromiso'}</button></div>
              {commitmentError&&<p className="mt-2 text-xs text-[var(--cm-danger)]">{commitmentError}</p>}
            </div>
          )}

          {/* Criteria Evaluation Breakdown */}          {/* Criteria Evaluation Breakdown */}
          <div className="cm-card rounded-xl p-4 sm:p-5 space-y-4">
            <h4 className="font-bold text-xs sm:text-sm text-[var(--cm-text)] uppercase tracking-wider font-heading border-b border-[var(--cm-border)] pb-2">
              Desglose Criterio por Criterio
            </h4>

            <div className="space-y-3">
              {(isEditing?draftItems:evaluation.items).map((item, idx) => {
                const qualityDef = isQuality ? item.qualityGuideline || QUALITY_ATTRIBUTES.find(c => c.id === item.criterionId) : undefined;
                const critDef = !isQuality ? CRITERIA_DEFINITIONS.find(c => c.id === item.criterionId) : undefined;
                const compliance = getItemCompliance(item);
                const dimensionId = critDef?.dimensionId;
                const dimLabel = qualityDef?.criterion || (dimensionId === 'CONECTAR' ? 'C1 · CONECTAR' : dimensionId === 'CLARIFICAR' ? 'C2 · CLARIFICAR' : dimensionId === 'CONVERTIR' ? 'C3 · CONVERTIR' : '3C');
                const code = qualityDef?.code || String(idx + 1);
                const name = qualityDef?.name || critDef?.name || `Criterio ${item.criterionId}`;
                const description = qualityDef?.focus || critDef?.description || 'Sin descripción registrada.';
                const details = qualityDef
                  ? [{ label: 'Conducta esperada', value: qualityDef.expected }, { label: 'No cumple', value: qualityDef.failures }, { label: 'Exclusión / no aplica', value: qualityDef.exclusion }]
                  : [{ label: 'Conducta esperada', value: critDef?.expectedBehavior }, { label: 'Pauta de evaluación', value: critDef?.evaluationGuide?.join(' · ') }];
                const rowKey = item.id || item.criterionId;
                const isExpanded = expandedCriterion === rowKey;

                return (
                  <div 
                    key={rowKey}
                    className="p-3.5 rounded-lg border border-[var(--cm-border)] bg-[var(--cm-surface-elevated)] space-y-2 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="cm-badge text-[var(--cm-primary)]">
                          {dimLabel}
                        </span>
                        <h5 className="font-bold text-[var(--cm-text)] text-xs">
                          {code}. {name}
                        </h5>
                        {qualityDef && 'critical' in qualityDef && qualityDef.critical && <span className="cm-badge cm-badge--critical">CRÍTICO</span>}
                        {isQuality && item.classification && <span className="cm-badge">{item.classification.replaceAll('_', ' ')}</span>}
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

                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] text-[var(--cm-text-secondary)] leading-relaxed">{description}</p>
                      <button type="button" onClick={() => setExpandedCriterion(isExpanded ? null : rowKey)} className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[var(--cm-primary)] hover:text-[var(--cm-primary-hover)]">
                        {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {isQuality && item.errorType && <p className="text-[11px] text-[var(--cm-danger)]"><b>Tipo de error:</b> {item.errorType}</p>}

                    {isEditing&&<div className="grid gap-2 border-t border-[var(--cm-border)] pt-3 md:grid-cols-2">
                      <label className="text-[11px] font-semibold">Resultado<select className="cm-select mt-1 p-2 font-normal" value={item.compliance||''} onChange={event=>{const compliance=event.target.value as EvaluationItem['compliance'];changeItem(item.id,{compliance,percentage:compliance==='CUMPLE'?100:0,level:compliance==='CUMPLE'?4:compliance==='NO_CUMPLE'?1:0});}}><option value="">Sin responder</option><option value="CUMPLE">Cumple</option><option value="NO_CUMPLE">No cumple</option><option value="NO_APLICA">No aplica</option></select></label>
                      <label className="text-[11px] font-semibold">Hallazgo<input className="cm-input mt-1 p-2 font-normal" value={item.finding||''} onChange={event=>changeItem(item.id,{finding:event.target.value})}/></label>
                      <label className="text-[11px] font-semibold">Evidencia<textarea rows={2} className="cm-input mt-1 p-2 font-normal" value={item.evidence||''} onChange={event=>changeItem(item.id,{evidence:event.target.value})}/></label>
                      <label className="text-[11px] font-semibold">Acción recomendada<textarea rows={2} className="cm-input mt-1 p-2 font-normal" value={item.recommendedAction||''} onChange={event=>changeItem(item.id,{recommendedAction:event.target.value})}/></label>
                    </div>}

                    {isExpanded && (
                      <div className="grid gap-2 border-t border-[var(--cm-border)] pt-3 md:grid-cols-2">
                        {details.filter(detail => detail.value).map(detail => <div key={detail.label} className="rounded-lg bg-[var(--cm-bg-secondary)] p-3"><strong className="text-[var(--cm-text)]">{detail.label}:</strong><p className="mt-1 leading-relaxed text-[var(--cm-text-secondary)]">{detail.value}</p></div>)}
                        {item.evidence && <div className="rounded-lg bg-[var(--cm-bg-secondary)] p-3"><strong>Evidencia:</strong><p className="mt-1 text-[var(--cm-text-secondary)]">{item.evidence}</p></div>}
                      </div>
                    )}

                    {(item.finding || item.recommendedAction) && (
                      <div className="pt-2 border-t border-[var(--cm-border)] grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        {item.finding && (
                          <div>
                            <strong className="text-[var(--cm-text)] font-semibold">Hallazgo:</strong>
                            <p className="text-[var(--cm-text-secondary)] mt-0.5">{item.finding}</p>
                          </div>
                        )}
                        {item.recommendedAction && (
                          <div>
                            <strong className="text-[var(--cm-primary)] font-semibold">Acción sugerida:</strong>
                            <p className="text-[var(--cm-text-secondary)] mt-0.5">{item.recommendedAction}</p>
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
          {(evaluation.comments||isEditing) && (
            <div className="cm-card rounded-xl p-4 sm:p-5 space-y-2 text-xs">
              <h4 className="font-bold text-xs text-[var(--cm-text)] uppercase tracking-wider font-heading">
                Conclusiones del Evaluador
              </h4>
              {isEditing?<textarea rows={4} className="cm-input p-3" value={draftMeta.comments} onChange={event=>setDraftMeta(value=>({...value,comments:event.target.value}))}/>:<p className="text-[var(--cm-text-secondary)] leading-relaxed bg-[var(--cm-surface-elevated)] p-3 rounded-lg border border-[var(--cm-border)]">{evaluation.comments}</p>}
            </div>
          )}

          {editError&&<div role="alert" className="rounded-xl border border-[var(--cm-danger)] bg-[rgba(255,77,79,.09)] px-4 py-3 text-xs text-[var(--cm-danger)]">{editError}</div>}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-[var(--cm-surface-elevated)] border-t border-[var(--cm-border)] flex items-center justify-between">
          <button
            onClick={()=>{if(isEditing){setIsEditing(false);setEditError('');}else onClose();}}
            className="cm-button-secondary px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {isEditing?'Cancelar edición':'Cerrar'}
          </button>

          {isEditing?<button disabled={savingEdit} onClick={()=>void saveEdit()} className="cm-button-primary px-4 py-2 text-xs disabled:opacity-50"><Save className="h-4 w-4"/>{savingEdit?'Guardando…':'Guardar cambios'}</button>:onOpenNewActionPlan && (
            <button
              onClick={() => {
                onOpenNewActionPlan(evaluation);
                onClose();
              }}
              className="cm-button-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
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
