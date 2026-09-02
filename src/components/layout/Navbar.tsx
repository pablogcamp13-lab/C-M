import React, { useState } from 'react';
import { Bell, ChevronDown, Menu, Plus, Search, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { NavigationSection } from '../../types';

const navigation: Array<{ label: string; section: NavigationSection }> = [
  { label: 'Inicio', section: 'home' }, { label: 'Mejora Continua', section: 'dashboard' },
  { label: 'Calidad', section: 'dashboard_quality' }, { label: 'Evaluaciones', section: 'evaluations' },
  { label: 'Feedback', section: 'feedback' }, { label: 'Planes de Acción', section: 'action_plans' },
  { label: 'Desarrollo', section: 'development' },
  { label: 'Analítica', section: 'pareto' }, { label: 'Configuración', section: 'admin' }
];

export const Navbar: React.FC<{ onOpenNewEvaluation: () => void }> = ({ onOpenNewEvaluation }) => {
  const { currentSection, setCurrentSection, currentUser, filters, setFilters, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const visibleNavigation = currentUser.role === 'ASESOR'
    ? navigation.filter(item => ['home', 'evaluations', 'feedback', 'action_plans', 'development'].includes(item.section))
    : navigation.filter(item => item.section !== 'development' || currentUser.role === 'ADMINISTRADOR');

  return <header className="cm-navbar">
    <div className="cm-navbar__inner">
      <button onClick={() => setCurrentSection('home')} className="cm-navbar__brand">
        <span className="cm-navbar__brand-mark">C&amp;M</span><span className="cm-navbar__divider hidden sm:block" />
        <span className="cm-navbar__subtitle hidden sm:block">Calidad y<br />Mejora Continua</span>
      </button>
      <nav className="cm-navbar__nav hidden lg:flex" aria-label="Navegación principal">
        {visibleNavigation.map(item => <button key={item.section} onClick={() => setCurrentSection(item.section)} className="cm-navbar__link" aria-current={currentSection === item.section ? 'page' : undefined}>{item.label}</button>)}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <label className="cm-navbar__search hidden xl:flex"><Search className="h-4 w-4" /><input value={filters.searchQuery} onChange={event => setFilters(value => ({ ...value, searchQuery: event.target.value }))} placeholder="Buscar..." className="cm-input" aria-label="Buscar" /></label>
        <button className="cm-navbar__icon-button" aria-label="Notificaciones"><Bell className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#1fa8ff]" /></button>
        <button onClick={() => setMenu(!menu)} className="cm-navbar__profile hidden sm:flex" aria-expanded={menu}><span className="cm-navbar__avatar">{currentUser.name.charAt(0)}</span><span className="max-w-28 text-left text-[11px] leading-tight"><b className="block truncate">{currentUser.name}</b><span className="text-[#c2dddd]">{currentUser.role}</span></span><ChevronDown className="h-3 w-3" /></button>
        {currentUser.role !== 'ASESOR' && <button onClick={onOpenNewEvaluation} className="cm-button-primary hidden px-3 py-2 text-xs md:inline-flex"><Plus className="h-4 w-4" />Nueva evaluación</button>}
        <button onClick={() => setOpen(!open)} className="cm-navbar__icon-button lg:hidden" aria-label="Abrir navegación" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
      </div>
    </div>
    {menu && <div className="cm-modal cm-navbar__menu text-sm"><p className="px-2 py-2 text-xs text-[var(--cm-text-muted)]">Sesión activa</p><button onClick={() => void logout()} className="cm-button-secondary w-full px-2 py-2 text-left">Cerrar sesión</button></div>}
    {open && <nav className="cm-navbar__mobile lg:hidden" aria-label="Navegación móvil">{visibleNavigation.map(item => <button key={item.section} onClick={() => { setCurrentSection(item.section); setOpen(false); }} className="cm-navbar__mobile-link" aria-current={currentSection === item.section ? 'page' : undefined}>{item.label}</button>)}{currentUser.role !== 'ASESOR' && <button onClick={onOpenNewEvaluation} className="cm-button-primary mt-2 w-full px-3 py-2 text-left text-sm">+ Nueva evaluación</button>}</nav>}
  </header>;
};
