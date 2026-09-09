import React from 'react';
import { Check, Filter, RotateCcw, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Drawer } from './Drawer';

interface MoreFiltersDrawerProps { isOpen: boolean; onClose: () => void; }
interface FieldProps { label: string; children: React.ReactNode; icon?: boolean; }
const Field: React.FC<FieldProps> = ({ label, children, icon }) => <div><label className="cm-filterbar__label mb-1.5 flex items-center gap-1.5 text-xs font-semibold">{icon && <User className="h-3.5 w-3.5" />}{label}</label>{children}</div>;

export const MoreFiltersDrawer: React.FC<MoreFiltersDrawerProps> = ({ isOpen, onClose }) => {
  const { filters, setFilters, resetFilters, campaigns, companies, operations, users, advisors } = useApp();
  if (!isOpen) return null;
  const supervisors = users.filter(user => user.role === 'SUPERVISOR');
  const visibleOperations=operations.filter(operation=>(!filters.companyId||operation.companyId===filters.companyId)&&(!filters.campaignId||operation.campaignId===filters.campaignId));
  const visibleAdvisors = advisors.filter(advisor => (!filters.operationId || advisor.operationId === filters.operationId) && (!filters.campaignId || advisor.campaignId === filters.campaignId) && (!filters.supervisorId || advisor.supervisorId === filters.supervisorId));
  const selectClass = 'cm-select px-3 py-2 text-xs';

  return <Drawer size="sm" icon={<Filter />} title="Filtros avanzados" subtitle="Segmentación detallada de evaluaciones" onClose={onClose} footer={<><button onClick={resetFilters} className="cm-button-secondary px-3 py-2 text-xs"><RotateCcw className="h-3.5 w-3.5" />Limpiar filtros</button><button onClick={onClose} className="cm-button-primary px-4 py-2 text-xs"><Check className="h-4 w-4" />Aplicar filtros</button></>}>
      <div className="space-y-4">
        <Field label="Empresa"><select value={filters.companyId||''} onChange={event => setFilters(previous => ({ ...previous, companyId:event.target.value, operationId:'', campaignId:'', advisorId:'' }))} className={selectClass}><option value="">Todas las empresas</option>{companies.filter(company=>company.status==='ACTIVA').map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
        <Field label="Operación"><select value={filters.operationId||''} onChange={event => {const operation=operations.find(item=>item.id===event.target.value);setFilters(previous => ({ ...previous, operationId:event.target.value, campaignId:operation?.campaignId||'', advisorId:'' }));}} className={selectClass}><option value="">Todas las operaciones</option>{visibleOperations.map(operation=><option key={operation.id} value={operation.id}>{operation.name}</option>)}</select></Field>
        <Field label="Campaña"><select value={filters.campaignId} onChange={event => setFilters(previous => ({ ...previous, campaignId: event.target.value, advisorId: '' }))} className={selectClass}><option value="">Todas las campañas</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name} ({campaign.client})</option>)}</select></Field>
        <Field label="Supervisor" icon><select value={filters.supervisorId} onChange={event => setFilters(previous => ({ ...previous, supervisorId: event.target.value, advisorId: '' }))} className={selectClass}><option value="">Todos los supervisores</option>{supervisors.map(supervisor => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></Field>
        <Field label="Asesor" icon><select value={filters.advisorId} onChange={event => setFilters(previous => ({ ...previous, advisorId: event.target.value }))} className={selectClass}><option value="">Todos los asesores</option>{visibleAdvisors.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></Field>
        <div className="border-t border-[var(--cm-border)] pt-3"><Field label="Rango de fechas"><div className="grid grid-cols-2 gap-2"><label className="cm-filterbar__text-muted text-[10px]">Desde<input type="date" value={filters.dateFrom} onChange={event => setFilters(previous => ({ ...previous, dateFrom: event.target.value }))} className="cm-input mt-1 px-2.5 py-1.5 text-xs" /></label><label className="cm-filterbar__text-muted text-[10px]">Hasta<input type="date" value={filters.dateTo} onChange={event => setFilters(previous => ({ ...previous, dateTo: event.target.value }))} className="cm-input mt-1 px-2.5 py-1.5 text-xs" /></label></div></Field></div>
      </div>
  </Drawer>;
};
