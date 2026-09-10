import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, Menu, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Badge, Button, IconButton } from '../ui';
import { sectionLabel } from './navigation';

export const Navbar: React.FC<{ onOpenNewEvaluation: () => void; onOpenNavigation: () => void }> = ({ onOpenNewEvaluation, onOpenNavigation }) => {
  const { currentSection, currentUser, logout, companies, filters } = useApp();
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const canCreateEvaluation = ['ADMINISTRADOR', 'CONSULTOR', 'MONITOR'].includes(currentUser.role);
  const company = companies.find(item => item.id === filters.companyId)?.name || 'Vista global';

  return <header className="cm-topbar"><div className="cm-topbar__left"><IconButton label="Abrir navegación" onClick={onOpenNavigation} className="lg:hidden"><Menu /></IconButton><div><nav aria-label="Migas de pan"><span>C&amp;M</span><b>/</b><strong>{sectionLabel(currentSection)}</strong></nav><small>{company}</small></div></div><div className="cm-topbar__actions"><Badge variant="success" dot>Operativo</Badge><IconButton label="Notificaciones"><Bell /><i className="cm-notification-dot" /></IconButton>{canCreateEvaluation && <Button size="sm" leadingIcon={<Plus />} onClick={onOpenNewEvaluation}>Nueva evaluación</Button>}<div className="cm-profile-menu" ref={root}><button onClick={() => setMenu(value => !value)} aria-expanded={menu}><span>{currentUser.name.charAt(0)}</span><i><b>{currentUser.name}</b><small>{currentUser.role}</small></i><ChevronDown /></button>{menu && <div className="cm-profile-menu__popover"><p>Sesión activa</p><b>{currentUser.name}</b><small>{currentUser.role}</small><Button variant="secondary" size="sm" onClick={() => void logout()}>Cerrar sesión</Button></div>}</div></div></header>;
};
