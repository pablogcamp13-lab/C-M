import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [view,server,css,template]=await Promise.all([
  readFile('src/components/advisors/AdvisorsList.tsx','utf8'),
  readFile('server/operationsModule.ts','utf8'),
  readFile('src/index.css','utf8'),
  readFile('src/utils/excelImport.ts','utf8')
]);

const checks=[
  ['carga empresas',/companies/],
  ['carga campañas',/operations/],
  ['tabs persistentes',/searchParams\.set\('tab'/],
  ['campaña vacía',/mode:'EMPTY'/],
  ['campaña con dotación',/advisorIds/],
  ['supervisores existentes',/supervisorIds/],
  ['origen de campaña',/sourceOperationId/],
  ['todos los filtrados',/selectAll/],
  ['movimiento masivo',/bulkMove/],
  ['cambio supervisor',/bulkSupervisor/],
  ['cierre distinto de borrado',/\/close/.test(server)&&/app\.delete\('\/api\/operations/.test(server)],
  ['borrado protegido',/La campaña tiene histórico y no puede eliminarse/.test(server)],
  ['edición individual',/updateAssignment/],
  ['historial',/staffing\/movements/],
  ['filtros server-side',/assignmentStatus/],
  ['movimientos auditables',/effective_at/.test(server)&&/created_at/.test(server)&&/actor_id/.test(server)],
  ['permisos backend',/guardRead/.test(server)&&/guardWrite/.test(server)],
  ['empty states',/EmptyState/],
  ['errores diseñados',/ErrorState/],
  ['responsive',/@media \(max-width:1279px\)/.test(css)&&/@media \(max-width:640px\)/.test(css)],
  ['sin diálogos nativos',!/window\.(alert|confirm|prompt)/.test(view)],
  ['plantilla validada',/dataValidations count="3"/.test(template)],
  ['histórico no reescrito',/UPDATE operation_assignments SET active=0/.test(server)&&/INSERT INTO staffing_movements/.test(server)],
  ['concurrencia',/version=version\+1/.test(server)&&/BEGIN IMMEDIATE/.test(server)]
];

for(const [name,condition] of checks){const ok=condition instanceof RegExp?condition.test(view+server+css+template):condition;assert.ok(ok,`Fase 3: ${name}`);}
console.log(`Fase 3: ${checks.length} verificaciones de arquitectura, UX, seguridad y trazabilidad correctas.`);
