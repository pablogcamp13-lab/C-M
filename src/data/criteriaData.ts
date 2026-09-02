import { CriterionDefinition, DimensionId } from '../types';

export const CRITERIA_DEFINITIONS: CriterionDefinition[] = [
  // C1: CONECTAR
  {
    id: 'fluidez_verbal',
    dimensionId: 'CONECTAR',
    name: 'Fluidez verbal',
    shortName: 'Fluidez',
    order: 1,
    description: 'Evalúa la ausencia de muletillas, interjecciones innecesarias, trabas, repeticiones, silencios y la continuidad del discurso.',
    evaluationGuide: [
      'Muletillas recurrentes (ehh, este, o sea, verdad)',
      'Interjecciones innecesarias y vicios de dicción',
      'Trabas o tropiezos al articular palabras',
      'Repeticiones innecesarias de ideas o frases',
      'Silencios incómodos o vacíos en la interacción',
      'Continuidad y ritmo natural del discurso'
    ],
    expectedBehavior: 'El asesor mantiene un discurso fluido, organizado y comprensible, sin interrupciones que deterioren la experiencia del cliente.'
  },
  {
    id: 'manejo_voz',
    dimensionId: 'CONECTAR',
    name: 'Manejo de la voz',
    shortName: 'Voz',
    order: 2,
    description: 'Evalúa tono, modulación, ritmo, volumen, entonación, pausas intencionales y énfasis en ideas clave.',
    evaluationGuide: [
      'Tono de voz adecuado (evitar monotonía o linealidad)',
      'Modulación expresiva según el momento de la llamada',
      'Ritmo equilibrado (ni acelerado ni excesivamente lento)',
      'Volumen audible y controlado',
      'Entonación asertiva y cordial',
      'Pausas estratégicas y énfasis en beneficios clave'
    ],
    expectedBehavior: 'El asesor evita una comunicación lineal o monótona y utiliza adecuadamente su voz para mantener interés y destacar información relevante.'
  },
  {
    id: 'seguridad_comunicativa',
    dimensionId: 'CONECTAR',
    name: 'Seguridad comunicativa',
    shortName: 'Seguridad',
    order: 3,
    description: 'Evalúa la seguridad al responder, orden de ideas, naturalidad, dominio del discurso y uso de frases completas.',
    evaluationGuide: [
      'Seguridad y firmeza al responder dudas del cliente',
      'Orden estructurado de las ideas transmitidas',
      'Naturalidad evitando sonar acartonado o robótico',
      'Dominio continuo del discurso sin dudar',
      'Uso de frases completas y bien articuladas'
    ],
    expectedBehavior: 'El asesor transmite seguridad y dominio durante la interacción, evitando una percepción de improvisación.'
  },

  // C2: CLARIFICAR
  {
    id: 'dominio_informacion',
    dimensionId: 'CLARIFICAR',
    name: 'Dominio de información',
    shortName: 'Información',
    order: 4,
    description: 'Evalúa el conocimiento correcto y consistente de planes, tarifas, beneficios, BiPay, condiciones y restricciones.',
    evaluationGuide: [
      'Conocimiento exacto de planes y tarifas promocionales',
      'Beneficios incluidos (Gigas, minutos, apps ilimitadas)',
      'Conocimiento de BiPay (billetera digital Bitel, recargas, transferencias, promociones)',
      'Condiciones y restricciones contractuales transparentes',
      'Ausencia de contradicciones o rectificaciones constantes'
    ],
    expectedBehavior: 'El asesor brinda información correcta y consistente, sin contradicciones, vacíos importantes o rectificaciones frecuentes.'
  },
  {
    id: 'simplificacion_mensaje',
    dimensionId: 'CLARIFICAR',
    name: 'Simplificación del mensaje',
    shortName: 'Simplificación',
    order: 5,
    description: 'Evalúa la capacidad de explicar información técnica o compleja de forma sencilla, ordenada y con frases breves.',
    evaluationGuide: [
      'Explicación en lenguaje directo y accesible',
      'Orden lógico paso a paso',
      'Uso de oraciones breves y contundentes',
      'Eliminación de tecnicismos o jerga interna del operador',
      'Verificación sutil de la comprensión del cliente'
    ],
    expectedBehavior: 'El cliente puede comprender fácilmente la explicación aunque no conozca previamente el producto o tecnología.'
  },
  {
    id: 'traduccion_beneficio',
    dimensionId: 'CLARIFICAR',
    name: 'Traducción a beneficio (BiPay foco)',
    shortName: 'Beneficios',
    order: 6,
    isBiPayRelated: true,
    description: 'Evalúa la conversión de características en beneficios y utilidad tangible para el cliente: Característica → Beneficio → Utilidad.',
    evaluationGuide: [
      'Paso de Característica a Beneficio concreto',
      'Explicación de la Utilidad cotidiana para el cliente',
      'Ejemplificación adaptada a la rutina del usuario',
      'Especial foco en BiPay: no solo qué es, sino cómo le ahorra tiempo y dinero',
      'Personalización de la propuesta según el perfil detectado'
    ],
    expectedBehavior: 'El asesor explica qué obtiene realmente el cliente y por qué ese beneficio debería resultarle relevante para su día a día.'
  },

  // C3: CONVERTIR
  {
    id: 'argumentacion_comercial',
    dimensionId: 'CONVERTIR',
    name: 'Argumentación comercial',
    shortName: 'Argumentación',
    order: 7,
    description: 'Evalúa la construcción de valor, selección de beneficios relevantes, generación de interés y conexión con la necesidad.',
    evaluationGuide: [
      'Construcción de valor diferencial de la migración',
      'Selección de beneficios acordes a las necesidades del cliente',
      'Generación de interés activo y curiosidad positiva',
      'Aprovechamiento de ganchos promocionales',
      'Conexión explícita entre lo que el cliente gasta en prepago vs lo que gana en postpago'
    ],
    expectedBehavior: 'El asesor presenta argumentos claros y relevantes que incrementan el interés del cliente por realizar la migración.'
  },
  {
    id: 'manejo_objeciones',
    dimensionId: 'CONVERTIR',
    name: 'Manejo de objeciones',
    shortName: 'Objeciones',
    order: 8,
    description: 'Evalúa la estructura Escuchar → Comprender → Responder → Reargumentar para neutralizar dudas y mantener la venta.',
    evaluationGuide: [
      'Escucha activa sin interrumpir la duda del cliente',
      'Identificación de la objeción real (precio, desconfianza, permanencia, desconocimiento)',
      'Empatía y validación de la inquietud',
      'Respuesta precisa y contraargumentación convincente',
      'Recuperación inmediata de la conversación hacia el valor'
    ],
    expectedBehavior: 'El asesor responde la resistencia del cliente de manera pertinente y mantiene viva la oportunidad comercial.'
  },
  {
    id: 'cierre_comercial',
    dimensionId: 'CONVERTIR',
    name: 'Cierre comercial',
    shortName: 'Cierre',
    order: 9,
    description: 'Evalúa la identificación de señales de compra, preguntas de cierre oportunas, propuesta de acción y búsqueda de decisión.',
    evaluationGuide: [
      'Identificación oportuna de señales de compra verbales',
      'Preguntas de cierre alternativas o directas (evitar cierres pasivos o tímidos)',
      'Propuesta clara del siguiente paso inmediato',
      'Seguridad y firmeza al solicitar la aceptación de la migración',
      'Búsqueda activa y explícita de decisión'
    ],
    expectedBehavior: 'El asesor conduce claramente la conversación hacia una decisión o compromiso comercial concreto.'
  }
];

