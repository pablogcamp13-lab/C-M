import React from 'react';
import { BarChart3, BellRing, BookOpen, CheckSquare2, ClipboardCheck, Gauge, GraduationCap, Home, LayoutDashboard, LineChart, MessageSquareText, Settings, ShieldCheck, UsersRound } from 'lucide-react';
import type { NavigationSection, UserRole } from '../../types';

export interface NavigationItem { label: string; section: NavigationSection; icon: React.ReactNode; group: 'GENERAL' | 'ANÁLISIS' | 'GESTIÓN' | 'SISTEMA'; roles?: UserRole[]; }

const all: NavigationItem[] = [
  { label: 'Inicio', section: 'home', icon: <Home />, group: 'GENERAL' },
  { label: 'Dashboard MC', section: 'dashboard', icon: <LayoutDashboard />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Dashboard Calidad', section: 'dashboard_quality', icon: <ShieldCheck />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Evaluaciones', section: 'evaluations', icon: <ClipboardCheck />, group: 'ANÁLISIS' },
  { label: 'Feedback', section: 'feedback', icon: <MessageSquareText />, group: 'ANÁLISIS' },
  { label: 'Alertas', section: 'quality_alerts', icon: <BellRing />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'SUPERVISOR', 'ASESOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Calibraciones', section: 'calibrations', icon: <CheckSquare2 />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'SUPERVISOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Dotación', section: 'advisors', icon: <UsersRound />, group: 'GESTIÓN', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Planes de acción', section: 'action_plans', icon: <Gauge />, group: 'GESTIÓN', roles: ['ADMINISTRADOR', 'CONSULTOR', 'SUPERVISOR', 'ASESOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Desarrollo', section: 'development', icon: <GraduationCap />, group: 'GESTIÓN', roles: ['ADMINISTRADOR', 'MONITOR', 'ASESOR'] },
  { label: 'Intervenciones', section: 'interventions', icon: <BookOpen />, group: 'GESTIÓN', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Pareto 80/20', section: 'pareto', icon: <BarChart3 />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Impacto', section: 'impact', icon: <LineChart />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Reportes', section: 'reports', icon: <BarChart3 />, group: 'ANÁLISIS', roles: ['ADMINISTRADOR', 'CONSULTOR', 'SUPERVISOR'] },
  { label: 'Metodología', section: 'methodology', icon: <BookOpen />, group: 'SISTEMA', roles: ['ADMINISTRADOR', 'CONSULTOR', 'FORMADOR', 'GERENCIA'] },
  { label: 'Configuración', section: 'admin', icon: <Settings />, group: 'SISTEMA', roles: ['ADMINISTRADOR'] },
];

const monitor: NavigationItem[] = [
  { label: 'Evaluar', section: 'evaluations', icon: <ClipboardCheck />, group: 'GENERAL' },
  { label: 'Feedbacks', section: 'feedback', icon: <MessageSquareText />, group: 'GENERAL' },
  { label: 'Resultados', section: 'monitor_results', icon: <BarChart3 />, group: 'ANÁLISIS' },
  { label: 'Cápsulas', section: 'development', icon: <GraduationCap />, group: 'GESTIÓN' },
  { label: 'Mis avances', section: 'monitor_progress', icon: <LineChart />, group: 'GESTIÓN' },
  { label: 'Usuarios', section: 'users', icon: <UsersRound />, group: 'SISTEMA' },
];

export const navigationForRole = (role: UserRole) => role === 'MONITOR' ? monitor : all.filter(item => !item.roles || item.roles.includes(role));
export const sectionLabel = (section: NavigationSection) => [...all, ...monitor].find(item => item.section === section)?.label || 'C&M';
