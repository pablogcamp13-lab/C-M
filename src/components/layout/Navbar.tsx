import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, Plus } from 'lucide-react';
import { qualityAlertsApi } from '../../api/sharedRepository';
import { useApp } from '../../context/AppContext';
import type { QualityAlert } from '../../types';
import { Badge, Button, IconButton } from '../ui';
import { sectionLabel } from './navigation';

export const Navbar: React.FC<{ onOpenNewEvaluation: () => void }> = ({ onOpenNewEvaluation }) => {
  const { currentSection, setCurrentSection, currentUser, logout, companies, filters, evaluations, actionPlans, advisors } = useApp();
  const [menu, setMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState('');
  const profileRoot = useRef<HTMLDivElement>(null);
  const notificationsRoot = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError('');
    try {
      const response = await qualityAlertsApi.list();
      setAlerts(response.alerts);
    } catch {
      setNotificationsError('No fue posible actualizar las alertas.');
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileRoot.current?.contains(target)) setMenu(false);
      if (!notificationsRoot.current?.contains(target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const canCreateEvaluation = ['ADMINISTRADOR', 'CONSULTOR', 'MONITOR'].includes(currentUser.role);
  const canValidate = ['ADMINISTRADOR', 'CONSULTOR', 'MONITOR'].includes(currentUser.role);
  const company = companies.find(item => item.id === filters.companyId)?.name || 'Vista global';
  const openAlerts = useMemo(() => alerts.filter(alert => alert.status !== 'CERRADA' && (currentUser.role !== 'ASESOR' || Boolean(currentUser.advisorId) && alert.advisorId === currentUser.advisorId)), [alerts, currentUser.advisorId, currentUser.role]);
  const pendingValidations = canValidate ? evaluations.filter(evaluation => evaluation.validationStatus === 'AUTOMATIC_PENDING' || evaluation.validationStatus === 'PENDIENTE_AUTOMATICO').length : 0;
  const scopedAdvisorIds = useMemo(() => new Set(advisors.filter(advisor => currentUser.role === 'ASESOR' ? advisor.id === currentUser.advisorId : currentUser.role === 'SUPERVISOR' ? advisor.supervisorId === currentUser.id || Boolean(currentUser.teamId && advisor.teamId === currentUser.teamId) : true).map(advisor => advisor.id)), [advisors, currentUser.advisorId, currentUser.id, currentUser.role, currentUser.teamId]);
  const overduePlans = actionPlans.filter(plan => plan.status === 'VENCIDO' && scopedAdvisorIds.has(plan.advisorId)).length;
  const notificationCount = openAlerts.length + pendingValidations + overduePlans;
  const navigate = (section: 'quality_alerts' | 'evaluations' | 'action_plans') => { setCurrentSection(section); setNotificationsOpen(false); };

  return <header className="cm-topbar"><div className="cm-topbar__left"><div><nav aria-label="Migas de pan"><span>C&amp;M</span><b>/</b><strong>{sectionLabel(currentSection)}</strong></nav><small>{company}</small></div></div><div className="cm-topbar__actions"><Badge variant="success" dot>Operativo</Badge><div className="cm-notifications" ref={notificationsRoot}><IconButton label={`Notificaciones${notificationCount ? `, ${notificationCount} pendientes` : ''}`} aria-expanded={notificationsOpen} onClick={() => { const next = !notificationsOpen; setNotificationsOpen(next); if (next) void loadNotifications(); }}><Bell />{notificationCount > 0 && <i className="cm-notification-count">{Math.min(notificationCount, 99)}</i>}</IconButton>{notificationsOpen && <div className="cm-notifications__popover" role="dialog" aria-label="Centro de notificaciones"><header><div><b>Notificaciones</b><small>{notificationCount ? `${notificationCount} pendientes` : 'Todo al día'}</small></div><button onClick={() => void loadNotifications()} disabled={notificationsLoading}>Actualizar</button></header><div className="cm-notifications__list">{notificationsLoading && !alerts.length ? <p>Actualizando notificaciones…</p> : <>{notificationsError && <p className="is-error">{notificationsError}</p>}{openAlerts.length > 0 && <button onClick={() => navigate('quality_alerts')}><span className="is-alert">{openAlerts.length}</span><i><b>Alertas de Calidad activas</b><small>Revisa las alertas pendientes de gestión.</small></i></button>}{pendingValidations > 0 && <button onClick={() => navigate('evaluations')}><span>{pendingValidations}</span><i><b>Evaluaciones por validar</b><small>Registros pendientes de validación.</small></i></button>}{overduePlans > 0 && <button onClick={() => navigate('action_plans')}><span className="is-alert">{overduePlans}</span><i><b>Planes de acción vencidos</b><small>Requieren seguimiento inmediato.</small></i></button>}{!notificationCount && !notificationsError && <p>No tienes notificaciones pendientes.</p>}</>}</div><footer><button onClick={() => navigate('quality_alerts')}>Ver centro de alertas</button></footer></div>}</div>{canCreateEvaluation && <Button size="sm" leadingIcon={<Plus />} onClick={onOpenNewEvaluation}>Nueva evaluación</Button>}<div className="cm-profile-menu" ref={profileRoot}><button onClick={() => setMenu(value => !value)} aria-expanded={menu}><span>{currentUser.name.charAt(0)}</span><i><b>{currentUser.name}</b><small>{currentUser.role}</small></i><ChevronDown /></button>{menu && <div className="cm-profile-menu__popover"><p>Sesión activa</p><b>{currentUser.name}</b><small>{currentUser.role}</small><Button variant="secondary" size="sm" onClick={() => void logout()}>Cerrar sesión</Button></div>}</div></div></header>;
};
