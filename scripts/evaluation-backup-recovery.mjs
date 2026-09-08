import { isDeepStrictEqual } from 'node:util';

export function parseEvaluationRows(values) {
  const [headers = [], ...rows] = values;
  for (const key of ['id', 'advisor_id', 'evaluator_id', 'evaluation_type', 'evaluated_at', 'payload_json', 'created_at']) {
    if (headers.filter(h => h === key).length !== 1) throw new Error(`Encabezado inválido: ${key}`);
  }
  const records = new Map();
  rows.forEach((cells, index) => {
    if (!cells.some(v => v !== '' && v != null)) return;
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    let evaluation;
    try { evaluation = JSON.parse(row.payload_json); } catch { throw new Error(`JSON inválido en EVALUATIONS, fila ${index + 2}`); }
    if (!evaluation || typeof evaluation.id !== 'string' || !evaluation.id || evaluation.id !== row.id
      || !['QUALITY', 'D3C'].includes(evaluation.evaluationType)
      || evaluation.evaluationType !== row.evaluation_type
      || !evaluation.advisorId || evaluation.advisorId !== row.advisor_id
      || !evaluation.evaluatorId || evaluation.evaluatorId !== row.evaluator_id
      || !evaluation.campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(evaluation.date || '')
      || !Array.isArray(evaluation.items)) throw new Error(`Evaluación inválida en fila ${index + 2}`);
    if (records.has(evaluation.id)) throw new Error(`ID duplicado en EVALUATIONS, fila ${index + 2}`);
    if (Object.values(row).some(v => String(v).length > 45000)) throw new Error(`Celda demasiado larga en fila ${index + 2}`);
    records.set(evaluation.id, { row, evaluation });
  });
  return { headers, records };
}

export function planRecovery(currentValues, backupValues, directories) {
  const current = parseEvaluationRows(currentValues);
  const backup = parseEvaluationRows(backupValues);
  if (!backup.records.size) throw new Error('El respaldo no contiene evaluaciones.');
  const missing = [...backup.records.values()].filter(r => !current.records.has(r.evaluation.id));
  const relations = { advisorId: 'ADVISORS', campaignId: 'CAMPAIGNS', evaluatorId: 'USERS', supervisorId: 'USERS', teamId: 'TEAMS' };
  for (const [field, table] of Object.entries(relations)) {
    const [headers = [], ...rows] = directories[table] || [];
    const column = headers.indexOf('id');
    if (column < 0) throw new Error(`Falta el directorio ${table}.`);
    const ids = new Set(rows.map(r => r[column]));
    const broken = missing.filter(r => r.evaluation[field] && !ids.has(r.evaluation[field]));
    if (broken.length) throw new Error(`${broken.length} evaluaciones sin referencia válida en ${table} (${field}). No se escribió nada.`);
  }
  const counts = records => records.reduce((out, r) => { out[r.evaluation.evaluationType] = (out[r.evaluation.evaluationType] || 0) + 1; return out; }, {});
  return {
    current, backup, missing,
    values: missing.map(r => current.headers.map(h => r.row[h] ?? '')),
    summary: {
      current: current.records.size, backup: backup.records.size, missing: missing.length,
      expectedTotal: current.records.size + missing.length, missingTypes: counts(missing),
      preservedConflicts: [...backup.records].filter(([id, r]) => current.records.has(id) && !isDeepStrictEqual(r.evaluation, current.records.get(id).evaluation)).length,
    },
  };
}

export function verifyRecovery(plan, afterValues) {
  const after = parseEvaluationRows(afterValues);
  for (const [id, record] of plan.current.records) {
    if (!isDeepStrictEqual(after.records.get(id)?.row, record.row)) throw new Error('Verificación fallida: un registro previo cambió. Conservar el respaldo y revisar antes de continuar.');
  }
  for (const record of plan.missing) {
    if (!isDeepStrictEqual(after.records.get(record.evaluation.id)?.evaluation, record.evaluation)) throw new Error('Verificación fallida: falta una evaluación recuperada o su contenido cambió.');
  }
  if (after.records.size !== plan.summary.expectedTotal) throw new Error('El total cambió durante la recuperación. Revisar antes de continuar.');
  return { verified: true, total: after.records.size, added: plan.missing.length, preserved: plan.current.records.size };
}

// The caller must pause all writers. Do not retry an uncertain append automatically.
export async function appendRecovery(plan, io) {
  if (!plan.missing.length) return verifyRecovery(plan, await io.read());
  await io.backup();
  const fresh = parseEvaluationRows(await io.read());
  if (!isDeepStrictEqual(fresh, plan.current)) throw new Error('EVALUATIONS cambió después del diagnóstico. No se escribió nada.');
  await io.append(plan.values);
  return verifyRecovery(plan, await io.read());
}
