import React, { useMemo, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Evaluation, EvaluationItem, EvaluationType, QualityGuideline } from '../../types';
import { filesApi } from '../../api/sharedRepository';
import { AudioPlayer } from '../common/AudioPlayer';
import { CallTypificationFields } from './CallTypificationFields';
import { EMPTY_CLASSIFICATION, classificationError, classificationPayload, inferredSourceTypification } from '../../utils/evaluationTypification';
import { TECHCENTER_MOVISTAR_FIELDS, TECHCENTER_MOVISTAR_FLOWS, TECHCENTER_MOVISTAR_FORM_ID, isReverseTechcenterCriterion, isTechcenterCriterion, scoreTechcenterMovistar, techcenterCriterionPresentation, techcenterFieldsForFlow, type TechcenterMovistarField, type TechcenterMovistarFlow } from '../../data/techcenterMovistarForm';

const inputClass='cm-input mt-1 w-full rounded-lg p-2.5 text-sm font-normal';
const today=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
const nowTime=()=>new Date().toTimeString().slice(0,5);

export const TechcenterMovistarQualityModal:React.FC<{operationId:string;campaignId:string;onClose:()=>void;onSuccess?:(evaluation:Evaluation)=>void}> = ({operationId,campaignId,onClose,onSuccess})=>{
  const {advisors,users,currentUser,addEvaluation}=useApp();
  const availableAdvisors=useMemo(()=>advisors.filter(item=>item.operationId===operationId&&item.campaignId===campaignId&&item.status==='ACTIVO'&&item.active!==false),[advisors,operationId,campaignId]);
  const [advisorId,setAdvisorId]=useState(availableAdvisors[0]?.id||'');
  const [flow,setFlow]=useState<TechcenterMovistarFlow>(TECHCENTER_MOVISTAR_FLOWS[0]);
  const [evaluationType,setEvaluationType]=useState<EvaluationType>('DIAGNOSTICO_INICIAL');
  const [date,setDate]=useState(today);
  const [time,setTime]=useState(nowTime);
  const [values,setValues]=useState<Record<number,string>>({});
  const [answers,setAnswers]=useState<Record<number,string>>({});
  const [comments,setComments]=useState<Record<number,string>>({});
  const [audio,setAudio]=useState<{file:File;url:string;duration:number}|null>(null);
  const [classification,setClassification]=useState(EMPTY_CLASSIFICATION);
  const [callDescription,setCallDescription]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const startedAt=useRef(new Date().toISOString());
  const advisor=availableAdvisors.find(item=>item.id===advisorId);
  const fields=useMemo(()=>techcenterFieldsForFlow(flow),[flow]);
  const isSaleFlow=flow.startsWith('Venta');
  const scored=scoreTechcenterMovistar(fields,answers);
  const setValue=(id:number,value:string)=>{setValues(previous=>({...previous,[id]:value}));if(id===30||id===31){const inferred=inferredSourceTypification(value);if(inferred)setClassification(previous=>previous.typification?previous:{...previous,typification:inferred});}};
  const fieldValue=(id:number)=>id===9?values[id]||({Q1:'Cuartil I',Q2:'Cuartil II',Q3:'Cuartil III',Q4:'Cuartil IV'} as Record<string,string>)[advisor?.quartile||'']||'':id===10?'Techcenter':id===12||id===13?values[id]||advisorId:id===14?flow.startsWith('Venta')?'Venta':'No venta':id===17?flow:values[id]||'';

  const renderField=(field:TechcenterMovistarField)=>{
    const value=fieldValue(field.id);
    const options=field.id===12||field.id===13?availableAdvisors.map(item=>({value:item.id,label:item.name})):field.id===9?['Cuartil I','Cuartil II','Cuartil III','Cuartil IV','No se identifica'].map(item=>({value:item,label:item})):field.options.map(item=>({value:item,label:item}));
    const isTextArea=field.kind.startsWith('Área de texto');
    const type=field.kind==='Fecha'?'date':field.kind==='Número entero'?'number':'text';
    const label=field.id===15?'¿Audio es rellamada?':field.id===16?'¿Audio de fija es reingreso?':field.id===108?'Duración del audio (minutos enteros)':field.label;
    return <label key={field.id} className="block text-xs font-semibold"><span>{label}{field.required==='Sí'&&<span className="text-rose-400"> *</span>}</span>
      {isTextArea?<textarea rows={2} value={value} onChange={event=>setValue(field.id,event.target.value)} className={inputClass}/>:options.length?<select value={value} onChange={event=>setValue(field.id,event.target.value)} className={inputClass}><option value="">Seleccionar</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<input type={type} min={type==='number'?0:undefined} step={type==='number'?1:undefined} value={value} onChange={event=>setValue(field.id,event.target.value)} className={inputClass}/>}
    </label>;
  };

  const save=async()=>{
    if(savingRef.current)return;
    if(!advisor){setError('Selecciona un asesor activo de esta campaña.');return;}
    if(!isSaleFlow&&!classification.typification){setError('Selecciona la tipificación principal en Grabación antes de guardar.');return;}
    if(classificationError(classification)){setError(classificationError(classification));return;}
    const required=[8,11,12,13,14,15,...(flow.includes('Fija')?[16]:[]),...(isSaleFlow?[108,109]:[])];
    if(required.some(id=>!fieldValue(id).trim())){setError('Completa los campos obligatorios de esta encuesta.');return;}
    if(isSaleFlow&&(!Number.isInteger(Number(fieldValue(108)))||Number(fieldValue(108))<0)){setError('La duración debe ser un número entero de minutos.');return;}
    if(scored.missing){setError(`Responde los ${scored.missing} criterios pendientes o marca No aplica.`);return;}
    if(!scored.possible){setError('Debe existir al menos un criterio evaluable para calcular la nota.');return;}
    savingRef.current=true;setSaving(true);setError('');
    try{
      const audioUrl=audio?(await filesApi.upload(audio.file)).url:undefined;
      const completedAt=new Date().toISOString();
      const sourceValues=Object.fromEntries(fields.filter(field=>!isTechcenterCriterion(field)).map(field=>[String(field.id),fieldValue(field.id)]));
      Object.assign(sourceValues,{'1':`TCMOV-${Date.now()}`,'2':startedAt.current,'3':completedAt,'4':currentUser.email||'','5':currentUser.name,'6':String(scored.earned)});
      const criteria=fields.filter(isTechcenterCriterion);
      const dimension:'CONECTAR'='CONECTAR';
      const items:EvaluationItem[]=criteria.map(field=>{
        const answer=answers[field.id],pass=answer===(isReverseTechcenterCriterion(field.id)?'No':'Sí');
        const compliance=answer==='No aplica'?'NO_APLICA':pass?'CUMPLE':'NO_CUMPLE';
        const {criterion}=techcenterCriterionPresentation(field);
        const guideline:QualityGuideline={id:`tc_mov_${field.id}`,code:String(field.id),criterion:'C1',name:criterion,weight:1,focus:field.section,category:field.section,critical:false,noApplies:true,expected:isReverseTechcenterCriterion(field.id)?'No':'Sí',failures:isReverseTechcenterCriterion(field.id)?'Sí':'No',exclusion:'No aplica',active:true};
        return {id:`item_tc_mov_${field.id}`,criterionId:guideline.id,dimension,compliance,percentage:compliance==='CUMPLE'?100:0,level:compliance==='CUMPLE'?4:compliance==='NO_CUMPLE'?1:0,finding:comments[field.id]||'',evidence:'',recommendedAction:'',attributeWeight:1,qualityGuideline:guideline,category:field.section,attribute:criterion,classification:'NO_CRITICO'};
      });
      const saved=await addEvaluation({advisorId:advisor.id,evaluatorId:currentUser.id,campaignId,operationId,teamId:advisor.teamId,supervisorId:advisor.supervisorId,product:isSaleFlow?fieldValue(107)||'Portabilidad Movistar':'Portabilidad Movistar',date,time,callId:fieldValue(8).trim(),recordingCode:fieldValue(8).trim(),...classificationPayload(classification),type:evaluationType,evaluationType:'QUALITY',qualityStatus:'FINALIZED',origin:'MANUAL',qualityCriticalErrorIds:[],sale:isSaleFlow,saleResult:isSaleFlow?'VENTA_CONCRETADA':'NO_VENTA',comments:[fieldValue(7),...(isSaleFlow?[fieldValue(110)]:[])].filter(Boolean).join('\n\n'),callDescription:callDescription.trim(),audioUrl,audioFileName:audio?.file.name,audioFileSize:audio?.file.size,audioMimeType:audio?.file.type,audioDurationSeconds:audio?.duration,items,qualityForm:{id:TECHCENTER_MOVISTAR_FORM_ID,flow,startedAt:startedAt.current,completedAt,fields:sourceValues,responses:Object.fromEntries(Object.entries(answers).map(([key,value])=>[key,value])),comments:Object.fromEntries(Object.entries(comments).map(([key,value])=>[key,value])),earned:scored.earned,possible:scored.possible}});
      onSuccess?.(saved);onClose();
    }catch(caught){setError(caught instanceof Error?caught.message:'No fue posible guardar la evaluación.');}
    finally{savingRef.current=false;setSaving(false);}
  };

  const general=TECHCENTER_MOVISTAR_FIELDS.filter(field=>field.section==='Datos generales'&&field.id>=7&&![10,17].includes(field.id)&&!(field.id===16&&!flow.includes('Fija')));
  const final=fields.filter(field=>field.section==='Datos finales');
  const flowFields=fields.filter(field=>field.section!=='Datos generales'&&field.section!=='Datos finales');
  const sections=[...new Set(flowFields.map(field=>field.section))];

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="techcenter-form-title"><div className="cm-modal flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden">
    <header className="flex items-start justify-between gap-3 border-b border-[var(--cm-border)] p-4 sm:p-5"><div><p className="cm-eyebrow">TECHCENTER · MOVISTAR PORTABILIDAD OUT</p><h2 id="techcenter-form-title" className="text-lg font-bold">Ficha de evaluación de Calidad</h2><p className="text-xs text-[var(--cm-text-secondary)]">Criterios con igual peso. No aplica se excluye de la nota.</p></div><button type="button" aria-label="Cerrar" onClick={onClose} className="cm-button-secondary p-2"><X className="h-4 w-4"/></button></header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
      <section className="cm-card space-y-3 p-4"><h3 className="font-bold">Datos de la evaluación</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold">Asesor *<select value={advisorId} onChange={event=>setAdvisorId(event.target.value)} className={inputClass}><option value="">Seleccionar</option>{availableAdvisors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Fecha de evaluación *<input type="date" value={date} onChange={event=>setDate(event.target.value)} className={inputClass}/></label>
        <label className="text-xs font-semibold">Hora de evaluación *<input type="time" value={time} onChange={event=>setTime(event.target.value)} className={inputClass}/></label>
        <label className="text-xs font-semibold">Tipo de evaluación<select value={evaluationType} onChange={event=>setEvaluationType(event.target.value as EvaluationType)} className={inputClass}><option value="DIAGNOSTICO_INICIAL">Diagnóstico inicial</option><option value="SEGUIMIENTO">Seguimiento</option><option value="COACHING">Coaching</option><option value="REEVALUACION">Reevaluación</option><option value="CERTIFICACION">Certificación</option></select></label>
        <label className="text-xs font-semibold">Tipo de encuesta *<select value={flow} onChange={event=>{setFlow(event.target.value as TechcenterMovistarFlow);setError('');}} className={inputClass}>{TECHCENTER_MOVISTAR_FLOWS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
        <div className="rounded-lg border border-[var(--cm-border)] p-2.5 text-xs"><b>Socio: Techcenter</b><span className="mt-1 block text-[var(--cm-text-secondary)]">Auditor: {currentUser.name} · {currentUser.email}</span><span className="block text-[var(--cm-text-secondary)]">Inicio: {new Date(startedAt.current).toLocaleString('es-PE')}</span></div>
      </div></section>
      <section className="cm-card space-y-3 p-4"><h3 className="font-bold">Datos generales de la llamada</h3><div className="grid gap-3 sm:grid-cols-2">{general.map(renderField)}</div></section>
      <section className="cm-card space-y-3 p-4"><h3 className="font-bold">Grabación</h3><p className="text-xs text-[var(--cm-text-secondary)]">La tipificación principal alimenta el dashboard. La respuesta de la ficha puede sugerirla; confirma aquí la categoría específica.</p><CallTypificationFields value={classification} onChange={setClassification} allowSecondary/><AudioPlayer audioUrl={audio?.url} audioFileName={audio?.file.name} audioDurationSeconds={audio?.duration} onAudioUpload={(file,url,duration)=>{setAudio({file,url,duration});setValue(8,file.name);}} onRemoveAudio={()=>setAudio(null)}/></section>
      {sections.map(section=><section key={section} className="cm-card space-y-3 p-4">
        <h3 className="border-b border-[var(--cm-border)] pb-2 font-bold">{section}</h3>
        {flowFields.filter(field=>field.section===section).map(field=>{
          if(!isTechcenterCriterion(field)) return <div key={field.id}>{renderField(field)}</div>;
          const {subtitle,criterion}=techcenterCriterionPresentation(field);
          return <div key={field.id} className="rounded-lg border border-[var(--cm-border)] p-3">
            {subtitle&&<h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--cm-primary)]">{subtitle}</h4>}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start">
              <label className="min-w-0 cursor-help break-words text-xs font-semibold" title={`${field.id}. ${criterion}`}><span className="text-[var(--cm-primary)]">{field.id}. </span>{criterion}</label>
              <select aria-label={`Resultado: ${criterion}`} value={answers[field.id]||''} onChange={event=>setAnswers(previous=>({...previous,[field.id]:event.target.value}))} className="cm-select h-11 w-full min-w-0 p-2 text-xs"><option value="">Sin responder</option><option value="Sí">Sí</option><option value="No">No</option><option value="No aplica">No aplica</option></select>
            </div>
            <label className="mt-2 block text-[11px] text-[var(--cm-text-secondary)]">Comentario asociado<input value={comments[field.id]||''} onChange={event=>setComments(previous=>({...previous,[field.id]:event.target.value}))} className={inputClass} placeholder="Hallazgo o minuto del audio"/></label>
          </div>;
        })}
      </section>)}
      {isSaleFlow&&<section className="cm-card space-y-3 p-4"><h3 className="font-bold">Datos finales</h3><div className="grid gap-3 sm:grid-cols-2">{final.map(renderField)}</div></section>}
      <section className="cm-card space-y-2 p-4"><label htmlFor="techcenter-call-description" className="text-sm font-bold">Descripción de la llamada</label><textarea id="techcenter-call-description" rows={3} value={callDescription} onChange={event=>setCallDescription(event.target.value)} placeholder="Resume qué ocurrió durante la llamada..." className={inputClass}/></section>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cm-border)] p-4 sm:p-5"><div className="text-sm"><b>{scored.percent===null?'Sin nota':`${scored.percent}%`}</b><span className="ml-2 text-xs text-[var(--cm-text-secondary)]">{scored.earned} de {scored.possible} criterios evaluables · {scored.missing} pendientes</span></div><div className="flex items-center gap-2"><button type="button" onClick={onClose} disabled={saving} className="cm-button-secondary px-4 py-2">Cancelar</button><button type="button" onClick={()=>void save()} disabled={saving||!advisor} className="cm-button-primary px-4 py-2 disabled:opacity-50"><Save className="h-4 w-4"/>{saving?'Guardando…':'Guardar evaluación'}</button></div>{error&&<p role="alert" className="w-full text-xs text-rose-400">{error}</p>}</footer>
  </div></div>;
};
