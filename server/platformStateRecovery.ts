// Preserve distinct historical records. The first source wins for the same ID.
export function mergeEvaluationSources(...sources: any[][]): any[] {
  const byId = new Map<string, any>();
  for (const source of sources) {
    for (const evaluation of source || []) {
      if (!evaluation || typeof evaluation.id !== 'string' || !evaluation.id) {
        throw new Error('Se encontró una evaluación sin identificador; se detuvo la lectura para proteger el historial.');
      }
      if (!byId.has(evaluation.id)) byId.set(evaluation.id, evaluation);
    }
  }
  return [...byId.values()];
}

export function readPlatformStateRows(rows: Record<string, any>[]): any | null {
  const chunks = rows.filter(row => /^global_\d+$/.test(row.id || ''));
  if (chunks.length) {
    // A malformed current snapshot must never become a successful empty response.
    const sorted = [...chunks].sort((a, b) => Number(a.id.slice(7)) - Number(b.id.slice(7)));
    if (!sorted.every((row, index) => Number(row.id.slice(7)) === index)) {
      throw new Error('APP_STATE contiene fragmentos duplicados o incompletos.');
    }
    const generations = new Set(sorted.map(row => row.updated_at || ''));
    if (generations.size > 1) throw new Error('APP_STATE contiene fragmentos de distintas escrituras.');
    const state = JSON.parse(sorted.map(row => row.payload_json || '').join(''));
    if (!state || !Array.isArray(state.evaluations)) throw new Error('APP_STATE no contiene una lista válida de evaluaciones.');
    return state;
  }
  const legacy = rows.filter(row => row.id === 'global' && row.payload_json);
  if (legacy.length > 1) throw new Error('APP_STATE contiene estados globales duplicados.');
  if (!legacy.length) return null;
  const state = JSON.parse(legacy[0].payload_json);
  if (!state || !Array.isArray(state.evaluations)) throw new Error('APP_STATE histórico inválido.');
  return state;
}
