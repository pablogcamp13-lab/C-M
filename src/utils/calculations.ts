import { 
  Evaluation, 
  Advisor, 
  MethodologyConfig, 
  EvaluationItem,
  DimensionId,
  PriorityLevel,
  OperationalMeasurement,
  ComplianceStatus
} from '../types';
import { CRITERIA_DEFINITIONS, DEFAULT_AUTOMATIC_RECOMMENDATIONS } from '../data/criteriaData';

// Helper to determine compliance status for an item (supporting backward compatibility)
export function getItemCompliance(item: Partial<EvaluationItem>): ComplianceStatus {
  if (item.compliance === 'CUMPLE' || item.compliance === 'NO_CUMPLE' || item.compliance === 'NO_APLICA') {
    return item.compliance;
  }
  if (item.level === 0) return 'NO_APLICA';
  if (item.level === 1 || item.level === 2) return 'NO_CUMPLE';
  if (item.level === 3 || item.level === 4) return 'CUMPLE';
  if (item.percentage === 0) return 'NO_CUMPLE';
  if (item.percentage === 100) return 'CUMPLE';
  return 'CUMPLE';
}

// Helper to format score or display N/A
export function formatDimensionScore(score: number | null | undefined): string {
  if (score === null || score === undefined || isNaN(score)) return 'N/A';
  return `${Math.round(score)}%`;
}

// Score evaluation items according to QA Rubric:
// - Cumple: 100% of weight
// - No cumple: 0%
// - No aplica: excludes criterion and redistributes weight
// Score = (Weight of Cumple / Weight of Evaluable) * 100
export function calculateEvaluationSummary(
  items: EvaluationItem[], 
  config?: MethodologyConfig
): {
  scoreConnect: number | null;
  scoreClarify: number | null;
  scoreConvert: number | null;
  scoreTotal: number | null;
  primaryGap: string;
  secondaryGap: string;
  strongestPillar: string;
  recommendation: string;
  criticalCriteria: string[];
} {
  const c1Items = items.filter(i => i.dimension === 'CONECTAR');
  const c2Items = items.filter(i => i.dimension === 'CLARIFICAR');
  const c3Items = items.filter(i => i.dimension === 'CONVERTIR');

  const calcDimScore = (dimItems: EvaluationItem[]): number | null => {
    const evaluable = dimItems.filter(i => getItemCompliance(i) !== 'NO_APLICA');
    if (evaluable.length === 0) return null;
    const fulfilled = evaluable.filter(i => getItemCompliance(i) === 'CUMPLE');
    return Math.round((fulfilled.length / evaluable.length) * 100);
  };

  const s1 = calcDimScore(c1Items);
  const s2 = calcDimScore(c2Items);
  const s3 = calcDimScore(c3Items);

  // Overall Score (Puntaje final = Peso cumplido / Peso evaluable × 100)
  const allEvaluable = items.filter(i => getItemCompliance(i) !== 'NO_APLICA');
  const allFulfilled = allEvaluable.filter(i => getItemCompliance(i) === 'CUMPLE');
  const sTot = allEvaluable.length > 0
    ? Math.round((allFulfilled.length / allEvaluable.length) * 100)
    : null;

  // Critical items (Only 'NO_CUMPLE' is a gap)
  const criticalItems = items.filter(i => getItemCompliance(i) === 'NO_CUMPLE');
  const criticalCriteria = criticalItems.map(i => {
    const found = CRITERIA_DEFINITIONS.find(c => c.id === i.criterionId);
    return found ? found.name : i.criterionId;
  });

  // Gap and Pillar analysis
  const dimStats = [
    { dim: 'CONECTAR' as DimensionId, name: 'COMUNICAR (Pilar 1)', score: s1, noCumpleCount: c1Items.filter(i => getItemCompliance(i) === 'NO_CUMPLE').length },
    { dim: 'CLARIFICAR' as DimensionId, name: 'CLARIFICAR (Pilar 2)', score: s2, noCumpleCount: c2Items.filter(i => getItemCompliance(i) === 'NO_CUMPLE').length },
    { dim: 'CONVERTIR' as DimensionId, name: 'CONVERTIR (Pilar 3)', score: s3, noCumpleCount: c3Items.filter(i => getItemCompliance(i) === 'NO_CUMPLE').length }
  ];

  let primaryGap = 'Sin brechas identificadas (100% Calidad)';
  let secondaryGap = 'Estándar 3C Cumplido';
  let strongest = 'COMUNICAR';

  if (criticalItems.length > 0) {
    const sortedGaps = [...dimStats]
      .filter(d => d.noCumpleCount > 0)
      .sort((a, b) => {
        if (a.score !== null && b.score !== null && a.score !== b.score) {
          return a.score - b.score;
        }
        return b.noCumpleCount - a.noCumpleCount;
      });

    if (sortedGaps.length > 0) {
      primaryGap = sortedGaps[0].name;
      secondaryGap = sortedGaps.length > 1 ? sortedGaps[1].name : 'Brecha puntual focalizada';
    }

    const evaluableDims = dimStats.filter(d => d.score !== null).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (evaluableDims.length > 0) {
      strongest = evaluableDims[0].name.split(' ')[0];
    }
  }

  // Recommended high-level action
  let recommendation = '';
  if (sTot !== null && sTot < 60) {
    recommendation = 'Priorizar plan de coaching inmediato con foco en criterios marcados como No Cumple antes de la siguiente interacción evaluable.';
  } else if (sTot !== null && sTot < 80) {
    recommendation = 'Reforzar acompañamiento en sala y clínicas de roleplay para asegurar cumplimiento consistente del 100% de la pauta de calidad.';
  } else if (sTot !== null && sTot < 100) {
    recommendation = 'Buen desempeño general de calidad. Revisar retroalimentación de criterios observados para alcanzar certificación plena.';
  } else if (sTot === 100) {
    recommendation = 'Excelente desempeño de Calidad 3C (100% Cumple). Mantener estándar y utilizar como modelo de buenas prácticas.';
  } else {
    recommendation = 'Evaluación no contiene criterios evaluables aplicables.';
  }

  return {
    scoreConnect: s1,
    scoreClarify: s2,
    scoreConvert: s3,
    scoreTotal: sTot,
    primaryGap,
    secondaryGap,
    strongestPillar: strongest,
    recommendation,
    criticalCriteria
  };
}

