import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Campaign } from '../../types';

const emptyForm: Omit<Campaign, 'id'> = {
  name: '', client: '', status: 'ACTIVA', products: [], description: '', backgroundImage: ''
};

export const CampaignManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { campaigns, advisors, addCampaign, updateCampaign, deleteCampaign } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Campaign, 'id'>>(emptyForm);
  const [message, setMessage] = useState('');

  const openForm = (campaign?: Campaign) => {
    setMessage('');
    setEditingId(campaign?.id || 'NEW');
    setForm(campaign ? { ...campaign } : emptyForm);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const data = { ...form, name: form.name.trim(), client: form.client.trim() || form.name.trim() };
    if (editingId === 'NEW') addCampaign(data);
    else if (editingId) updateCampaign(editingId, data);
    setEditingId(null);
  };

  const remove = async (campaign: Campaign) => {
    if (advisors.some(advisor => advisor.campaignId === campaign.id)) {
      setMessage(`No se puede eliminar “${campaign.name}” porque tiene asesores asignados.`);
      return;
    }
    if (!window.confirm(`¿Eliminar la campaña “${campaign.name}”?`)) return;
    try { await deleteCampaign(campaign.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la campaña.'); }
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
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.72;
        let result = canvas.toDataURL('image/jpeg', quality);
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
          <div><h3 className="text-lg font-bold text-white">Gestionar campañas</h3><p className="text-xs text-[var(--cm-text-secondary)]">Crear, editar, visualizar y eliminar campañas.</p></div>
          <button onClick={onClose} className="p-2 text-[var(--cm-text-secondary)] hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--cm-text-secondary)]">{campaigns.length} campañas registradas</span>
            <button onClick={() => openForm()} className="cm-button-primary flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold"><Plus className="h-4 w-4" />Añadir campaña</button>
          </div>
          {message && <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">{message}</div>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map(campaign => (
              <article key={campaign.id} className="overflow-hidden rounded-xl border border-[var(--cm-border)] bg-[var(--cm-surface)]">
                <div className="h-28 bg-[#071a31] bg-cover bg-center" style={campaign.backgroundImage ? { backgroundImage: `linear-gradient(180deg,transparent,rgba(3,18,35,.75)),url(${campaign.backgroundImage})` } : undefined} />
                <div className="space-y-2 p-4">
                  <div><h4 className="font-bold text-white">{campaign.name}</h4><p className="text-xs text-[var(--cm-text-secondary)]">{campaign.client}</p></div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${campaign.status === 'ACTIVA' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-300'}`}>{campaign.status}</span>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => openForm(campaign)} className="cm-button-secondary flex items-center gap-1 px-3 py-1.5 text-xs"><Edit3 className="h-3.5 w-3.5" />Editar</button>
                    <button onClick={() => remove(campaign)} className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {editingId && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-4">
            <form onSubmit={save} className="cm-modal w-full max-w-lg space-y-4 p-5">
              <div className="flex justify-between"><h4 className="font-bold text-white">{editingId === 'NEW' ? 'Nueva campaña' : 'Editar campaña'}</h4><button type="button" onClick={() => setEditingId(null)}><X className="h-5 w-5" /></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        )}
      </div>
    </div>, document.body
  );
};