export const DIMENSIONS: { id: DimensionId; name: string; subtitle: string; description: string; color: string; bgLight: string; borderColor: string }[] = [
  {
    id: 'CONECTAR',
    name: '1. Comunicar',
    subtitle: 'Comunicación y Voz',
    description: 'El asesor primero debe aprender a comunicarse correctamente sin ruidos verbales, con modulación expresiva y seguridad.',
    color: '#0284C7', // Sky-600
    bgLight: 'bg-sky-50 text-sky-900',
    borderColor: 'border-sky-300'
  },
  {
    id: 'CLARIFICAR',
    name: '2. Clarificar',
    subtitle: 'Información y Beneficios',
    description: 'Posteriormente debe aprender a trasladar la información de manera sencilla, orientada al beneficio y utilidad (con foco en BiPay).',
    color: '#D97706', // Amber-600
    bgLight: 'bg-amber-50 text-amber-900',
    borderColor: 'border-amber-300'
  },
  {
    id: 'CONVERTIR',
    name: '3. Convertir',
    subtitle: 'Persuasión y Cierre',
    description: 'Finalmente debe utilizar esa comunicación y claridad para argumentar con valor, derribar objeciones y cerrar la migración.',
    color: '#059669', // Emerald-600
    bgLight: 'bg-emerald-50 text-emerald-900',
    borderColor: 'border-emerald-300'
  }
];

