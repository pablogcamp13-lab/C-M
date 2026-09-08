import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Campaign, Operation } from '../../types';

const emptyForm: Omit<Campaign, 'id'> = { name: '', client: '', status: 'ACTIVA', products: [], description: '', backgroundImage: '' };
type CampaignRow = { campaign: Campaign; operation?: Operation; companyId?: string };

export const CampaignManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { campaigns, companies, operations, advisors, addCampaign, updateCampaign, deleteCampaign, addOperation, updateOperation } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState<Omit<Campaign, 'id'>>(emptyForm);
  const [message, setMessage] = useState('');

  const groups = useMemo(() => {
    const activeOperations = operations.filter(operation => !operation.legacy && operation.status === 'ACTIVA');
    const result: { id: string; name: string; rows: CampaignRow[] }[] = companies.map(company => ({
      id: company.id,
      name: company.name,
      rows: activeOperations.filter(operation => operation.companyId === company.id).flatMap(operation => {
        const campaign = campaigns.find(item => item.id === operation.campaignId);
        return campaign?.status === 'ACTIVA' ? [{ campaign, operation, companyId: company.id }] : [];
      })
    })).filter(group => group.rows.length > 0);
    const linkedIds = new Set(activeOperations.map(operation => operation.campaignId));
    const unassigned = campaigns.filter(campaign => campaign.status === 'ACTIVA' && !linkedIds.has(campaign.id)).map(campaign => ({ campaign }));
    if (unassigned.length) result.push({ id: '', name: 'Sin empresa asignada', rows: unassigned });
    return result;
  }, [campaigns, companies, operations]);

  const openForm = (row?: CampaignRow) => {
    setMessage('');
    setEditingId(row?.campaign.id || 'NEW');
    setEditingOperationId(row?.operation?.id || null);
    setCompanyId(row?.companyId || companies.find(company => company.status === 'ACTIVA')?.id || '');
    setForm(row ? { ...row.campaign } : emptyForm);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !companyId) return;
    const company = companies.find(item => item.id === companyId);
    const data = { ...form, name: form.name.trim(), client: form.client.trim() || company?.name || form.name.trim() };
    if (editingId === 'NEW') {
      const campaign = addCampaign(data);
      addOperation({ companyId, campaignId: campaign.id, name: `${company?.name || ''} / ${campaign.name}`, status: data.status, legacy: false });
    } else if (editingId) {
      updateCampaign(editingId, data);
      if (editingOperationId) updateOperation(editingOperationId, { companyId, name: `${company?.name || ''} / ${data.name}`, status: data.status });
      else addOperation({ companyId, campaignId: editingId, name: `${company?.name || ''} / ${data.name}`, status: data.status, legacy: false });
    }
    setEditingId(null);
  };

  const remove = async (row: CampaignRow) => {
    const scope = row.companyId ? ` de ${companies.find(company => company.id === row.companyId)?.name || 'la empresa'}` : '';
    if (!window.confirm(`¿Eliminar la campaña “${row.campaign.name}”${scope}? Los asesores y su historial se conservarán.`)) return;
    setMessage('');
    try {
      await deleteCampaign(row.campaign.id, row.companyId);
      setMessage(`Campaña “${row.campaign.name}” eliminada${scope}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la campaña.'); }
  };

  const loadImage = (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage('La imagen no debe superar 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 760 / image.width, 320 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.72; let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > 45000 && quality > 0.3) { quality -= 0.08; result = canvas.toDataURL('image/jpeg', quality); }
        if (result.length > 50000) { setMessage('La imagen es demasiado compleja. Usa una imagen más ligera.'); return; }
        setForm(previous => ({ ...previous, backgroundImage: result }));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
      <div className="cm-modal flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--cm-border)] px-5 py-4">
          <div><h3 className="text-lg font-bold text-white">Gestionar campañas</h3><p className="text-xs text-[var(--cm-text-secondary)]">Campañas organizadas por empresa.</p></div>
          <button onClick={onClose} className="p-2 text-[var(--cm-text-secondary)] hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--cm-text-secondary)]">{groups.reduce((total, group) => total + group.rows.length, 0)} campañas registradas</span>
            <button onClick={() => openForm()} className="cm-button-primary flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold"><Plus className="h-4 w-4" />Añadir campaña</button>
          </div>
          {message && <div className="mb-4 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-xs text-cyan-100">{message}</div>}
          <div className="space-y-5">
            {groups.map(group => <section key={group.id || 'unassigned'}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--cm-primary)]">{group.name}</h4>
              <div className="overflow-hidden rounded-xl border border-[var(--cm-border)]">
                <div className="hidden grid-cols-[56px_1fr_110px_90px_150px] gap-3 border-b border-[var(--cm-border)] bg-[#071a31] px-4 py-2 text-[10px] font-bold uppercase text-[var(--cm-text-secondary)] sm:grid"><span /><span>Campaña</span><span>Estado</span><span>Dotación</span><span className="text-right">Acciones</span></div>
                {group.rows.map(row => {
                  const assigned = advisors.filter(advisor => row.operation ? advisor.operationId === row.operation.id : advisor.campaignId === row.campaign.id).length;
                  return <div key={row.operation?.id || row.campaign.id} className="grid items-center gap-3 border-b border-[var(--cm-border)] px-4 py-3 last:border-b-0 sm:grid-cols-[56px_1fr_110px_90px_150px]">
                    <div className="h-10 w-14 rounded-md bg-[#071a31] bg-cover bg-center" style={row.campaign.backgroundImage ? { backgroundImage: `url(${row.campaign.backgroundImage})` } : undefined} />
                    <div><strong className="text-sm text-white">{row.campaign.name}</strong><span className="block text-xs text-[var(--cm-text-secondary)]">{row.campaign.description || row.operation?.name || 'Sin descripción'}</span></div>
                    <span className="w-fit rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{row.campaign.status}</span>
                    <span className="text-xs text-[var(--cm-text-secondary)]">{assigned} asesores</span>
                    <div className="flex justify-end gap-2"><button onClick={() => openForm(row)} className="cm-button-secondary flex items-center gap-1 px-3 py-1.5 text-xs"><Edit3 className="h-3.5 w-3.5" />Editar</button><button onClick={() => void remove(row)} className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></button></div>
                  </div>;
                })}
              </div>
            </section>)}
            {!groups.length && <p className="py-10 text-center text-sm text-[var(--cm-text-secondary)]">No hay campañas activas.</p>}
          </div>
        </div>

        {editingId && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-4">
          <form onSubmit={save} className="cm-modal w-full max-w-lg space-y-4 p-5">
            <div className="flex justify-between"><h4 className="font-bold text-white">{editingId === 'NEW' ? 'Nueva campaña' : 'Editar campaña'}</h4><button type="button" onClick={() => setEditingId(null)}><X className="h-5 w-5" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--cm-text-secondary)]">Empresa *<select required className="cm-select mt-1 w-full" value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">Seleccionar empresa</option>{companies.filter(company => company.status === 'ACTIVA').map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label className="text-xs text-[var(--cm-text-secondary)]">Nombre *<input required className="cm-input mt-1 w-full" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
              <label className="text-xs text-[var(--cm-text-secondary)]">Cliente<input className="cm-input mt-1 w-full" value={form.client} onChange={event => setForm({ ...form, client: event.target.value })} /></label>
              <label className="text-xs text-[var(--cm-text-secondary)]">Estado<select className="cm-select mt-1 w-full" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Campaign['status'] })}><option value="ACTIVA">Activa</option><option value="INACTIVA">Inactiva</option></select></label>
              <label className="text-xs text-[var(--cm-text-secondary)]">Productos (separados por coma)<input className="cm-input mt-1 w-full" value={form.products.join(', ')} onChange={event => setForm({ ...form, products: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
              <label className="sm:col-span-2 text-xs text-[var(--cm-text-secondary)]">Descripción<textarea className="cm-input mt-1 w-full" rows={3} value={form.description || ''} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
              <label className="sm:col-span-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--cm-border)] p-3 text-xs text-[var(--cm-text-secondary)]"><ImagePlus className="h-4 w-4" />Seleccionar imagen de fondo (máx. 2 MB)<input type="file" accept="image/*" className="hidden" onChange={event => loadImage(event.target.files?.[0])} /></label>
              {form.backgroundImage && <div className="sm:col-span-2 h-28 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${form.backgroundImage})` }}><button type="button" onClick={() => setForm({ ...form, backgroundImage: '' })} className="m-2 rounded bg-slate-950/70 px-2 py-1 text-[10px] text-white">Quitar imagen</button></div>}
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingId(null)} className="cm-button-secondary px-4 py-2 text-xs">Cancelar</button><button className="cm-button-primary px-4 py-2 text-xs font-bold">Guardar campaña</button></div>
          </form>
        </div>}
      </div>
    </div>, document.body
  );
};
