import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  User, 
  Campaign, 
  Team, 
  Advisor, 
  Evaluation, 
  EvaluationItem,
  ActionPlan, 
  Intervention, 
  AdvisorIntervention, 
  MethodologyConfig, 
  FilterState, 
  UserRole,
  NavigationSection,
  OperationalMeasurement,
  ImportHistoryLog 
} from '../types';
import { 
  INITIAL_USERS, 
  INITIAL_CAMPAIGNS, 
  INITIAL_TEAMS, 
  INITIAL_ADVISORS, 
  INITIAL_EVALUATIONS, 
  INITIAL_ACTION_PLANS, 
  INITIAL_ADVISOR_INTERVENTIONS, 
  DEFAULT_METHODOLOGY_CONFIG,
  INITIAL_OPERATIONAL_MEASUREMENTS 
} from '../data/initialData';
import { INITIAL_INTERVENTIONS } from '../data/interventionsData';
import { calculateEvaluationSummary, parseTimeToMinutes, formatMinutesToHHMM } from '../utils/calculations';
import { adminCampaignsApi, adminUsersApi, authApi, evaluationsApi, platformStateApi, sharedRepositoryApi } from '../api/sharedRepository';
import { QUALITY_WEIGHTS } from '../data/qualityPueData';

export const formatAdvisorUsername = (name: string): string => {
  const parts = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'asesor.user';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
};

interface AppContextType {
  currentUser: User;
  authenticatedUserId: string | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
  platformLoadError: string;
  login: (identity: string, password: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User) => void;
  setUserRole: (role: UserRole) => void;

  users: User[];
  companies: import('../types').Company[];
  operations: import('../types').Operation[];
  campaigns: Campaign[];
  teams: Team[];
  advisors: Advisor[];
  evaluations: Evaluation[];
  actionPlans: ActionPlan[];
  interventions: Intervention[];
  advisorInterventions: AdvisorIntervention[];
  operationalMeasurements: OperationalMeasurement[];
  config: MethodologyConfig;
  filters: FilterState;
  currentSection: NavigationSection;
  setCurrentSection: (section: NavigationSection) => void;

  // Filter actions
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  filteredEvaluations: Evaluation[];
  filteredAdvisors: Advisor[];
  filteredOperationalMeasurements: OperationalMeasurement[];

  // User management
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => Promise<User>;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  createUsersForAdvisorsWithoutAccount: () => Promise<number>;

  // Campaign & Team management
  addCampaign: (campaign: Omit<Campaign, 'id'>) => Campaign;
  updateCampaign: (id: string, data: Partial<Campaign>) => void;
  deleteCampaign: (id: string, companyId?: string) => Promise<void>;
  addOperation: (operation: Omit<import('../types').Operation, 'id'>) => import('../types').Operation;
  updateOperation: (id: string, data: Partial<import('../types').Operation>) => void;
  addTeam: (team: Omit<Team, 'id'>) => Team;

  // Mutators
  addEvaluation: (evalData: Omit<Evaluation, 'id' | 'createdAt' | 'scoreConnect' | 'scoreClarify' | 'scoreConvert' | 'scoreTotal' | 'primaryGap' | 'secondaryGap' | 'strongestPillar' | 'recommendation'>) => Promise<Evaluation>;
  updateEvaluation: (id: string, evalData: Partial<Evaluation>) => void;
  deleteEvaluation: (id: string) => void;

  addAdvisor: (advisor: Omit<Advisor, 'id'>) => Advisor;
  updateAdvisor: (id: string, data: Partial<Advisor>) => void;
  deleteAdvisor: (id: string) => void;

  addOperationalMeasurement: (data: Omit<OperationalMeasurement, 'id' | 'createdAt'>) => OperationalMeasurement;
  updateOperationalMeasurement: (id: string, data: Partial<OperationalMeasurement>) => void;
  deleteOperationalMeasurement: (id: string) => void;

  addActionPlan: (plan: Omit<ActionPlan, 'id' | 'createdDate'>) => ActionPlan;
  updateActionPlan: (id: string, data: Partial<ActionPlan>) => void;
  deleteActionPlan: (id: string) => void;

  addIntervention: (intervention: Omit<Intervention, 'id'>) => Intervention;
  updateIntervention: (id: string, data: Partial<Intervention>) => void;
  deleteIntervention: (id: string) => void;
  assignIntervention: (assignment: Omit<AdvisorIntervention, 'id' | 'assignedDate'>) => AdvisorIntervention;
  assignBatchInterventions: (assignments: Omit<AdvisorIntervention, 'id' | 'assignedDate'>[]) => AdvisorIntervention[];
  updateAdvisorIntervention: (id: string, data: Partial<AdvisorIntervention>) => void;
  deleteAdvisorIntervention: (id: string) => void;

  // Import History & Batch Import
  importHistory: ImportHistoryLog[];
  importAdvisorsBatch: (payload: {
    campaignId: string;
    campaignName: string;
    operationId?: string;
    periodName: string;
    cutoffDate: string;
    isBaseline: boolean;
    baselineHandling: 'KEEP' | 'REPLACE';
    fileName: string;
    fileSize: number;
    usesSheetCampaigns?: boolean;
    campaignMappings?: Record<string, string>;
    rows: any[];
  }) => {
    newCount: number;
    updateCount: number;
    measurementsCount: number;
    errorCount: number;
    warningCount: number;
    duplicateCount: number;
    invalidCount: number;
  };
  deleteImportHistoryLog: (id: string) => void;

  updateConfig: (newConfig: Partial<MethodologyConfig>) => void;
  clearAllData: () => void;
  resetToDemoData: () => void;
  resetDemoData: () => void;
}

const STORAGE_PREFIX = 'METODOLOGIA_3C_PROD_V1_';

const initialFilters: FilterState = {
  dateFrom: '',
  dateTo: '',
  campaignId: '',
  companyId: '',
  operationId: '',
  productId: '',
  supervisorId: '',
  advisorId: '',
  evaluatorId: '',
  evaluationType: '',
  priorityLevel: '',
  searchQuery: ''
};

