import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IconButton } from '../ui';
import { navigationForRole } from './navigation';

export const Sidebar: React.FC<{ mobileOpen: boolean; onMobileClose: () => void }> = ({ mobileOpen, onMobileClose }) => {
  const { currentSection, setCurrentSection, currentUser, evaluations, actionPlans } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const navigation = navigationForRole(currentUser.role);
  const groups = Array.from(new Set(navigation.map(item => item.group)));
  const badgeFor = (section: string) => section === 'evaluations' ? evaluations.length : section === 'action_plans' ? actionPlans.filter(plan => plan.status === 'EN_CURSO' || plan.status === 'PENDIENTE').length : undefined;
  const go = (section: typeof currentSection) => { setCurrentSection(section); onMobileClose(); };

  return <>
    {mobileOpen && <button className="cm-sidebar-backdrop lg:hidden" onClick={onMobileClose} aria-label="Cerrar navegación" />}
    <aside className={`cm-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="cm-sidebar__brand"><button onClick={() => go(currentUser.role === 'MONITOR' ? 'monitor_progress' : 'home')}><span>C&amp;M</span>{!collapsed && <i>Calidad y<br />Mejora Continua</i>}</button><IconButton label="Cerrar navegación" onClick={onMobileClose} className="lg:hidden"><X /></IconButton></div>
      <nav className="cm-sidebar__nav" aria-label="Navegación principal">{groups.map(group => <section key={group}>{!collapsed && <h2>{group}</h2>}<div>{navigation.filter(item => item.group === group).map(item => { const active = currentSection === item.section; const badge = badgeFor(item.section); return <button key={item.section} onClick={() => go(item.section)} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}><span>{item.icon}</span>{!collapsed && <><b>{item.label}</b>{badge !== undefined && badge > 0 && <em>{badge}</em>}</>}</button>; })}</div></section>)}</nav>
      <div className="cm-sidebar__footer"><button className="cm-sidebar__user" title={`${currentUser.name} · ${currentUser.role}`}><span>{currentUser.name.charAt(0)}</span>{!collapsed && <i><b>{currentUser.name}</b><small>{currentUser.role}</small></i>}</button><IconButton label={collapsed ? 'Expandir menú' : 'Contraer menú'} onClick={() => setCollapsed(value => !value)} className="hidden lg:grid">{collapsed ? <ChevronRight /> : <ChevronLeft />}</IconButton></div>
    </aside>
  </>;
};
