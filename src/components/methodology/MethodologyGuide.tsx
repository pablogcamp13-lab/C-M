import React, { useState } from 'react';
import { CRITERIA_DEFINITIONS, SCALE_LEVELS } from '../../data/criteriaData';
import { 
  Layers, 
  MessageSquare, 
  Lightbulb, 
  Target, 
  Smartphone, 
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const MethodologyGuide: React.FC = () => {
  const [selectedDimension, setSelectedDimension] = useState<'ALL' | 'CONECTAR' | 'CLARIFICAR' | 'CONVERTIR'>('ALL');
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({
    fluidez_verbal: true,
    traduccion_beneficio: true,
    cierre_comercial: true
  });

  const toggleCriteria = (id: string) => {
    setExpandedCriteria(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredCriteria = CRITERIA_DEFINITIONS.filter(c => 
    selectedDimension === 'ALL' ? true : c.dimensionId === selectedDimension
  );

  return (
    <div className="cm-workspace flex-1 overflow-y-auto bg-slate-100/70 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-sm">
        <div className="max-w-3xl">
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950/80 px-2.5 py-1 rounded-full border border-teal-800">
            Marco Teórico & Operativo
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-3 tracking-tight">
            Metodología 3C: Conectar · Clarificar · Convertir
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
            La consultoría identifica que el principal cuello de botella comercial no se origina únicamente en el cierre, sino en deficiencias de comunicación inicial (Conectar) y en explicaciones confusas de valor y productos (Clarificar).
          </p>
        </div>

        {/* 3 Pillars Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          
          <div className="bg-slate-800/80 rounded-xl p-4 border border-sky-500/30">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase mb-1">
              <MessageSquare className="w-4 h-4" />
              1. Conectar (30%)
            </div>
            <div className="text-sm font-bold text-white">Nivel 1: Comunicación</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fluidez verbal, modulación, escucha activa y seguridad. Construye confianza y receptividad.
            </p>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-4 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase mb-1">
              <Lightbulb className="w-4 h-4" />
              2. Clarificar (35%)
            </div>
            <div className="text-sm font-bold text-white">Nivel 2: Claridad & Beneficios</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Estructura de planes, explicación simple de BiPay y traducción de características a beneficios cotidianos.
            </p>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-4 border border-emerald-500/30">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase mb-1">
              <Target className="w-4 h-4" />
              3. Convertir (35%)
            </div>
            <div className="text-sm font-bold text-white">Nivel 3: Cierre Comercial</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Preguntas de control, manejo contundente de objeciones y búsqueda activa del cierre de la migración.
            </p>
          </div>

        </div>
      </div>

      {/* BiPay Feature-to-Benefit Translation Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Guía de Traducción BiPay: Característica → Beneficio
            </h3>
            <p className="text-xs text-slate-500">
              Estándar esperado en la evaluación para el criterio de traducción a beneficios
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
            <span className="font-bold text-rose-800 uppercase text-[11px] block mb-2">
              ❌ Explicación Confusa / Incorrecta (Nivel 1 o 2)
            </span>
            <ul className="space-y-2 text-rose-900 text-[11px]">
              <li>• <em>"Tiene que afiliarse a BiPay que es una billetera electrónica de Bitel para pagar."</em> (Genera miedo a cobros ocultos o complejidad bancaria).</li>
              <li>• <em>"El plan viene con BiPay incluido."</em> (El cliente no entiende qué es ni para qué le sirve).</li>
              <li>• <em>"Le descargo la app de BiPay y ahí ve sus gigas."</em> (Confunde billetera con app de autogestión de líneas).</li>
            </ul>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <span className="font-bold text-emerald-800 uppercase text-[11px] block mb-2">
              ✅ Explicación con Traducción a Beneficio (Nivel 3 o 4)
            </span>
            <ul className="space-y-2 text-emerald-900 text-[11px]">
              <li>• <em>"Para su total comodidad, recarga su plan desde su celular en 10 segundos sin salir de casa ni hacer colas en agentes, y además Bitel le regala 2 GB extra cada mes."</em></li>
              <li>• <em>"Usted ahorra tiempo y dinero: mantiene el control de su saldo directamente en su pantalla sin comisiones."</em></li>
            </ul>
          </div>

        </div>
      </div>

      {/* 9 Criteria Breakdown with Rubrics */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        
        {/* Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Rúbrica de los 9 Criterios Metodológicos
            </h3>
            <p className="text-xs text-slate-500">
              Criterios oficiales y descripciones de los 4 niveles de desempeño
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setSelectedDimension('ALL')}
              className={`px-3 py-1 rounded-lg transition-colors ${selectedDimension === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
            >
              Todos (9)
            </button>
            <button
              onClick={() => setSelectedDimension('CONECTAR')}
              className={`px-3 py-1 rounded-lg transition-colors ${selectedDimension === 'CONECTAR' ? 'bg-sky-600 text-white shadow-xs' : ''}`}
            >
              Conectar (3)
            </button>
            <button
              onClick={() => setSelectedDimension('CLARIFICAR')}
              className={`px-3 py-1 rounded-lg transition-colors ${selectedDimension === 'CLARIFICAR' ? 'bg-amber-600 text-white shadow-xs' : ''}`}
            >
              Clarificar (3)
            </button>
            <button
              onClick={() => setSelectedDimension('CONVERTIR')}
              className={`px-3 py-1 rounded-lg transition-colors ${selectedDimension === 'CONVERTIR' ? 'bg-emerald-600 text-white shadow-xs' : ''}`}
            >
              Convertir (3)
            </button>
          </div>
        </div>

        {/* Criteria Cards */}
        <div className="space-y-3">
          {filteredCriteria.map((c) => {
            const isExpanded = expandedCriteria[c.id];

            return (
              <div 
                key={c.id}
                className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div 
                  onClick={() => toggleCriteria(c.id)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                      {c.shortName}
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{c.name}</h4>
                      <p className="text-[11px] text-slate-500">{c.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      c.dimensionId === 'CONECTAR' ? 'bg-sky-100 text-sky-800' :
                      c.dimensionId === 'CLARIFICAR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {c.dimensionId}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    {SCALE_LEVELS.map(scale => (
                      <div key={scale.level} className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${scale.badgeClass}`}>
                            Nivel {scale.level} - {scale.label}
                          </span>
                          <span className="font-black text-slate-700 text-[11px]">{scale.percentage}%</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                          {scale.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
};
