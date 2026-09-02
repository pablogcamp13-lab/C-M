import React from 'react';
import { Check, Filter, RotateCcw, User, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { COMMERCIAL_PLANS } from '../../data/plansData';

interface MoreFiltersDrawerProps { isOpen: boolean; onClose: () => void; }
interface FieldProps { label: string; children: React.ReactNode; icon?: boolean; }
const Field: React.FC<FieldProps> = ({ label, children, icon }) => <div><label className="cm-filterbar__label mb-1.5 flex items-center gap-1.5 text-xs font-semibold">{icon && <User className="h-3.5 w-3.5" />}{label}</label>{children}</div>;

export const MoreFiltersDrawer: React.FC<MoreFiltersDrawerProps> = ({ isOpen, onClose }) => {
  const { filters, setFilters, campaigns, users, advisors, evaluations, currentSection } = useApp();
  if (!isOpen) return null;
  const isQualityDashboard = currentSection === 'dashboard_quality';
  const isImprovementDashboard = currentSection === 'dashboard';
  const evaluators = users.filter(user => user.role === 'CONSULTOR' || user.role === 'ADMINISTRADOR');
  const products = Array.from(new Set([...COMMERCIAL_PLANS.map(plan => plan.name), ...evaluations.map(evaluation => evaluation.product).filter(Boolean)]));
  const resetSectionFilters = () => setFilters(previous => ({ ...previous, advisorId: '', campaignId: '', productId: '', evaluatorId: '', evaluationType: '', priorityLevel: '', dateFrom: '', dateTo: '' }));
  const selectClass = 'cm-select px-3 py-2 text-xs';

  return <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Filtros avanzados">
    <button className="absolute inset-0 w-full cursor-default bg-[rgba(3,11,24,.50)]" onClick={onClose} aria-label="Cerrar filtros" />
    <div className="absolute inset-y-0 right-0 flex max-w-full pl-10"><div className="cm-filterbar__drawer flex flex-col">
      <header className="cm-filterbar__drawer-header flex items-center justify-between border-b p-5"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[rgba(31,214,255,.12)] text-[var(--cm-primary)]"><Filter className="h-4 w-4" /></div><div><h3 className="text-sm font-bold">Filtros avanzados</h3><p className="cm-filterbar__text-muted text-xs">Segmentación detallada de evaluaciones</p></div></div><button onClick={onClose} className="cm-navbar__icon-button" aria-label="Cerrar"><X className="h-5 w-5" /></button></header>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Field label="Asesor específico" icon><select value={filters.advisorId} onChange={event => setFilters(previous => ({ ...previous, advisorId: event.target.value }))} className={selectClass}><option value="">Todos los asesores</option>{advisors.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></Field>
        <Field label="Campaña"><select value={filters.campaignId} onChange={event => setFilters(previous => ({ ...previous, campaignId: event.target.value }))} className={selectClass}><option value="">Todas las campañas</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name} ({campaign.client})</option>)}</select></Field>
        <Field label="Producto / plan"><select value={filters.productId} onChange={event => setFilters(previous => ({ ...previous, productId: event.target.value }))} className={selectClass}><option value="">Todos los productos</option>{products.map(product => <option key={product} value={product}>{product}</option>)}</select></Field>
        <Field label={isQualityDashboard ? 'Evaluador de Calidad' : 'Evaluador / consultor'}><select value={filters.evaluatorId} onChange={event => setFilters(previous => ({ ...previous, evaluatorId: event.target.value }))} className={selectClass}><option value="">Todos los evaluadores</option>{evaluators.map(evaluator => <option key={evaluator.id} value={evaluator.id}>{evaluator.name} ({evaluator.role})</option>)}</select></Field>
        {!isQualityDashboard && !isImprovementDashboard && <Field label="Metodología / tipo de ficha"><select value={filters.evaluationType} onChange={event => setFilters(previous => ({ ...previous, evaluationType: event.target.value }))} className={selectClass}><option value="">Todas las metodologías</option><option value="D3C">Mejora Continua (D+3C)</option><option value="QUALITY">Calidad (PUE)</option><option value="DIAGNOSTICO_INICIAL">Diagnóstico inicial</option><option value="SEGUIMIENTO">Seguimiento</option><option value="COACHING">Coaching 1 a 1</option><option value="REEVALUACION">Reevaluación</option><option value="CERTIFICACION">Certificación</option></select></Field>}
        <Field label={`Nivel global ${isQualityDashboard ? 'de Calidad' : 'de score'}`}><select value={filters.priorityLevel} onChange={event => setFilters(previous => ({ ...previous, priorityLevel: event.target.value }))} className={selectClass}><option value="">Todos los niveles</option><option value="ALTA">Crítico (&lt;60%)</option><option value="MEDIA">En desarrollo (60–79%)</option><option value="ESPERADO">Esperado (80–89%)</option><option value="DOMINADO">Dominado (≥90%)</option></select></Field>
        <div className="border-t border-[var(--cm-border)] pt-3"><Field label="Rango de fechas específico"><div className="grid grid-cols-2 gap-2"><label className="cm-filterbar__text-muted text-[10px]">Desde<input type="date" value={filters.dateFrom} onChange={event => setFilters(previous => ({ ...previous, dateFrom: event.target.value }))} className="cm-input mt-1 px-2.5 py-1.5 text-xs" /></label><label className="cm-filterbar__text-muted text-[10px]">Hasta<input type="date" value={filters.dateTo} onChange={event => setFilters(previous => ({ ...previous, dateTo: event.target.value }))} className="cm-input mt-1 px-2.5 py-1.5 text-xs" /></label></div></Field></div>
      </div>
      <footer className="cm-filterbar__drawer-footer flex items-center justify-between border-t p-4"><button onClick={resetSectionFilters} className="cm-button-secondary px-3 py-2 text-xs"><RotateCcw className="h-3.5 w-3.5" />Limpiar filtros</button><button onClick={onClose} className="cm-button-primary px-4 py-2 text-xs"><Check className="h-4 w-4" />Aplicar filtros</button></footer>
    </div></div>
  </div>;
};
