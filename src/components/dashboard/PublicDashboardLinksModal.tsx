import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Link2, ShieldOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Field, Modal, Select } from '../ui';

type LinkRecord = { id:string; companyId:string; campaignId:string; companyName:string; campaignName:string; dashboardType:'QUALITY'|'D3C'|'BOTH'; createdAt:string; expiresAt:string; revokedAt:string|null };
const request = async (path:string, init?:RequestInit) => {
  const token=sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN');
  const response=await fetch(path,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'No se pudo completar la operación.');
  return body;
};

export const PublicDashboardLinksModal:React.FC<{onClose:()=>void}>=({onClose})=>{
  const {companies,campaigns,operations}=useApp();
  const [companyId,setCompanyId]=useState('');
  const [campaignId,setCampaignId]=useState('');
  const [dashboardType,setDashboardType]=useState<'QUALITY'|'D3C'|''>('');
  const [expiresInDays,setExpiresInDays]=useState(90);
  const [links,setLinks]=useState<LinkRecord[]>([]);
  const [newUrl,setNewUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const activeCompanies=useMemo(()=>companies.filter(company=>company.status==='ACTIVA'&&operations.some(operation=>operation.companyId===company.id&&operation.status==='ACTIVA'&&!operation.legacy)),[companies,operations]);
  const availableCampaigns=useMemo(()=>campaigns.filter(campaign=>campaign.status==='ACTIVA'&&operations.some(operation=>operation.companyId===companyId&&operation.campaignId===campaign.id&&operation.status==='ACTIVA'&&!operation.legacy)),[campaigns,companyId,operations]);
  useEffect(()=>{let alive=true;request('/api/admin/public-dashboard-links').then(data=>{if(alive)setLinks(data.links||[]);}).catch(cause=>{if(alive)setError(cause.message);});return()=>{alive=false;};},[]);
  const create=async()=>{setBusy(true);setError('');setNotice('');setNewUrl('');try{const data=await request('/api/admin/public-dashboard-links',{method:'POST',body:JSON.stringify({companyId,campaignId,dashboardType,expiresInDays})});setLinks(items=>[data.link,...items]);setNewUrl(`${window.location.origin}${data.path}`);setNotice('Enlace creado. Cópialo ahora: por seguridad no volverá a mostrarse.');}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo crear el enlace.');}finally{setBusy(false);}};
  const revoke=async(id:string)=>{if(!window.confirm('¿Revocar este enlace? El cliente dejará de poder abrirlo.'))return;setBusy(true);setError('');try{const data=await request(`/api/admin/public-dashboard-links/${id}/revoke`,{method:'POST'});setLinks(items=>items.map(item=>item.id===id?data.link:item));setNotice('Enlace revocado.');}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo revocar.');}finally{setBusy(false);}};
  const copy=async()=>{try{await navigator.clipboard.writeText(newUrl);setNotice('Enlace copiado.');}catch{setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo.');}};
  return <Modal open title="Compartir dashboard con cliente" description="Enlace público de solo lectura, limitado a una empresa y campaña." onClose={onClose} size="lg" footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
    <div className="space-y-5">
      <p className="rounded-xl border border-cyan-700/50 bg-cyan-950/20 p-3 text-sm text-[var(--cm-text-secondary)]">Cualquier persona con el enlace podrá ver nombres de asesores, indicadores y evaluaciones resumidas. No tendrá acceso a audios, documentos ni datos de contacto.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Empresa"><Select value={companyId} onChange={event=>{setCompanyId(event.target.value);setCampaignId('');}}><option value="">Seleccionar empresa</option>{activeCompanies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</Select></Field>
        <Field label="Campaña"><Select value={campaignId} disabled={!companyId} onChange={event=>setCampaignId(event.target.value)}><option value="">Seleccionar campaña</option>{availableCampaigns.map(campaign=><option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></Field>
        <Field label="Dashboard"><Select value={dashboardType} onChange={event=>setDashboardType(event.target.value as 'QUALITY'|'D3C'|'')}><option value="">Seleccionar vista</option><option value="QUALITY">Calidad</option><option value="D3C">Mejora Continua · D+3C</option></Select></Field>
        <Field label="Vigencia"><Select value={expiresInDays} onChange={event=>setExpiresInDays(Number(event.target.value))}><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option></Select></Field>
      </div>
      <Button leadingIcon={<Link2/>} disabled={!companyId||!campaignId||!dashboardType} loading={busy} onClick={create}>Generar enlace</Button>
      {newUrl&&<div className="rounded-xl border border-emerald-700/60 bg-emerald-950/20 p-4"><p className="mb-2 text-sm font-semibold">Enlace listo para compartir</p><input aria-label="Enlace público generado" readOnly value={newUrl} onFocus={event=>event.target.select()} className="cm-input w-full"/><div className="mt-3 flex gap-2"><Button size="sm" leadingIcon={<Copy/>} onClick={copy}>Copiar enlace</Button><Button size="sm" variant="secondary" leadingIcon={<ExternalLink/>} onClick={()=>window.open(newUrl,'_blank','noopener,noreferrer')}>Vista previa</Button></div></div>}
      {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-300">{notice}</p>}
      <section aria-label="Enlaces generados"><h3 className="mb-2 font-semibold">Enlaces generados</h3>{links.length?<div className="max-h-56 space-y-2 overflow-y-auto">{links.map(link=>{const active=!link.revokedAt&&Date.parse(link.expiresAt)>Date.now();return <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cm-border)] p-3 text-sm"><span><strong>{link.companyName} / {link.campaignName}</strong><small className="block text-[var(--cm-text-secondary)]">{link.dashboardType==='QUALITY'?'Calidad':link.dashboardType==='D3C'?'D+3C':'Ambas vistas (enlace anterior)'} · {link.revokedAt?'Revocado':active?`Vence ${new Date(link.expiresAt).toLocaleDateString('es-PE')}`:'Caducado'}</small></span>{active&&<Button size="sm" variant="danger" leadingIcon={<ShieldOff/>} disabled={busy} onClick={()=>revoke(link.id)}>Revocar</Button>}</div>;})}</div>:<p className="text-sm text-[var(--cm-text-secondary)]">Aún no hay enlaces compartidos.</p>}</section>
    </div>
  </Modal>;
};