const evaluationIdentity = (evaluation: Partial<Evaluation>) => [evaluation.advisorId, evaluation.evaluationType, evaluation.date, evaluation.time, evaluation.callId || evaluation.recordingCode || evaluation.id].join('|');
const uniqueEvaluations = (items: Evaluation[]) => {
  const seen = new Set<string>();
  return items.filter(item => { const key = evaluationIdentity(item); if (seen.has(key)) return false; seen.add(key); return true; });
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial states from LocalStorage or defaults
  const [users, setUsers] = useState<User[]>(() => {
    return [];
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    return users[0] || INITIAL_USERS[0];
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    return [];
  });
  const [companies, setCompanies] = useState<import('../types').Company[]>([]);
  const [operations, setOperations] = useState<import('../types').Operation[]>([]);

  const [teams, setTeams] = useState<Team[]>(() => {
    return [];
  });

  const [advisors, setAdvisors] = useState<Advisor[]>(() => {
    return [];
  });

  const [evaluations, setEvaluations] = useState<Evaluation[]>(() => {
    return [];
  });

  const [actionPlans, setActionPlans] = useState<ActionPlan[]>(() => {
    return [];
  });

  const [interventions, setInterventions] = useState<Intervention[]>(() => {
    return [];
  });

  const [advisorInterventions, setAdvisorInterventions] = useState<AdvisorIntervention[]>(() => {
    return [];
  });

  const [operationalMeasurements, setOperationalMeasurements] = useState<OperationalMeasurement[]>(() => {
    return [];
  });

  const [importHistory, setImportHistory] = useState<ImportHistoryLog[]>(() => {
    return [];
  });

  const [config, setConfig] = useState<MethodologyConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}config`);
    return saved ? JSON.parse(saved) : DEFAULT_METHODOLOGY_CONFIG;
  });

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [currentSection, setCurrentSection] = useState<NavigationSection>('home');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const rosterHydrated = useRef(false);
  const platformStateHydrated = useRef(false);
  const skipHydrationSave = useRef(false);
  const [platformLoadError, setPlatformLoadError] = useState('');
  const recentEvaluation = useRef<{ key: string; evaluation: Evaluation; createdAt: number } | null>(null);

  // La sesión se mantiene sólo por pestaña; el token nunca se guarda en localStorage.
  useEffect(() => {
    const restoreSession = async () => {
      if (!authApi.token()) { setIsAuthReady(true); return; }
      try { const user=await authApi.currentUser(); setCurrentUser(user); setAuthenticatedUserId(user.id); setIsAuthenticated(true); }
      catch { await authApi.logout(); }
      finally { setIsAuthReady(true); }
    };
    restoreSession();
  }, []);

  // La fuente de verdad de la dotación es el backend/Sheets. Nunca se envían los
  // datos iniciales del navegador al abrir una sesión nueva.
  useEffect(() => {
    if (!isAuthenticated || rosterHydrated.current) return;
    const hydrate = async () => {
      try {
        const persisted = await sharedRepositoryApi.load();
        rosterHydrated.current = true;
        setUsers(persisted.users); setCampaigns(persisted.campaigns); setCompanies(persisted.companies || []); setOperations(persisted.operations || []); setTeams(persisted.teams); setAdvisors(persisted.advisors);
        const persistedState = await platformStateApi.load();
        const state = persistedState;
        if (state) {
          setEvaluations(Array.isArray(state.evaluations) ? uniqueEvaluations(state.evaluations) : []); setActionPlans(state.actionPlans || []); setInterventions(state.interventions || []);
          setAdvisorInterventions(state.advisorInterventions || []); setOperationalMeasurements(state.operationalMeasurements || []); setImportHistory(state.importHistory || []); setConfig(state.config || DEFAULT_METHODOLOGY_CONFIG);
        }
        skipHydrationSave.current = true;
        setPlatformLoadError('');
        platformStateHydrated.current = true;
      } catch (error) {
        setPlatformLoadError(error instanceof Error ? error.message : 'No se pudo cargar el historial.');
        console.error('No fue posible cargar la dotación persistente', error);
      }
    };
    hydrate();
  }, [isAuthenticated, currentUser.role]);

  // Persistencia incremental del repositorio único de dotación. Los demás módulos
  // siguen en su almacenamiento actual hasta sus fases de migración respectivas.
  useEffect(() => {
    if (!isAuthenticated || ['ASESOR', 'SUPERVISOR', 'MONITOR'].includes(currentUser.role) || !rosterHydrated.current) return;
    void sharedRepositoryApi.sync({ users, campaigns, companies, operations, teams, advisors }).catch(error => console.error('No fue posible sincronizar la dotación', error));
  }, [users, campaigns, companies, operations, teams, advisors, isAuthenticated, currentUser.role]);

  useEffect(() => {
    if (!isAuthenticated || ['ASESOR', 'SUPERVISOR', 'MONITOR'].includes(currentUser.role) || !platformStateHydrated.current) return;
    if (skipHydrationSave.current) { skipHydrationSave.current = false; return; }
    void platformStateApi.save({ evaluations, actionPlans, interventions, advisorInterventions, operationalMeasurements, importHistory, config }).catch(error => console.error('No fue posible sincronizar el estado de plataforma', error));
  }, [evaluations, actionPlans, interventions, advisorInterventions, operationalMeasurements, importHistory, config, isAuthenticated, currentUser.role]);

  const login = async (identity: string, password: string) => {
    const user = await authApi.login(identity, password);
    rosterHydrated.current = false;
    platformStateHydrated.current = false;
    setCurrentUser(user); setAuthenticatedUserId(user.id); setIsAuthenticated(true);
  };
  const changePassword = async (password: string) => {
    const updated = await authApi.changePassword(password);
    setCurrentUser(updated);
    setUsers(prev => prev.map(user => user.id === updated.id ? { ...user, ...updated, mustChangePassword: false } : user));
  };

  const logout = async () => {
    await authApi.logout();
    rosterHydrated.current = false;
    platformStateHydrated.current = false;
    setIsAuthenticated(false);
    setAuthenticatedUserId(null);
  };

  // Sync to LocalStorage on changes
  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}users`, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}campaigns`, JSON.stringify(campaigns));
  }, [campaigns]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}teams`, JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}advisors`, JSON.stringify(advisors));
  }, [advisors]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}evaluations`, JSON.stringify(evaluations));
  }, [evaluations]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}action_plans`, JSON.stringify(actionPlans));
  }, [actionPlans]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}interventions`, JSON.stringify(interventions));
  }, [interventions]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}advisor_interventions`, JSON.stringify(advisorInterventions));
  }, [advisorInterventions]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}operational_measurements`, JSON.stringify(operationalMeasurements));
  }, [operationalMeasurements]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}import_history`, JSON.stringify(importHistory));
  }, [importHistory]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}config`, JSON.stringify(config));
  }, [config]);

  const setUserRole = (role: UserRole) => {
    const matching = users.find(u => u.role === role) || {
      ...currentUser,
      role
    };
    setCurrentUser(matching);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  // Filtered dataset computed dynamically
  const filteredEvaluations = evaluations.filter(ev => {
    const operation=operations.find(item=>item.id===(ev.operationId || advisors.find(a=>a.id===ev.advisorId)?.operationId));
    const validatedForOperationalUse = !ev.validationStatus || ['VALIDATED', 'VALIDADO', 'AJUSTADO_VALIDADO'].includes(ev.validationStatus);
    if (['ASESOR', 'SUPERVISOR'].includes(currentUser.role) && !validatedForOperationalUse) return false;
    if (filters.dateFrom && ev.date < filters.dateFrom) return false;
    if (filters.dateTo && ev.date > filters.dateTo) return false;
    if (filters.campaignId && ev.campaignId !== filters.campaignId) return false;
    if (filters.operationId && operation?.id !== filters.operationId) return false;
    if (filters.companyId && operation?.companyId !== filters.companyId) return false;
    if (filters.productId && ev.product !== filters.productId) return false;
    if (filters.supervisorId && ev.supervisorId !== filters.supervisorId) return false;
    if (filters.advisorId && ev.advisorId !== filters.advisorId) return false;
    if (filters.evaluatorId && ev.evaluatorId !== filters.evaluatorId) return false;
    if (filters.evaluationType && ev.evaluationType !== filters.evaluationType && ev.type !== filters.evaluationType) return false;
    if (filters.priorityLevel) {
      const score = ev.scoreTotal ?? 0;
      const matchesPriority = (filters.priorityLevel === 'ALTA' && score < 60)
        || (filters.priorityLevel === 'MEDIA' && score >= 60 && score < 80)
        || (filters.priorityLevel === 'ESPERADO' && score >= 80 && score < 90)
        || (filters.priorityLevel === 'DOMINADO' && score >= 90);
      if (!matchesPriority) return false;
    }
    
    // Role-based restrictions: Advisor only sees their own
    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      if (ev.advisorId !== currentUser.advisorId) return false;
    }

    // Role-based restrictions (Supervisor only sees their own team)
    if (currentUser.role === 'SUPERVISOR') {
      if (ev.supervisorId !== currentUser.id && (!currentUser.teamId || ev.teamId !== currentUser.teamId)) return false;
    }

    if (currentUser.role === 'MONITOR' && ev.evaluatorId !== currentUser.id) return false;

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const adv = advisors.find(a => a.id === ev.advisorId);
      const match = 
        (adv && (adv.name.toLowerCase().includes(q) || adv.dni.includes(q) || adv.employeeCode.toLowerCase().includes(q))) ||
        ev.callId.toLowerCase().includes(q) ||
        ev.recordingCode.toLowerCase().includes(q) ||
        ev.comments.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const filteredAdvisors = advisors.filter(adv => {
    const operation=operations.find(item=>item.id===adv.operationId);
    if (filters.campaignId && adv.campaignId !== filters.campaignId) return false;
    if (filters.operationId && adv.operationId !== filters.operationId) return false;
    if (filters.companyId && operation?.companyId !== filters.companyId) return false;
    if (filters.supervisorId && adv.supervisorId !== filters.supervisorId) return false;
    if (filters.advisorId && adv.id !== filters.advisorId) return false;
    
    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      if (adv.id !== currentUser.advisorId) return false;
    }

    if (currentUser.role === 'SUPERVISOR') {
      if (adv.supervisorId !== currentUser.id && (!currentUser.teamId || adv.teamId !== currentUser.teamId)) return false;
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const match = 
        adv.name.toLowerCase().includes(q) || 
        adv.dni.includes(q) || 
        adv.employeeCode.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const filteredOperationalMeasurements = operationalMeasurements.filter(meas => {
    if (filters.dateFrom && meas.measurementDate < filters.dateFrom) return false;
    if (filters.dateTo && meas.measurementDate > filters.dateTo) return false;
    if (filters.advisorId && meas.advisorId !== filters.advisorId) return false;

    const advisor = advisors.find(a => a.id === meas.advisorId);
    if (!advisor) return false;

    if (filters.campaignId && advisor.campaignId !== filters.campaignId) return false;
    const operation=operations.find(item=>item.id===advisor.operationId);
    if (filters.operationId && advisor.operationId !== filters.operationId) return false;
    if (filters.companyId && operation?.companyId !== filters.companyId) return false;
    if (filters.supervisorId && advisor.supervisorId !== filters.supervisorId) return false;

    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      if (advisor.id !== currentUser.advisorId) return false;
    }

    if (currentUser.role === 'SUPERVISOR') {
      if (advisor.supervisorId !== currentUser.id && (!currentUser.teamId || advisor.teamId !== currentUser.teamId)) return false;
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const match = 
        advisor.name.toLowerCase().includes(q) || 
        advisor.dni.includes(q) || 
        advisor.employeeCode.toLowerCase().includes(q) ||
        meas.periodName.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // User Management
  const addUser = async (userData: Omit<User, 'id' | 'createdAt'>): Promise<User> => {
    const { user: newUser } = await adminUsersApi.create(userData);
    setUsers(prev => [newUser, ...prev]);
    return newUser;
  };

  const updateUser = (id: string, data: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
    if (currentUser.id === id) {
      setCurrentUser(prev => ({ ...prev, ...data }));
    }
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) return; // Don't delete last user
    setUsers(prev => prev.filter(u => u.id !== id));
    if (currentUser.id === id) {
      const nextUser = users.find(u => u.id !== id) || INITIAL_USERS[0];
      setCurrentUser(nextUser);
    }
  };

  const createUsersForAdvisorsWithoutAccount = async (): Promise<number> => {
    let createdCount = 0;
    const existingAdvisorIds = new Set(users.filter(u => u.role === 'ASESOR' && u.advisorId).map(u => u.advisorId));
    const reservedUsernames = new Set(users.map(user => user.username?.toLowerCase()).filter(Boolean));
    const newUsersToAdd: User[] = [];

    advisors.forEach(adv => {
      if (!existingAdvisorIds.has(adv.id)) {
        const base = formatAdvisorUsername(adv.name); let username = base; let suffix = 1;
        while (reservedUsernames.has(username.toLowerCase())) username = `${base}.${++suffix}`;
        reservedUsernames.add(username.toLowerCase());
        const email = `${username}@asesores3c.com`;
        newUsersToAdd.push({
          id: `usr_adv_${adv.id}`,
          name: adv.name,
          username,
          password: '12345678', mustChangePassword: true,
          email,
          role: 'ASESOR',
          status: 'ACTIVO',
          advisorId: adv.id,
          createdAt: new Date().toISOString()
        });
        createdCount++;
      }
    });

    if (newUsersToAdd.length > 0) {
      const { repository: persisted } = await sharedRepositoryApi.sync({ users: [...users, ...newUsersToAdd], campaigns, teams, advisors });
      setUsers(persisted.users);
    }
    return createdCount;
  };

  // Campaigns & Teams
  const addCampaign = (campaign: Omit<Campaign, 'id'>): Campaign => {
    const newCamp: Campaign = {
      ...campaign,
      id: `camp_${Date.now()}`
    };
    setCampaigns(prev => [...prev, newCamp]);
    return newCamp;
  };

  const updateCampaign = (id: string, data: Partial<Campaign>) => {
    setCampaigns(prev => prev.map(campaign => campaign.id === id ? { ...campaign, ...data, id } : campaign));
  };

  const addOperation = (operation: Omit<import('../types').Operation, 'id'>) => {
    const created = { ...operation, id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    setOperations(previous => [...previous, created]);
    return created;
  };

  const updateOperation = (id: string, data: Partial<import('../types').Operation>) => {
    setOperations(previous => previous.map(operation => operation.id === id ? { ...operation, ...data, id } : operation));
  };

  const deleteCampaign = async (id: string, companyId?: string) => {
    await adminCampaignsApi.remove(id, companyId);
    if (companyId) {
      setOperations(previous => previous.map(operation => operation.campaignId === id && operation.companyId === companyId && !operation.legacy ? { ...operation, status: 'INACTIVA' } : operation));
      const hasAnotherActiveOperation = operations.some(operation => operation.campaignId === id && operation.companyId !== companyId && !operation.legacy && operation.status === 'ACTIVA');
      if (!hasAnotherActiveOperation) setCampaigns(previous => previous.map(campaign => campaign.id === id ? { ...campaign, status: 'INACTIVA' } : campaign));
      return;
    }
    setCampaigns(previous => previous.map(campaign => campaign.id === id ? { ...campaign, status: 'INACTIVA' } : campaign));
    setOperations(previous => previous.map(operation => operation.campaignId === id && !operation.legacy ? { ...operation, status: 'INACTIVA' } : operation));
  };

  const addTeam = (team: Omit<Team, 'id'>): Team => {
    const newTeam: Team = {
      ...team,
      id: `team_${Date.now()}`
    };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  };

  // Mutators
  const addEvaluation = async (
    evalData: Omit<Evaluation, 'id' | 'createdAt' | 'scoreConnect' | 'scoreClarify' | 'scoreConvert' | 'scoreTotal' | 'primaryGap' | 'secondaryGap' | 'strongestPillar' | 'recommendation'>
  ): Promise<Evaluation> => {
    const submissionKey = evaluationIdentity(evalData);
    if (recentEvaluation.current?.key === submissionKey && Date.now() - recentEvaluation.current.createdAt < 30000) return recentEvaluation.current.evaluation;
    const quality = evalData.evaluationType === 'QUALITY';
    const qualityScore = (criterion: string) => {
      const entries = evalData.items.filter(item => item.dimension === criterion && ['CUMPLE', 'NO_CUMPLE'].includes(item.compliance || ''));
      if (!entries.length) return null;
      const itemWeight = (item: EvaluationItem) => Number((item as any).attributeWeight ?? item.qualityGuideline?.weight ?? 1);
      const totalWeight = entries.reduce((sum, item) => sum + itemWeight(item), 0);
      const passedWeight = entries.filter(item => item.compliance === 'CUMPLE').reduce((sum, item) => sum + itemWeight(item), 0);
      return Math.round((passedWeight / totalWeight) * 100);
    };
    const criticalItem = evalData.items.find(item => item.compliance === 'NO_CUMPLE' && (item.qualityGuideline?.critical || item.classification?.startsWith('CRITICO_')));
    const criticalFailure = Boolean(quality && (evalData.qualityCriticalErrorIds?.length || criticalItem));
    const qualityScores = quality ? { C1: qualityScore('CONECTAR'), C2: qualityScore('CLARIFICAR'), C3: qualityScore('CONVERTIR'), C4: qualityScore('CONECTAR_C4' as any) } : null;
    const qualityWeights = campaigns.find(campaign => campaign.id === evalData.campaignId)?.qualityCriterionWeights || QUALITY_WEIGHTS;
    const qualityKeys: Array<'C1' | 'C2' | 'C3' | 'C4'> = ['C1', 'C2', 'C3', 'C4'];
    const activeQualityWeight = qualityScores ? qualityKeys.reduce((sum, key) => sum + (qualityScores[key] === null ? 0 : qualityWeights[key]), 0) : 0;
    const rawQualityTotal = qualityScores && activeQualityWeight ? Math.round(qualityKeys.reduce((sum, key) => sum + (qualityScores[key] === null ? 0 : Number(qualityScores[key]) * qualityWeights[key]), 0) / activeQualityWeight) : null;
    const qualityCampaign = campaigns.find(campaign => campaign.id === evalData.campaignId);
    const failedByMinimum = Boolean(quality && /(?:migraciones.*bitel|bitel.*migraciones)/i.test(qualityCampaign?.name || '') && (rawQualityTotal ?? 0) < 75);
    const summary = quality ? { scoreConnect: qualityScores!.C1, scoreClarify: qualityScores!.C2, scoreConvert: qualityScores!.C3, scoreTotal: criticalFailure ? 0 : rawQualityTotal, primaryGap: criticalFailure ? 'Error crítico PUE' : 'PUE', secondaryGap: '', strongestPillar: '', recommendation: criticalFailure ? 'Corregir error crítico antes de nueva evaluación.' : 'Revisar atributos no cumplidos.' } : calculateEvaluationSummary(evalData.items, config);
    const newEval: Evaluation = {
      ...evalData,
      evaluationType: evalData.evaluationType || 'D3C',
      id: `eval_${Date.now()}`,
      createdAt: new Date().toISOString(),
      scoreConnect: summary.scoreConnect,
      scoreClarify: summary.scoreClarify,
      scoreConvert: summary.scoreConvert,
      scoreTotal: summary.scoreTotal,
      technicalScore: quality ? rawQualityTotal : undefined,
      qualityResult: quality ? (criticalFailure || failedByMinimum ? 'REPROBADA' : 'APROBADA') : undefined,
      criticalReason: quality && criticalFailure ? (evalData.qualityCriticalErrorSnapshot?.[0]?.name || criticalItem?.classification?.replaceAll('_', ' ') || 'Error crítico') : failedByMinimum ? 'Puntaje menor al mínimo aprobatorio de 75%' : undefined,
      primaryGap: summary.primaryGap,
      secondaryGap: summary.secondaryGap,
      strongestPillar: summary.strongestPillar,
      recommendation: summary.recommendation
    };

    const saved = (await evaluationsApi.create(newEval)).evaluation || newEval;
    recentEvaluation.current = { key: submissionKey, evaluation: saved, createdAt: Date.now() };
    setEvaluations(prev => [saved, ...prev.filter(item => evaluationIdentity(item) !== submissionKey)]);
    window.dispatchEvent(new Event('cm:data-changed'));
    return saved;
  };

  const updateEvaluation = (id: string, evalData: Partial<Evaluation>) => {
    if (currentUser.role === 'MONITOR' && !evaluations.some(e => e.id === id && e.evaluatorId === currentUser.id)) return;
    setEvaluations(prev => prev.map(e => {
      if (e.id === id) {
        const merged = { ...e, ...evalData };
        if (evalData.items) {
          const summary = calculateEvaluationSummary(merged.items, config);
          return {
            ...merged,
            scoreConnect: summary.scoreConnect,
            scoreClarify: summary.scoreClarify,
            scoreConvert: summary.scoreConvert,
            scoreTotal: summary.scoreTotal,
            primaryGap: summary.primaryGap,
            secondaryGap: summary.secondaryGap,
            strongestPillar: summary.strongestPillar,
            recommendation: summary.recommendation
          };
        }
        return merged;
      }
      return e;
    }));
  };

  const deleteEvaluation = (id: string) => {
    if (currentUser.role === 'MONITOR') return;
    setEvaluations(prev => prev.filter(e => e.id !== id));
  };

  const addAdvisor = (advisorData: Omit<Advisor, 'id'>): Advisor => {
    const connMinutes = advisorData.baselineConnectionMinutes !== undefined 
      ? advisorData.baselineConnectionMinutes 
      : (advisorData.baselineConnectionTime ? parseTimeToMinutes(advisorData.baselineConnectionTime) : 360);

    const newAdvisor: Advisor = {
      ...advisorData,
      id: `adv_${Date.now()}`,
      hasOperationalBaseline: advisorData.hasOperationalBaseline ?? true,
      baselineConnectionMinutes: connMinutes,
      baselineConnectionTime: advisorData.baselineConnectionTime || formatMinutesToHHMM(connMinutes),
      baselineSph: advisorData.baselineSph !== undefined ? advisorData.baselineSph : 0.20,
      baselineDate: advisorData.baselineDate || new Date().toISOString().split('T')[0],
      baselinePeriod: advisorData.baselinePeriod || 'Línea Base'
    };

    // Auto-generate User account for the advisor: Username: Nombre.apellido, Password: DNI
    const cleanUsername = formatAdvisorUsername(newAdvisor.name);
    const newAdvisorUser: User = {
      id: `usr_adv_${newAdvisor.id}`,
      name: newAdvisor.name,
      username: cleanUsername,
      password: '12345678', mustChangePassword: true,
      email: `${cleanUsername}@asesores3c.com`,
      role: 'ASESOR',
      status: 'ACTIVO',
      advisorId: newAdvisor.id,
      createdAt: new Date().toISOString()
    };

    setAdvisors(prev => [...prev, newAdvisor]);
    setUsers(prev => {
      if (prev.some(u => u.advisorId === newAdvisor.id)) return prev;
      return [newAdvisorUser, ...prev];
    });

    return newAdvisor;
  };

  const updateAdvisor = (id: string, data: Partial<Advisor>) => {
    setAdvisors(prev => prev.map(a => {
      if (a.id === id) {
        const updated = { ...a, ...data };
        if (data.baselineConnectionTime && data.baselineConnectionMinutes === undefined) {
          updated.baselineConnectionMinutes = parseTimeToMinutes(data.baselineConnectionTime);
        }
        return updated;
      }
      return a;
    }));
    if (data.name?.trim()) setUsers(prev => prev.map(user => user.advisorId === id ? { ...user, name: data.name!.trim() } : user));
  };

  const deleteAdvisor = (id: string) => {
    setAdvisors(prev => prev.filter(a => a.id !== id));
    setUsers(prev => prev.filter(u => u.advisorId !== id));
    setEvaluations(prev => prev.filter(e => e.advisorId !== id));
    setActionPlans(prev => prev.filter(p => p.advisorId !== id));
    setOperationalMeasurements(prev => prev.filter(m => m.advisorId !== id));
    setAdvisorInterventions(prev => prev.filter(i => i.advisorId !== id));
  };

  const addOperationalMeasurement = (
    data: Omit<OperationalMeasurement, 'id' | 'createdAt'>
  ): OperationalMeasurement => {
    const minutes = data.connectionMinutes !== undefined 
      ? data.connectionMinutes 
      : parseTimeToMinutes(data.connectionTime);

    const newMeasurement: OperationalMeasurement = {
      ...data,
      id: `opm_${Date.now()}`,
      connectionMinutes: minutes,
      connectionTime: data.connectionTime || formatMinutesToHHMM(minutes),
      createdAt: new Date().toISOString()
    };
    setOperationalMeasurements(prev => [...prev, newMeasurement]);
    return newMeasurement;
  };

  const updateOperationalMeasurement = (id: string, data: Partial<OperationalMeasurement>) => {
    setOperationalMeasurements(prev => prev.map(m => {
      if (m.id === id) {
        const updated = { ...m, ...data };
        if (data.connectionTime && data.connectionMinutes === undefined) {
          updated.connectionMinutes = parseTimeToMinutes(data.connectionTime);
        }
        return updated;
      }
      return m;
    }));
  };

  const deleteOperationalMeasurement = (id: string) => {
    setOperationalMeasurements(prev => prev.filter(m => m.id !== id));
  };

  const addActionPlan = (planData: Omit<ActionPlan, 'id' | 'createdDate'>): ActionPlan => {
    const newPlan: ActionPlan = {
      ...planData,
      id: `act_${Date.now()}`,
      createdDate: new Date().toISOString().split('T')[0]
    };
    setActionPlans(prev => [newPlan, ...prev]);
    return newPlan;
  };

  const updateActionPlan = (id: string, data: Partial<ActionPlan>) => {
    setActionPlans(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  };

  const deleteActionPlan = (id: string) => {
    setActionPlans(prev => prev.filter(p => p.id !== id));
  };

  const addIntervention = (data: Omit<Intervention, 'id'>): Intervention => {
    const newInt: Intervention = {
      ...data,
      id: `int_${Date.now()}`
    };
    setInterventions(prev => [...prev, newInt]);
    return newInt;
  };

  const updateIntervention = (id: string, data: Partial<Intervention>) => {
    setInterventions(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
  };

  const deleteIntervention = (id: string) => {
    setInterventions(prev => prev.filter(i => i.id !== id));
  };

  const assignIntervention = (data: Omit<AdvisorIntervention, 'id' | 'assignedDate'>): AdvisorIntervention => {
    const newAssignment: AdvisorIntervention = {
      ...data,
      id: `adv_int_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      assignedDate: new Date().toISOString().split('T')[0]
    };
    setAdvisorInterventions(prev => [newAssignment, ...prev]);
    return newAssignment;
  };

  const assignBatchInterventions = (assignments: Omit<AdvisorIntervention, 'id' | 'assignedDate'>[]): AdvisorIntervention[] => {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const createdList: AdvisorIntervention[] = assignments.map((item, idx) => ({
      ...item,
      id: `adv_int_${now}_${idx}`,
      assignedDate: today
    }));
    setAdvisorInterventions(prev => [...createdList, ...prev]);
    return createdList;
  };

  const updateAdvisorIntervention = (id: string, data: Partial<AdvisorIntervention>) => {
    setAdvisorInterventions(prev => prev.map(ai => ai.id === id ? { ...ai, ...data } : ai));
  };

  const deleteAdvisorIntervention = (id: string) => {
    setAdvisorInterventions(prev => prev.filter(ai => ai.id !== id));
  };

  // Import Advisors Batch from Excel Payload
  const importAdvisorsBatch = (payload: {
    campaignId: string;
    campaignName: string;
    operationId?: string;
    periodName: string;
    cutoffDate: string;
    isBaseline: boolean;
    baselineHandling: 'KEEP' | 'REPLACE';
    fileName: string;
    fileSize: number;
    usesSheetCampaigns?: boolean;
    campaignMappings?: Record<string, string>;
    rows: any[];
  }) => {
    const validRows = payload.rows.filter(r => r.status !== 'ERROR' && r.actionType !== 'SKIP');
    const existingDniMap = new Map<string, Advisor>();
    advisors.forEach(a => {
      if (a.dni) existingDniMap.set(a.dni.trim(), a);
    });

    let newCount = 0;
    let updateCount = 0;
    const nowTimestamp = Date.now();
    const isoNow = new Date().toISOString();

    const advisorsToAdd: Advisor[] = [];
    const advisorsToUpdate: Advisor[] = [];
    const usersToAdd: User[] = [];
    const measurementsToAdd: OperationalMeasurement[] = [];
    const campaignsToAdd: Campaign[] = [];
    const teamsToAdd: Team[] = [];

    const normalizeCampaign = (value: string) => value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const campaignByName = new Map<string, Campaign>(campaigns.map(campaign => [normalizeCampaign(campaign.name), campaign]));
    if (payload.usesSheetCampaigns) {
      payload.rows.filter(row => row.status !== 'ERROR').forEach(row => {
        const name = String(row.campaignName || row.sheetName || '').trim();
        const mappedId = payload.campaignMappings?.[name];
        if (mappedId && mappedId !== '__NEW__') return;
        const key = normalizeCampaign(name);
        if (!name || campaignByName.has(key)) return;
        const id = `camp_excel_${nowTimestamp}_${campaignsToAdd.length}`;
        const campaign: Campaign = { id, name, client: name, status: 'ACTIVA', products: [] };
        campaignsToAdd.push(campaign);
        campaignByName.set(key, campaign);
      });
    }

    // Fallback supervisor and team
    const defaultSupervisor = users.find(u => u.role === 'SUPERVISOR') || users[0];

    validRows.forEach((row, index) => {
      const existingAdv = existingDniMap.get(row.dni);
      const rowSph = typeof row.sph === 'number' ? row.sph : 0.00;
      const rowCampaign = payload.usesSheetCampaigns
        ? campaigns.find(campaign => campaign.id === payload.campaignMappings?.[String(row.campaignName || row.sheetName || '')])
          || campaignByName.get(normalizeCampaign(String(row.campaignName || row.sheetName || '')))
        : undefined;
      const destinationOperation=payload.operationId ? operations.find(operation=>operation.id===payload.operationId && operation.status==='ACTIVA') : undefined;
      const campaignId = destinationOperation?.campaignId || rowCampaign?.id || payload.campaignId;
      const campaignName = rowCampaign?.name || payload.campaignName;
      let campaignTeam = teams.find(team => team.campaignId === campaignId && (!destinationOperation || team.operationId === destinationOperation.id));
      if (!campaignTeam) {
        campaignTeam = teamsToAdd.find(team => team.campaignId === campaignId);
      }
      if (!campaignTeam) {
        campaignTeam = {
          id: `team_excel_${nowTimestamp}_${teamsToAdd.length}`,
          campaignId,
          operationId: destinationOperation?.id,
          supervisorId: row.supervisorId || defaultSupervisor.id,
          name: `Equipo ${campaignName}`
        };
        teamsToAdd.push(campaignTeam);
      }

      if (!existingAdv) {
        // Create new advisor
        newCount++;
        const newAdvId = `adv_${nowTimestamp}_${index}`;
        const newEmployeeCode = `ADV-${row.dni.slice(-4)}`;

        const newAdvisor: Advisor = {
          id: newAdvId,
          dni: row.dni,
          employeeCode: newEmployeeCode,
          name: row.name,
          campaignId,
          operationId: destinationOperation?.id,
          sourceCampaignName: row.campaignName || row.sheetName,
          teamId: campaignTeam.id,
          supervisorId: row.supervisorId || defaultSupervisor.id,
          supervisor: row.supervisorRaw || defaultSupervisor.name,
          schedule: row.schedule || 'COMPLETO',
          shift: /tarde|noche/i.test(row.shiftRaw || '') ? 'TARDE' : /mañana|manana/i.test(row.shiftRaw || '') ? 'MANANA' : 'COMPLETO',
          status: row.terminationDate || /inactivo|cesado/i.test(row.sourceStatus || '') ? 'INACTIVO' : 'ACTIVO',
          hireDate: row.hireDate || '',
          hireDatePending: Boolean(row.hireDatePending),
          campaignStartDate: row.campaignStartDate,
          campaignStartDatePending: Boolean(!row.campaignStartDate),
          terminationDate: row.terminationDate,
          importedTenureLabel: row.importedTenureLabel,
          quartile: row.quartile || undefined,
          condition: row.condition,
          fte: row.fte,
          modality: row.modality,
          sourceShift: row.shiftRaw,
          site: row.site,
          indicators: row.indicators,
          active: !(row.terminationDate || /inactivo|cesado/i.test(row.sourceStatus || '')),

          // Operational Baseline
          hasOperationalBaseline: true,
          baselineConnectionMinutes: 0,
          baselineConnectionTime: 'Pendiente',
          baselineSph: rowSph,
          baselineDate: payload.cutoffDate,
          baselinePeriod: payload.periodName
        };

        advisorsToAdd.push(newAdvisor);

        // Auto-create User account for the new advisor (username: nombre.apellido, password: DNI)
        const username = formatAdvisorUsername(newAdvisor.name);
        const newUser: User = {
          id: `usr_adv_${newAdvisor.id}`,
          name: newAdvisor.name,
          username,
          password: '12345678', mustChangePassword: true,
          email: `${username}@asesores3c.com`,
          role: 'ASESOR',
          status: 'ACTIVO',
          advisorId: newAdvisor.id,
          createdAt: isoNow
        };
        usersToAdd.push(newUser);

        // Create Operational Measurement for this period
        measurementsToAdd.push({
          id: `opm_${nowTimestamp}_${index}`,
          advisorId: newAdvId,
          dni: newAdvisor.dni,
          measurementDate: payload.cutoffDate,
          periodName: payload.periodName,
          campaignId,
          campaignName,
          connectionTime: 'Pendiente',
          connectionMinutes: 0,
          sph: rowSph,
          pv: row.pv,
          sa: row.sa,
          dif: row.dif,
          sourcePercentage1: row.sourcePercentage1,
          ac: row.ac,
          sourcePercentage2: row.sourcePercentage2,
          managementFactor: row.managementFactor,
          quartile: row.quartile,
          source: 'CARGA_EXCEL',
          comments: `Importación Excel (${payload.fileName})`,
          createdAt: isoNow
        });
      } else if (row.actionType === 'UPDATE') {
        updateCount++;
        const updatedAdvisor: Advisor = { ...existingAdv };
        if (destinationOperation) {
          updatedAdvisor.operationId = destinationOperation.id;
          updatedAdvisor.campaignId = destinationOperation.campaignId;
          updatedAdvisor.teamId = campaignTeam.id;
        }
        if (row.schedule) updatedAdvisor.schedule = row.schedule;
        if (row.supervisorId) updatedAdvisor.supervisorId = row.supervisorId;
        if (row.supervisorRaw) updatedAdvisor.supervisor = row.supervisorRaw;
        if (row.terminationDate) {
          updatedAdvisor.terminationDate = row.terminationDate;
          updatedAdvisor.status = 'INACTIVO';
          updatedAdvisor.active = false;
        }
        if ((payload.isBaseline || updatedAdvisor.baselineSph === undefined) && (!updatedAdvisor.hasOperationalBaseline || payload.baselineHandling === 'REPLACE' || updatedAdvisor.baselineSph === undefined)) {
          updatedAdvisor.hasOperationalBaseline = true;
          updatedAdvisor.baselineSph = rowSph;
          updatedAdvisor.baselineDate = payload.cutoffDate;
          updatedAdvisor.baselinePeriod = payload.periodName;
        }
        advisorsToUpdate.push(updatedAdvisor);
        measurementsToAdd.push({
          id: `opm_${nowTimestamp}_${index}`,
          advisorId: existingAdv.id,
          dni: existingAdv.dni,
          measurementDate: payload.cutoffDate,
          periodName: payload.periodName,
          campaignId,
          campaignName,
          connectionTime: 'Pendiente',
          connectionMinutes: 0,
          sph: rowSph,
          pv: row.pv,
          sa: row.sa,
          dif: row.dif,
          sourcePercentage1: row.sourcePercentage1,
          ac: row.ac,
          sourcePercentage2: row.sourcePercentage2,
          managementFactor: row.managementFactor,
          quartile: row.quartile,
          source: 'CARGA_EXCEL',
          comments: `Importación Excel (${payload.fileName})`,
          createdAt: isoNow
        });
      }
    });

    // Commit state updates
    if (advisorsToAdd.length > 0) {
      setAdvisors(prev => [...prev, ...advisorsToAdd]);
    }
    if (advisorsToUpdate.length > 0) {
      const updateMap = new Map(advisorsToUpdate.map(advisor => [advisor.id, advisor]));
      setAdvisors(prev => prev.map(advisor => updateMap.get(advisor.id) || advisor));
    }
    if (campaignsToAdd.length > 0) setCampaigns(prev => [...prev, ...campaignsToAdd]);
    if (teamsToAdd.length > 0) setTeams(prev => [...prev, ...teamsToAdd]);
    if (usersToAdd.length > 0) {
      setUsers(prev => [...prev, ...usersToAdd]);
    }
    if (measurementsToAdd.length > 0) {
      setOperationalMeasurements(prev => [...prev, ...measurementsToAdd]);
    }

    // Save to Import History
    const newLog: ImportHistoryLog = {
      id: `imp_${nowTimestamp}`,
      date: isoNow,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      user: currentUser.name,
      recordType: 'DOTACION',
      campaign: payload.usesSheetCampaigns ? [...new Set(payload.rows.filter(row => row.status !== 'ERROR').map(row => row.campaignName))].join(', ') : payload.campaignName,
      period: payload.periodName,
      cutoffDate: payload.cutoffDate,
      isBaseline: payload.isBaseline,
      rowsDetected: payload.rows.length,
      rowsReady: payload.rows.filter(r => r.status === 'READY').length,
      rowsWarnings: payload.rows.filter(r => r.status === 'WARNING').length,
      rowsErrors: payload.rows.filter(r => r.status === 'ERROR').length,
      newAdvisorsCount: newCount,
      updatedAdvisorsCount: updateCount,
      duplicatesOmittedCount: payload.rows.filter(r => r.actionType === 'SKIP').length,
      operationalMeasurementsCount: measurementsToAdd.length,
      errorsList: payload.rows.filter(r => r.status === 'ERROR').map(r => ({
        row: r.rowIndex,
        dni: r.dni || 'Sin DNI',
        advisor: r.name || 'Sin nombre',
        reason: r.errors.join('; ')
      })),
      warningsList: payload.rows.filter(r => r.status === 'WARNING').map(r => ({
        row: r.rowIndex,
        dni: r.dni,
        advisor: r.name,
        reason: r.warnings.join('; ')
      }))
    };

    setImportHistory(prev => [newLog, ...prev]);

    return {
      newCount,
      updateCount,
      measurementsCount: measurementsToAdd.length,
      errorCount: payload.rows.filter(r => r.status === 'ERROR').length,
      warningCount: payload.rows.filter(r => r.status === 'WARNING').length,
      duplicateCount: payload.rows.filter(r => r.actionType === 'SKIP').length,
      invalidCount: payload.rows.filter(r => r.status === 'ERROR').length
    };
  };

  const deleteImportHistoryLog = (id: string) => {
    setImportHistory(prev => prev.filter(h => h.id !== id));
  };

  const updateConfig = (newConfig: Partial<MethodologyConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const clearAllData = () => {
    const cleanAdmin: User = {
      id: 'usr_admin',
      name: 'Administrador Principal',
      email: 'admin@consultoria3c.com',
      role: 'ADMINISTRADOR',
      status: 'ACTIVO',
      createdAt: new Date().toISOString()
    };

    setUsers([cleanAdmin]);
    setCurrentUser(cleanAdmin);
    setAdvisors([]);
    setEvaluations([]);
    setActionPlans([]);
    setAdvisorInterventions([]);
    setOperationalMeasurements([]);
    setTeams([]);
    setCampaigns(INITIAL_CAMPAIGNS);
    setConfig(DEFAULT_METHODOLOGY_CONFIG);
    setFilters(initialFilters);

    localStorage.clear();
  };

  const resetToDemoData = () => {
    clearAllData();
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authenticatedUserId,
        isAuthReady,
        isAuthenticated,
      login,
      changePassword,
        logout,
        setCurrentUser,
        setUserRole,
        users,
        companies,
        operations,
        campaigns,
        teams,
        advisors,
        evaluations,
        actionPlans,
        interventions,
        advisorInterventions,
        operationalMeasurements,
        config,
        filters,
        setFilters,
        resetFilters,
        currentSection,
        setCurrentSection,
        filteredEvaluations,
        platformLoadError,
        filteredAdvisors,
        filteredOperationalMeasurements,
        addUser,
        updateUser,
        deleteUser,
        createUsersForAdvisorsWithoutAccount,
        addCampaign,
        updateCampaign,
        deleteCampaign,
        addOperation,
        updateOperation,
        addTeam,
        addEvaluation,
        updateEvaluation,
        deleteEvaluation,
        addAdvisor,
        updateAdvisor,
        deleteAdvisor,
        addOperationalMeasurement,
        updateOperationalMeasurement,
        deleteOperationalMeasurement,
        addActionPlan,
        updateActionPlan,
        deleteActionPlan,
        addIntervention,
        updateIntervention,
        deleteIntervention,
        assignIntervention,
        assignBatchInterventions,
        updateAdvisorIntervention,
        deleteAdvisorIntervention,
        importHistory,
        importAdvisorsBatch,
        deleteImportHistoryLog,
        updateConfig,
        clearAllData,
        resetToDemoData,
        resetDemoData: clearAllData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
