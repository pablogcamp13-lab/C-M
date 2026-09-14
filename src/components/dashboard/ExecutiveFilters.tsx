import React, { useMemo } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Company, FilterState, Operation } from '../../types';
import { Button, DateInput, Field, Select } from '../ui';

export const getExecutiveFilterSummary = (filters: FilterState, companies: Company[], operations: Operation[], evaluationCount: number) => {
  const activeCount = [filters.companyId, filters.operationId, filters.supervisorId, filters.advisorId, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  const company = companies.find(item => item.id === filters.companyId)?.name || 'Todas las empresas';
  const operation = operations.find(item => item.id === filters.operationId)?.name || 'Todas las operaciones';
  return { activeCount, context: `${evaluationCount} evaluaciones · ${company} · ${operation}` };
};

export const useExecutiveFilterSummary = () => {
  const { filters, companies, operations, filteredEvaluations } = useApp();
  return useMemo(() => getExecutiveFilterSummary(filters, companies, operations, filteredEvaluations.length), [companies, filteredEvaluations.length, filters, operations]);
};

export const ExecutiveFilters: React.FC<{ activeCount: number }> = ({ activeCount }) => {
  const { currentUser, filters, setFilters, resetFilters, companies, operations, campaigns, advisors, users, filteredEvaluations } = useApp();
  const campaignById = useMemo(() => new Map(campaigns.map(campaign => [campaign.id, campaign])), [campaigns]);
  const companyById = useMemo(() => new Map(companies.map(company => [company.id, company])), [companies]);
  const operationById = useMemo(() => new Map(operations.map(operation => [operation.id, operation])), [operations]);
  const advisorById = useMemo(() => new Map(advisors.map(advisor => [advisor.id, advisor])), [advisors]);
  const scopedAdvisorIds = useMemo(() => currentUser.role === 'MONITOR' ? new Set(filteredEvaluations.map(evaluation => evaluation.advisorId)) : null, [currentUser.role, filteredEvaluations]);
  const scopedOperationIds = useMemo(() => currentUser.role === 'MONITOR' ? new Set(filteredEvaluations.map(evaluation => evaluation.operationId || operationById.get(advisorById.get(evaluation.advisorId)?.operationId || '')?.id).filter((id): id is string => Boolean(id))) : null, [advisorById, currentUser.role, filteredEvaluations, operationById]);
  const activeOperations = useMemo(() => operations.filter(operation => {
    if (operation.status !== 'ACTIVA' || campaignById.get(operation.campaignId)?.status !== 'ACTIVA' || companyById.get(operation.companyId)?.status !== 'ACTIVA') return false;
    if (scopedOperationIds && !scopedOperationIds.has(operation.id)) return false;
    return !filters.companyId || operation.companyId === filters.companyId;
  }).sort((a, b) => `${companyById.get(a.companyId)?.name} ${a.name}`.localeCompare(`${companyById.get(b.companyId)?.name} ${b.name}`)), [campaignById, companyById, filters.companyId, operations, scopedOperationIds]);

  const availableAdvisors = useMemo(() => advisors.filter(advisor => {
    const operation = operationById.get(advisor.operationId || '');
    if (advisor.status === 'INACTIVO') return false;
    if (scopedAdvisorIds && !scopedAdvisorIds.has(advisor.id)) return false;
    if (filters.companyId && operation?.companyId !== filters.companyId) return false;
    if (filters.operationId && advisor.operationId !== filters.operationId) return false;
    if (filters.supervisorId && advisor.supervisorId !== filters.supervisorId) return false;
    return true;
  }), [advisors, filters.companyId, filters.operationId, filters.supervisorId, operationById, scopedAdvisorIds]);

  const supervisorOptions = useMemo(() => {
    const ids = new Set(availableAdvisors.map(advisor => advisor.supervisorId).filter(Boolean));
    return [...ids].map(id => ({ id, name: users.find(user => user.id === id)?.name || advisors.find(advisor => advisor.supervisorId === id)?.supervisor || 'Supervisor no identificado' })).sort((a, b) => a.name.localeCompare(b.name));
  }, [advisors, availableAdvisors, users]);

  return <section className="cm-exec-filters" aria-label="Filtros ejecutivos">
    <div className="cm-exec-filters__grid">
      <Field label="Empresa">
        <Select value={filters.companyId || ''} onChange={event => setFilters(previous => ({ ...previous, companyId: event.target.value, operationId: '', campaignId: '', supervisorId: '', advisorId: '' }))}>
          <option value="">Todas las empresas</option>
          {companies.filter(company => company.status === 'ACTIVA' && (!scopedOperationIds || activeOperations.some(operation => operation.companyId === company.id))).sort((a, b) => a.name.localeCompare(b.name)).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </Select>
      </Field>
      <Field label="Campaña / operación">
        <Select value={filters.operationId || ''} onChange={event => {
          const operation = operations.find(item => item.id === event.target.value);
          setFilters(previous => ({ ...previous, operationId: operation?.id || '', campaignId: operation?.campaignId || '', companyId: operation?.companyId || previous.companyId || '', supervisorId: '', advisorId: '' }));
        }}>
          <option value="">Todas las operaciones</option>
          {activeOperations.map(operation => <option key={operation.id} value={operation.id}>{companyById.get(operation.companyId)?.name} / {operation.name}</option>)}
        </Select>
      </Field>
      <Field label="Supervisor">
        <Select value={filters.supervisorId} onChange={event => setFilters(previous => ({ ...previous, supervisorId: event.target.value, advisorId: '' }))}>
          <option value="">Todos los supervisores</option>
          {supervisorOptions.map(supervisor => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}
        </Select>
      </Field>
      <Field label="Agente">
        <Select value={filters.advisorId} onChange={event => setFilters(previous => ({ ...previous, advisorId: event.target.value }))}>
          <option value="">Todos los agentes</option>
          {[...availableAdvisors].sort((a, b) => a.name.localeCompare(b.name)).map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
        </Select>
      </Field>
      <div className="cm-exec-filters__period">
        <Field label="Desde"><DateInput aria-label="Periodo desde" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={event => setFilters(previous => ({ ...previous, dateFrom: event.target.value }))} /></Field>
        <Field label="Hasta"><DateInput aria-label="Periodo hasta" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={event => setFilters(previous => ({ ...previous, dateTo: event.target.value }))} /></Field>
      </div>
    </div>
    <div className="cm-exec-filters__context"><span><CalendarDays aria-hidden="true" />{filteredEvaluations.length} evaluaciones</span>{activeCount > 0 && <Button variant="ghost" size="sm" leadingIcon={<RotateCcw />} onClick={resetFilters}>Limpiar filtros</Button>}</div>
  </section>;
};
