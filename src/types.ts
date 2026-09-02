export type UserRole = 'ADMINISTRADOR' | 'CONSULTOR' | 'SUPERVISOR' | 'FORMADOR' | 'GERENCIA' | 'ASESOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
  avatar?: string;
  teamId?: string; // For supervisors
  advisorId?: string; // Linked advisor for ASESOR role
  username?: string; // e.g. "nombre.apellido"
  password?: string; // e.g. DNI for advisors
  mustChangePassword?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  client: string;
  status: 'ACTIVA' | 'INACTIVA';
  products: string[];
  description?: string;
}

export interface Team {
  id: string;
  campaignId: string;
  supervisorId: string;
  name: string;
}

export type PriorityLevel = 'ALTA' | 'MEDIA' | 'ESPERADO' | 'DOMINADO';

export interface Advisor {
  id: string;
  dni: string;
  employeeCode: string;
  name: string;
  campaignId: string;
  teamId: string;
  supervisorId: string;
  supervisor?: string;
  quartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string;
  schedule?: string;
  shift?: 'MANANA' | 'TARDE' | 'COMPLETO';
  status: 'ACTIVO' | 'INACTIVO' | 'EN_CAPACITACION';
  hireDate: string; // YYYY-MM-DD (F. INGRESO)
  hireDatePending?: boolean;
  campaignStartDate?: string; // YYYY-MM-DD (F. CAMPAÑA)
  campaignStartDatePending?: boolean;
  terminationDate?: string; // YYYY-MM-DD (F. CESE)
  importedTenureLabel?: string; // ANTIGÜEDAD from Excel (for traceability)
  avatar?: string;
  active?: boolean;

  // Level 2 - Operational Baseline (Punto de partida inmutable)
  hasOperationalBaseline?: boolean;
  baselineConnectionTime?: string; // HH:MM e.g. "06:10"
  baselineConnectionMinutes?: number; // numeric e.g. 370
  baselineSph?: number; // decimal e.g. 0.23
  baselineDate?: string; // YYYY-MM-DD
  baselinePeriod?: string; // e.g. "Línea Base Inicial" / "Enero 2026"
}

export interface OperationalMeasurement {
  id: string;
  advisorId: string;
  dni?: string;
  measurementDate: string; // YYYY-MM-DD (Fecha de corte)
  periodStart?: string;
  periodEnd?: string;
  periodName: string; // e.g. "Agosto 2026", "Semana 1", etc.
  campaignId?: string;
  campaignName?: string;
  connectionTime: string; // HH:MM e.g. "06:42" or "Pendiente"
  connectionMinutes: number; // numeric minutes e.g. 402 or 0
  sph: number; // decimal e.g. 0.31
  
  // Operational fields from Excel
  pv?: number | string;
  sa?: number | string;
  dif?: number | string;
  sourcePercentage1?: number | string; // %
  ac?: number | string;
  sourcePercentage2?: number | string; // %2
  managementFactor?: number | string; // GESTION
  quartile?: string; // CUARTIL

  source?: 'MANUAL' | 'CARGA_EXCEL' | 'TELEFONIA_CTI' | string;
  comments?: string;
  createdBy?: string;
  createdAt: string;
}

export interface ImportHistoryLog {
  id: string;
  date: string;
  fileName: string;
  fileSize: number;
  user: string;
  campaign: string;
  period: string;
  cutoffDate: string;
  isBaseline: boolean;
  rowsDetected: number;
  rowsReady: number;
  rowsWarnings: number;
  rowsErrors: number;
  newAdvisorsCount: number;
  updatedAdvisorsCount: number;
  operationalMeasurementsCount: number;
  errorsList?: Array<{ row: number; dni: string; advisor: string; reason: string }>;
  warningsList?: Array<{ row: number; dni: string; advisor: string; reason: string }>;
}

export type DimensionId = 'CONECTAR' | 'CLARIFICAR' | 'CONVERTIR';

export interface CriterionDefinition {
  id: string;
  dimensionId: DimensionId;
  dimension?: DimensionId;
  name: string;
  shortName: string;
  order: number;
  description: string;
  evaluationGuide: string[];
  expectedBehavior: string;
  isBiPayRelated?: boolean;
}

export type ComplianceStatus = 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA';
export type EvaluationScoreLevel = 1 | 2 | 3 | 4 | 0;

export interface CriterionScore {
  criterionId: string;
  compliance?: ComplianceStatus;
  level?: EvaluationScoreLevel;
  percentage?: number;
  finding?: string;
  evidence?: string;
  recommendedAction?: string;
}

export type EvaluationType = 
  | 'DIAGNOSTICO_INICIAL' 
  | 'SEGUIMIENTO' 
  | 'COACHING' 
  | 'REEVALUACION' 
  | 'CERTIFICACION';

// Clasifica el módulo de plataforma; `type` conserva la modalidad histórica.
export type PlatformEvaluationType = 'QUALITY' | 'D3C';

export interface EvaluationItem {
  id: string;
  dimension: DimensionId;
  criterionId: string;
  compliance?: ComplianceStatus; // 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'
  level?: EvaluationScoreLevel; // Backward compatibility
  percentage?: number; // 100 for CUMPLE, 0 for NO_CUMPLE, 0 for NO_APLICA
  finding: string;
  evidence: string;
  recommendedAction: string;
  timestamp?: string; // e.g. "01:24"
  timestampSeconds?: number; // e.g. 84
}

export interface AiAlert {
  id: string;
  severity: 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO';
  title: string;
  pillar?: DimensionId;
  description: string;
  timestamp?: string;
  recommendation?: string;
}

