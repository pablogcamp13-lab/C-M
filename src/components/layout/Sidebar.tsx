import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IconButton } from '../ui';
import { navigationForRole } from './navigation';

const AUTO_HIDE_DELAY = 5_000;

export const Sidebar: React.FC = () => {
  const { currentSection, setCurrentSection, currentUser, filteredEvaluations, actionPlans } = useApp();
  const [autoHidden, setAutoHidden] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = navigationForRole(currentUser.role);
  const groups = Array.from(new Set(navigation.map(item => item.group)));
  const badgeFor = (section: string) => section === 'evaluations' ? filteredEvaluations.length : section === 'action_plans' ? actionPlans.filter(plan => (currentUser.role !== 'ASESOR' || Boolean(currentUser.advisorId) && (plan.advisorIds?.length ? plan.advisorIds : [plan.advisorId]).includes(currentUser.advisorId!)) && (plan.status === 'EN_CURSO' || plan.status === 'PENDIENTE')).length : undefined;

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setAutoHidden(true);
      setEdgeOpen(false);
    }, AUTO_HIDE_DELAY);
  }, []);

  const reveal = useCallback(() => {
    setAutoHidden(false);
    setEdgeOpen(true);
    scheduleHide();
  }, [scheduleHide]);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setAutoHidden(true);
    setEdgeOpen(false);
  }, []);

  useEffect(() => {
    scheduleHide();
    const keepVisible = () => { if (!autoHidden) scheduleHide(); };
    window.addEventListener('pointermove', keepVisible, { passive: true });
    window.addEventListener('pointerdown', keepVisible, { passive: true });
    window.addEventListener('keydown', keepVisible);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      window.removeEventListener('pointermove', keepVisible);
      window.removeEventListener('pointerdown', keepVisible);
      window.removeEventListener('keydown', keepVisible);
    };
  }, [autoHidden, scheduleHide]);

  const go = (section: typeof currentSection) => {
    setCurrentSection(section);
    setEdgeOpen(false);
    scheduleHide();
  };

  return <>
    {autoHidden && <button className="cm-sidebar-edge-trigger" onMouseEnter={reveal} onFocus={reveal} onClick={reveal} aria-label="Mostrar navegación" />}
    {edgeOpen && <button className="cm-sidebar-backdrop lg:hidden" onClick={hide} aria-label="Cerrar navegación" />}
    <aside className={`cm-sidebar ${autoHidden ? 'is-auto-hidden' : ''} ${edgeOpen ? 'is-mobile-open' : ''}`} aria-hidden={autoHidden} inert={autoHidden} onMouseEnter={scheduleHide} onFocusCapture={scheduleHide}>
      <div className="cm-sidebar__brand"><button onClick={() => go(currentUser.role === 'MONITOR' ? 'monitor_progress' : 'home')}><span>C&amp;M</span><i>Calidad y<br />Mejora Continua</i></button><IconButton label="Cerrar navegación" onClick={hide} className="lg:hidden"><X /></IconButton></div>
      <nav className="cm-sidebar__nav" aria-label="Navegación principal">{groups.map(group => <section key={group}><h2>{group}</h2><div>{navigation.filter(item => item.group === group).map(item => { const active = currentSection === item.section; const badge = badgeFor(item.section); return <button key={item.section} onClick={() => go(item.section)} aria-current={active ? 'page' : undefined}><span>{item.icon}</span><b>{item.label}</b>{badge !== undefined && badge > 0 && <em>{badge}</em>}</button>; })}</div></section>)}</nav>
      <div className="cm-sidebar__footer"><button className="cm-sidebar__user" title={`${currentUser.name} · ${currentUser.role}`}><span>{currentUser.name.charAt(0)}</span><i><b>{currentUser.name}</b><small>{currentUser.role}</small></i></button></div>
    </aside>
  </>;
};
