import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ClipboardCheck, Download, Edit3, Plus, Trash2, X } from 'lucide-react';
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
    answered = items.reduce((n, x) => n + x.participants.filter((p) => p.status === 'RESPONDIDA').length + (x.expertResponse ? 1 : 0), 0),
    metrics = [
      ['Total', items.length],
      ['Programadas / En vivo', `${items.filter((x) => norm(x.status) === 'PROGRAMADA').length} / ${items.filter((x) => norm(x.status) === 'EN_VIVO').length}`],
      ['Cerradas', closedItems.length],
      ['Respuestas', answered],
      ['Afinidad promedio', aff.length ? `${Math.round((aff.reduce((a, b) => a + b, 0) / aff.length) * 10) / 10}%` : '—'],
    ];
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
  return (
    <main className="cm-workspace flex-1 overflow-y-auto p-5 lg:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="cm-page-heading flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="cm-eyebrow">CONSISTENCIA DE EVALUACIÓN</p>
            <h1 className="text-xl font-bold">Calibraciones</h1>
            <p className="text-xs text-[var(--cm-text-secondary)]">Evaluación ciega contra Referente Experto.</p>
          </div>
          {manager && (
            <button onClick={() => setCreateOpen(true)} className="cm-button-primary px-4 py-2 text-xs">
              <Plus className="h-4 w-4" />
              Nueva calibración
            </button>
          )}
        </header>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map(([n, v]) => (
            <article key={n} className="cm-card p-4">
              <span className="text-xs text-[var(--cm-text-secondary)]">{n}</span>
              <b className="mt-2 block text-2xl">{v}</b>
            </article>
          ))}
        </section>
        <section className="cm-card p-4">
          <label className="text-xs font-semibold">
            Calibración seleccionada
            <select className="cm-select mt-2 w-full" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Sin calibraciones</option>
              {items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} · {names[x.status] || x.status}
                </option>
              ))}
            </select>
          </label>
        </section>
        {error && <p className="rounded-lg border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        {selected && (
          <section className="cm-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{selected.title}</h2>
                <p className="text-sm text-[var(--cm-text-secondary)]">{selected.description || 'Sin descripción'}</p>
                <p className="mt-2 text-xs">
                  {campaigns.find((c) => c.id === selected.campaignId)?.name || '—'} · Llamada {selected.caseSnapshot?.callId} · {selected.callType || '—'} · {names[selected.status] || selected.status}
                </p>
              </div>
              <div className="flex gap-2">
                {manager && (!['CERRADA', 'ANULADA'].includes(norm(selected.status)) || admin) && (
                  <button onClick={() => setEditing(selected)} className="cm-button-secondary px-3 py-2">
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </button>
                )}
                {closed && (
                  <button onClick={exportCsv} className="cm-button-secondary px-3 py-2">
                    <Download className="h-4 w-4" />
                    CSV
                  </button>
                )}
                {admin && (
                  <button onClick={() => void remove()} className="cm-button-secondary px-3 py-2 text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
              <Info label="Referente" value={users.find((u) => u.id === selected.expertId)?.name || '—'} />
              <Info label="Programación" value={selected.scheduledAt || '—'} />
              <Info label="Vencimiento" value={selected.dueAt || '—'} />
              <Info label="Respuestas" value={`${selected.participants.filter((p) => p.status === 'RESPONDIDA').length}/${selected.participants.length}`} />
            </div>
            {selected.caseSnapshot?.audioUrl && (
              <div className="mt-4">
                <AudioPlayer audioUrl={selected.caseSnapshot.audioUrl} audioFileName={selected.caseSnapshot.audioFileName} audioDurationSeconds={selected.caseSnapshot.audioDurationSeconds} readOnly />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {manager && norm(selected.status) === 'BORRADOR' && <Action text="Programar" run={() => transition('PROGRAMADA')} busy={busy} />} {manager && norm(selected.status) === 'PROGRAMADA' && <Action text="Iniciar" run={() => transition('EN_VIVO')} busy={busy} />} {manager && norm(selected.status) === 'EN_VIVO' && <Action text="Finalizar" run={() => transition('FINALIZADA')} busy={busy} />} {manager && norm(selected.status) === 'FINALIZADA' && <Action text="Cerrar y publicar" run={() => transition('CERRADA')} busy={busy} />}{' '}
              {manager && !['CERRADA', 'ANULADA'].includes(norm(selected.status)) && (
                <button onClick={() => void transition('ANULADA')} className="cm-button-secondary px-3 py-2">
                  Anular
                </button>
              )}
              {mayRespond && (
                <button onClick={() => setResponding(selected)} className="cm-button-primary px-3 py-2">
                  Responder en vivo
                </button>
              )}
            </div>
            {closed ? <Results item={selected} users={users} /> : <p className="mt-5 rounded-lg border border-[var(--cm-border)] p-4 text-center text-xs text-[var(--cm-text-secondary)]">Los resultados se publican únicamente al cerrar.</p>}
          </section>
        )}
        {!items.length && <section className="cm-card p-10 text-center text-sm">No hay calibraciones.</section>}
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
