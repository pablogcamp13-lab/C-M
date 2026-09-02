import { User, Campaign, Team, Advisor, Evaluation, ActionPlan, AdvisorIntervention, MethodologyConfig, OperationalMeasurement } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr_admin',
    name: 'Administrador Principal',
    email: 'admin@consultoria3c.com',
    role: 'ADMINISTRADOR',
    status: 'ACTIVO',
    createdAt: new Date().toISOString()
  },
  { id: 'usr_sup_demo', name: 'Ana Ramírez', email: 'ana.ramirez@demo.local', role: 'SUPERVISOR', status: 'ACTIVO', createdAt: new Date().toISOString() },
  { id: 'usr_eval_demo', name: 'José López', email: 'jose.lopez@demo.local', role: 'CONSULTOR', status: 'ACTIVO', createdAt: new Date().toISOString() }
];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp_1',
    name: 'Campaña Comercial 3C',
    client: 'Operación Principal',
    status: 'ACTIVA',
    products: ['Servicio Móvil', 'Portabilidad / Migraciones', 'BiPay Digital'],
    description: 'Campaña activa para evaluación de calidad y efectividad 3C.'
  }
];

export const INITIAL_TEAMS: Team[] = [{ id: 'team_demo', campaignId: 'camp_1', supervisorId: 'usr_sup_demo', name: 'Equipo Migraciones Demo' }];

export const INITIAL_ADVISORS: Advisor[] = [
  { id: 'adv_demo_1', dni: '70000001', employeeCode: 'A-10234', name: 'María Fernanda López', campaignId: 'camp_1', teamId: 'team_demo', supervisorId: 'usr_sup_demo', status: 'ACTIVO', hireDate: '2025-01-15', quartile: 'Q2', active: true },
  { id: 'adv_demo_2', dni: '70000002', employeeCode: 'A-10987', name: 'Juan Manuel Torres', campaignId: 'camp_1', teamId: 'team_demo', supervisorId: 'usr_sup_demo', status: 'ACTIVO', hireDate: '2024-08-10', quartile: 'Q3', active: true }
];

export const INITIAL_EVALUATIONS: Evaluation[] = [
  { id: 'eval_demo_d3c', advisorId: 'adv_demo_1', evaluatorId: 'usr_eval_demo', campaignId: 'camp_1', teamId: 'team_demo', supervisorId: 'usr_sup_demo', product: 'Portabilidad / Migraciones', date: '2026-08-31', time: '10:30', callId: 'LLAM-71920', recordingCode: 'REC-DEMO-001', type: 'DIAGNOSTICO_INICIAL', evaluationType: 'D3C', sale: false, saleResult: 'NO_VENTA', comments: 'La asesora explica correctamente los beneficios, pero debe profundizar el proceso de migración.', scoreConnect: 85, scoreClarify: 78, scoreConvert: 84, scoreTotal: 82, primaryGap: 'Proceso de migración', secondaryGap: 'Manejo de objeciones', strongestPillar: 'Conectar', recommendation: 'Reforzar el proceso de migración y validar comprensión.', items: [], createdAt: '2026-08-31T10:30:00.000Z' },
  { id: 'eval_demo_quality', advisorId: 'adv_demo_2', evaluatorId: 'usr_eval_demo', campaignId: 'camp_1', teamId: 'team_demo', supervisorId: 'usr_sup_demo', product: 'Portabilidad / Migraciones', date: '2026-08-30', time: '15:15', callId: 'PUE-DEMO-002', recordingCode: 'REC-DEMO-002', type: 'DIAGNOSTICO_INICIAL', evaluationType: 'QUALITY', qualityStatus: 'FINALIZED', sale: false, saleResult: 'NO_VENTA', comments: 'Debe reforzar la validación de condiciones antes de finalizar la gestión.', scoreConnect: null, scoreClarify: null, scoreConvert: null, scoreTotal: 76, primaryGap: 'Ofrecimiento y condiciones', secondaryGap: '', strongestPillar: '', recommendation: 'Reforzar lectura de condiciones y validación del cliente.', items: [], createdAt: '2026-08-30T15:15:00.000Z' }
];

export const INITIAL_ACTION_PLANS: ActionPlan[] = [];

export const INITIAL_ADVISOR_INTERVENTIONS: AdvisorIntervention[] = [];

export const INITIAL_OPERATIONAL_MEASUREMENTS: OperationalMeasurement[] = [];

export const DEFAULT_METHODOLOGY_CONFIG: MethodologyConfig = {
  weights: {
    CONECTAR: 30,
    CLARIFICAR: 35,
    CONVERTIR: 35,
    connect: 30,
    clarify: 35,
    convert: 35
  },
  scaleValues: {
    1: 25,
    2: 50,
    3: 75,
    4: 100
  },
  priorityThresholds: {
    highGapMax: 60,
    mediumGapMax: 80,
    expectedMax: 90
  },
  focusProductKey: 'BiPay',
  tenureThresholdDays: 90
};