// Generate automatic recommendation for a single criterion
export function getAutoRecommendation(criterionId: string, statusOrLevel: ComplianceStatus | number): string {
  const isGap = typeof statusOrLevel === 'string' 
    ? statusOrLevel === 'NO_CUMPLE' 
    : statusOrLevel <= 2;
  
  if (isGap) {
    return DEFAULT_AUTOMATIC_RECOMMENDATIONS[criterionId] || 'Reforzar acompañamiento y coaching focalizado en este criterio.';
  }
  return 'Conducta conforme al estándar esperado de calidad.';
}

// Classify priority
export function classifyPriority(score: number | null | undefined, config?: MethodologyConfig): PriorityLevel {
  if (score === null || score === undefined) return 'ESPERADO';
  const highMax = config?.priorityThresholds?.highGapMax ?? 60;
  const medMax = config?.priorityThresholds?.mediumGapMax ?? 80;
  const expMax = config?.priorityThresholds?.expectedMax ?? 90;

  if (score < highMax) return 'ALTA';
  if (score < medMax) return 'MEDIA';
  if (score < expMax) return 'ESPERADO';
  return 'DOMINADO';
}

export function getPriorityBadge(priority: PriorityLevel): { label: string; bg: string; text: string; border: string } {
  switch (priority) {
    case 'ALTA':
      return { label: 'Prioridad Alta (<60%)', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    case 'MEDIA':
      return { label: 'Prioridad Media (60-79%)', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'ESPERADO':
      return { label: 'Nivel Esperado (80-89%)', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'DOMINADO':
      return { label: 'Dominado (≥90%)', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  }
}

// Pareto Analysis: Only 'NO_CUMPLE' is counted as a breach (gap)
export interface ParetoItem {
  criterionId: string;
  name: string;
  shortName: string;
  dimension: DimensionId;
  frequency: number;
  percentage: number;
  cumulativePercentage: number;
  isPareto80: boolean;
}

export function calculatePareto(
  evaluations: Evaluation[], 
  dimensionFilter: 'ALL' | DimensionId = 'ALL',
  tenureFilter: 'ALL' | 'NUEVO' | 'ANTIGUO' = 'ALL',
  advisors?: Advisor[],
  thresholdDays: number = 90
): ParetoItem[] {
  // Filter evaluations by tenure if requested
  let targetEvaluations = evaluations;
  if (tenureFilter !== 'ALL' && advisors && advisors.length > 0) {
    targetEvaluations = evaluations.filter(ev => {
      const adv = advisors.find(a => a.id === ev.advisorId);
      if (!adv) return true;
      const tenure = calculateAdvisorTenure(adv.hireDate, thresholdDays);
      return tenure.category === tenureFilter;
    });
  }

  // Count frequency of 'NO_CUMPLE' only
  const frequencyMap: Record<string, number> = {};
  
  CRITERIA_DEFINITIONS.forEach(c => {
    frequencyMap[c.id] = 0;
  });

  targetEvaluations.forEach(ev => {
    ev.items.forEach(item => {
      if (getItemCompliance(item) === 'NO_CUMPLE') {
        frequencyMap[item.criterionId] = (frequencyMap[item.criterionId] || 0) + 1;
      }
    });
  });

  let list = CRITERIA_DEFINITIONS.map(c => ({
    criterionId: c.id,
    name: c.name,
    shortName: c.shortName,
    dimension: c.dimensionId,
    frequency: frequencyMap[c.id] || 0,
    percentage: 0,
    cumulativePercentage: 0,
    isPareto80: false
  }));

  if (dimensionFilter !== 'ALL') {
    list = list.filter(item => item.dimension === dimensionFilter);
  }

  // Sort descending by frequency
  list.sort((a, b) => b.frequency - a.frequency);

  const totalGaps = list.reduce((acc, curr) => acc + curr.frequency, 0);

  let cumulative = 0;
  list.forEach(item => {
    item.percentage = totalGaps > 0 ? Math.round((item.frequency / totalGaps) * 1000) / 10 : 0;
    cumulative += item.percentage;
    item.cumulativePercentage = Math.min(100, Math.round(cumulative * 10) / 10);
    item.isPareto80 = item.cumulativePercentage <= 80 || (item.cumulativePercentage > 80 && cumulative - item.percentage < 80);
  });

  return list;
}

// BiPay Deep Dive Analytics
export interface BiPayAnalytics {
  totalEvaluations: number;
  correctExplanationPct: number;
  incompleteKnowledgePct: number;
  confusingExplanationPct: number;
  benefitTranslationPct: number;
  salesRateWithBiPayDominance: number;
  salesRateWithBiPayGap: number;
  salesLiftPoints: number;
  topGapAdvisors: { advisorId: string; advisorName: string; teamName: string; averageLevel: number; gapCount: number }[];
}

export function calculateBiPayAnalytics(
  evaluations: Evaluation[], 
  advisors: Advisor[]
): BiPayAnalytics {
  if (evaluations.length === 0) {
    return {
      totalEvaluations: 0,
      correctExplanationPct: 0,
      incompleteKnowledgePct: 0,
      confusingExplanationPct: 0,
      benefitTranslationPct: 0,
      salesRateWithBiPayDominance: 0,
      salesRateWithBiPayGap: 0,
      salesLiftPoints: 0,
      topGapAdvisors: []
    };
  }

  // Filter items for BiPay / Traducción a beneficio
  const targetItems = evaluations.flatMap(e => e.items.filter(i => i.criterionId === 'traduccion_beneficio'));
  const evaluableItems = targetItems.filter(i => getItemCompliance(i) !== 'NO_APLICA');
  const total = evaluableItems.length || 1;

  const cumpleCount = evaluableItems.filter(i => getItemCompliance(i) === 'CUMPLE').length;
  const noCumpleCount = evaluableItems.filter(i => getItemCompliance(i) === 'NO_CUMPLE').length;

  const correctExplanationPct = Math.round((cumpleCount / total) * 100);
  const confusingExplanationPct = Math.round((noCumpleCount / total) * 100);
  const incompleteKnowledgePct = confusingExplanationPct;
  const benefitTranslationPct = correctExplanationPct;

  // Correlation with Sales
  const evalsWithBiPayDom = evaluations.filter(e => {
    const item = e.items.find(i => i.criterionId === 'traduccion_beneficio');
    return item && getItemCompliance(item) === 'CUMPLE';
  });
  const evalsWithBiPayGap = evaluations.filter(e => {
    const item = e.items.find(i => i.criterionId === 'traduccion_beneficio');
    return item && getItemCompliance(item) === 'NO_CUMPLE';
  });

  const salesDominance = evalsWithBiPayDom.length > 0 
    ? Math.round((evalsWithBiPayDom.filter(e => e.sale).length / evalsWithBiPayDom.length) * 100) 
    : 0;

  const salesGap = evalsWithBiPayGap.length > 0 
    ? Math.round((evalsWithBiPayGap.filter(e => e.sale).length / evalsWithBiPayGap.length) * 100) 
    : 0;

  // Advisor ranking with BiPay gap
  const advisorMap: Record<string, { totalScores: number[]; gapCount: number }> = {};
  evaluations.forEach(e => {
    const item = e.items.find(i => i.criterionId === 'traduccion_beneficio');
    if (item && getItemCompliance(item) !== 'NO_APLICA') {
      if (!advisorMap[e.advisorId]) {
        advisorMap[e.advisorId] = { totalScores: [], gapCount: 0 };
      }
      const isCumple = getItemCompliance(item) === 'CUMPLE';
      advisorMap[e.advisorId].totalScores.push(isCumple ? 100 : 0);
      if (!isCumple) {
        advisorMap[e.advisorId].gapCount += 1;
      }
    }
  });

  const topGapAdvisors = Object.entries(advisorMap)
    .map(([advId, data]) => {
      const adv = advisors.find(a => a.id === advId);
      const avg = data.totalScores.length > 0 
        ? Math.round(data.totalScores.reduce((a, b) => a + b, 0) / data.totalScores.length)
        : 0;
      return {
        advisorId: advId,
        advisorName: adv ? adv.name : 'Asesor',
        teamName: adv ? (adv.teamId === 'team_1' ? 'Equipo Alfa' : adv.teamId === 'team_2' ? 'Equipo Beta' : 'Equipo Gamma') : 'Equipo',
        averageLevel: avg,
        gapCount: data.gapCount
      };
    })
    .sort((a, b) => b.gapCount - a.gapCount || a.averageLevel - b.averageLevel)
    .slice(0, 5);

  return {
    totalEvaluations: evaluations.length,
    correctExplanationPct,
    incompleteKnowledgePct,
    confusingExplanationPct,
    benefitTranslationPct,
    salesRateWithBiPayDominance: salesDominance,
    salesRateWithBiPayGap: salesGap,
    salesLiftPoints: Math.max(0, salesDominance - salesGap),
    topGapAdvisors
  };
}

// Before vs After Impact Analysis
export interface ImpactComparison {
  advisorId: string;
  advisorName: string;
  teamId: string;
  initialDate: string;
  lastDate: string;
  initialScores: {
    connect: number;
    clarify: number;
    convert: number;
    total: number;
    criteria: Record<string, number>;
  };
  lastScores: {
    connect: number;
    clarify: number;
    convert: number;
    total: number;
    criteria: Record<string, number>;
  };
  delta: {
    connect: number;
    clarify: number;
    convert: number;
    total: number;
    criteria: Record<string, number>;
  };
  hasImproved: boolean;
}

export function calculateImpactAnalysis(
  evaluations: Evaluation[], 
  advisors: Advisor[]
): {
  comparisons: ImpactComparison[];
  cohortAverageDelta: {
    connect: number;
    clarify: number;
    convert: number;
    total: number;
  };
  criteriaAveragesDelta: { criterionId: string; name: string; dimension: DimensionId; beforePct: number; afterPct: number; deltaPts: number }[];
} {
  const comparisons: ImpactComparison[] = [];

  advisors.forEach(adv => {
    const advEvals = evaluations
      .filter(e => e.advisorId === adv.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (advEvals.length >= 2) {
      const first = advEvals[0];
      const last = advEvals[advEvals.length - 1];

      const initialCriteria: Record<string, number> = {};
      const lastCriteria: Record<string, number> = {};
      const deltaCriteria: Record<string, number> = {};

      CRITERIA_DEFINITIONS.forEach(c => {
        const item1 = first.items.find(i => i.criterionId === c.id);
        const item2 = last.items.find(i => i.criterionId === c.id);
        const pct1 = item1 ? (item1.percentage ?? (getItemCompliance(item1) === 'CUMPLE' ? 100 : 0)) : 0;
        const pct2 = item2 ? (item2.percentage ?? (getItemCompliance(item2) === 'CUMPLE' ? 100 : 0)) : 0;
        initialCriteria[c.id] = pct1;
        lastCriteria[c.id] = pct2;
        deltaCriteria[c.id] = pct2 - pct1;
      });

      const firstConnect = first.scoreConnect ?? 0;
      const lastConnect = last.scoreConnect ?? 0;
      const firstClarify = first.scoreClarify ?? 0;
      const lastClarify = last.scoreClarify ?? 0;
      const firstConvert = first.scoreConvert ?? 0;
      const lastConvert = last.scoreConvert ?? 0;
      const firstTotal = first.scoreTotal ?? 0;
      const lastTotal = last.scoreTotal ?? 0;

      const deltaConnect = lastConnect - firstConnect;
      const deltaClarify = lastClarify - firstClarify;
      const deltaConvert = lastConvert - firstConvert;
      const deltaTotal = lastTotal - firstTotal;

      comparisons.push({
        advisorId: adv.id,
        advisorName: adv.name,
        teamId: adv.teamId,
        initialDate: first.date,
        lastDate: last.date,
        initialScores: {
          connect: firstConnect,
          clarify: firstClarify,
          convert: firstConvert,
          total: firstTotal,
          criteria: initialCriteria
        },
        lastScores: {
          connect: lastConnect,
          clarify: lastClarify,
          convert: lastConvert,
          total: lastTotal,
          criteria: lastCriteria
        },
        delta: {
          connect: deltaConnect,
          clarify: deltaClarify,
          convert: deltaConvert,
          total: deltaTotal,
          criteria: deltaCriteria
        },
        hasImproved: deltaTotal > 0
      });
    }
  });

  const count = comparisons.length || 1;
  const cohortAverageDelta = {
    connect: Math.round(comparisons.reduce((acc, c) => acc + c.delta.connect, 0) / count),
    clarify: Math.round(comparisons.reduce((acc, c) => acc + c.delta.clarify, 0) / count),
    convert: Math.round(comparisons.reduce((acc, c) => acc + c.delta.convert, 0) / count),
    total: Math.round(comparisons.reduce((acc, c) => acc + c.delta.total, 0) / count)
  };

  const criteriaAveragesDelta = CRITERIA_DEFINITIONS.map(c => {
    const beforeAvg = Math.round(
      comparisons.reduce((acc, comp) => acc + (comp.initialScores.criteria[c.id] || 0), 0) / count
    );
    const afterAvg = Math.round(
      comparisons.reduce((acc, comp) => acc + (comp.lastScores.criteria[c.id] || 0), 0) / count
    );
    return {
      criterionId: c.id,
      name: c.name,
      dimension: c.dimensionId,
      beforePct: beforeAvg,
      afterPct: afterAvg,
      deltaPts: afterAvg - beforeAvg
    };
  });

  return {
    comparisons,
    cohortAverageDelta,
    criteriaAveragesDelta
  };
}

// Generate Real Executive Insights (Section 30)
export function generateExecutiveInsights(
  evaluations: Evaluation[], 
  advisors: Advisor[]
): string[] {
  if (evaluations.length === 0) return ['No hay evaluaciones suficientes registradas en el período seleccionado.'];

  const insights: string[] = [];
  const pareto = calculatePareto(evaluations, 'ALL');
  const biPay = calculateBiPayAnalytics(evaluations, advisors);
  const impact = calculateImpactAnalysis(evaluations, advisors);

  // 1. Pareto Top Gap insight
  if (pareto.length > 0 && pareto[0].frequency > 0) {
    insights.push(
      `"${pareto[0].name}" representa actualmente el ${pareto[0].percentage}% de todas las brechas críticas ("No cumple") detectadas en la operación.`
    );
  }

  // 2. Lowest dimension
  const evalsConnect = evaluations.filter(e => e.scoreConnect !== null);
  const evalsClarify = evaluations.filter(e => e.scoreClarify !== null);
  const evalsConvert = evaluations.filter(e => e.scoreConvert !== null);

  const avgConnect = evalsConnect.length > 0 ? Math.round(evalsConnect.reduce((a, e) => a + (e.scoreConnect || 0), 0) / evalsConnect.length) : null;
  const avgClarify = evalsClarify.length > 0 ? Math.round(evalsClarify.reduce((a, e) => a + (e.scoreClarify || 0), 0) / evalsClarify.length) : null;
  const avgConvert = evalsConvert.length > 0 ? Math.round(evalsConvert.reduce((a, e) => a + (e.scoreConvert || 0), 0) / evalsConvert.length) : null;

  const validDims = [
    { name: 'Comunicar', score: avgConnect },
    { name: 'Clarificar', score: avgClarify },
    { name: 'Convertir', score: avgConvert }
  ].filter(d => d.score !== null);

  if (validDims.length > 0) {
    const lowest = validDims.sort((a, b) => (a.score || 0) - (b.score || 0))[0];
    insights.push(
      `"${lowest.name}" es la dimensión 3C con menor promedio global (${lowest.score}%), confirmando la necesidad de robustecer la base comunicativa previa al cierre comercial.`
    );
  }

  // 3. BiPay Insight
  if (biPay.incompleteKnowledgePct + biPay.confusingExplanationPct > 0) {
    insights.push(
      `El ${biPay.incompleteKnowledgePct + biPay.confusingExplanationPct}% de las evaluaciones registra observaciones al presentar el beneficio de ahorro BiPay.`
    );
  }

  // 4. Sales Correlation
  if (biPay.salesLiftPoints > 0) {
    insights.push(
      `Los asesores que cumplen con la pauta en Clarificar/BiPay registran una tasa de venta ${biPay.salesLiftPoints} puntos porcentuales superior a quienes presentan brechas.`
    );
  }

  // 5. Impact Improvement
  if (impact.cohortAverageDelta.connect > 0) {
    insights.push(
      `Tras las intervenciones y sesiones de coaching, la dimensión Comunicar mejoró en promedio +${impact.cohortAverageDelta.connect} puntos porcentuales (Antes vs. Después).`
    );
  }

  return insights;
}

// Export data to CSV string
export function exportEvaluationsToCSV(evaluations: Evaluation[], advisors: Advisor[]): string {
  const headers = [
    'ID Evaluacion',
    'Fecha',
    'Hora',
    'Tipo',
    'Asesor DNI',
    'Asesor Nombre',
    'ID Llamada',
    'Codigo Grabacion',
    'Producto',
    'Venta Concretada',
    'Resultado Venta',
    'Score Conectar',
    'Score Clarificar',
    'Score Convertir',
    'Score Total 3C',
    'Brecha Principal',
    'Brecha Secundaria',
    'Comentarios'
  ];

  const rows = evaluations.map(e => {
    const adv = advisors.find(a => a.id === e.advisorId);
    return [
      `"${e.id}"`,
      `"${e.date}"`,
      `"${e.time}"`,
      `"${e.type}"`,
      `"${adv?.dni || ''}"`,
      `"${adv?.name || ''}"`,
      `"${e.callId}"`,
      `"${e.recordingCode}"`,
      `"${e.product}"`,
      `"${e.sale ? 'SI' : 'NO'}"`,
      `"${e.saleResult}"`,
      e.scoreConnect,
      e.scoreClarify,
      e.scoreConvert,
      e.scoreTotal,
      `"${e.primaryGap}"`,
      `"${e.secondaryGap}"`,
      `"${(e.comments || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// LEVEL 2 – OPERATIONAL IMPACT UTILITIES
// ==========================================

export function parseTimeToMinutes(timeStr: string | undefined): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim();
  const parts = cleaned.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return Math.max(0, hours * 60 + minutes);
  }
  const numeric = parseFloat(cleaned);
  return isNaN(numeric) ? 0 : Math.max(0, Math.round(numeric));
}

export function formatMinutesToHHMM(minutes: number): string {
  const totalMin = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function formatMinutesToHuman(minutes: number): string {
  const totalMin = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
}

export function formatMinutesDelta(deltaMinutes: number): {
  text: string;
  isPositive: boolean;
  isNegative: boolean;
  isNeutral: boolean;
} {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) {
    return { text: '0m', isPositive: false, isNegative: false, isNeutral: true };
  }
  const isPositive = rounded > 0;
  const absMin = Math.abs(rounded);
  const hrs = Math.floor(absMin / 60);
  const mins = absMin % 60;
  const timeFormatted = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  const sign = isPositive ? '+' : '-';
  return {
    text: `${sign}${timeFormatted}`,
    isPositive,
    isNegative: !isPositive,
    isNeutral: false
  };
}

export function formatSph(sph: number | undefined): string {
  if (sph === undefined || isNaN(sph)) return '0.00';
  return sph.toFixed(2);
}

export function formatSphDelta(delta: number): {
  text: string;
  isPositive: boolean;
  isNegative: boolean;
  isNeutral: boolean;
} {
  const num = Number(delta.toFixed(2));
  if (num === 0) {
    return { text: '0.00', isPositive: false, isNegative: false, isNeutral: true };
  }
  const isPositive = num > 0;
  const sign = isPositive ? '+' : '';
  return {
    text: `${sign}${num.toFixed(2)}`,
    isPositive,
    isNegative: !isPositive,
    isNeutral: false
  };
}

export interface AdvisorOperationalAnalysis {
  advisorId: string;
  advisorName: string;
  employeeCode: string;
  teamId: string;
  supervisorId: string;
  hasBaseline: boolean;
  baseline: {
    connectionTime: string;
    connectionMinutes: number;
    sph: number;
    date: string;
    period: string;
  };
  latest: {
    connectionTime: string;
    connectionMinutes: number;
    sph: number;
    date: string;
    period: string;
  };
  delta: {
    connectionMinutes: number;
    connectionPct: number;
    sph: number;
    sphPct: number;
  };
  measurementsCount: number;
  history: Array<{
    id: string;
    periodName: string;
    date: string;
    connectionTime: string;
    connectionMinutes: number;
    sph: number;
    deltaConnectionMinutes: number;
    deltaSph: number;
    source?: string;
    comments?: string;
  }>;
}

export function calculateAdvisorOperationalAnalysis(
  advisor: Advisor,
  allMeasurements: OperationalMeasurement[]
): AdvisorOperationalAnalysis {
  const advisorMeasurements = allMeasurements
    .filter(m => m.advisorId === advisor.id)
    .sort((a, b) => new Date(a.measurementDate).getTime() - new Date(b.measurementDate).getTime());

  const baselineMinutes = advisor.baselineConnectionMinutes || parseTimeToMinutes(advisor.baselineConnectionTime) || 360;
  const baselineSph = advisor.baselineSph !== undefined ? advisor.baselineSph : 0.20;
  const baselineTime = advisor.baselineConnectionTime || formatMinutesToHHMM(baselineMinutes);

  const latestMeas = advisorMeasurements.length > 0
    ? advisorMeasurements[advisorMeasurements.length - 1]
    : null;

  const latestMinutes = latestMeas ? latestMeas.connectionMinutes : baselineMinutes;
  const latestSph = latestMeas ? latestMeas.sph : baselineSph;
  const latestTime = latestMeas ? latestMeas.connectionTime : baselineTime;
  const latestDate = latestMeas ? latestMeas.measurementDate : (advisor.baselineDate || advisor.hireDate);
  const latestPeriod = latestMeas ? latestMeas.periodName : (advisor.baselinePeriod || 'Línea Base');

  const deltaMinutes = latestMinutes - baselineMinutes;
  const deltaSph = Number((latestSph - baselineSph).toFixed(2));
  const connectionPct = baselineMinutes > 0 ? Math.round((deltaMinutes / baselineMinutes) * 100) : 0;
  const sphPct = baselineSph > 0 ? Math.round((deltaSph / baselineSph) * 100) : 0;

  const history = advisorMeasurements.map(m => ({
    id: m.id,
    periodName: m.periodName,
    date: m.measurementDate,
    connectionTime: m.connectionTime,
    connectionMinutes: m.connectionMinutes,
    sph: m.sph,
    deltaConnectionMinutes: m.connectionMinutes - baselineMinutes,
    deltaSph: Number((m.sph - baselineSph).toFixed(2)),
    source: m.source,
    comments: m.comments
  }));

  return {
    advisorId: advisor.id,
    advisorName: advisor.name,
    employeeCode: advisor.employeeCode,
    teamId: advisor.teamId,
    supervisorId: advisor.supervisorId,
    hasBaseline: Boolean(advisor.hasOperationalBaseline ?? true),
    baseline: {
      connectionTime: baselineTime,
      connectionMinutes: baselineMinutes,
      sph: baselineSph,
      date: advisor.baselineDate || '2026-01-20',
      period: advisor.baselinePeriod || 'Línea Base'
    },
    latest: {
      connectionTime: latestTime,
      connectionMinutes: latestMinutes,
      sph: latestSph,
      date: latestDate,
      period: latestPeriod
    },
    delta: {
      connectionMinutes: deltaMinutes,
      connectionPct,
      sph: deltaSph,
      sphPct
    },
    measurementsCount: advisorMeasurements.length,
    history
  };
}

export interface GlobalOperationalSummary {
  cohortCount: number;
  baselineAvgMinutes: number;
  baselineAvgTime: string;
  baselineAvgSph: number;
  currentAvgMinutes: number;
  currentAvgTime: string;
  currentAvgSph: number;
  deltaAvgMinutes: number;
  deltaAvgSph: number;
  connectionPctGain: number;
  sphPctGain: number;
  advisorsImprovingSphPct: number;
  advisorsImprovingConnectionPct: number;
  advisorsImprovingBothPct: number;
  advisorsAnalysis: AdvisorOperationalAnalysis[];
  periodsEvolution: Array<{
    periodName: string;
    date: string;
    avgMinutes: number;
    avgTime: string;
    avgSph: number;
  }>;
}

export function calculateGlobalOperationalSummary(
  advisors: Advisor[],
  measurements: OperationalMeasurement[]
): GlobalOperationalSummary {
  if (advisors.length === 0) {
    return {
      cohortCount: 0,
      baselineAvgMinutes: 0,
      baselineAvgTime: '00:00',
      baselineAvgSph: 0,
      currentAvgMinutes: 0,
      currentAvgTime: '00:00',
      currentAvgSph: 0,
      deltaAvgMinutes: 0,
      deltaAvgSph: 0,
      connectionPctGain: 0,
      sphPctGain: 0,
      advisorsImprovingSphPct: 0,
      advisorsImprovingConnectionPct: 0,
      advisorsImprovingBothPct: 0,
      advisorsAnalysis: [],
      periodsEvolution: []
    };
  }

  const analyses = advisors.map(a => calculateAdvisorOperationalAnalysis(a, measurements));
  const count = analyses.length;

  const baselineAvgMinutes = Math.round(analyses.reduce((acc, a) => acc + a.baseline.connectionMinutes, 0) / count);
  const baselineAvgSph = Number((analyses.reduce((acc, a) => acc + a.baseline.sph, 0) / count).toFixed(2));

  const currentAvgMinutes = Math.round(analyses.reduce((acc, a) => acc + a.latest.connectionMinutes, 0) / count);
  const currentAvgSph = Number((analyses.reduce((acc, a) => acc + a.latest.sph, 0) / count).toFixed(2));

  const deltaAvgMinutes = currentAvgMinutes - baselineAvgMinutes;
  const deltaAvgSph = Number((currentAvgSph - baselineAvgSph).toFixed(2));

  const connectionPctGain = baselineAvgMinutes > 0 ? Math.round((deltaAvgMinutes / baselineAvgMinutes) * 100) : 0;
  const sphPctGain = baselineAvgSph > 0 ? Math.round((deltaAvgSph / baselineAvgSph) * 100) : 0;

  const improvingSphCount = analyses.filter(a => a.delta.sph > 0).length;
  const improvingConnectionCount = analyses.filter(a => a.delta.connectionMinutes > 0).length;
  const improvingBothCount = analyses.filter(a => a.delta.sph > 0 && a.delta.connectionMinutes > 0).length;

  const advisorsImprovingSphPct = Math.round((improvingSphCount / count) * 100);
  const advisorsImprovingConnectionPct = Math.round((improvingConnectionCount / count) * 100);
  const advisorsImprovingBothPct = Math.round((improvingBothCount / count) * 100);

  // Group measurements by period for period evolution
  const periodNames = Array.from(new Set(measurements.map(m => m.periodName))).filter(Boolean);
  const periodsEvolution: Array<{
    periodName: string;
    date: string;
    avgMinutes: number;
    avgTime: string;
    avgSph: number;
  }> = [];

  // Add baseline as first point
  periodsEvolution.push({
    periodName: 'Línea Base',
    date: '2026-01-20',
    avgMinutes: baselineAvgMinutes,
    avgTime: formatMinutesToHHMM(baselineAvgMinutes),
    avgSph: baselineAvgSph
  });

  periodNames.forEach(pName => {
    const periodMeasures = measurements.filter(m => m.periodName === pName);
    if (periodMeasures.length > 0) {
      const pMinutes = Math.round(periodMeasures.reduce((a, b) => a + b.connectionMinutes, 0) / periodMeasures.length);
      const pSph = Number((periodMeasures.reduce((a, b) => a + b.sph, 0) / periodMeasures.length).toFixed(2));
      const pDate = periodMeasures[0].measurementDate;
      periodsEvolution.push({
        periodName: pName,
        date: pDate,
        avgMinutes: pMinutes,
        avgTime: formatMinutesToHHMM(pMinutes),
        avgSph: pSph
      });
    }
  });

  return {
    cohortCount: count,
    baselineAvgMinutes,
    baselineAvgTime: formatMinutesToHHMM(baselineAvgMinutes),
    baselineAvgSph,
    currentAvgMinutes,
    currentAvgTime: formatMinutesToHHMM(currentAvgMinutes),
    currentAvgSph,
    deltaAvgMinutes,
    deltaAvgSph,
    connectionPctGain,
    sphPctGain,
    advisorsImprovingSphPct,
    advisorsImprovingConnectionPct,
    advisorsImprovingBothPct,
    advisorsAnalysis: analyses,
    periodsEvolution
  };
}

// ==========================================
// TENURE (ANTIGÜEDAD) CALCULATION ENGINE
// ==========================================

export interface AdvisorTenureInfo {
  days: number;
  months: number;
  formatted: string; // e.g. "3 meses · 13 días" or "24 días"
  isNew: boolean;
  category: 'NUEVO' | 'ANTIGUO' | 'PENDIENTE';
  isPending: boolean;
}

export function calculateAdvisorTenure(
  hireDateStr?: string, 
  thresholdDays: number = 90,
  referenceDate?: Date
): AdvisorTenureInfo {
  if (!hireDateStr || hireDateStr === '#N/D' || hireDateStr === '-' || hireDateStr === 'PENDIENTE') {
    return {
      days: 0,
      months: 0,
      formatted: 'Fecha de ingreso pendiente',
      isNew: false,
      category: 'PENDIENTE',
      isPending: true
    };
  }

  // Parse YYYY-MM-DD
  const parts = hireDateStr.split('-').map(Number);
  const hireDate = parts.length === 3 
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(hireDateStr);

  if (isNaN(hireDate.getTime())) {
    return {
      days: 0,
      months: 0,
      formatted: 'Fecha de ingreso pendiente',
      isNew: false,
      category: 'PENDIENTE',
      isPending: true
    };
  }

  const ref = referenceDate || new Date(2026, 7, 28); // Reference August 2026 or current
  
  const diffMs = Math.max(0, ref.getTime() - hireDate.getTime());
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  const months = Math.floor(totalDays / 30.4375);
  const remainingDays = Math.floor(totalDays % 30.4375);
  
  let formatted = '';
  if (months === 0) {
    formatted = `${totalDays} ${totalDays === 1 ? 'día' : 'días'}`;
  } else if (remainingDays === 0) {
    formatted = `${months} ${months === 1 ? 'mes' : 'meses'}`;
  } else {
    formatted = `${months} ${months === 1 ? 'mes' : 'meses'} · ${remainingDays} ${remainingDays === 1 ? 'd' : 'd'}`;
  }

  const isNew = totalDays <= thresholdDays;

  return {
    days: totalDays,
    months,
    formatted,
    isNew,
    category: isNew ? 'NUEVO' : 'ANTIGUO',
    isPending: false
  };
}

export interface DualAdvisorTenure {
  company: AdvisorTenureInfo;
  campaign: AdvisorTenureInfo;
  importedLabel?: string;
}

export function calculateDualAdvisorTenure(
  advisor: Advisor,
  thresholdDays: number = 90,
  referenceDate?: Date
): DualAdvisorTenure {
  const company = calculateAdvisorTenure(
    advisor.hireDatePending ? undefined : advisor.hireDate, 
    thresholdDays, 
    referenceDate
  );
  
  const campaign = calculateAdvisorTenure(
    advisor.campaignStartDatePending ? undefined : advisor.campaignStartDate, 
    thresholdDays, 
    referenceDate
  );

  return {
    company,
    campaign,
    importedLabel: advisor.importedTenureLabel
  };
}

export interface TenureGroupMetrics {
  count: number;
  evaluationsCount: number;
  avgScore3C: number;
  avgScoreConnect: number;
  avgScoreClarify: number;
  avgScoreConvert: number;
  avgSph: number;
  avgConnectionMinutes: number;
  avgConnectionTime: string;
  topGaps: Array<{ name: string; dimension: DimensionId; count: number }>;
}

export interface TenureSegmentationSummary {
  thresholdDays: number;
  nuevos: TenureGroupMetrics;
  antiguos: TenureGroupMetrics;
  gap3C: number; // antiguos avg - nuevos avg
  gapSph: number;
  gapConnectionMinutes: number;
}

export function calculateTenureSegmentationAnalysis(
  advisors: Advisor[],
  evaluations: Evaluation[],
  opMeasurements: OperationalMeasurement[],
  thresholdDays: number = 90
): TenureSegmentationSummary {
  const newAdvisors = advisors.filter(a => calculateAdvisorTenure(a.hireDate, thresholdDays).isNew);
  const oldAdvisors = advisors.filter(a => !calculateAdvisorTenure(a.hireDate, thresholdDays).isNew);

  const newAdvisorIds = new Set(newAdvisors.map(a => a.id));
  const oldAdvisorIds = new Set(oldAdvisors.map(a => a.id));

  const newEvals = evaluations.filter(e => newAdvisorIds.has(e.advisorId));
  const oldEvals = evaluations.filter(e => oldAdvisorIds.has(e.advisorId));

  const calcGroupMetrics = (advGroup: Advisor[], evGroup: Evaluation[]): TenureGroupMetrics => {
    if (advGroup.length === 0) {
      return {
        count: 0,
        evaluationsCount: 0,
        avgScore3C: 0,
        avgScoreConnect: 0,
        avgScoreClarify: 0,
        avgScoreConvert: 0,
        avgSph: 0,
        avgConnectionMinutes: 0,
        avgConnectionTime: '00:00',
        topGaps: []
      };
    }

    const evWithTotal = evGroup.filter(e => e.scoreTotal !== null);
    const avgScore3C = evWithTotal.length > 0
      ? Math.round(evWithTotal.reduce((a, b) => a + (b.scoreTotal || 0), 0) / evWithTotal.length)
      : 0;

    const evWithConnect = evGroup.filter(e => e.scoreConnect !== null);
    const avgScoreConnect = evWithConnect.length > 0
      ? Math.round(evWithConnect.reduce((a, b) => a + (b.scoreConnect || 0), 0) / evWithConnect.length)
      : 0;

    const evWithClarify = evGroup.filter(e => e.scoreClarify !== null);
    const avgScoreClarify = evWithClarify.length > 0
      ? Math.round(evWithClarify.reduce((a, b) => a + (b.scoreClarify || 0), 0) / evWithClarify.length)
      : 0;

    const evWithConvert = evGroup.filter(e => e.scoreConvert !== null);
    const avgScoreConvert = evWithConvert.length > 0
      ? Math.round(evWithConvert.reduce((a, b) => a + (b.scoreConvert || 0), 0) / evWithConvert.length)
      : 0;

    // SPH and Connection Time from latest measurements or baseline
    const opValues = advGroup.map(a => {
      const advMeasures = opMeasurements.filter(m => m.advisorId === a.id);
      if (advMeasures.length > 0) {
        const latest = advMeasures[advMeasures.length - 1];
        return { sph: latest.sph, minutes: latest.connectionMinutes };
      }
      return {
        sph: a.baselineSph || 0.20,
        minutes: a.baselineConnectionMinutes || 360
      };
    });

    const avgSph = opValues.length > 0
      ? Number((opValues.reduce((a, b) => a + b.sph, 0) / opValues.length).toFixed(2))
      : 0;

    const avgMinutes = opValues.length > 0
      ? Math.round(opValues.reduce((a, b) => a + b.minutes, 0) / opValues.length)
      : 0;

    // Count top critical gaps (Only NO_CUMPLE)
    const gapCountMap: Record<string, { name: string; dimension: DimensionId; count: number }> = {};
    evGroup.forEach(ev => {
      ev.items.forEach(item => {
        if (getItemCompliance(item) === 'NO_CUMPLE') {
          const critDef = CRITERIA_DEFINITIONS.find(c => c.id === item.criterionId);
          if (critDef) {
            if (!gapCountMap[critDef.id]) {
              gapCountMap[critDef.id] = { name: critDef.name, dimension: critDef.dimensionId, count: 0 };
            }
            gapCountMap[critDef.id].count += 1;
          }
        }
      });
    });

    const topGaps = Object.values(gapCountMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      count: advGroup.length,
      evaluationsCount: evGroup.length,
      avgScore3C,
      avgScoreConnect,
      avgScoreClarify,
      avgScoreConvert,
      avgSph,
      avgConnectionMinutes: avgMinutes,
      avgConnectionTime: formatMinutesToHHMM(avgMinutes),
      topGaps
    };
  };

  const nuevosMetrics = calcGroupMetrics(newAdvisors, newEvals);
  const antiguosMetrics = calcGroupMetrics(oldAdvisors, oldEvals);

  return {
    thresholdDays,
    nuevos: nuevosMetrics,
    antiguos: antiguosMetrics,
    gap3C: antiguosMetrics.avgScore3C - nuevosMetrics.avgScore3C,
    gapSph: Number((antiguosMetrics.avgSph - nuevosMetrics.avgSph).toFixed(2)),
    gapConnectionMinutes: antiguosMetrics.avgConnectionMinutes - nuevosMetrics.avgConnectionMinutes
  };
}
