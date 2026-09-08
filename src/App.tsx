import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { EvaluationsList } from './components/evaluations/EvaluationsList';
import { NewEvaluationModal } from './components/evaluations/NewEvaluationModal';
import { QualityEvaluationModal } from './components/evaluations/QualityEvaluationModal';
import { QualityDashboardView } from './components/dashboard/QualityDashboardView';
import { HomeView } from './components/dashboard/HomeView';
import { AdvisorHomeView } from './components/dashboard/AdvisorHomeView';
import { SupervisorHomeView } from './components/dashboard/SupervisorHomeView';
import { QualityAlertsView } from './components/quality/QualityAlertsView';
import { CalibrationsView } from './components/quality/CalibrationsView';
import { EvaluationDetailModal } from './components/evaluations/EvaluationDetailModal';
import { AdvisorsList } from './components/advisors/AdvisorsList';
import { AdvisorProfileModal } from './components/advisors/AdvisorProfileModal';
import { NewAdvisorModal } from './components/advisors/NewAdvisorModal';
import { ParetoDeepDive } from './components/pareto/ParetoDeepDive';
import { MethodologyGuide } from './components/methodology/MethodologyGuide';
import { ActionPlansManager } from './components/actionplans/ActionPlansManager';
import { InterventionsCatalog } from './components/interventions/InterventionsCatalog';
import { ImpactAnalysisView } from './components/impact/ImpactAnalysisView';
import { ReportsExportView } from './components/reports/ReportsExportView';
import { AdminSettingsView } from './components/admin/AdminSettingsView';
import { FeedbackView } from './components/feedback/FeedbackView';
import { DevelopmentView } from './components/development/DevelopmentView';
import { MonitorProgressView, MonitorResultsView } from './components/monitor/MonitorViews';
import { Evaluation, Advisor, Campaign, Company, Operation } from './types';
import { LoginScreen } from './components/auth/LoginScreen';
import { ForcePasswordChange } from './components/auth/ForcePasswordChange';
import { ChevronRight, ShieldCheck, TrendingUp, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { currentSection, setCurrentSection, evaluations, advisors, campaigns, companies, operations, currentUser, authenticatedUserId } = useApp();
  useEffect(() => {
    const allowed = ['evaluations', 'feedback', 'monitor_results', 'development', 'monitor_progress'];
    if (currentUser.role === 'MONITOR' && !allowed.includes(currentSection)) setCurrentSection('monitor_progress');
  }, [currentSection, currentUser.role, setCurrentSection]);

  // Modals state
  const [isNewEvalModalOpen, setIsNewEvalModalOpen] = useState(false);
  const [newEvaluationCampaignId, setNewEvaluationCampaignId] = useState<string | null>(null);
  const [newEvaluationCompanyId, setNewEvaluationCompanyId] = useState<string | null>(null);
  const [newEvaluationOperationId, setNewEvaluationOperationId] = useState<string | null>(null);
  const [newEvaluationModule, setNewEvaluationModule] = useState<'QUALITY' | 'D3C' | null>(null);
  const [preselectedAdvisorForEval, setPreselectedAdvisorForEval] = useState<Advisor | null>(null);
  
  const [selectedEvaluationForDetail, setSelectedEvaluationForDetail] = useState<Evaluation | null>(null);
  const [selectedAdvisorIdForProfile, setSelectedAdvisorIdForProfile] = useState<string | null>(null);
  const [isNewAdvisorModalOpen, setIsNewAdvisorModalOpen] = useState(false);
  const [initialEvalForActionPlan, setInitialEvalForActionPlan] = useState<any>(null);

  const handleOpenNewEvaluation = (advisor?: Advisor) => {
    if (advisor) {
      setPreselectedAdvisorForEval(advisor);
    } else {
      setPreselectedAdvisorForEval(null);
    }
    const operation=operations.find(item=>item.id===advisor?.operationId);
    setNewEvaluationCompanyId(operation?.companyId || null);
    setNewEvaluationOperationId(operation?.id || null);
    setNewEvaluationCampaignId(advisor?.campaignId || null);
    setNewEvaluationModule(null);
    setIsNewEvalModalOpen(true);
  };

  const handleOpenActionPlanWithEval = (evalData: Evaluation) => {
    setIsNewEvalModalOpen(false);
    setSelectedEvaluationForDetail(null);
    setInitialEvalForActionPlan({
      evaluationId: evalData.id,
      advisorId: evalData.advisorId,
      primaryGap: evalData.primaryGap || 'Conectar con el cliente',
      recommendation: evalData.recommendation || 'Microentrenamiento focalizado'
    });
    setCurrentSection('action_plans');
  };

  const handleOpenActionPlanForAdvisor = (advisor: Advisor) => {
    setSelectedAdvisorIdForProfile(null);
    setInitialEvalForActionPlan({
      advisorId: advisor.id,
      primaryGap: 'Conectar con el cliente',
      recommendation: 'Microentrenamiento de modulación y escucha activa'
    });
    setCurrentSection('action_plans');
  };

  // Re-evaluation rate calculation
  const reevalCount = evaluations.filter(e => e.evaluationType === 'REEVALUACION' || e.evaluationType === 'SEGUIMIENTO').length;
  const reevalRate = evaluations.length > 0 ? Math.round((reevalCount / evaluations.length) * 100) : 0;
  const activeAdvisorsCount = advisors.filter(a => a.active).length;

  return (
    <div className="cm-app-shell antialiased [background-image:radial-gradient(circle_at_90%_0%,rgba(33,212,253,.08),transparent_28%)]">
      <div className="min-h-screen flex flex-col">
        
        {/* Top Navbar */}
        <Navbar onOpenNewEvaluation={() => handleOpenNewEvaluation()} />

        {/* Dynamic View Router */}
        <main className="flex-1 flex flex-col min-h-0 relative">
          {currentSection === 'home' && (currentUser.role === 'ASESOR' ? <AdvisorHomeView onSelectEvaluation={setSelectedEvaluationForDetail} /> : currentUser.role === 'SUPERVISOR' ? <SupervisorHomeView /> : <HomeView />)}
          
          {currentSection === 'dashboard' && (
            <DashboardView
              onSelectAdvisor={(id) => setSelectedAdvisorIdForProfile(id)}
              onNavigateTab={(sec) => setCurrentSection(sec)}
            />
          )}
          {currentSection === 'dashboard_quality' && <QualityDashboardView />}

          {currentSection === 'evaluations' && (
            <EvaluationsList
              onSelectEvaluation={(ev) => setSelectedEvaluationForDetail(ev)}
              onOpenNewEvaluation={() => handleOpenNewEvaluation()}
            />
          )}
          {currentSection === 'feedback' && <FeedbackView />}
          {currentSection === 'quality_alerts' && <QualityAlertsView />}
          {currentSection === 'calibrations' && <CalibrationsView />}
          {currentSection === 'development' && <DevelopmentView />}
          {currentSection === 'monitor_results' && currentUser.role === 'MONITOR' && <MonitorResultsView onSelectEvaluation={setSelectedEvaluationForDetail} />}
          {currentSection === 'monitor_progress' && currentUser.role === 'MONITOR' && <MonitorProgressView onSelectEvaluation={setSelectedEvaluationForDetail} onNavigate={setCurrentSection} />}

          {currentSection === 'advisors' && (
            <AdvisorsList
              onSelectAdvisor={(id) => setSelectedAdvisorIdForProfile(id)}
              onOpenNewAdvisor={() => setIsNewAdvisorModalOpen(true)}
            />
          )}

          {currentSection === 'pareto' && (
            <ParetoDeepDive />
          )}

          {currentSection === 'methodology' && (
            <MethodologyGuide />
          )}

          {currentSection === 'action_plans' && (
            <ActionPlansManager
              initialEvaluationForPlan={initialEvalForActionPlan}
              onClearInitialEvaluation={() => setInitialEvalForActionPlan(null)}
            />
          )}

          {currentSection === 'interventions' && (
            <InterventionsCatalog />
          )}

          {currentSection === 'impact' && (
            <ImpactAnalysisView
              onSelectAdvisor={(id) => setSelectedAdvisorIdForProfile(id)}
            />
          )}

          {currentSection === 'reports' && ['ADMINISTRADOR','CONSULTOR','SUPERVISOR'].includes(currentUser.role) && (
            <ReportsExportView />
          )}

          {currentSection === 'admin' && (
            <AdminSettingsView />
          )}

        </main>

      </div>{currentUser.mustChangePassword && currentUser.id === authenticatedUserId && <ForcePasswordChange />}

      {/* Global Modals */}
      {isNewEvalModalOpen && (
        newEvaluationCompanyId === null ? <CompanyPicker companies={companies} onSelect={setNewEvaluationCompanyId} onClose={() => setIsNewEvalModalOpen(false)} /> : newEvaluationOperationId === null ? <CampaignPicker companyId={newEvaluationCompanyId} operations={operations} onSelect={(operationId) => { const operation=operations.find(item=>item.id===operationId);setNewEvaluationOperationId(operationId);setNewEvaluationCampaignId(operation?.campaignId||null); }} onBack={() => setNewEvaluationCompanyId(null)} onClose={() => setIsNewEvalModalOpen(false)} /> : newEvaluationModule === null ? <EvaluationModulePicker campaign={campaigns.find(item => item.id === newEvaluationCampaignId)} onBack={() => {setNewEvaluationOperationId(null);setNewEvaluationCampaignId(null);}} onSelect={setNewEvaluationModule} onClose={() => setIsNewEvalModalOpen(false)} /> : newEvaluationModule === 'QUALITY' ? <QualityEvaluationModal campaignId={newEvaluationCampaignId} operationId={newEvaluationOperationId} onClose={() => { setIsNewEvalModalOpen(false); setNewEvaluationCompanyId(null);setNewEvaluationOperationId(null);setNewEvaluationCampaignId(null); setNewEvaluationModule(null); }} onSuccess={(evaluation) => setSelectedEvaluationForDetail(evaluation)} /> : <NewEvaluationModal
          onClose={() => {
            setIsNewEvalModalOpen(false);
          setNewEvaluationCampaignId(null);
            setNewEvaluationCompanyId(null);
            setNewEvaluationOperationId(null);
            setNewEvaluationModule(null);
            setPreselectedAdvisorForEval(null);
          }}
          preselectedCampaignId={newEvaluationCampaignId}
          preselectedOperationId={newEvaluationOperationId}
          preselectedAdvisor={preselectedAdvisorForEval}
          onOpenActionPlanWithEval={(evalData) => {
            handleOpenActionPlanWithEval(evalData);
          }}
        />
      )}

      {selectedEvaluationForDetail && (
        <EvaluationDetailModal
          evaluation={selectedEvaluationForDetail}
          onClose={() => setSelectedEvaluationForDetail(null)}
          onOpenNewActionPlan={currentUser.role === 'ASESOR' ? undefined : (ev) => {
            setSelectedEvaluationForDetail(null);
            handleOpenActionPlanWithEval(ev);
          }}
        />
      )}

      {selectedAdvisorIdForProfile && (
        <AdvisorProfileModal
          advisorId={selectedAdvisorIdForProfile}
          onClose={() => setSelectedAdvisorIdForProfile(null)}
          onOpenNewEvaluationForAdvisor={(adv) => {
            setSelectedAdvisorIdForProfile(null);
            handleOpenNewEvaluation(adv);
          }}
          onOpenNewActionPlanForAdvisor={(adv) => {
            setSelectedAdvisorIdForProfile(null);
            handleOpenActionPlanForAdvisor(adv);
          }}
          onSelectEvaluation={(ev) => {
            setSelectedEvaluationForDetail(ev);
          }}
        />
      )}

      {isNewAdvisorModalOpen && (
        <NewAdvisorModal
          onClose={() => setIsNewAdvisorModalOpen(false)}
          onSuccess={(adv) => setSelectedAdvisorIdForProfile(adv.id)}
        />
      )}

    </div>
  );
};

