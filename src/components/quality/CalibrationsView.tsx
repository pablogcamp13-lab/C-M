import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, Edit3, MoreHorizontal, Plus, Search, Target, Trash2, Users, X } from 'lucide-react';
import { calibrationsApi } from '../../api/sharedRepository';
import { useApp } from '../../context/AppContext';
import type { Calibration, ComplianceStatus, Evaluation } from '../../types';
import { AudioPlayer } from '../common/AudioPlayer';
const names: Record<string, string> = {
  BORRADOR: 'Borrador',
  PROGRAMADA: 'Programada',
  EN_VIVO: 'En vivo',
  FINALIZADA: 'Finalizada',
  CERRADA: 'Cerrada con resultados',
  ANULADA: 'Anulada',
  PENDIENTE: 'Programada',
  EN_CURSO: 'En vivo',
  COMPLETADA: 'Cerrada con resultados',
  VENCIDA: 'Anulada',
};
const norm = (s: string) =>
  ({
    PENDIENTE: 'PROGRAMADA',
    EN_CURSO: 'EN_VIVO',
    COMPLETADA: 'CERRADA',
    VENCIDA: 'ANULADA',
  })[s] || s;
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const CalibrationsView: React.FC = () => {
  const { currentUser, evaluations, users, campaigns } = useApp(),
    [items, setItems] = useState<Calibration[]>([]),
    [selectedId, setSelectedId] = useState(''),
    [createOpen, setCreateOpen] = useState(false),
    [editing, setEditing] = useState<Calibration | null>(null),
    [responding, setResponding] = useState<Calibration | null>(null),
    [search, setSearch] = useState(''),
    [statusFilter, setStatusFilter] = useState('TODOS'),
    [page, setPage] = useState(1),
    [tab, setTab] = useState<'MATRIZ' | 'PARTICIPANTES' | 'INFORMACION'>('MATRIZ'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const manager = ['ADMINISTRADOR', 'CONSULTOR'].includes(currentUser.role),
    admin = currentUser.role === 'ADMINISTRADOR';
  const reload = async () => {
    const d = await calibrationsApi.list();
    setItems(d.calibrations);
    setSelectedId((id) => (id && d.calibrations.some((x) => x.id === id) ? id : d.calibrations[0]?.id || ''));
  };
  useEffect(() => {
    void reload();
  }, []);
  const selected = items.find((x) => x.id === selectedId),
    closed = selected && norm(selected.status) === 'CERRADA',
    closedItems = items.filter((x) => norm(x.status) === 'CERRADA'),
    aff = closedItems.flatMap((x) => x.participants.map((p) => p.affinity).filter((v): v is number => v !== undefined)),
    globalAffinity = aff.length ? Math.round((aff.reduce((a, b) => a + b, 0) / aff.length) * 10) / 10 : null,
    activeCount = items.filter((x) => ['PROGRAMADA', 'EN_VIVO'].includes(norm(x.status))).length;
  const transition = async (status: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await calibrationsApi.transition(selected.id, status);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible actualizar.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!selected || !confirm('¿Eliminar definitivamente?')) return;
    await calibrationsApi.remove(selected.id);
    await reload();
  };
  const exportCsv = () => {
    if (!selected || !closed) return;
    const rows = [
        ['Calibración', 'Participante', 'Rol', 'Área', 'Afinidad', 'Nivel', 'Desviación', 'Diferencias principales'],
        ...selected.participants.map((p) => {
          const u = users.find((x) => x.id === p.supervisorId);
          return [selected.title, u?.name || p.supervisorId, u?.role || '', u?.teamId || '', p.affinity ?? '', p.affinityLevel || '', p.deviation ?? '', p.mainDifferences?.join('; ') || ''];
        }),
      ],
      blob = new Blob(['\ufeff' + rows.map((r) => r.map(csv).join(',')).join('\n')], { type: 'text/csv' }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calibracion-${selected.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const mine = selected?.participants.find((p) => p.supervisorId === currentUser.id);
  const mayRespond = selected && norm(selected.status) === 'EN_VIVO' && ((selected.expertId === currentUser.id && !selected.expertResponse) || (mine && !mine.response));
  const deviations = useMemo(() => {
    const totals = new Map<string, { label: string; total: number; differences: number }>();
    closedItems.forEach((calibration) => Object.entries(calibration.attributeLabels || {}).forEach(([id, label]) => {
      const row = totals.get(id) || { label: String(label), total: 0, differences: 0 };
      calibration.participants.forEach((participant) => { if (participant.response && calibration.expertResponse) { row.total++; if (participant.response.answers[id] !== calibration.expertResponse.answers[id]) row.differences++; } });
      totals.set(id, row);
    }));
    return [...totals.values()].map((row) => ({ ...row, percentage: row.total ? Math.round(row.differences / row.total * 100) : 0 })).sort((a, b) => b.percentage - a.percentage);
  }, [closedItems]);
  const filtered = items.filter((item) => (statusFilter === 'TODOS' || norm(item.status) === statusFilter) && `${item.title} ${item.id} ${campaigns.find((c) => c.id === item.campaignId)?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const pageSize = 6, pages = Math.max(1, Math.ceil(filtered.length / pageSize)), visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <main className="cm-workspace flex-1 overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="cm-page-heading relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-[#07192d] to-[#0b2740] p-5 shadow-xl shadow-slate-950/20">
          <div className="absolute right-12 top-0 h-32 w-64 -rotate-12 rounded-full border border-cyan-400/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-3"><div><p className="cm-eyebrow">CONSISTENCIA DE EVALUACIÓN</p><h1 className="text-2xl font-bold">Calibraciones</h1><p className="text-sm text-[var(--cm-text-secondary)]">Evalúa la alineación del equipo frente al referente experto.</p></div>{manager&&<button onClick={()=>setCreateOpen(true)} className="cm-button-primary px-4 py-2 text-xs"><Plus className="h-4 w-4"/>Nueva calibración</button>}</div>
        </header>
        <section className="grid gap-3 md:grid-cols-3">
          <Kpi icon={<Activity/>} label="Calibraciones activas" value={String(activeCount)} detail={`de ${items.length} en el periodo`}/>
          <Kpi icon={<Users/>} label="Afinidad global" value={globalAffinity===null?'Sin resultados':`${globalAffinity}%`} detail={globalAffinity===null?'Se calculará al cerrar':'Consolidado del periodo'}/>
          <Kpi icon={<Target/>} label="Criterio con mayor desviación" value={deviations[0]?.label||'Sin datos suficientes'} detail={deviations[0]?`${deviations[0].percentage}% de diferencia promedio`:'Aparecerá con respuestas cerradas'}/>
        </section>
        {error&&<p className="rounded-lg border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        {!items.length?<section className="cm-card grid min-h-[360px] place-items-center p-8 text-center"><div><ClipboardCheck className="mx-auto h-12 w-12 text-cyan-400/70"/><h2 className="mt-4 text-lg font-bold">Aún no hay calibraciones registradas.</h2><p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Crea la primera sesión para medir la consistencia del equipo.</p>{manager&&<button onClick={()=>setCreateOpen(true)} className="cm-button-primary mx-auto mt-5 px-4 py-2"><Plus className="h-4 w-4"/>Crear primera calibración</button>}</div></section>:
        <section className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(520px,0.9fr)_minmax(620px,1.1fr)]">
          <article className="cm-card flex min-h-0 flex-col overflow-hidden"><div className="border-b border-[var(--cm-border)] p-4"><h2 className="font-bold">Lista de calibraciones</h2><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_170px]"><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input className="cm-input w-full pl-9" placeholder="Buscar calibraciones..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label><select className="cm-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}><option value="TODOS">Todos los estados</option><option value="BORRADOR">Borrador</option><option value="PROGRAMADA">Programada</option><option value="EN_VIVO">En vivo</option><option value="CERRADA">Cerrada</option><option value="ANULADA">Anulada</option></select></div></div>
          <div className="flex-1 overflow-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-[#091b30]"><tr>{['Calibración','Campaña','Referente','Participantes','Estado','Afinidad','Fecha',''].map(x=><th key={x} className="border-b border-[var(--cm-border)] p-3 text-[var(--cm-text-secondary)]">{x}</th>)}</tr></thead><tbody>{visibleItems.map(item=>{const isSelected=item.id===selectedId,values=item.participants.map(p=>p.affinity).filter((x):x is number=>x!==undefined),average=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;return <tr key={item.id} onClick={()=>{setSelectedId(item.id);setTab('MATRIZ')}} className={`cursor-pointer border-b border-[var(--cm-border)] transition ${isSelected?'bg-cyan-400/10 shadow-[inset_3px_0_0_#22d3ee]':'hover:bg-white/[.03]'}`}><td className="p-3"><b className="block max-w-40 truncate">{item.title}</b><span className="text-[10px] text-[var(--cm-text-secondary)]">{item.id}</span></td><td className="p-3">{campaigns.find(c=>c.id===item.campaignId)?.name||'—'}</td><td className="p-3">{users.find(u=>u.id===item.expertId)?.name||'—'}</td><td className="p-3 text-center">{item.participants.length}</td><td className="p-3"><StatusBadge status={item.status}/></td><td className="p-3 font-bold text-cyan-300">{average===null?'—':`${average}%`}</td><td className="p-3">{formatDate(item.scheduledAt||item.caseSnapshot?.date)}</td><td className="p-3"><ChevronRight className="h-4 w-4"/></td></tr>})}</tbody></table>{!visibleItems.length&&<p className="p-8 text-center text-sm text-[var(--cm-text-secondary)]">No hay coincidencias.</p>}</div>
          <footer className="flex items-center justify-between border-t border-[var(--cm-border)] p-3 text-xs text-[var(--cm-text-secondary)]"><span>{filtered.length} registros</span><div className="flex items-center gap-2"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="rounded-md border border-[var(--cm-border)] p-1 disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button><span>{page} / {pages}</span><button disabled={page===pages} onClick={()=>setPage(p=>p+1)} className="rounded-md border border-[var(--cm-border)] p-1 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button></div></footer></article>
          {selected&&<article className="cm-card min-w-0 overflow-hidden"><div className="border-b border-[var(--cm-border)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-cyan-300">DETALLE DE CALIBRACIÓN</p><h2 className="mt-1 text-lg font-bold">{selected.title}</h2><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">{campaigns.find(c=>c.id===selected.campaignId)?.name||'—'} · {selected.id} · {formatDate(selected.scheduledAt||selected.caseSnapshot?.date)}</p></div><div className="flex items-center gap-2"><StatusBadge status={selected.status}/><MoreHorizontal className="h-5 w-5 text-slate-400"/></div></div><div className="mt-4 flex gap-1 overflow-x-auto">{[['MATRIZ','Matriz de evaluación'],['PARTICIPANTES','Participantes'],['INFORMACION','Información general']].map(([id,label])=><button key={id} onClick={()=>setTab(id as typeof tab)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${tab===id?'border-cyan-400 text-cyan-300':'border-transparent text-[var(--cm-text-secondary)]'}`}>{label}</button>)}</div></div>
          <div className="max-h-[650px] overflow-auto p-4">{tab==='MATRIZ'&&<Matrix item={selected} users={users}/>} {tab==='PARTICIPANTES'&&<Participants item={selected} users={users}/>} {tab==='INFORMACION'&&<GeneralInfo item={selected} users={users}/>}<div className="mt-4 flex flex-wrap gap-2">{manager&&norm(selected.status)==='BORRADOR'&&<Action text="Programar" run={()=>transition('PROGRAMADA')} busy={busy}/>} {manager&&norm(selected.status)==='PROGRAMADA'&&<Action text="Iniciar" run={()=>transition('EN_VIVO')} busy={busy}/>} {manager&&norm(selected.status)==='EN_VIVO'&&<Action text="Finalizar" run={()=>transition('FINALIZADA')} busy={busy}/>} {manager&&norm(selected.status)==='FINALIZADA'&&<Action text="Cerrar y publicar" run={()=>transition('CERRADA')} busy={busy}/>} {mayRespond&&<Action text="Responder en vivo" run={()=>setResponding(selected)} busy={busy}/>} {manager&&(!['CERRADA','ANULADA'].includes(norm(selected.status))||admin)&&<button onClick={()=>setEditing(selected)} className="cm-button-secondary px-3 py-2"><Edit3 className="h-4 w-4"/>Editar</button>} {closed&&<button onClick={exportCsv} className="cm-button-secondary px-3 py-2"><Download className="h-4 w-4"/>CSV</button>} {manager&&!['CERRADA','ANULADA'].includes(norm(selected.status))&&<button onClick={()=>void transition('ANULADA')} className="cm-button-secondary px-3 py-2">Anular</button>} {admin&&<button onClick={()=>void remove()} className="cm-button-secondary px-3 py-2 text-red-300"><Trash2 className="h-4 w-4"/></button>}</div></div></article>}
        </section>}
      </div>
      {createOpen && (
        <Form
          evaluations={evaluations.filter((e) => e.evaluationType === 'QUALITY')}
          users={users}
          initial={null}
          close={() => setCreateOpen(false)}
          saved={async () => {
            setCreateOpen(false);
            await reload();
          }}
        />
      )}
      {editing && (
        <Form
          evaluations={[]}
          users={users}
          initial={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {responding && (
        <Room
          item={responding}
          close={() => setResponding(null)}
          saved={async () => {
            setResponding(null);
            await reload();
          }}
        />
      )}
    </main>
  );
};
const Kpi=({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string})=><article className="cm-card flex items-center gap-4 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><div className="min-w-0"><p className="text-xs text-[var(--cm-text-secondary)]">{label}</p><b className="mt-1 block truncate text-xl">{value}</b><span className="text-[11px] text-slate-400">{detail}</span></div></article>;
const StatusBadge=({status}:{status:string})=>{const normalized=norm(status),tone=normalized==='EN_VIVO'?'border-cyan-400/40 bg-cyan-400/10 text-cyan-300':normalized==='CERRADA'?'border-emerald-400/40 bg-emerald-400/10 text-emerald-300':normalized==='ANULADA'?'border-red-400/40 bg-red-400/10 text-red-300':'border-amber-400/40 bg-amber-400/10 text-amber-300';return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${tone}`}>{names[status]||names[normalized]||status}</span>};
const AnswerBadge=({value}:{value?:string})=>{const config=value==='CUMPLE'?['Cumple','border-emerald-400/30 bg-emerald-400/10 text-emerald-300']:value==='NO_CUMPLE'?['No cumple','border-red-400/30 bg-red-400/10 text-red-300']:value==='NO_APLICA'?['No aplica','border-slate-400/30 bg-slate-400/10 text-slate-300']:['Pendiente','border-slate-600 bg-slate-800 text-slate-400'];return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${config[1]}`}>{config[0]}</span>};
const formatDate=(value?:string)=>{if(!value)return '—';const date=new Date(value.length===10?`${value}T00:00:00`:value);return Number.isNaN(date.getTime())?value:date.toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:value.length>10?'2-digit':undefined,minute:value.length>10?'2-digit':undefined})};
const Matrix=({item,users}:{item:Calibration;users:any[]})=>{if(norm(item.status)!=='CERRADA')return <div className="grid min-h-72 place-items-center text-center"><div><Target className="mx-auto h-10 w-10 text-cyan-400/60"/><h3 className="mt-3 font-bold">Matriz pendiente de publicación</h3><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">Se habilitará cuando la calibración esté cerrada.</p></div></div>;const participants=item.participants.filter(p=>p.response).slice(0,3),criteria=Object.entries(item.attributeLabels||{});const criterionRows=criteria.map(([id,label])=>{const reference=item.expertResponse?.answers[id],matches=participants.filter(p=>p.response?.answers[id]===reference).length;return{id,label,reference,affinity:participants.length?Math.round(matches/participants.length*100):0}}),breaches=criterionRows.filter(r=>r.affinity<100).sort((a,b)=>a.affinity-b.affinity).slice(0,3);return <div className="space-y-4"><div className="overflow-x-auto rounded-xl border border-[var(--cm-border)]"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-white/[.03]"><tr><th className="p-3">Criterio</th><th className="p-3">Referente</th>{participants.map((p,i)=><th key={p.supervisorId} className="p-3">{users.find(u=>u.id===p.supervisorId)?.name||`Monitor ${i+1}`}</th>)}<th className="p-3">Afinidad</th></tr></thead><tbody>{criterionRows.map(row=><tr key={row.id} className="border-t border-[var(--cm-border)]"><td className="p-3 font-semibold">{row.label}</td><td className="p-3"><AnswerBadge value={row.reference}/></td>{participants.map(p=><td key={p.supervisorId} className="p-3"><AnswerBadge value={p.response?.answers[row.id]}/></td>)}<td className="p-3 font-bold text-cyan-300">{row.affinity}%</td></tr>)}</tbody></table></div><div className="grid gap-3 lg:grid-cols-2"><section className="rounded-xl border border-[var(--cm-border)] bg-white/[.02] p-4"><h3 className="font-bold">Brechas detectadas</h3><div className="mt-3 space-y-2">{breaches.length?breaches.map((row,i)=><p key={row.id} className="rounded-lg bg-slate-950/25 p-2 text-xs"><b className="mr-2 text-cyan-300">{i+1}.</b>{row.label}: {100-row.affinity}% de dispersión frente al referente.</p>):<p className="text-xs text-[var(--cm-text-secondary)]">No se detectaron brechas.</p>}</div></section><section className="rounded-xl border border-[var(--cm-border)] bg-white/[.02] p-4"><h3 className="font-bold">Afinidad por evaluador</h3><div className="mt-3 space-y-3"><Bar label={users.find(u=>u.id===item.expertId)?.name||'Referente'} value={100}/>{participants.map((p,i)=><Bar key={p.supervisorId} label={users.find(u=>u.id===p.supervisorId)?.name||`Monitor ${i+1}`} value={p.affinity||0}/>)}</div></section></div></div>};
const Bar=({label,value}:{label:string;value:number;key?:React.Key})=><div><div className="mb-1 flex justify-between text-[11px]"><span>{label}</span><b>{value}%</b></div><div className="h-2 rounded-full bg-slate-700/70"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></div>;
const Participants=({item,users}:{item:Calibration;users:any[]})=><div className="space-y-2"><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs"><b>Referente experto</b><span className="ml-2 text-[var(--cm-text-secondary)]">{users.find(u=>u.id===item.expertId)?.name||'Sin asignar'}</span></div>{item.participants.map(participant=><div key={participant.supervisorId} className="flex items-center justify-between rounded-xl border border-[var(--cm-border)] p-3 text-xs"><div><b>{users.find(u=>u.id===participant.supervisorId)?.name||participant.supervisorId}</b><span className="block text-[var(--cm-text-secondary)]">{users.find(u=>u.id===participant.supervisorId)?.role||'Participante'}</span></div><span>{participant.status==='RESPONDIDA'?'Respuesta enviada':'Pendiente'}</span></div>)}</div>;
const GeneralInfo=({item,users}:{item:Calibration;users:any[]})=><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Info label="Descripción" value={item.description||'Sin descripción'}/><Info label="Tipo" value={item.callType||'—'}/><Info label="ID de llamada" value={item.caseSnapshot?.callId||'—'}/><Info label="Referente" value={users.find(u=>u.id===item.expertId)?.name||'—'}/><Info label="Programación" value={formatDate(item.scheduledAt)}/><Info label="Vencimiento" value={formatDate(item.dueAt)}/></div>{item.caseSnapshot?.audioUrl&&<AudioPlayer audioUrl={item.caseSnapshot.audioUrl} audioFileName={item.caseSnapshot.audioFileName} audioDurationSeconds={item.caseSnapshot.audioDurationSeconds} readOnly/>}</div>;
const Action = ({ text, run, busy }: { text: string; run: () => void; busy: boolean }) => (
  <button disabled={busy} onClick={() => void run()} className="cm-button-primary px-3 py-2">
    {text}
  </button>
);
const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border border-[var(--cm-border)] p-3">
    <span className="block text-[var(--cm-text-secondary)]">{label}</span>
    <b>{value}</b>
  </div>
);
const Form: React.FC<{
  evaluations: Evaluation[];
  users: any[];
  initial: Calibration | null;
  close: () => void;
  saved: () => void;
}> = ({ evaluations, users, initial, close, saved }) => {
  const [eid, setEid] = useState(initial?.evaluationId || ''),
    [title, setTitle] = useState(initial?.title || ''),
    [description, setDescription] = useState(initial?.description || ''),
    [callType, setCallType] = useState(initial?.callType || 'NO_VENTA'),
    [scheduledAt, setScheduled] = useState(initial?.scheduledAt || ''),
    [dueAt, setDue] = useState(initial?.dueAt || ''),
    [expertId, setExpert] = useState(initial?.expertId || ''),
    [ids, setIds] = useState<string[]>(initial?.participants.map((p) => p.supervisorId) || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = users.filter((u) => u.status === 'ACTIVO' && !['ASESOR', 'GERENCIA'].includes(u.role)),
    experts = active.filter((u) => ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR'].includes(u.role));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (initial)
        await calibrationsApi.update(initial.id, {
          title,
          description,
          callType,
          scheduledAt,
          dueAt,
          expertId,
          participants: ids
            .filter((id) => id !== expertId)
            .map((supervisorId) => ({
              supervisorId,
              status: initial.participants.find((p) => p.supervisorId === supervisorId)?.status || 'PENDIENTE',
            })),
        });
      else {
        const evaluation = evaluations.find((x) => x.id === eid);
        if (!evaluation) throw Error('Selecciona la evaluación.');
        await calibrationsApi.create({
          evaluation,
          title,
          description,
          callType,
          scheduledAt,
          dueAt,
          expertId,
          participantIds: ids,
        });
      }
      await saved();
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial ? 'Editar calibración' : 'Nueva calibración'} close={close}>
      <form onSubmit={save} className="space-y-3">
        {!initial && (
          <Field label="Evaluación existente *">
            <select
              required
              className="cm-select w-full"
              value={eid}
              onChange={(e) => {
                setEid(e.target.value);
                const v = evaluations.find((x) => x.id === e.target.value);
                if (v) {
                  setTitle(`Calibración ${v.callId}`);
                  setCallType(v.sale ? 'VENTA' : 'NO_VENTA');
                }
              }}
            >
              <option value="">Seleccionar</option>
              {evaluations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.callId} · {x.date} · {x.technicalScore ?? x.scoreTotal}%
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nombre *">
          <input required className="cm-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Descripción">
          <textarea className="cm-input w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <select className="cm-select w-full" value={callType} onChange={(e) => setCallType(e.target.value as any)}>
              <option value="VENTA">Venta</option>
              <option value="NO_VENTA">No venta</option>
            </select>
          </Field>
          <Field label="Programación *">
            <input required type="datetime-local" className="cm-input w-full" value={scheduledAt} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label="Vencimiento *">
            <input required type="date" className="cm-input w-full" value={dueAt} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Referente Experto *">
          <select
            required
            className="cm-select w-full"
            value={expertId}
            onChange={(e) => {
              setExpert(e.target.value);
              setIds((v) => v.filter((id) => id !== e.target.value));
            }}
          >
            <option value="">Seleccionar</option>
            {experts.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Participantes activos *">
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {active
              .filter((u) => u.id !== expertId)
              .map((u) => (
                <label key={u.id} className="flex gap-2 rounded-lg border border-[var(--cm-border)] p-2">
                  <input type="checkbox" checked={ids.includes(u.id)} onChange={(e) => setIds((v) => (e.target.checked ? [...v, u.id] : v.filter((id) => id !== u.id)))} />
                  <span>
                    {u.name}
                    <small className="block text-[var(--cm-text-secondary)]">{u.role}</small>
                  </span>
                </label>
              ))}
          </div>
        </Field>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="cm-button-secondary px-4 py-2">
            Cancelar
          </button>
          <button disabled={busy || !ids.length} className="cm-button-primary px-4 py-2">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
};
const Room: React.FC<{
  item: Calibration;
  close: () => void;
  saved: () => void;
}> = ({ item, close, saved }) => {
  const [answers, setAnswers] = useState<Record<string, ComplianceStatus>>({}),
    [comments, setComments] = useState<Record<string, string>>({}),
    [typification, setTyp] = useState(''),
    [observation, setObs] = useState(''),
    [error, setError] = useState('');
  const submit = async () => {
    if (!confirm('¿Enviar? La respuesta quedará bloqueada.')) return;
    try {
      await calibrationsApi.respond(item.id, {
        answers,
        comments,
        typification,
        observation,
      });
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  return (
    <Modal title={`Sala · ${item.title}`} close={close}>
      {item.caseSnapshot?.audioUrl && <AudioPlayer audioUrl={item.caseSnapshot.audioUrl} audioFileName={item.caseSnapshot.audioFileName} audioDurationSeconds={item.caseSnapshot.audioDurationSeconds} readOnly />}
      <div className="mt-4 space-y-3">
        {Object.entries(item.attributeLabels || {}).map(([id, n]) => (
          <div key={id} className="rounded-lg border border-[var(--cm-border)] p-3">
            <b className="text-sm">{n}</b>
            <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
              <select
                className="cm-select"
                value={answers[id] || ''}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [id]: e.target.value as ComplianceStatus,
                  })
                }
              >
                <option value="">Seleccionar</option>
                <option value="CUMPLE">Cumple</option>
                <option value="NO_CUMPLE">No cumple</option>
                <option value="NO_APLICA">No aplica</option>
              </select>
              <input className="cm-input" placeholder="Comentario" value={comments[id] || ''} onChange={(e) => setComments({ ...comments, [id]: e.target.value })} />
            </div>
          </div>
        ))}
        <Field label="Tipificación">
          <input className="cm-input w-full" value={typification} onChange={(e) => setTyp(e.target.value)} />
        </Field>
        <Field label="Observación">
          <textarea className="cm-input w-full" value={observation} onChange={(e) => setObs(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={close} className="cm-button-secondary px-4 py-2">
            Cancelar
          </button>
          <button disabled={Object.keys(answers).length !== Object.keys(item.attributeLabels || {}).length} onClick={() => void submit()} className="cm-button-primary px-4 py-2">
            <CheckCircle2 className="h-4 w-4" />
            Confirmar y enviar
          </button>
        </div>
      </div>
    </Modal>
  );
};
const Results = ({ item, users }: { item: Calibration; users: any[] }) => {
  const rows = [...item.participants].filter((p) => p.affinity !== undefined).sort((a, b) => (b.affinity || 0) - (a.affinity || 0));
  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-bold">Resultados publicados</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Info label="Nota patrón" value={`${item.results?.patternScore ?? item.expertResponse?.score ?? 0}%`} />
        <Info label="Afinidad promedio" value={`${item.results?.averageAffinity ?? 0}%`} />
        <Info label="Mayor afinidad" value={`${item.results?.highestAffinity ?? 0}%`} />
        <Info label="Menor afinidad" value={`${item.results?.lowestAffinity ?? 0}%`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead>
            <tr>
              {['#', 'Participante', 'Afinidad', 'Nivel', 'Desviación', 'Diferencias principales'].map((x) => (
                <th key={x} className="border-b border-[var(--cm-border)] p-3">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.supervisorId}>
                <td className="p-3">{i + 1}</td>
                <td className="p-3 font-semibold">{users.find((u) => u.id === p.supervisorId)?.name || p.supervisorId}</td>
                <td className="p-3">{p.affinity}%</td>
                <td className="p-3">{p.affinityLevel}</td>
                <td className="p-3">{p.deviation}</td>
                <td className="p-3">{p.mainDifferences?.join(', ') || 'Sin diferencias'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-bold">Comparación 1 a 1</h4>
        {rows.map((participant) => (
          <details key={participant.supervisorId} className="rounded-lg border border-[var(--cm-border)] p-3 text-xs">
            <summary className="cursor-pointer font-semibold">{users.find((u) => u.id === participant.supervisorId)?.name || participant.supervisorId} · {participant.affinity}%</summary>
            <div className="mt-3 grid gap-2">
              {Object.entries(item.attributeLabels || {}).map(([id, label]) => (
                <div key={id} className="grid grid-cols-[1fr_100px_100px] gap-2"><span>{label}</span><span>Patrón: {item.expertResponse?.answers[id]}</span><span>Participante: {participant.response?.answers[id]}</span></div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};
const Modal: React.FC<{
  title: string;
  close: () => void;
  children: React.ReactNode;
}> = ({ title, close, children }) =>
  createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="cm-modal max-h-[94vh] w-full max-w-4xl overflow-y-auto p-5">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold">
            <ClipboardCheck className="h-5 w-5 text-[var(--cm-primary)]" />
            {title}
          </h2>
          <button onClick={close}>
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-semibold">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);
