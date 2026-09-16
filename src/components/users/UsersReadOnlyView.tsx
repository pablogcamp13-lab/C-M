import React, { useMemo, useState } from 'react';
import { Search, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

const roles: Array<UserRole | 'TODOS'> = ['TODOS', 'ADMINISTRADOR', 'CONSULTOR', 'MONITOR', 'SUPERVISOR', 'FORMADOR', 'GERENCIA', 'ASESOR'];

export const UsersReadOnlyView: React.FC = () => {
  const { users, advisors, teams } = useApp();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<UserRole | 'TODOS'>('TODOS');
  const [status, setStatus] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return users
      .filter(user => role === 'TODOS' || user.role === role)
      .filter(user => status === 'TODOS' || user.status === status)
      .filter(user => !normalized || [user.name, user.email, user.username, user.role].some(value => String(value || '').toLocaleLowerCase().includes(normalized)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, role, status, users]);

  const assignment = (user: (typeof users)[number]) => {
    if (user.role === 'ASESOR') return advisors.find(item => item.id === user.advisorId)?.name || 'Sin asesor vinculado';
    if (user.role === 'SUPERVISOR') return teams.find(item => item.id === user.teamId)?.name || 'Sin equipo asignado';
    if (user.accessScope === 'COMPANY') return `${user.companyIds?.length || 0} empresa(s)`;
    if (user.accessScope === 'OPERATION') return `${user.operationIds?.length || 0} operación(es)`;
    return 'Acceso global';
  };

  return (
    <main className="cm-workspace min-h-full flex-1 overflow-y-auto p-5 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="cm-page-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="cm-eyebrow">DIRECTORIO</p>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Consulta de cuentas, roles y asignaciones de la plataforma.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Solo lectura
          </span>
        </header>

        <section className="cm-card p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cm-text-secondary)]" />
              <input value={query} onChange={event => setQuery(event.target.value)} className="cm-input w-full pl-9" placeholder="Buscar nombre, correo o usuario" aria-label="Buscar usuarios" />
            </label>
            <select value={role} onChange={event => setRole(event.target.value as UserRole | 'TODOS')} className="cm-select" aria-label="Filtrar por rol">
              {roles.map(item => <option key={item} value={item}>{item === 'TODOS' ? 'Todos los roles' : item}</option>)}
            </select>
            <select value={status} onChange={event => setStatus(event.target.value as typeof status)} className="cm-select" aria-label="Filtrar por estado">
              <option value="TODOS">Todos los estados</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-[var(--cm-text-secondary)]">{visibleUsers.length} de {users.length} usuarios</p>
        </section>

        <section className="cm-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-[var(--cm-border)] bg-white/[.025] text-[var(--cm-text-secondary)]">
                <tr>{['Usuario', 'Cuenta de acceso', 'Rol', 'Asignación / alcance', 'Estado'].map(label => <th key={label} className="px-4 py-3 font-semibold uppercase tracking-wide">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--cm-border)]">
                {visibleUsers.map(user => (
                  <tr key={user.id} className="transition-colors hover:bg-white/[.025]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 font-bold text-cyan-300">{user.name.charAt(0).toUpperCase()}</span>
                        <div><b className="block text-[var(--cm-text-primary)]">{user.name}</b><span className="text-[var(--cm-text-secondary)]">{user.email}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--cm-text-secondary)]">{user.username || '—'}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 rounded-full border border-[var(--cm-border)] px-2 py-1 font-semibold"><UserRoundCheck className="h-3 w-3 text-cyan-300" />{user.role}</span></td>
                    <td className="px-4 py-3 text-[var(--cm-text-secondary)]">{assignment(user)}</td>
                    <td className="px-4 py-3"><span className={`cm-badge ${user.status === 'ACTIVO' ? 'cm-badge--success' : ''}`}>{user.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleUsers.length && <div className="grid min-h-48 place-items-center text-center"><div><UsersRound className="mx-auto h-8 w-8 text-[var(--cm-text-secondary)]" /><p className="mt-2 font-semibold">No hay usuarios que coincidan</p><p className="text-xs text-[var(--cm-text-secondary)]">Prueba con otros filtros de búsqueda.</p></div></div>}
        </section>
      </div>
    </main>
  );
};
