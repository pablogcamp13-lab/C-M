import React, { useState } from 'react';
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
import { Evaluation, Advisor } from './types';
import { LoginScreen } from './components/auth/LoginScreen';
import { ForcePasswordChange } from './components/auth/ForcePasswordChange';
import { ChevronRight, ShieldCheck, TrendingUp, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { currentSection, setCurrentSection, evaluations, advisors, currentUser } = useApp();

  // Modals state
  const [isNewEvalModalOpen, setIsNewEvalModalOpen] = useState(false);
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
          {currentSection === 'home' && (currentUser.role === 'ASESOR' ? <AdvisorHomeView /> : currentUser.role === 'SUPERVISOR' ? <SupervisorHomeView /> : <HomeView />)}
          
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

          {currentSection === 'reports' && (
            <ReportsExportView />
          )}

          {currentSection === 'admin' && (
            <AdminSettingsView />
          )}

        </main>

      </div>{currentUser.mustChangePassword && <ForcePasswordChange />}

      {/* Global Modals */}
      {isNewEvalModalOpen && (
        newEvaluationModule === null ? <EvaluationModulePicker onSelect={setNewEvaluationModule} onClose={() => setIsNewEvalModalOpen(false)} /> : newEvaluationModule === 'QUALITY' ? <QualityEvaluationModal onClose={() => { setIsNewEvalModalOpen(false); setNewEvaluationModule(null); }} onSuccess={(evaluation) => setSelectedEvaluationForDetail(evaluation)} /> : <NewEvaluationModal
          onClose={() => {
            setIsNewEvalModalOpen(false);
            setNewEvaluationModule(null);
            setPreselectedAdvisorForEval(null);
          }}
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
          onOpenActionPlan={(ev) => {
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

const EvaluationModulePicker: React.FC<{ onSelect: (module: 'QUALITY' | 'D3C') => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const [selected, setSelected] = useState<'QUALITY' | 'D3C'>('QUALITY');
  const options = [{ id: 'QUALITY' as const, title: 'Calidad', description: 'Migraciones Bitel · cumplimiento y estándar', icon: <ShieldCheck className="h-9 w-9" /> }, { id: 'D3C' as const, title: 'Mejora Continua D+3C', description: 'Diagnóstico comercial y plan de mejora', icon: <TrendingUp className="h-9 w-9" /> }];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A2E]/40 p-4 backdrop-blur-[2px]"><div role="dialog" aria-modal="true" className="w-full max-w-[640px] overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between px-7 pb-5 pt-6"><div><h2 className="text-xl font-bold text-[#102A2E]">Nueva evaluación</h2><p className="mt-1 text-sm text-[#66767A]">Selecciona el tipo de evaluación que deseas realizar</p></div><button onClick={onClose} className="rounded-lg p-1 text-[#66767A] hover:bg-[#F0F7F7]" aria-label="Cerrar"><X className="h-5 w-5" /></button></div><div className="px-7"><p className="text-xs font-bold text-[#43565A]">Tipo de evaluación</p><div className="mt-3 grid gap-4 sm:grid-cols-2">{options.map(option => <button key={option.id} onClick={() => setSelected(option.id)} className={`relative min-h-[220px] rounded-xl border p-5 text-center transition-all ${selected === option.id ? 'border-[#00B8B0] bg-[#F5FCFC] shadow-[0_0_0_1px_#00B8B0]' : 'border-[#E2E9E9] bg-white hover:border-[#9CCFCD]'}`}><span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${selected === option.id ? 'bg-[#E3F6F5] text-[#006B6B]' : 'bg-[#F3F5F5] text-[#008B88]'}`}>{option.icon}</span>{selected === option.id && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#00A9A3] text-sm font-bold text-white">✓</span>}<strong className="mt-4 block text-[15px] text-[#102A2E]">{option.title}</strong><span className="mx-auto mt-2 block max-w-[210px] text-xs leading-5 text-[#66767A]">{option.description}</span></button>)}</div></div><footer className="mt-7 flex items-center justify-between border-t border-[#E2E9E9] px-7 py-4"><button onClick={onClose} className="text-sm font-medium text-[#66767A] hover:text-[#102A2E]">Cancelar</button><button onClick={() => onSelect(selected)} className="inline-flex items-center gap-2 rounded-lg bg-[#008B88] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#006B6B]">Continuar <ChevronRight className="h-4 w-4" /></button></footer></div></div>;
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
