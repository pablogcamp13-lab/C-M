import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { KpiCards } from './KpiCards';
import { ParetoWidget } from './ParetoWidget';
import { ProgressionLadder } from './ProgressionLadder';
import { EvolutionLineChart } from './EvolutionLineChart';
import { TopGapsAndPriorities } from './TopGapsAndPriorities';
import { HeatmapWidget } from './HeatmapWidget';
import { BiPayDeepDiveWidget } from './BiPayDeepDiveWidget';
import { OperationalDashboardWidget } from './OperationalDashboardWidget';
import { FiltersBar } from '../common/FiltersBar';
import { 
  BarChart2, 
  Smartphone, 
  Grid3X3, 
  ChevronRight,
  TrendingUp,
  Sparkles,
  Gauge
} from 'lucide-react';

interface DashboardViewProps {
  onSelectAdvisor?: (advisorId: string) => void;
  onNavigateTab?: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onSelectAdvisor, onNavigateTab }) => {
  const [activeSecondaryView, setActiveSecondaryView] = useState<'main' | 'operational' | 'bipay' | 'heatmap'>('main');
  const { setFilters } = useApp();
  useEffect(() => { setFilters(previous => ({ ...previous, evaluationType: 'D3C' })); return () => setFilters(previous => previous.evaluationType === 'D3C' ? { ...previous, evaluationType: '' } : previous); }, [setFilters]);

  return (
    <div className="cm-workspace cm-dashboard-legacy flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F6F7F9]">
      
      {/* Global Filters with Progressive Disclosure */}
      <FiltersBar />

      <div className="w-full px-5 py-4 sm:px-7 sm:py-6 space-y-5">
        
        {/* Section 9 - Row 1: 5 Compact KPI Cards */}
        <section>
          <KpiCards />
        </section>

        {/* Simple Text Tabs with Tech Orange bottom underline */}
        <div className="flex items-center justify-between border-b border-[#E7E9ED] -mb-1">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveSecondaryView('main')}
              className={`text-xs font-semibold pb-2.5 transition-colors cursor-pointer relative ${
                activeSecondaryView === 'main'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <span>Vista ejecutiva</span>
              {activeSecondaryView === 'main' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1FD6FF] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveSecondaryView('operational')}
              className={`text-xs font-semibold pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer relative ${
                activeSecondaryView === 'operational'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Gauge className={`w-3.5 h-3.5 ${activeSecondaryView === 'operational' ? 'text-[#FF7A00]' : 'text-[#98A2B3]'}`} />
              <span>Impacto Operacional (Nivel 2)</span>
              {activeSecondaryView === 'operational' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1FD6FF] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveSecondaryView('bipay')}
              className={`text-xs font-semibold pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer relative ${
                activeSecondaryView === 'bipay'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Smartphone className={`w-3.5 h-3.5 ${activeSecondaryView === 'bipay' ? 'text-[#FF6B00]' : 'text-[#98A2B3]'}`} />
              <span>Foco BiPay</span>
              {activeSecondaryView === 'bipay' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1FD6FF] rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveSecondaryView('heatmap')}
              className={`text-xs font-semibold pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer relative ${
                activeSecondaryView === 'heatmap'
                  ? 'text-[#031E3C]'
                  : 'text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Grid3X3 className={`w-3.5 h-3.5 ${activeSecondaryView === 'heatmap' ? 'text-[#031E3C]' : 'text-[#98A2B3]'}`} />
              <span>Matriz 3C</span>
              {activeSecondaryView === 'heatmap' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1FD6FF] rounded-full" />
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#667085]">
            <span>Metodología 3C</span>
            <span className="text-[#98A2B3]">·</span>
            <span className="font-medium text-[#031E3C]">C&M Analytics</span>
          </div>
        </div>

        {/* View Mode: Main Dashboard */}
        {activeSecondaryView === 'main' && (
          <div className="space-y-5">
            
            {/* Section 9 - Row 2: Pareto de brechas (2/3) + Distribución 3C (1/3) */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <ParetoWidget onNavigateToPareto={() => onNavigateTab && onNavigateTab('pareto')} />
              </div>
              <div className="lg:col-span-1">
                <ProgressionLadder />
              </div>
            </section>

            {/* Section 9 - Row 3: Evolución 3C (Full Width) */}
            <section className="w-full">
              <EvolutionLineChart />
            </section>

            {/* Section 9 - Row 4: Operational Impact Level 2 Widget */}
            <section className="w-full">
              <OperationalDashboardWidget 
                onSelectAdvisor={onSelectAdvisor}
                onNavigateToImpact={() => onNavigateTab && onNavigateTab('impact')}
              />
            </section>

            {/* Section 9 - Row 5: Asesores Prioritarios (Compact Table) */}
            <section className="w-full">
              <TopGapsAndPriorities onSelectAdvisor={onSelectAdvisor} />
            </section>

          </div>
        )}

        {/* View Mode: Operational Deep Dive */}
        {activeSecondaryView === 'operational' && (
          <section className="animate-in fade-in duration-200">
            <OperationalDashboardWidget 
              onSelectAdvisor={onSelectAdvisor}
              onNavigateToImpact={() => onNavigateTab && onNavigateTab('impact')}
            />
          </section>
        )}

        {/* View Mode: BiPay Deep Dive */}
        {activeSecondaryView === 'bipay' && (
          <section className="animate-in fade-in duration-200">
            <BiPayDeepDiveWidget onSelectAdvisor={onSelectAdvisor} />
          </section>
        )}

        {/* View Mode: Heatmap 3C */}
        {activeSecondaryView === 'heatmap' && (
          <section className="animate-in fade-in duration-200">
            <HeatmapWidget onSelectAdvisor={onSelectAdvisor} />
          </section>
        )}

      </div>
    </div>
  );
};