export const COMPLIANCE_OPTIONS = [
  { 
    status: 'CUMPLE' as const, 
    label: 'Cumple', 
    shortLabel: 'Cumple', 
    percentage: 100, 
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', 
    dotClass: 'bg-emerald-500', 
    desc: 'Otorga el 100% del peso del criterio.' 
  },
  { 
    status: 'NO_CUMPLE' as const, 
    label: 'No cumple', 
    shortLabel: 'No cumple', 
    percentage: 0, 
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300', 
    dotClass: 'bg-rose-500', 
    desc: 'Otorga 0% y se contabiliza como brecha.' 
  },
  { 
    status: 'NO_APLICA' as const, 
    label: 'No aplica', 
    shortLabel: 'No aplica', 
    percentage: null, 
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', 
    dotClass: 'bg-slate-400', 
    desc: 'Excluye el criterio del cálculo y redistribuye automáticamente su peso.' 
  }
];

export const SCALE_LEVELS = [
  { level: 1, label: 'No cumple', percentage: 0, badgeClass: 'bg-rose-100 text-rose-800 border-rose-300', dotClass: 'bg-rose-500', desc: 'Otorga 0% y se contabiliza como brecha.' },
  { level: 2, label: 'No cumple', percentage: 0, badgeClass: 'bg-rose-100 text-rose-800 border-rose-300', dotClass: 'bg-rose-500', desc: 'Otorga 0% y se contabiliza como brecha.' },
  { level: 3, label: 'Cumple', percentage: 100, badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', dotClass: 'bg-emerald-500', desc: 'Otorga el 100% del peso del criterio.' },
  { level: 4, label: 'Cumple', percentage: 100, badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', dotClass: 'bg-emerald-500', desc: 'Otorga el 100% del peso del criterio.' },
  { level: 0, label: 'No aplica', percentage: 0, badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', dotClass: 'bg-slate-400', desc: 'Excluye el criterio del cálculo y redistribuye su peso.' }
];

export const DEFAULT_AUTOMATIC_RECOMMENDATIONS: Record<string, string> = {
  fluidez_verbal: 'Entrenamiento de fluidez verbal, control de muletillas y práctica intensiva de discurso estructurado de 60 segundos sin pausas.',
  manejo_voz: 'Ejercicios de modulación de voz, ritmo, énfasis en palabras clave y escucha comparativa de grabaciones modelo.',
  seguridad_comunicativa: 'Refuerzo de asertividad verbal, eliminación de frases de duda y práctica de ordenamiento mental de ideas.',
  dominio_informacion: 'Refuerzo técnico de parrilla de planes, tarifas y evaluación de conocimiento de producto.',
  simplificacion_mensaje: 'Taller de simplificación: cómo explicar planes y condiciones complejas con oraciones breves y sin tecnicismos.',
  traduccion_beneficio: 'Práctica intensiva de conversión: Característica → Beneficio → Utilidad para el cliente (con énfasis en BiPay).',
  argumentacion_comercial: 'Taller de construcción de valor y conexión de beneficios con la necesidad detectada en el cliente.',
  manejo_objeciones: 'Roleplay específico con estructura: Escuchar → Comprender → Responder → Reargumentar.',
  cierre_comercial: 'Taller de reconocimiento de señales de compra y aplicación de preguntas de cierre directo y alternativo.'
};

export const AUTOMATIC_RECOMMENDATIONS = DEFAULT_AUTOMATIC_RECOMMENDATIONS;
