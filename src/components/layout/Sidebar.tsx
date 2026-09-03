import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { NavigationSection } from '../../types';
import { TechcenterLogo } from '../common/TechcenterLogo';
import { 
  LayoutDashboard, 
  ClipboardList, 
  BarChart3, 
  TrendingUp, 
  Users2, 
  ListTodo, 
  GraduationCap, 
  Layers, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Shield
} from 'lucide-react';

interface NavItem {
  id: NavigationSection;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const { currentSection, setCurrentSection, currentUser, evaluations, actionPlans, advisors } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Dynamic counts for notification badges
  const activePlansCount = actionPlans.filter(p => p.status === 'EN_CURSO' || p.status === 'PENDIENTE').length;

  const navGroups: { groupName: string; items: NavItem[] }[] = [
    {
      groupName: 'ANÁLISIS',
      items: [
        { id: 'dashboard', label: 'Dashboard MC', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'dashboard_quality', label: 'Dashboard Calidad', icon: <Shield className="w-4 h-4" /> },
        { id: 'evaluations', label: 'Evaluaciones', icon: <ClipboardList className="w-4 h-4" />, badge: evaluations.length },
        { id: 'pareto', label: 'Pareto 80/20', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'impact', label: 'Impacto', icon: <TrendingUp className="w-4 h-4" /> },
      ]
    },
    {
      groupName: 'GESTIÓN',
      items: [
        { id: 'advisors', label: 'Asesores', icon: <Users2 className="w-4 h-4" />, badge: advisors.length },
        { id: 'action_plans', label: 'PDA', icon: <ListTodo className="w-4 h-4" />, badge: activePlansCount },
        { id: 'interventions', label: 'Intervenciones', icon: <GraduationCap className="w-4 h-4" /> },
      ]
    },
    {
      groupName: 'SISTEMA',
      items: [
        { id: 'methodology', label: 'Metodología 3C', icon: <Layers className="w-4 h-4" /> },
        { id: 'admin', label: 'Configuración', icon: <Settings className="w-4 h-4" /> },
      ]
    }
  ];

  return (
    <aside 
      className={`h-screen bg-[#031E3C] text-white flex flex-col justify-between shrink-0 transition-all duration-300 z-30 border-r border-[#0B2B50] select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      
      {/* Top Brand Header */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#0B2B50]">
          <div className="flex items-center overflow-hidden">
            <TechcenterLogo variant="white" collapsed={isCollapsed} size="sm" />
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#0B2B50] rounded-md transition-colors"
            title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)]">
          {navGroups.map((group) => (
            <div key={group.groupName} className="space-y-1">
              
              {/* Section Header */}
              {!isCollapsed ? (
                <div className="px-3 py-1 text-[10px] font-bold text-[#667085] tracking-wider uppercase font-heading">
                  {group.groupName}
                </div>
              ) : (
                <div className="h-2 border-t border-[#0B2B50] my-1 mx-2" />
              )}

              {/* Items */}
              {group.items.map((item) => {
                const isActive = currentSection === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all relative group cursor-pointer ${
                      isActive 
                        ? 'bg-white/[0.06] text-white font-semibold' 
                        : 'text-white/75 hover:text-white hover:bg-white/[0.03]'
                    } ${isCollapsed ? 'justify-center px-0' : ''}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {/* Active Tech Orange 3px Vertical Left Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#FF6B00] rounded-r-sm" />
                    )}

                    <span className={`shrink-0 ${isActive ? 'text-[#FF6B00]' : 'text-[#98A2B3] group-hover:text-white/90'}`}>
                      {item.icon}
                    </span>

                    {!isCollapsed && (
                      <span className="truncate text-left flex-1">{item.label}</span>
                    )}

                    {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isActive ? 'bg-[#0B2B50] text-white border border-[#FF6B00]/30' : 'bg-[#0B2B50] text-[#98A2B3]'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

            </div>
          ))}
        </nav>
      </div>

      {/* User Compact Footer */}
      <div className="p-3 border-t border-[#0B2B50] bg-[#02172F]">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#0B2B50] text-[#FF6B00] border border-[#FF6B00]/30 flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {currentUser.name}
                </p>
                <p className="text-[10px] text-[#667085] truncate flex items-center gap-1 mt-0.5">
                  <Shield className="w-2.5 h-2.5 text-[#FF6B00]" />
                  {currentUser.role}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div 
              className="w-7 h-7 rounded-full bg-[#0B2B50] text-[#FF6B00] border border-[#FF6B00]/30 flex items-center justify-center font-bold text-xs"
              title={`${currentUser.name} (${currentUser.role})`}
            >
              {currentUser.name.charAt(0)}
            </div>
          </div>
        )}
      </div>

    </aside>
  );
};