const campaignImage = (campaign: Campaign) => campaign.backgroundImage || (/retenciones/i.test(campaign.name) ? '/home/mejora-continua.png' : '/home/calidad.png');

const CompanyPicker:React.FC<{companies:Company[];onSelect:(id:string)=>void;onClose:()=>void}>=({companies,onSelect,onClose})=>{const available=companies.filter(c=>c.status==='ACTIVA');const [selected,setSelected]=useState(available[0]?.id||'');return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div className="cm-modal w-full max-w-2xl overflow-hidden"><header className="flex items-start justify-between border-b border-[var(--cm-border)] px-7 pb-5 pt-6"><div><p className="cm-eyebrow">NUEVA EVALUACIÓN</p><h2 className="text-xl font-bold">Selecciona la empresa</h2><p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Primero define la empresa operadora.</p></div><button onClick={onClose} className="cm-navbar__icon-button"><X className="h-5 w-5"/></button></header><div className="grid gap-3 p-7 sm:grid-cols-3">{available.map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className={`rounded-xl border p-5 text-left font-bold ${selected===c.id?'border-[var(--cm-primary)] bg-[var(--cm-surface-elevated)]':'border-[var(--cm-border)]'}`}>{c.name}</button>)}</div><footer className="flex justify-between border-t border-[var(--cm-border)] px-7 py-4"><button onClick={onClose} className="cm-button-secondary px-4 py-2">Cancelar</button><button disabled={!selected} onClick={()=>onSelect(selected)} className="cm-button-primary px-4 py-2">Continuar <ChevronRight className="h-4 w-4"/></button></footer></div></div>};
const CampaignPicker: React.FC<{companyId:string;operations:Operation[];onSelect:(operationId:string)=>void;onBack:()=>void;onClose:()=>void}> = ({ companyId,operations,onSelect,onBack,onClose }) => {
  const { campaigns } = useApp();
  const activeCampaignIds = new Set(campaigns.filter(campaign => campaign.status === 'ACTIVA').map(campaign => campaign.id));
  const available = operations.filter(operation => operation.companyId === companyId && operation.status === 'ACTIVA' && !operation.legacy && activeCampaignIds.has(operation.campaignId)).filter((operation, index, list) => list.findIndex(item => item.campaignId === operation.campaignId) === index);
  const [selected,setSelected]=useState(available[0]?.id||'');
  const selectedIsAvailable = available.some(operation => operation.id === selected);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="cm-modal w-full max-w-2xl overflow-hidden"><header className="flex items-start justify-between border-b border-[var(--cm-border)] px-7 pb-5 pt-6"><div><p className="cm-eyebrow">NUEVA EVALUACIÓN</p><h2 className="text-xl font-bold">Selecciona la campaña</h2><p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Sólo se muestran campañas activas asociadas a la empresa seleccionada.</p></div><button onClick={onClose} className="cm-navbar__icon-button"><X className="h-5 w-5" /></button></header><div className="max-h-[62vh] space-y-2 overflow-y-auto p-7">{available.map(operation=>{const campaign=campaigns.find(c=>c.id===operation.campaignId)!;return <button key={operation.id} onClick={()=>setSelected(operation.id)} className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition-colors ${selected===operation.id?'border-[var(--cm-primary)] bg-[var(--cm-surface-elevated)]':'border-[var(--cm-border)] hover:border-[var(--cm-primary)]'}`}><span><small className="font-bold uppercase tracking-wider text-[var(--cm-primary)]">Campaña</small><strong className="mt-1 block text-base">{campaign.name}</strong></span>{selected===operation.id&&<span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--cm-primary)] font-bold text-[#031326]">✓</span>}</button>})}{!available.length&&<p className="py-8 text-center text-sm text-[var(--cm-text-secondary)]">No hay campañas activas para esta empresa.</p>}</div><footer className="flex justify-between border-t border-[var(--cm-border)] px-7 py-4"><button onClick={onBack} className="cm-button-secondary px-4 py-2">← Volver</button><button disabled={!selectedIsAvailable} onClick={()=>{if(selectedIsAvailable)onSelect(selected);}} className="cm-button-primary px-4 py-2">Continuar <ChevronRight className="h-4 w-4"/></button></footer></div></div>;
};

const EvaluationModulePicker: React.FC<{ campaign?: Campaign; onSelect: (module: 'QUALITY' | 'D3C') => void; onBack: () => void; onClose: () => void }> = ({ campaign, onSelect, onBack, onClose }) => {
  const [selected, setSelected] = useState<'QUALITY' | 'D3C'>('QUALITY');
  const options = [{ id: 'QUALITY' as const, title: 'Calidad', description: `${campaign?.name || 'Campaña'} · cumplimiento y estándar`, icon: <ShieldCheck className="h-9 w-9" /> }, { id: 'D3C' as const, title: 'MC D+3C', description: `${campaign?.name || 'Campaña'} · diagnóstico y mejora`, icon: <TrendingUp className="h-9 w-9" /> }];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="cm-modal w-full max-w-[640px] overflow-hidden"><div className="flex items-start justify-between px-7 pb-5 pt-6"><div><p className="cm-eyebrow">{campaign?.name}</p><h2 className="text-xl font-bold">Nueva evaluación</h2><p className="mt-1 text-sm text-[var(--cm-text-secondary)]">Selecciona el tipo de evaluación que deseas realizar</p></div><button onClick={onClose} className="cm-navbar__icon-button" aria-label="Cerrar"><X className="h-5 w-5" /></button></div><div className="px-7"><p className="text-xs font-bold text-[var(--cm-text-secondary)]">Tipo de evaluación</p><div className="mt-3 grid gap-4 sm:grid-cols-2">{options.map(option => <button key={option.id} onClick={() => setSelected(option.id)} className={`relative min-h-[220px] rounded-xl border p-5 text-center transition-all ${selected === option.id ? 'border-[var(--cm-primary)] bg-[var(--cm-surface-elevated)] shadow-[0_0_0_1px_var(--cm-primary)]' : 'border-[var(--cm-border)] hover:border-[var(--cm-primary)]'}`}><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--cm-surface-elevated)] text-[var(--cm-primary)]">{option.icon}</span>{selected === option.id && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[var(--cm-primary)] text-sm font-bold text-[#031326]">✓</span>}<strong className="mt-4 block text-[15px]">{option.title}</strong><span className="mx-auto mt-2 block max-w-[210px] text-xs leading-5 text-[var(--cm-text-secondary)]">{option.description}</span></button>)}</div></div><footer className="mt-7 flex items-center justify-between border-t border-[var(--cm-border)] px-7 py-4"><button onClick={onBack} className="cm-button-secondary px-4 py-2 text-sm">← Volver</button><button onClick={() => onSelect(selected)} className="cm-button-primary px-4 py-2.5 text-sm">Continuar <ChevronRight className="h-4 w-4" /></button></footer></div></div>;
};

export default function App() {
  return (
    <AppProvider>
      <AuthenticatedApplication />
    </AppProvider>
  );
}

const AuthenticatedApplication: React.FC = () => {
  const { isAuthReady, isAuthenticated } = useApp();
  if (!isAuthReady) return <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center text-sm text-[#667085]">Cargando plataforma…</div>;
  return isAuthenticated ? <MainLayout /> : <LoginScreen />;
};