export interface AiEvaluationAnalysis {
  callDescription: string;
  keyMoments?: {
    minute: string;
    description: string;
    sentiment: 'POSITIVO' | 'NEUTRO' | 'CRITICO';
  }[];
  alerts: AiAlert[];
  methodologySummary: {
    connectObservations: string;
    clarifyObservations: string;
    convertObservations: string;
  };
  suggestedConclusions: string;
  detectedSaleLikelihood?: 'ALTA' | 'MEDIA' | 'BAJA' | 'NULA';
  analyzedAt: string;
}

export interface Evaluation {
  id: string;
  advisorId: string;
  evaluatorId: string;
  campaignId: string;
  teamId: string;
  supervisorId: string;
  product: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  callId: string;
  recordingCode: string;
  type: EvaluationType;
  evaluationType?: PlatformEvaluationType;
  qualityCriticalErrorIds?: string[];
  qualityStatus?: 'DRAFT' | 'FINALIZED';
  sale: boolean;
  saleResult: 'VENTA_CONCRETADA' | 'NO_VENTA' | 'VENTA_OBSERVADA' | 'VOLVER_A_LLAMAR';
  noSaleReason?: string;
  comments: string;
  
  // Audio Evidence
  audioUrl?: string;
  audioFileName?: string;
  audioFileSize?: number; // in bytes
  audioDurationSeconds?: number;
  audioMimeType?: string;
  
  // AI 3C Analysis
  aiAnalysis?: AiEvaluationAnalysis;
  aiAlerts?: AiAlert[];
  aiCallDescription?: string;

  // Calculated 3C scores (null if all criteria in dimension are 'NO_APLICA')
  scoreConnect: number | null;
  scoreClarify: number | null;
  scoreConvert: number | null;
  scoreTotal: number | null;
  
  primaryGap: string;
  secondaryGap: string;
  strongestPillar: string;
  recommendation: string;
  
  items: EvaluationItem[];
  createdAt: string;
}

export type ActionPlanStatus = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'VENCIDO';

export interface ActionPlan {
  id: string;
  advisorId: string;
  evaluationId?: string;
  criterionId: string;
  dimension?: DimensionId;
  objective?: string;
  action: string;
  responsibleId?: string;
  ownerId?: string; // alias for responsible user
  createdDate?: string;
  targetDate?: string;
  dueDate?: string;
  followUpDate?: string;
  completedDate?: string;
  status: ActionPlanStatus;
  notes?: string;
  comments?: string;
  evidence?: string;
  result?: string;
}

export type InterventionType = 
  | 'MICROENTRENAMIENTO' 
  | 'TALLER' 
  | 'ROLE_PLAY' 
  | 'ESCUCHA_GUIADA' 
  | 'FEEDBACK_1A1' 
  | 'CLINICA_CIERRE';

export interface Intervention {
  id: string;
  name: string;
  title?: string;
  dimension: DimensionId;
  criterionId?: string;
  type?: InterventionType;
  category?: string;
  duration?: string;
  durationMins?: number;
  description: string;
  materials?: string;
  expectedOutcome?: string;
  criteriaTarget?: string[];
  recommendedTrigger?: string;
  active?: boolean;
}

export type InterventionTargetType = 'INDIVIDUAL' | 'GRUPAL';

export interface AdvisorIntervention {
  id: string;
  targetType?: InterventionTargetType; // 'INDIVIDUAL' | 'GRUPAL'
  advisorId: string;
  advisorIds?: string[]; // If grupal, all participating advisor IDs
  interventionId: string;
  title?: string;
  dimension?: DimensionId;
  type?: InterventionType;
  duration?: string;
  description?: string;
  materials?: string;
  expectedOutcome?: string;
  
  // Individual specifics
  evaluationId?: string; // Linked evaluation ID
  evaluationDate?: string;
  evaluationScore?: number;
  evaluationGap?: string;
  evaluationCallId?: string;
  
  // Grupal specifics
  paretoTargetCriterionId?: string; // Pareto criterion being tackled
  paretoTargetName?: string;
  paretoReason?: string;
  
  assignedBy: string;
  assignedByName?: string;
  assignedDate: string;
  scheduledDate?: string;
  completionDate?: string;
  completedDate?: string;
  status: 'PROGRAMADA' | 'EN_PROGRESO' | 'COMPLETADA' | 'CANCELADA' | 'ASIGNADO' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO';
  resultNotes?: string;
}

export interface MethodologyConfig {
  weights: {
    CONECTAR: number;
    CLARIFICAR: number;
    CONVERTIR: number;
    connect?: number;
    clarify?: number;
    convert?: number;
  };
  scaleValues: {
    1: number;
    2: number;
    3: number;
    4: number;
  };
  priorityThresholds: {
    highGapMax: number; // e.g. < 60
    mediumGapMax: number; // e.g. < 80
    expectedMax: number; // e.g. < 90
  };
  focusProductKey: string; // "BiPay"
  tenureThresholdDays: number; // default 90 days for Nuevos vs Antiguos
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  campaignId: string;
  productId: string;
  supervisorId: string;
  advisorId: string;
  evaluatorId: string;
  evaluationType: string;
  priorityLevel: string;
  searchQuery: string;
  tenure?: 'ALL' | 'NUEVO' | 'ANTIGUO';
}

export type NavigationSection = 
  | 'home'
  | 'dashboard' 
  | 'dashboard_quality'
  | 'new_evaluation' 
  | 'evaluations' 
  | 'feedback'
  | 'advisors' 
  | 'pareto' 
  | 'methodology' 
  | 'action_plans' 
  | 'interventions' 
  | 'impact' 
  | 'reports' 
  | 'admin'
  | 'development';
