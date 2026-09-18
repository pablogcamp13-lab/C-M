import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Link2, UserPlus } from 'lucide-react';
import { organizationApi, speechImportApi } from '../../api/sharedRepository';
import { useApp } from '../../context/AppContext';
import type { Evaluation } from '../../types';

const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const ResolveAdvisorModal: React.FC<{ evaluation: Evaluation; onClose: () => void }> = ({ evaluation, onClose }) => {
  const { advisors, campaigns, companies, operations, refreshRepository, refreshEvaluations } = useApp();
  const campaignName = evaluation.sourceCampaignName || campaigns.find(item => item.id === evaluation.campaignId)?.name || '';
  const candidateOperations = operations.filter(item => item.status === 'ACTIVA' && !item.legacy && normalize(campaigns.find(campaign => campaign.id === item.campaignId)?.name || '') === normalize(campaignName));
  const candidates = advisors.filter(advisor => advisor.status === 'ACTIVO' && advisor.active !== false && candidateOperations.some(operation => operation.id === advisor.operationId));
  const [mode, setMode] = useState<'link' | 'create'>('link');
  const [advisorId, setAdvisorId] = useState('');
  const [name, setName] = useState(evaluation.sourceAdvisorName || '');
  const dni = String(evaluation.sourceAdvisorDni || '').replace(/\D/g, '');
  const [companyId, setCompanyId] = useState(() => companies.find(company => normalize(company.name) === normalize(evaluation.sourceCompanyName || ''))?.id || '');
  const [operationId, setOperationId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [supervisors, setSupervisors] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createdMessage, setCreatedMessage] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    setSupervisors([]); setSupervisorId(''); setError('');
    if (!operationId) return;
    let active = true;
    setLoadingSupervisors(true);
    void organizationApi.supervisors(operationId).then(result => {
      if (active) setSupervisors(result.supervisors || []);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'No fue posible cargar los supervisores de esta campaña.');
    }).finally(() => { if (active) setLoadingSupervisors(false); });
    return () => { active = false; };
  }, [operationId]);

  const link = async (selectedId: string) => {
    await speechImportApi.linkAdvisor(evaluation.id, selectedId);
    await refreshEvaluations();
    setDone(mode === 'create' ? 'El asesor se creó en Dotación y la evaluación quedó relacionada correctamente.' : 'La evaluación quedó relacionada correctamente con el asesor.');
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (mode === 'create') {
        if (!name.trim() || !/^\d{8}$/.test(dni) || !companyId || !operationId || !supervisorId) throw new Error('Completa nombre, empresa, campaña y supervisor. El archivo debe contener un DNI válido de 8 dígitos.');
        const { advisor } = await speechImportApi.createAdvisor(evaluation.id, { name: name.trim(), dni, companyId, operationId, supervisorId });
        setAdvisorId(advisor.id);
        setMode('link');
        setCreatedMessage(`${advisor.name} se creó y guardó en Dotación. Si falla la relación, podrás reintentarla sin volver a crearlo.`);
        await refreshRepository();
        await link(advisor.id);
      } else {
        if (!advisorId) throw new Error('Selecciona un asesor.');
        await link(advisorId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible completar la operación.');
    } finally { setBusy(false); }
  };

  return createPortal(<div className="fixed inset-0 z-[330] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="resolve-advisor-title"><div className="cm-modal max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="cm-eyebrow">RESOLVER ALERTA</p><h3 id="resolve-advisor-title" className="text-base font-bold">{done ? 'Alerta resuelta' : 'Relacionar evaluación con asesor'}</h3><p className="mt-1 text-xs text-[var(--cm-text-secondary)]">{evaluation.sourceAdvisorName || 'Asesor no identificado'}{dni ? ` · DNI ${dni}` : ''}</p></div><button type="button" onClick={onClose} disabled={busy} className="cm-navbar__icon-button" aria-label="Cerrar">×</button></div>
    {done ? <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"><CheckCircle2 className="mb-2 h-6 w-6 text-emerald-400"/><p>{done}</p><button type="button" onClick={onClose} className="cm-button-primary mt-4 px-4 py-2 text-xs">Cerrar</button></div> : <>
      <div className="mt-5 flex gap-2 border-b border-[var(--cm-border)] pb-3"><button type="button" aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setError(''); }} disabled={busy} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'link' ? 'bg-cyan-500 text-slate-950' : 'cm-button-secondary'}`}><Link2 className="mr-1 inline h-4 w-4"/>Seleccionar existente</button><button type="button" aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(''); }} disabled={busy || Boolean(createdMessage)} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'create' ? 'bg-cyan-500 text-slate-950' : 'cm-button-secondary'}`}><UserPlus className="mr-1 inline h-4 w-4"/>Crear asesor</button></div>
      {mode === 'link' ? <label className="mt-5 block text-xs font-bold">Asesor activo de {campaignName}<select value={advisorId} onChange={event => setAdvisorId(event.target.value)} className="cm-select mt-2 w-full p-3"><option value="">Seleccionar asesor</option>{candidates.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name} · {advisor.dni}</option>)}</select></label> : <div className="mt-5 space-y-3 text-xs">
        <label className="block font-bold">Nombre completo<input value={name} onChange={event => setName(event.target.value)} className="cm-input mt-1.5 w-full p-3" maxLength={120}/></label>
        <label className="block font-bold">DNI del archivo<input value={dni} readOnly className="cm-input mt-1.5 w-full p-3 opacity-75"/></label>
        <label className="block font-bold">Empresa<select value={companyId} onChange={event => { setCompanyId(event.target.value); setOperationId(''); }} className="cm-select mt-1.5 w-full p-3"><option value="">Seleccionar empresa</option>{companies.filter(company => company.status === 'ACTIVA' && candidateOperations.some(operation => operation.companyId === company.id)).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className="block font-bold">Campaña<select value={operationId} onChange={event => setOperationId(event.target.value)} disabled={!companyId} className="cm-select mt-1.5 w-full p-3"><option value="">Seleccionar campaña</option>{candidateOperations.filter(operation => operation.companyId === companyId).map(operation => <option key={operation.id} value={operation.id}>{campaigns.find(campaign => campaign.id === operation.campaignId)?.name || operation.name} · {operation.name}</option>)}</select></label>
        <label className="block font-bold">Supervisor<select value={supervisorId} onChange={event => setSupervisorId(event.target.value)} disabled={!operationId || loadingSupervisors} className="cm-select mt-1.5 w-full p-3"><option value="">{loadingSupervisors ? 'Cargando supervisores…' : 'Seleccionar supervisor'}</option>{supervisors.map(supervisor => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label>
        {operationId && !loadingSupervisors && !supervisors.length && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-amber-200">La campaña no tiene supervisor vinculado. Solicita a Administración asignar uno antes de crear al asesor.</p>}
        {!/^\d{8}$/.test(dni) && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-amber-200">El archivo no contiene un DNI válido de 8 dígitos. Corrige ese dato antes del alta.</p>}
      </div>}
      {createdMessage && <p role="status" className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200">{createdMessage}</p>}
      {!candidates.length && mode === 'link' && <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-400/10 p-3 text-xs text-amber-200">No hay asesores activos en esta campaña. Puedes crear uno aquí.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-[var(--cm-border)] pt-4"><button type="button" onClick={onClose} disabled={busy} className="cm-button-secondary px-3 py-2 text-xs">Cancelar</button><button type="button" disabled={busy || (mode === 'link' ? !advisorId : !name.trim() || !/^\d{8}$/.test(dni) || !companyId || !operationId || !supervisorId)} onClick={() => void submit()} className="cm-button-primary px-3 py-2 text-xs disabled:opacity-50">{mode === 'create' ? <UserPlus className="h-4 w-4"/> : <Link2 className="h-4 w-4"/>}{busy ? 'Guardando…' : mode === 'create' ? 'Crear y relacionar' : 'Confirmar relación'}</button></div>
    </>}
  </div></div>, document.body);
};
