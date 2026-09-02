import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  User, 
  Campaign, 
  Team, 
  Advisor, 
  Evaluation, 
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
import { adminUsersApi, authApi, evaluationsApi, platformStateApi, sharedRepositoryApi } from '../api/sharedRepository';
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
  isAuthReady: boolean;
  isAuthenticated: boolean;
  login: (identity: string, password: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User) => void;
  setUserRole: (role: UserRole) => void;

  users: User[];
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
  addTeam: (team: Omit<Team, 'id'>) => Team;

  // Mutators
  addEvaluation: (evalData: Omit<Evaluation, 'id' | 'createdAt' | 'scoreConnect' | 'scoreClarify' | 'scoreConvert' | 'scoreTotal' | 'primaryGap' | 'secondaryGap' | 'strongestPillar' | 'recommendation'>) => Evaluation;
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
    periodName: string;
    cutoffDate: string;
    isBaseline: boolean;
    baselineHandling: 'KEEP' | 'REPLACE';
    fileName: string;
    fileSize: number;
    rows: any[];
  }) => {
    newCount: number;
    updateCount: number;
    measurementsCount: number;
    errorCount: number;
    warningCount: number;
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
  productId: '',
  supervisorId: '',
  advisorId: '',
  evaluatorId: '',
  evaluationType: '',
  priorityLevel: '',
  searchQuery: ''
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial states from LocalStorage or defaults
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}users`);
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    return users[0] || INITIAL_USERS[0];
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}campaigns`);
    return saved ? JSON.parse(saved) : INITIAL_CAMPAIGNS;
  });

  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}teams`);
    return saved ? JSON.parse(saved) : INITIAL_TEAMS;
  });

  const [advisors, setAdvisors] = useState<Advisor[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}advisors`);
    return saved ? JSON.parse(saved) : INITIAL_ADVISORS;
  });

  const [evaluations, setEvaluations] = useState<Evaluation[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}evaluations`);
    return saved ? JSON.parse(saved) : INITIAL_EVALUATIONS;
  });

  const [actionPlans, setActionPlans] = useState<ActionPlan[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}action_plans`);
    return saved ? JSON.parse(saved) : INITIAL_ACTION_PLANS;
  });

  const [interventions, setInterventions] = useState<Intervention[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}interventions`);
    return saved ? JSON.parse(saved) : INITIAL_INTERVENTIONS;
  });

  const [advisorInterventions, setAdvisorInterventions] = useState<AdvisorIntervention[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}advisor_interventions`);
    return saved ? JSON.parse(saved) : INITIAL_ADVISOR_INTERVENTIONS;
  });

  const [operationalMeasurements, setOperationalMeasurements] = useState<OperationalMeasurement[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}operational_measurements`);
    return saved ? JSON.parse(saved) : INITIAL_OPERATIONAL_MEASUREMENTS;
  });

  const [importHistory, setImportHistory] = useState<ImportHistoryLog[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}import_history`);
    return saved ? JSON.parse(saved) : [
      {
        id: 'imp_initial_demo',
        date: '2026-08-28T14:30:00.000Z',
        fileName: 'Base_Operacional_Agosto2026.xlsx',
        fileSize: 45210,
        user: 'Pablo Campos (Consultor 3C)',
        campaign: 'Migraciones Prepago → Postpago',
        period: 'Agosto 2026',
        cutoffDate: '2026-08-28',
        isBaseline: true,
        rowsDetected: 8,
        rowsReady: 8,
        rowsWarnings: 1,
        rowsErrors: 0,
        newAdvisorsCount: 8,
        updatedAdvisorsCount: 0,
        operationalMeasurementsCount: 8
      }
    ];
  });

  const [config, setConfig] = useState<MethodologyConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}config`);
    return saved ? JSON.parse(saved) : DEFAULT_METHODOLOGY_CONFIG;
  });

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [currentSection, setCurrentSection] = useState<NavigationSection>('home');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const rosterHydrated = useRef(false);
  const platformStateHydrated = useRef(false);

  // La sesión se mantiene sólo por pestaña; el token nunca se guarda en localStorage.
  useEffect(() => {
    const restoreSession = async () => {
      if (!authApi.token()) { setIsAuthReady(true); return; }
      try { setCurrentUser(await authApi.currentUser()); setIsAuthenticated(true); }
      catch { await authApi.logout(); }
      finally { setIsAuthReady(true); }
    };
    restoreSession();
  }, []);

  // Primera carga autenticada: importa una única vez la dotación existente y, desde
  // entonces, la fuente de verdad para usuarios/campañas/equipos/asesores es SQLite.
  useEffect(() => {
    if (!isAuthenticated || rosterHydrated.current) return;
    const hydrate = async () => {
      const repository = { users, campaigns, teams, advisors };
      try {
        const migrationKey = `${STORAGE_PREFIX}shared_repository_migrated_v1`;
        if (currentUser.role !== 'ASESOR' && !localStorage.getItem(migrationKey)) {
          await sharedRepositoryApi.migrate(repository);
          localStorage.setItem(migrationKey, 'true');
        }
        const persisted = await sharedRepositoryApi.load();
        rosterHydrated.current = true;
        setUsers(persisted.users); setCampaigns(persisted.campaigns); setTeams(persisted.teams); setAdvisors(persisted.advisors);
        const localState = { evaluations, actionPlans, interventions, advisorInterventions, operationalMeasurements, importHistory, config };
        const stateMigrationKey = `${STORAGE_PREFIX}platform_state_migrated_v1`;
        const persistedState = await platformStateApi.load();
        if (currentUser.role !== 'ASESOR' && !localStorage.getItem(stateMigrationKey) && !persistedState) { await platformStateApi.save(localState); }
        if (!localStorage.getItem(stateMigrationKey)) localStorage.setItem(stateMigrationKey, 'true');
        const state = persistedState || await platformStateApi.load();
        if (state) {
          setEvaluations(Array.isArray(state.evaluations) ? state.evaluations : INITIAL_EVALUATIONS); setActionPlans(state.actionPlans || []); setInterventions(state.interventions || INITIAL_INTERVENTIONS);
          setAdvisorInterventions(state.advisorInterventions || []); setOperationalMeasurements(state.operationalMeasurements || []); setImportHistory(state.importHistory || []); setConfig(state.config || DEFAULT_METHODOLOGY_CONFIG);
        }
        platformStateHydrated.current = true;
      } catch (error) {
        console.error('No fue posible cargar la dotación persistente', error);
      }
    };
    hydrate();
  }, [isAuthenticated, currentUser.role]);

  // Persistencia incremental del repositorio único de dotación. Los demás módulos
  // siguen en su almacenamiento actual hasta sus fases de migración respectivas.
  useEffect(() => {
    if (!isAuthenticated || currentUser.role === 'ASESOR' || !rosterHydrated.current) return;
    void sharedRepositoryApi.sync({ users, campaigns, teams, advisors }).catch(error => console.error('No fue posible sincronizar la dotación', error));
  }, [users, campaigns, teams, advisors, isAuthenticated, currentUser.role]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role === 'ASESOR' || !platformStateHydrated.current) return;
    void platformStateApi.save({ evaluations, actionPlans, interventions, advisorInterventions, operationalMeasurements, importHistory, config }).catch(error => console.error('No fue posible sincronizar el estado de plataforma', error));
  }, [evaluations, actionPlans, interventions, advisorInterventions, operationalMeasurements, importHistory, config, isAuthenticated, currentUser.role]);

  const login = async (identity: string, password: string) => {
    const user = await authApi.login(identity, password);
    rosterHydrated.current = false;
    platformStateHydrated.current = false;
    setCurrentUser(user); setIsAuthenticated(true);
  };
  const changePassword = async (password: string) => { setCurrentUser(await authApi.changePassword(password)); };

  const logout = async () => {
    await authApi.logout();
    rosterHydrated.current = false;
    platformStateHydrated.current = false;
    setIsAuthenticated(false);
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
    if (filters.dateFrom && ev.date < filters.dateFrom) return false;
    if (filters.dateTo && ev.date > filters.dateTo) return false;
    if (filters.campaignId && ev.campaignId !== filters.campaignId) return false;
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
    if (currentUser.role === 'SUPERVISOR' && currentUser.teamId) {
      if (ev.teamId !== currentUser.teamId) return false;
    }

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
    if (filters.campaignId && adv.campaignId !== filters.campaignId) return false;
    if (filters.supervisorId && adv.supervisorId !== filters.supervisorId) return false;
    if (filters.advisorId && adv.id !== filters.advisorId) return false;
    
    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      if (adv.id !== currentUser.advisorId) return false;
    }

    if (currentUser.role === 'SUPERVISOR' && currentUser.teamId) {
      if (adv.teamId !== currentUser.teamId) return false;
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
    if (filters.supervisorId && advisor.supervisorId !== filters.supervisorId) return false;

    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      if (advisor.id !== currentUser.advisorId) return false;
    }

    if (currentUser.role === 'SUPERVISOR' && currentUser.teamId) {
      if (advisor.teamId !== currentUser.teamId) return false;
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

  const addTeam = (team: Omit<Team, 'id'>): Team => {
    const newTeam: Team = {
      ...team,
      id: `team_${Date.now()}`
    };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  };

  // Mutators
  const addEvaluation = (
    evalData: Omit<Evaluation, 'id' | 'createdAt' | 'scoreConnect' | 'scoreClarify' | 'scoreConvert' | 'scoreTotal' | 'primaryGap' | 'secondaryGap' | 'strongestPillar' | 'recommendation'>
  ): Evaluation => {
    const quality = evalData.evaluationType === 'QUALITY';
    const qualityScore = (criterion: string) => {
      const entries = evalData.items.filter(item => item.dimension === criterion && item.compliance !== 'NO_APLICA');
      if (!entries.length) return null;
      const totalWeight = entries.reduce((sum, item) => sum + Number(item.percentage === undefined ? 1 : (item as any).attributeWeight || 1), 0);
      const passedWeight = entries.filter(item => item.compliance === 'CUMPLE').reduce((sum, item) => sum + Number((item as any).attributeWeight || 1), 0);
      return Math.round((passedWeight / totalWeight) * 100);
    };
    const criticalFailure = quality && (evalData.qualityCriticalErrorIds?.length || evalData.items.some(item => ['q_1_2', 'q_2_1', 'q_3_2'].includes(item.criterionId) && item.compliance === 'NO_CUMPLE'));
    const qualityScores = quality ? { C1: qualityScore('CONECTAR'), C2: qualityScore('CLARIFICAR'), C3: qualityScore('CONVERTIR'), C4: qualityScore('CONECTAR_C4' as any) } : null;
    const rawQualityTotal = qualityScores ? Math.round(((qualityScores.C1 || 0) * QUALITY_WEIGHTS.C1) + ((qualityScores.C2 || 0) * QUALITY_WEIGHTS.C2) + ((qualityScores.C3 || 0) * QUALITY_WEIGHTS.C3) + ((qualityScores.C4 || 0) * QUALITY_WEIGHTS.C4)) : null;
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
      primaryGap: summary.primaryGap,
      secondaryGap: summary.secondaryGap,
      strongestPillar: summary.strongestPillar,
      recommendation: summary.recommendation
    };

    setEvaluations(prev => [newEval, ...prev]);
    void evaluationsApi.create(newEval).catch(error => console.error('No fue posible persistir la evaluación', error));
    return newEval;
  };

  const updateEvaluation = (id: string, evalData: Partial<Evaluation>) => {
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
    periodName: string;
    cutoffDate: string;
    isBaseline: boolean;
    baselineHandling: 'KEEP' | 'REPLACE';
    fileName: string;
    fileSize: number;
    rows: any[];
  }) => {
    const validRows = payload.rows.filter(r => r.status !== 'ERROR');
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

    // Fallback supervisor and team
    const defaultSupervisor = users.find(u => u.role === 'SUPERVISOR') || users[0];
    const defaultTeam = teams[0] || { id: 'team_default', name: 'Equipo Operaciones' };

    validRows.forEach((row, index) => {
      const existingAdv = existingDniMap.get(row.dni);
      const rowSph = typeof row.sph === 'number' ? row.sph : 0.00;

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
          campaignId: payload.campaignId,
          teamId: defaultTeam.id,
          supervisorId: row.supervisorId || defaultSupervisor.id,
          supervisor: row.supervisorRaw || defaultSupervisor.name,
          schedule: row.schedule || 'COMPLETO',
          shift: 'COMPLETO',
          status: row.terminationDate ? 'INACTIVO' : 'ACTIVO',
          hireDate: row.hireDate || '',
          hireDatePending: Boolean(row.hireDatePending),
          campaignStartDate: row.campaignStartDate,
          campaignStartDatePending: Boolean(!row.campaignStartDate),
          terminationDate: row.terminationDate,
          importedTenureLabel: row.importedTenureLabel,
          active: !row.terminationDate,

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
          campaignId: payload.campaignId,
          campaignName: payload.campaignName,
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

      } else {
        // Update existing advisor operational fields
        updateCount++;
        const updatedAdvisor: Advisor = { ...existingAdv };

        if (row.schedule) updatedAdvisor.schedule = row.schedule;
        if (row.supervisorId) updatedAdvisor.supervisorId = row.supervisorId;
        if (row.supervisorRaw) updatedAdvisor.supervisor = row.supervisorRaw;
        if (row.terminationDate) {
          updatedAdvisor.terminationDate = row.terminationDate;
          updatedAdvisor.status = 'INACTIVO';
          updatedAdvisor.active = false;
        }

        // Handle baseline logic or latest SPH
        if (payload.isBaseline || updatedAdvisor.baselineSph === undefined) {
          if (!updatedAdvisor.hasOperationalBaseline || payload.baselineHandling === 'REPLACE' || updatedAdvisor.baselineSph === undefined) {
            updatedAdvisor.hasOperationalBaseline = true;
            updatedAdvisor.baselineSph = rowSph;
            updatedAdvisor.baselineDate = payload.cutoffDate;
            updatedAdvisor.baselinePeriod = payload.periodName;
          }
        }

        advisorsToUpdate.push(updatedAdvisor);

        // Create Operational Measurement for existing advisor
        measurementsToAdd.push({
          id: `opm_${nowTimestamp}_${index}`,
          advisorId: existingAdv.id,
          dni: existingAdv.dni,
          measurementDate: payload.cutoffDate,
          periodName: payload.periodName,
          campaignId: payload.campaignId,
          campaignName: payload.campaignName,
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
      const updateMap = new Map(advisorsToUpdate.map(a => [a.id, a]));
      setAdvisors(prev => prev.map(a => updateMap.get(a.id) || a));
    }
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
      campaign: payload.campaignName,
      period: payload.periodName,
      cutoffDate: payload.cutoffDate,
      isBaseline: payload.isBaseline,
      rowsDetected: payload.rows.length,
      rowsReady: payload.rows.filter(r => r.status === 'READY').length,
      rowsWarnings: payload.rows.filter(r => r.status === 'WARNING').length,
      rowsErrors: payload.rows.filter(r => r.status === 'ERROR').length,
      newAdvisorsCount: newCount,
      updatedAdvisorsCount: updateCount,
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
      warningCount: payload.rows.filter(r => r.status === 'WARNING').length
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
        isAuthReady,
        isAuthenticated,
      login,
      changePassword,
        logout,
        setCurrentUser,
        setUserRole,
        users,
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
        filteredAdvisors,
        filteredOperationalMeasurements,
        addUser,
        updateUser,
        deleteUser,
        createUsersForAdvisorsWithoutAccount,
        addCampaign,
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
