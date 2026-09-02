import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Intervention, 
  InterventionType, 
  DimensionId, 
  Advisor, 
  Evaluation, 
  AdvisorIntervention 
} from '../../types';
import { FiltersBar } from '../common/FiltersBar';
import { CRITERIA_DEFINITIONS } from '../../data/criteriaData';
import { calculatePareto } from '../../utils/calculations';
import { 
  BookOpen, 
  PlusCircle, 
  UserCheck, 
  Clock, 
  CheckCircle2, 
  Users, 
  User, 
  X, 
  Save, 
  Search, 
  Target, 
  Sparkles, 
  FileText, 
  TrendingDown, 
  Check, 
  Trash2, 
  Calendar, 
  Award, 
  ChevronRight, 
  AlertCircle, 
  Layers,
  Filter
} from 'lucide-react';

export const InterventionsCatalog: React.FC = () => {
  const { 
    interventions, 
    advisorInterventions, 
    advisors, 
    evaluations, 
    users, 
    currentUser,
    addIntervention, 
    assignIntervention, 
    assignBatchInterventions, 
    updateAdvisorIntervention,
    deleteAdvisorIntervention 
  } = useApp();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'tracking' | 'catalog'>('tracking');

  // Filter state for catalog & tracking
  const [selectedDimension, setSelectedDimension] = useState<'ALL' | DimensionId>('ALL');
  const [selectedType, setSelectedType] = useState<string>('');
  const [trackingModalidadFilter, setTrackingModalidadFilter] = useState<'ALL' | 'INDIVIDUAL' | 'GRUPAL'>('ALL');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<string>('ALL');
  const [trackingSearch, setTrackingSearch] = useState<string>('');

  // Main Modal State: Nueva Intervención
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalidad, setModalidad] = useState<'INDIVIDUAL' | 'GRUPAL'>('INDIVIDUAL');

  // Individual Form State
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string>('');

  // Grupal Form State
  const [selectedParetoCriterionId, setSelectedParetoCriterionId] = useState<string>('rebatimiento_objeciones');
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState<string[]>([]);
  const [advisorSearchQuery, setAdvisorSearchQuery] = useState<string>('');

  const facilitators = useMemo(() => users.filter(u => u.role !== 'ASESOR'), [users]);

  // Common Intervention Details
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customDimension, setCustomDimension] = useState<DimensionId>('CONVERTIR');
  const [customType, setCustomType] = useState<InterventionType>('MICROENTRENAMIENTO');
  const [customDuration, setCustomDuration] = useState<string>('20 minutos');
  const [scheduledDate, setScheduledDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [responsibleId, setResponsibleId] = useState<string>(() => {
    if (currentUser && currentUser.role !== 'ASESOR') return currentUser.id;
    return users.find(u => u.role !== 'ASESOR')?.id || currentUser?.id || users[0]?.id || '';
  });
  const [notes, setNotes] = useState<string>('');
  const [materials, setMaterials] = useState<string>('Guía de objeciones y audio modelo');
  const [expectedOutcome, setExpectedOutcome] = useState<string>('Mejora en fluidez y cierre efectivo');

  // Detail / View Modal for an assignment
  const [viewingAssignment, setViewingAssignment] = useState<AdvisorIntervention | null>(null);

  // Status edit modal
  const [editingStatusAssignment, setEditingStatusAssignment] = useState<AdvisorIntervention | null>(null);
  const [newStatus, setNewStatus] = useState<string>('COMPLETADA');
  const [resultNotes, setResultNotes] = useState<string>('');

  // Pareto items calculation for Grupal selection
  const paretoGaps = calculatePareto(evaluations, 'ALL', 'ALL', advisors);

  // Filtered interventions for Catalog tab
  const filteredInterventions = interventions.filter(i => {
    if (selectedDimension !== 'ALL' && i.dimension !== selectedDimension) return false;
    if (selectedType && i.type !== selectedType) return false;
    return true;
  });

  // Filtered tracking list
  const filteredTracking = advisorInterventions.filter(ai => {
    // If logged in as ASESOR, only show their own
    if (currentUser.role === 'ASESOR' && currentUser.advisorId) {
      const isRecipient = ai.advisorId === currentUser.advisorId || (ai.advisorIds && ai.advisorIds.includes(currentUser.advisorId));
      if (!isRecipient) return false;
    }

    if (trackingModalidadFilter !== 'ALL') {
      const isGrupal = ai.targetType === 'GRUPAL' || (ai.advisorIds && ai.advisorIds.length > 1);
      if (trackingModalidadFilter === 'GRUPAL' && !isGrupal) return false;
      if (trackingModalidadFilter === 'INDIVIDUAL' && isGrupal) return false;
    }

    if (trackingStatusFilter !== 'ALL') {
      if (ai.status !== trackingStatusFilter) return false;
    }

    if (trackingSearch.trim()) {
      const q = trackingSearch.toLowerCase();
      const adv = advisors.find(a => a.id === ai.advisorId);
      const advName = adv ? adv.name.toLowerCase() : '';
      const title = (ai.title || '').toLowerCase();
      const pareto = (ai.paretoTargetName || '').toLowerCase();
      const matches = advName.includes(q) || title.includes(q) || pareto.includes(q);
      if (!matches) return false;
    }

    return true;
  });

  // Open modal with template
  const handleOpenModalWithTemplate = (template?: Intervention) => {
    if (template) {
      setSelectedTemplateId(template.id);
      setCustomTitle(template.name || template.title || '');
      setCustomDimension(template.dimension);
      setCustomType(template.type || 'MICROENTRENAMIENTO');
      setCustomDuration(template.duration || `${template.durationMins || 20} minutos`);
      setExpectedOutcome(template.expectedOutcome || '');
      setMaterials(template.materials || '');
    } else {
      setSelectedTemplateId('');
      setCustomTitle('');
      setCustomDimension('CONVERTIR');
      setCustomType('MICROENTRENAMIENTO');
      setCustomDuration('20 minutos');
      setExpectedOutcome('Cierre de brecha 3C y mejora en desempeño comercial');
      setMaterials('Guía práctica de refuerzo');
    }

    // Default advisor selection
    if (advisors.length > 0) {
      setSelectedAdvisorId(advisors[0].id);
      const advEvals = evaluations.filter(e => e.advisorId === advisors[0].id);
      if (advEvals.length > 0) {
        setSelectedEvaluationId(advEvals[0].id);
      } else {
        setSelectedEvaluationId('');
      }
      setSelectedAdvisorIds([advisors[0].id]);
    } else {
      setSelectedAdvisorId('');
      setSelectedEvaluationId('');
      setSelectedAdvisorIds([]);
    }

    setNotes('');
    setIsModalOpen(true);
  };

  // When selected advisor changes in individual mode
  const handleAdvisorChange = (advId: string) => {
    setSelectedAdvisorId(advId);
    const advEvals = evaluations.filter(e => e.advisorId === advId);
    if (advEvals.length > 0) {
      setSelectedEvaluationId(advEvals[0].id);
      // Auto-set dimension based on evaluation primary gap
      const ev = advEvals[0];
      if (ev.primaryGap.includes('CONECTAR')) setCustomDimension('CONECTAR');
      else if (ev.primaryGap.includes('CLARIFICAR')) setCustomDimension('CLARIFICAR');
      else if (ev.primaryGap.includes('CONVERTIR')) setCustomDimension('CONVERTIR');
    } else {
      setSelectedEvaluationId('');
    }
  };

  // When selected evaluation changes in individual mode
  const handleEvaluationChange = (evalId: string) => {
    setSelectedEvaluationId(evalId);
    const ev = evaluations.find(e => e.id === evalId);
    if (ev) {
      if (ev.primaryGap.includes('CONECTAR')) setCustomDimension('CONECTAR');
      else if (ev.primaryGap.includes('CLARIFICAR')) setCustomDimension('CLARIFICAR');
      else if (ev.primaryGap.includes('CONVERTIR')) setCustomDimension('CONVERTIR');

      if (!customTitle) {
        setCustomTitle(`Refuerzo Individual 3C: ${ev.primaryGap.split('(')[0].trim()}`);
      }
    }
  };

  // When Pareto criterion changes in grupal mode
  const handleParetoChange = (criterionId: string) => {
    setSelectedParetoCriterionId(criterionId);
    const crit = CRITERIA_DEFINITIONS.find(c => c.id === criterionId);
    if (crit) {
      setCustomDimension(crit.dimensionId);
      if (!customTitle || customTitle.startsWith('Taller Grupal')) {
        setCustomTitle(`Taller Grupal: ${crit.name} (Atacando Pareto 3C)`);
      }
    }
  };

  // Toggle advisor checkbox in grupal mode
  const toggleAdvisorSelection = (advId: string) => {
    setSelectedAdvisorIds(prev => 
      prev.includes(advId) ? prev.filter(id => id !== advId) : [...prev, advId]
    );
  };

  const handleSelectAllAdvisors = () => {
    if (selectedAdvisorIds.length === advisors.length) {
      setSelectedAdvisorIds([]);
    } else {
      setSelectedAdvisorIds(advisors.map(a => a.id));
    }
  };

  // Submit modal
  const handleSaveIntervention = (e: React.FormEvent) => {
    e.preventDefault();

    const titleToUse = customTitle.trim() || (modalidad === 'INDIVIDUAL' ? 'Refuerzo Individual 3C' : 'Taller Grupal Pareto 3C');
    const responsibleUser = users.find(u => u.id === responsibleId) || currentUser;

    if (modalidad === 'INDIVIDUAL') {
      if (!selectedAdvisorId) {
        alert('Por favor selecciona un asesor.');
        return;
      }

      const linkedEval = evaluations.find(e => e.id === selectedEvaluationId);
      const selectedAdvisor = advisors.find(a => a.id === selectedAdvisorId);

      assignIntervention({
        targetType: 'INDIVIDUAL',
        advisorId: selectedAdvisorId,
        advisorIds: [selectedAdvisorId],
        interventionId: selectedTemplateId || `custom_${Date.now()}`,
        title: titleToUse,
        dimension: customDimension,
        type: customType,
        duration: customDuration,
        materials,
        expectedOutcome,
        description: notes || `Intervención individual asignada a ${selectedAdvisor?.name || 'asesor'}.`,
        
        // Linked evaluation details
        evaluationId: linkedEval?.id,
        evaluationDate: linkedEval?.date,
        evaluationScore: linkedEval?.scoreTotal,
        evaluationGap: linkedEval?.primaryGap,
        evaluationCallId: linkedEval?.callId || linkedEval?.recordingCode,
        
        assignedBy: responsibleUser.id,
        assignedByName: responsibleUser.name,
        scheduledDate: scheduledDate || new Date().toISOString().split('T')[0],
        status: 'PROGRAMADA',
        resultNotes: ''
      });

    } else {
      // GRUPAL MODE
      if (selectedAdvisorIds.length === 0) {
        alert('Por favor selecciona al menos un asesor participante para la intervención grupal.');
        return;
      }

      const paretoCrit = CRITERIA_DEFINITIONS.find(c => c.id === selectedParetoCriterionId);
      const paretoName = paretoCrit ? `${paretoCrit.shortName}: ${paretoCrit.name}` : selectedParetoCriterionId;

      // Create a master grupal record + individual references for each participating advisor
      const batchList: Omit<AdvisorIntervention, 'id' | 'assignedDate'>[] = selectedAdvisorIds.map(advId => ({
        targetType: 'GRUPAL',
        advisorId: advId,
        advisorIds: selectedAdvisorIds,
        interventionId: selectedTemplateId || `custom_${Date.now()}`,
        title: titleToUse,
        dimension: customDimension,
        type: customType,
        duration: customDuration,
        materials,
        expectedOutcome,
        description: notes || `Taller grupal focalizado en brecha Pareto: ${paretoName}`,
        
        // Pareto details
        paretoTargetCriterionId: selectedParetoCriterionId,
        paretoTargetName: paretoName,
        paretoReason: `Afecta a múltiples asesores en la matriz Pareto 3C`,
        
        assignedBy: responsibleUser.id,
        assignedByName: responsibleUser.name,
        scheduledDate: scheduledDate || new Date().toISOString().split('T')[0],
        status: 'PROGRAMADA',
        resultNotes: ''
      }));

      assignBatchInterventions(batchList);
    }

    setIsModalOpen(false);
  };

  // Update status handler
  const handleConfirmStatusUpdate = () => {
    if (!editingStatusAssignment) return;
    updateAdvisorIntervention(editingStatusAssignment.id, {
      status: newStatus as any,
      completionDate: newStatus === 'COMPLETADA' ? new Date().toISOString().split('T')[0] : undefined,
      resultNotes: resultNotes || editingStatusAssignment.resultNotes
    });
    setEditingStatusAssignment(null);
  };

  // Group grupal interventions for cleaner display if desired or show per advisor
  const selectedAdvisor = advisors.find(a => a.id === selectedAdvisorId);
  const selectedAdvisorEvals = evaluations.filter(e => e.advisorId === selectedAdvisorId);

  return (
    <div className="cm-workspace cm-interventions flex-1 overflow-y-auto bg-[#F7F8FA] text-[#031E3C]">
      
      {/* Global Filters Bar */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E5E8EC] rounded-xl p-5 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center font-bold">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#031E3C] tracking-tight font-heading">
                  Gestión & Catálogo de Intervenciones Formativas 3C
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Asignación formativa individual con evaluación vinculada o grupal atacando causas raíz Pareto.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleOpenModalWithTemplate()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6B00] hover:bg-[#e05e00] text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nueva Intervención</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation: Registro & Seguimiento vs Catálogo de Fichas */}
        <div className="flex items-center justify-between border-b border-[#E5E8EC] bg-white rounded-t-xl px-4 pt-3">
          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('tracking')}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'tracking' 
                  ? 'border-[#FF6B00] text-[#031E3C] font-bold' 
                  : 'border-transparent text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Seguimiento de Asignaciones ({advisorInterventions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'catalog' 
                  ? 'border-[#FF6B00] text-[#031E3C] font-bold' 
                  : 'border-transparent text-[#667085] hover:text-[#031E3C]'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Biblioteca de Fichas 3C ({interventions.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: REGISTRO & SEGUIMIENTO */}
        {activeTab === 'tracking' && (
          <div className="space-y-4">
            
            {/* Tracking Filters Bar */}
            <div className="bg-white border border-[#E5E8EC] rounded-xl p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              
              {/* Search input */}
              <div className="flex items-center bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-[#98A2B3] mr-2 shrink-0" />
                <input
                  type="text"
                  value={trackingSearch}
                  onChange={(e) => setTrackingSearch(e.target.value)}
                  placeholder="Buscar por asesor, tema, pareto..."
                  className="bg-transparent text-xs text-[#031E3C] focus:outline-none w-full placeholder:text-[#98A2B3]"
                />
              </div>

              {/* Modalidad Filter Pills */}
              <div className="flex items-center gap-2">
                <span className="text-[#667085] font-medium hidden sm:inline">Modalidad:</span>
                <div className="flex items-center bg-[#F7F8FA] p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setTrackingModalidadFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${trackingModalidadFilter === 'ALL' ? 'bg-white text-[#031E3C] shadow-2xs' : 'text-[#667085]'}`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setTrackingModalidadFilter('INDIVIDUAL')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${trackingModalidadFilter === 'INDIVIDUAL' ? 'bg-white text-[#031E3C] shadow-2xs' : 'text-[#667085]'}`}
                  >
                    <User className="w-3 h-3 text-sky-600" />
                    <span>Individuales</span>
                  </button>
                  <button
                    onClick={() => setTrackingModalidadFilter('GRUPAL')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${trackingModalidadFilter === 'GRUPAL' ? 'bg-white text-[#031E3C] shadow-2xs' : 'text-[#667085]'}`}
                  >
                    <Users className="w-3 h-3 text-[#FF6B00]" />
                    <span>Grupales (Pareto)</span>
                  </button>
                </div>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[#667085] font-medium">Estado:</span>
                <select
                  value={trackingStatusFilter}
                  onChange={(e) => setTrackingStatusFilter(e.target.value)}
                  className="bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 text-xs text-[#031E3C] focus:outline-none font-medium"
                >
                  <option value="ALL">Todos los Estados</option>
                  <option value="PROGRAMADA">Programadas</option>
                  <option value="EN_PROGRESO">En Progreso</option>
                  <option value="COMPLETADA">Completadas</option>
                </select>
              </div>

            </div>

            {/* Tracking Table Card */}
            <div className="bg-white border border-[#E5E8EC] rounded-xl shadow-2xs overflow-hidden">
              {filteredTracking.length === 0 ? (
                <div className="p-12 text-center text-[#667085] space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-[#98A2B3]">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm text-[#031E3C]">No hay intervenciones registradas con estos filtros</h3>
                  <p className="text-xs max-w-md mx-auto text-[#667085]">
                    Crea una nueva intervención seleccionando un asesor (con su evaluación vinculada) o múltiples asesores para atacar una brecha Pareto.
                  </p>
                  <button
                    onClick={() => handleOpenModalWithTemplate()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FF6B00] text-white rounded-lg text-xs font-bold shadow-xs hover:bg-[#e05e00] transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Programar Primera Intervención</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#F7F8FA] text-[11px] font-bold text-[#667085] uppercase border-b border-[#E5E8EC]">
                      <tr>
                        <th className="py-3 px-4">Modalidad</th>
                        <th className="py-3 px-4">Tema & Formato</th>
                        <th className="py-3 px-4">Asesor(es) Destinatario(s)</th>
                        <th className="py-3 px-4">Vínculo Metodológico</th>
                        <th className="py-3 px-4">Fecha Programada</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E8EC]">
                      {filteredTracking.map(ai => {
                        const advisor = advisors.find(a => a.id === ai.advisorId);
                        const isGrupal = ai.targetType === 'GRUPAL' || (ai.advisorIds && ai.advisorIds.length > 1);
                        const groupCount = ai.advisorIds?.length || 1;

                        return (
                          <tr key={ai.id} className="hover:bg-[#F7F8FA]/60 transition-colors">
                            
                            {/* Modalidad */}
                            <td className="py-3 px-4">
                              {isGrupal ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                                  <Users className="w-3 h-3" />
                                  <span>Grupal ({groupCount})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                                  <User className="w-3 h-3" />
                                  <span>Individual</span>
                                </span>
                              )}
                            </td>

                            {/* Tema & Formato */}
                            <td className="py-3 px-4">
                              <p className="font-bold text-[#031E3C] leading-snug">{ai.title || 'Intervención 3C'}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#667085]">
                                <span className={`font-bold px-1.5 py-0.2 rounded ${
                                  ai.dimension === 'CONECTAR' ? 'bg-sky-50 text-sky-700' :
                                  ai.dimension === 'CLARIFICAR' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {ai.dimension || 'CONVERTIR'}
                                </span>
                                <span>·</span>
                                <span>{ai.type || 'Microentrenamiento'}</span>
                                {ai.duration && <span>({ai.duration})</span>}
                              </div>
                            </td>

                            {/* Asesor */}
                            <td className="py-3 px-4">
                              {isGrupal ? (
                                <div>
                                  <span className="font-semibold text-[#031E3C] block">{advisor?.name || 'Asesor'}</span>
                                  <span className="text-[10px] text-[#667085] block">
                                    Participante del grupo ({groupCount} asesores)
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-semibold text-[#031E3C] block">{advisor?.name || 'Asesor no asignado'}</span>
                                  <span className="text-[10px] text-[#667085] block">{advisor?.employeeCode || advisor?.dni}</span>
                                </div>
                              )}
                            </td>

                            {/* Vinculo metodologico */}
                            <td className="py-3 px-4">
                              {isGrupal ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                    <Target className="w-3 h-3" />
                                    <span>Pareto: {ai.paretoTargetName || ai.paretoTargetCriterionId || 'Causa Raíz Crítica'}</span>
                                  </span>
                                </div>
                              ) : ai.evaluationId ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                    <FileText className="w-3 h-3" />
                                    <span>Eval: {ai.evaluationDate || 'Asociada'} ({ai.evaluationScore ? `${ai.evaluationScore}%` : 'Registrada'})</span>
                                  </span>
                                  {ai.evaluationGap && (
                                    <p className="text-[10px] text-[#667085] truncate max-w-xs">
                                      Brecha: {ai.evaluationGap}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#98A2B3] italic">Diagnóstico directo</span>
                              )}
                            </td>

                            {/* Fecha */}
                            <td className="py-3 px-4 text-[#667085] text-xs font-medium">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-[#98A2B3]" />
                                <span>{ai.scheduledDate || ai.assignedDate}</span>
                              </div>
                            </td>

                            {/* Estado */}
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                ai.status === 'COMPLETADA' ? 'bg-emerald-100 text-emerald-800' :
                                ai.status === 'EN_PROGRESO' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {ai.status === 'COMPLETADA' && <Check className="w-3 h-3" />}
                                <span>{ai.status}</span>
                              </span>
                            </td>

                            {/* Acciones */}
                            <td className="py-3 px-4 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setEditingStatusAssignment(ai);
                                  setNewStatus(ai.status === 'COMPLETADA' ? 'PROGRAMADA' : 'COMPLETADA');
                                  setResultNotes(ai.resultNotes || '');
                                }}
                                className="text-[10px] font-bold px-2.5 py-1 rounded bg-[#F7F8FA] hover:bg-[#E5E8EC] text-[#031E3C] transition-colors"
                              >
                                {ai.status === 'COMPLETADA' ? 'Editar' : 'Completar'}
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm('¿Deseas eliminar este registro de intervención?')) {
                                    deleteAdvisorIntervention(ai.id);
                                  }
                                }}
                                className="text-[10px] p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: CATÁLOGO / BIBLIOTECA DE FICHAS 3C */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            
            {/* Catalog Sub-Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E5E8EC] rounded-xl p-3.5 shadow-2xs">
              
              {/* Dimension tabs */}
              <div className="flex items-center bg-[#F7F8FA] p-0.5 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setSelectedDimension('ALL')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${selectedDimension === 'ALL' ? 'bg-white text-[#031E3C] shadow-2xs font-bold' : 'text-[#667085]'}`}
                >
                  Todas ({interventions.length})
                </button>
                <button
                  onClick={() => setSelectedDimension('CONECTAR')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${selectedDimension === 'CONECTAR' ? 'bg-sky-600 text-white font-bold' : 'text-[#667085]'}`}
                >
                  Conectar (C1)
                </button>
                <button
                  onClick={() => setSelectedDimension('CLARIFICAR')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${selectedDimension === 'CLARIFICAR' ? 'bg-amber-600 text-white font-bold' : 'text-[#667085]'}`}
                >
                  Clarificar (C2)
                </button>
                <button
                  onClick={() => setSelectedDimension('CONVERTIR')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${selectedDimension === 'CONVERTIR' ? 'bg-emerald-600 text-white font-bold' : 'text-[#667085]'}`}
                >
                  Convertir (C3)
                </button>
              </div>

              {/* Format dropdown */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#667085] font-medium">Formato:</span>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="bg-[#F7F8FA] border border-[#E5E8EC] rounded-md px-2.5 py-1.5 text-xs text-[#031E3C] focus:outline-none font-medium"
                >
                  <option value="">Todos los Formatos</option>
                  <option value="MICROENTRENAMIENTO">Microentrenamiento (15-20m)</option>
                  <option value="TALLER">Taller Grupal (45-60m)</option>
                  <option value="ROLE_PLAY">Role Play (30m)</option>
                  <option value="ESCUCHA_GUIADA">Escucha Guiada (20m)</option>
                  <option value="FEEDBACK_1A1">Feedback 1 a 1 (15m)</option>
                  <option value="CLINICA_CIERRE">Clínica de Cierre (45m)</option>
                </select>
              </div>

            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInterventions.map(item => {
                const totalAssigned = advisorInterventions.filter(ai => ai.interventionId === item.id).length;

                return (
                  <div 
                    key={item.id}
                    className="bg-white border border-[#E5E8EC] rounded-xl p-4 shadow-2xs flex flex-col justify-between hover:border-[#FF6B00]/40 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          item.dimension === 'CONECTAR' ? 'bg-sky-100 text-sky-800' :
                          item.dimension === 'CLARIFICAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {item.dimension}
                        </span>
                        <span className="text-[10px] font-semibold text-[#667085] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.duration || `${item.durationMins || 20} min`}
                        </span>
                      </div>

                      <h3 className="font-bold text-xs text-[#031E3C] leading-snug">
                        {item.name || item.title}
                      </h3>

                      <p className="text-[#667085] text-[11px] mt-1.5 leading-relaxed">
                        {item.description}
                      </p>

                      <div className="bg-[#F7F8FA] rounded-lg p-2.5 mt-3 border border-[#E5E8EC] text-[11px] space-y-1">
                        <div>
                          <span className="font-bold text-[#667085] block text-[10px] uppercase">Resultado Esperado:</span>
                          <span className="text-[#031E3C] font-medium">{item.expectedOutcome}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#E5E8EC] flex items-center justify-between">
                      <span className="text-[10px] text-[#667085] font-medium">
                        {totalAssigned} ejecuciones
                      </span>

                      <button
                        onClick={() => handleOpenModalWithTemplate(item)}
                        className="px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e05e00] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Programar Ficha</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL PRINCIPAL: NUEVA INTERVENCIÓN (INDIVIDUAL O GRUPAL)                  */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#031E3C]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="cm-modal max-w-2xl w-full p-6 my-8 animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E5E8EC] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#031E3C]">Programar Nueva Intervención 3C</h3>
                  <p className="text-[11px] text-[#667085]">Define si la intervención es individual (con evaluación) o grupal (con Pareto).</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-[#98A2B3] hover:text-[#031E3C] p-1 rounded-lg hover:bg-[#F7F8FA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIntervention} className="space-y-4 text-xs">
              
              {/* PASO 1: SELECCIONAR MODALIDAD (INDIVIDUAL vs GRUPAL) */}
              <div className="bg-[#F7F8FA] p-3.5 rounded-xl border border-[#E5E8EC] space-y-2">
                <label className="block font-bold text-[#031E3C] text-xs">
                  1. Modalidad de la Intervención *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Option: Individual */}
                  <button
                    type="button"
                    onClick={() => setModalidad('INDIVIDUAL')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      modalidad === 'INDIVIDUAL'
                        ? 'bg-white border-[#FF6B00] ring-1 ring-[#FF6B00] shadow-xs'
                        : 'bg-white/60 border-[#E5E8EC] hover:bg-white text-[#667085]'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${modalidad === 'INDIVIDUAL' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'}`}>
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-[#031E3C]">Individual (1 Asesor)</p>
                      <p className="text-[10px] text-[#667085] mt-0.5">Asociada directamente a una evaluación registrada.</p>
                    </div>
                  </button>

                  {/* Option: Grupal */}
                  <button
                    type="button"
                    onClick={() => setModalidad('GRUPAL')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      modalidad === 'GRUPAL'
                        ? 'bg-white border-[#FF6B00] ring-1 ring-[#FF6B00] shadow-xs'
                        : 'bg-white/60 border-[#E5E8EC] hover:bg-white text-[#667085]'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${modalidad === 'GRUPAL' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-[#031E3C]">Grupal (Múltiples Asesores)</p>
                      <p className="text-[10px] text-[#667085] mt-0.5">Focalizada en una brecha o causa raíz de Pareto 3C.</p>
                    </div>
                  </button>

                </div>
              </div>

              {/* PASO 2A: SI ES INDIVIDUAL -> ESCOGER ASESOR Y EVALUACIÓN ASOCIADA */}
              {modalidad === 'INDIVIDUAL' && (
                <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center gap-1.5 text-sky-900 font-bold text-xs">
                    <User className="w-4 h-4 text-sky-700" />
                    <span>Selección de Asesor y Evaluación Asociada</span>
                  </div>

                  {advisors.length === 0 ? (
                    <div className="bg-white p-3 rounded-lg border border-sky-200 text-center space-y-1">
                      <AlertCircle className="w-5 h-5 text-amber-500 mx-auto" />
                      <p className="font-bold text-xs text-[#031E3C]">No hay asesores registrados en la plataforma</p>
                      <p className="text-[11px] text-[#667085]">Primero debes agregar asesores en el Directorio o en Evaluaciones.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      
                      {/* Advisor selector */}
                      <div>
                        <label className="block font-semibold text-[#031E3C] mb-1">
                          Asesor Destinatario *
                        </label>
                        <select
                          value={selectedAdvisorId}
                          onChange={(e) => handleAdvisorChange(e.target.value)}
                          className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium text-[#031E3C]"
                        >
                          {advisors.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.employeeCode || a.dni})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Evaluation selector */}
                      <div>
                        <label className="block font-semibold text-[#031E3C] mb-1">
                          Evaluación Asociada *
                        </label>
                        {selectedAdvisorEvals.length === 0 ? (
                          <div className="bg-white border border-dashed border-amber-300 rounded-lg p-2 text-[11px] text-amber-800">
                            Sin evaluaciones previas. Se registrará como intervención directa de diagnóstico.
                          </div>
                        ) : (
                          <select
                            value={selectedEvaluationId}
                            onChange={(e) => handleEvaluationChange(e.target.value)}
                            className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium text-[#031E3C]"
                          >
                            {selectedAdvisorEvals.map(ev => (
                              <option key={ev.id} value={ev.id}>
                                {ev.date} · Score: {ev.scoreTotal}% · {ev.primaryGap.split('(')[0]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                    </div>
                  )}

                  {/* Summary of chosen evaluation */}
                  {selectedEvaluationId && (
                    (() => {
                      const ev = evaluations.find(e => e.id === selectedEvaluationId);
                      if (!ev) return null;
                      return (
                        <div className="bg-white rounded-lg p-2.5 border border-sky-200 text-[11px] flex items-center justify-between">
                          <div>
                            <span className="font-bold text-[#031E3C]">Llamada Ref: {ev.callId || ev.recordingCode}</span>
                            <span className="text-[#667085] block">Brecha Crítica: <strong className="text-rose-700">{ev.primaryGap}</strong></span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-xs text-[#031E3C]">{ev.scoreTotal}% 3C</span>
                            <span className="text-[10px] text-[#667085] block">Fecha: {ev.date}</span>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* PASO 2B: SI ES GRUPAL -> ESCOGER EL PARETO A ATACAR Y SELECCIONAR ASESORES */}
              {modalidad === 'GRUPAL' && (
                <div className="bg-orange-50/50 border border-orange-200 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-orange-900 font-bold text-xs">
                      <Target className="w-4 h-4 text-orange-700" />
                      <span>Selección de Pareto a Atacar y Asesores Participantes</span>
                    </div>
                  </div>

                  {/* Pareto criterion selector */}
                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">
                      Causa Raíz / Brecha Pareto a Atacar *
                    </label>
                    <select
                      value={selectedParetoCriterionId}
                      onChange={(e) => handleParetoChange(e.target.value)}
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-semibold text-[#031E3C]"
                    >
                      {CRITERIA_DEFINITIONS.map(crit => {
                        const paretoItem = paretoGaps.find(p => p.criterionId === crit.id);
                        const isPareto80 = paretoItem ? paretoItem.isPareto80 : false;
                        const freq = paretoItem ? paretoItem.frequency : 0;
                        return (
                          <option key={crit.id} value={crit.id}>
                            [{crit.dimensionId}] {crit.order}. {crit.name} {isPareto80 ? `★ (Pareto 80% - ${freq} fallas)` : `(${freq} fallas)`}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Advisors Multi-selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-semibold text-[#031E3C]">
                        Seleccionar Asesores Convocados ({selectedAdvisorIds.length} de {advisors.length}) *
                      </label>
                      <button
                        type="button"
                        onClick={handleSelectAllAdvisors}
                        className="text-[11px] font-bold text-[#FF6B00] hover:underline cursor-pointer"
                      >
                        {selectedAdvisorIds.length === advisors.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                      </button>
                    </div>

                    {/* Advisor Search inside modal */}
                    <div className="flex items-center bg-white border border-[#E5E8EC] rounded-lg px-2 py-1 mb-2">
                      <Search className="w-3.5 h-3.5 text-[#98A2B3] mr-1.5 shrink-0" />
                      <input
                        type="text"
                        value={advisorSearchQuery}
                        onChange={(e) => setAdvisorSearchQuery(e.target.value)}
                        placeholder="Filtrar asesores..."
                        className="bg-transparent text-xs text-[#031E3C] focus:outline-none w-full"
                      />
                    </div>

                    {/* Checkbox grid */}
                    <div className="max-h-36 overflow-y-auto bg-white border border-[#E5E8EC] rounded-lg p-2 space-y-1">
                      {advisors
                        .filter(a => !advisorSearchQuery || a.name.toLowerCase().includes(advisorSearchQuery.toLowerCase()))
                        .map(adv => {
                          const isSelected = selectedAdvisorIds.includes(adv.id);
                          return (
                            <label
                              key={adv.id}
                              className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                                isSelected ? 'bg-orange-50 font-semibold text-[#031E3C]' : 'hover:bg-[#F7F8FA] text-[#667085]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleAdvisorSelection(adv.id)}
                                  className="w-3.5 h-3.5 text-[#FF6B00] rounded focus:ring-0 cursor-pointer"
                                />
                                <span>{adv.name}</span>
                              </div>
                              <span className="text-[10px] text-[#98A2B3]">{adv.employeeCode || adv.dni}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>

                </div>
              )}

              {/* PASO 3: DETALLES FORMATIVOS DE LA INTERVENCIÓN */}
              <div className="border-t border-[#E5E8EC] pt-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#031E3C] text-xs">2. Parámetros de la Actividad Formativa</span>
                  <span className="text-[10px] text-[#667085]">Personalizable o desde plantilla</span>
                </div>

                <div>
                  <label className="block font-semibold text-[#031E3C] mb-1">Título / Tema *</label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Ej: Clínica de Objeciones BiPay y Pregunta de Cierre"
                    className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">Dimensión 3C *</label>
                    <select
                      value={customDimension}
                      onChange={(e) => setCustomDimension(e.target.value as DimensionId)}
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                    >
                      <option value="CONECTAR">Conectar (C1)</option>
                      <option value="CLARIFICAR">Clarificar (C2)</option>
                      <option value="CONVERTIR">Convertir (C3)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">Formato *</label>
                    <select
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value as InterventionType)}
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                    >
                      <option value="MICROENTRENAMIENTO">Microentrenamiento</option>
                      <option value="TALLER">Taller Grupal</option>
                      <option value="ROLE_PLAY">Role Play</option>
                      <option value="ESCUCHA_GUIADA">Escucha Guiada</option>
                      <option value="FEEDBACK_1A1">Feedback 1 a 1</option>
                      <option value="CLINICA_CIERRE">Clínica de Cierre</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">Fecha Programada *</label>
                    <input
                      type="date"
                      required
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">Facilitador / Responsable *</label>
                    <select
                      value={responsibleId}
                      onChange={(e) => setResponsibleId(e.target.value)}
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                    >
                      {facilitators.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#031E3C] mb-1">Duración Estimada</label>
                    <input
                      type="text"
                      value={customDuration}
                      onChange={(e) => setCustomDuration(e.target.value)}
                      placeholder="20 minutos"
                      className="w-full bg-white border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF6B00] font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#031E3C] mb-1">Resultado Esperado / Dinámica</label>
                  <textarea
                    rows={2}
                    value={expectedOutcome}
                    onChange={(e) => setExpectedOutcome(e.target.value)}
                    placeholder="Detalla el objetivo concreto y qué comportamiento esperado se medirá en la reevaluación..."
                    className="w-full bg-white border border-[#E5E8EC] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E5E8EC]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#667085] hover:bg-[#F7F8FA] rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#FF6B00] hover:bg-[#e05e00] rounded-lg shadow-sm cursor-pointer transition-colors"
                >
                  Confirmar y Guardar Intervención
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE ACTUALIZACIÓN DE ESTADO & RESULTADOS                              */}
      {/* ========================================================================= */}
      {editingStatusAssignment && (
        <div className="fixed inset-0 z-50 bg-[#031E3C]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="cm-modal max-w-md w-full p-5">
            <h3 className="font-bold text-sm text-[#031E3C] mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Actualizar Estado de la Intervención</span>
            </h3>

            <p className="text-xs text-[#667085] mb-3">
              {editingStatusAssignment.title}
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Estado de Ejecución</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2 font-semibold"
                >
                  <option value="PROGRAMADA">PROGRAMADA</option>
                  <option value="EN_PROGRESO">EN PROGRESO</option>
                  <option value="COMPLETADA">COMPLETADA (Cumplida)</option>
                  <option value="CANCELADA">CANCELADA</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Notas del Resultado / Observaciones</label>
                <textarea
                  rows={3}
                  value={resultNotes}
                  onChange={(e) => setResultNotes(e.target.value)}
                  placeholder="Consigna los compromisos acordados, avance del asesor o evidencias del taller..."
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E8EC]">
                <button
                  type="button"
                  onClick={() => setEditingStatusAssignment(null)}
                  className="px-3.5 py-1.5 font-semibold text-[#667085] hover:bg-[#F7F8FA] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStatusUpdate}
                  className="px-4 py-1.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  Guardar Estado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
