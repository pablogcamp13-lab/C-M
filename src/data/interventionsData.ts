import { Intervention } from '../types';

export const INITIAL_INTERVENTIONS: Intervention[] = [
  // CONECTAR
  {
    id: 'int_1',
    name: 'Taller de Control de Muletillas y Fluidez 60s',
    dimension: 'CONECTAR',
    criterionId: 'fluidez_verbal',
    description: 'Entrenamiento práctico de respiración diafragmática, eliminación de palabras de relleno (ehh, este, o sea) y ejercicio de discurso estructurado en 60 segundos.',
    category: 'Control de muletillas',
    durationMins: 45,
    recommendedTrigger: 'Fluidez verbal ≤ 2',
    active: true
  },
  {
    id: 'int_2',
    name: 'Laboratorio de Modulación de Voz y Énfasis',
    dimension: 'CONECTAR',
    criterionId: 'manejo_voz',
    description: 'Práctica de curvas de entonación, control de ritmo, pausas intencionales para captar atención y eliminación de tonos monótonos/robóticos.',
    category: 'Modulación de voz',
    durationMins: 40,
    recommendedTrigger: 'Manejo de voz ≤ 2',
    active: true
  },
  {
    id: 'int_3',
    name: 'Bootcamp de Seguridad Verbal y Estructura',
    dimension: 'CONECTAR',
    criterionId: 'seguridad_comunicativa',
    description: 'Técnicas de pensamiento antes de hablar, ordenamiento de ideas en 3 puntos y eliminación de frases dubitativas (creo que, tal vez).',
    category: 'Seguridad verbal',
    durationMins: 30,
    recommendedTrigger: 'Seguridad comunicativa ≤ 2',
    active: true
  },

  // CLARIFICAR
  {
    id: 'int_4',
    name: 'Refuerzo de Parrilla de Planes y Tarifas',
    dimension: 'CLARIFICAR',
    criterionId: 'dominio_informacion',
    description: 'Actualización y evaluación rápida de conocimientos sobre paquetes de Gigas, minutos, apps ilimitadas y condiciones de portabilidad/migración.',
    category: 'Planes y Tarifas',
    durationMins: 30,
    recommendedTrigger: 'Dominio de información ≤ 2',
    active: true
  },
  {
    id: 'int_5',
    name: 'Microentrenamiento BiPay: Explicación en 30 Segundos',
    dimension: 'CLARIFICAR',
    criterionId: 'traduccion_beneficio',
    description: 'Roleplay intensivo para simplificar BiPay (billetera digital Bitel), transformando funciones técnicas en ahorro directo de tiempo y recargas seguras.',
    category: 'BiPay y Beneficios',
    durationMins: 40,
    recommendedTrigger: 'Brecha en BiPay o Traducción a beneficio ≤ 2',
    active: true
  },
  {
    id: 'int_6',
    name: 'Taller de Simplificación: Del Tecnicismo a la Claridad',
    dimension: 'CLARIFICAR',
    criterionId: 'simplificacion_mensaje',
    description: 'Metodología de oraciones cortas, analogías cotidianas y validación de entendimiento sin hacer sentir incómodo al cliente.',
    category: 'Simplificación',
    durationMins: 35,
    recommendedTrigger: 'Simplificación del mensaje ≤ 2',
    active: true
  },
  {
    id: 'int_7',
    name: 'Laboratorio de Traducción: Característica → Beneficio → Utilidad',
    dimension: 'CLARIFICAR',
    criterionId: 'traduccion_beneficio',
    description: 'Entrenamiento de matriz CBU para conectar cada característica técnica con la vida diaria del usuario final.',
    category: 'Traducción a beneficio',
    durationMins: 45,
    recommendedTrigger: 'Traducción a beneficio ≤ 2',
    active: true
  },

  // CONVERTIR
  {
    id: 'int_8',
    name: 'Taller de Argumentación y Construcción de Valor',
    dimension: 'CONVERTIR',
    criterionId: 'argumentacion_comercial',
    description: 'Selección de argumentos de alto impacto según el perfil del cliente prepago (ahorro acumulado vs recarga individual).',
    category: 'Argumentación',
    durationMins: 50,
    recommendedTrigger: 'Argumentación comercial ≤ 2',
    active: true
  },
  {
    id: 'int_9',
    name: 'Roleplay Clínico de Manejo de Objeciones (4 Pasos)',
    dimension: 'CONVERTIR',
    criterionId: 'manejo_objeciones',
    description: 'Simulación de casos difíciles aplicando la estructura: Escuchar → Comprender → Responder → Reargumentar con empatía y firmeza.',
    category: 'Objeciones',
    durationMins: 60,
    recommendedTrigger: 'Manejo de objeciones ≤ 2',
    active: true
  },
  {
    id: 'int_10',
    name: 'Laboratorio de Cierre Comercial y Reconocimiento de Señales',
    dimension: 'CONVERTIR',
    criterionId: 'cierre_comercial',
    description: 'Detección de preguntas de interés del cliente y formulación de preguntas de cierre alternativas para consolidar el compromiso inmediato.',
    category: 'Cierre',
    durationMins: 40,
    recommendedTrigger: 'Cierre comercial ≤ 2',
    active: true
  }
];
