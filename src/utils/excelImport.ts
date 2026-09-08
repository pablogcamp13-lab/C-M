import * as XLSX from 'xlsx';
import { Advisor, OperationalMeasurement, ImportHistoryLog, User } from '../types';

export interface RawExcelRow {
  [key: string]: any;
}

export interface NormalizedAdvisorRow {
  sheetName: string;
  rowIndex: number;
  dni: string;
  name: string;
  supervisorRaw: string;
  supervisorId?: string;
  schedule?: string;
  hireDate?: string; // YYYY-MM-DD
  hireDateRaw?: string;
  hireDatePending: boolean;
  campaignStartDate?: string; // YYYY-MM-DD
  campaignStartDateRaw?: string;
  terminationDate?: string; // YYYY-MM-DD
  terminationDateRaw?: string;
  importedTenureLabel?: string;
  managementFactor?: string | number;
  pv?: string | number;
  sph: number | null;
  sphRaw?: any;
  sa?: string | number;
  dif?: string | number;
  sourcePercentage1?: string | number;
  ac?: string | number;
  sourcePercentage2?: string | number;
  quartile?: string;
  companyName?: string;
  sourceStatus?: string;
  condition?: string;
  fte?: string | number;
  modality?: string;
  shiftRaw?: string;
  campaignName?: string;
  site?: string;
  indicators?: string | number;
  
  // Validation status
  status: 'READY' | 'WARNING' | 'ERROR';
  actionType: 'NEW' | 'UPDATE' | 'SKIP';
  errors: string[];
  warnings: string[];
  existingAdvisor?: Advisor;
}

export interface ExcelValidationResult {
  fileName: string;
  fileSize: number;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  errorRows: number;
  newCount: number;
  updateCount: number;
  duplicateCount: number;
  invalidCount: number;
  usesSheetCampaigns: boolean;
  detectedCampaigns: string[];
  rows: NormalizedAdvisorRow[];
  detectedSupervisors: Array<{
    nameRaw: string;
    matchedUserId?: string;
    matchedUserName?: string;
    count: number;
  }>;
  columnMappingSummary: Record<string, string>;
}

// Normalize column header keys for fuzzy matching
export function normalizeHeaderKey(header: string): string {
  if (!header) return '';
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9%]/g, ''); // remove punctuation/spaces, keep %
}

// Standard header dictionary matcher
const HEADER_PATTERNS: Record<string, string[]> = {
  dni: ['dni', 'documento', 'docidentidad', 'cedula', 'idasesor', 'documentoidentidad', 'nrodocumento'],
  name: ['asesores', 'asesor', 'nombre', 'nombres', 'nombrecompleto', 'nombrerepresentante', 'asesorrepresentante'],
  lastName: ['apellido', 'apellidos', 'apellidopaterno', 'apellidomaterno'],
  supervisor: ['supervisor', 'supervisora', 'sup', 'teamleader', 'lider', 'coordinador'],
  schedule: ['horario', 'jornada', 'horariogestion', 'horariotrabajo'],
  hireDate: ['fingreso', 'fechadeingreso', 'fechaingreso', 'fingresoempresa', 'fechaingresoempresa'],
  campaignStartDate: ['fcampana', 'fechacampana', 'fechadecampana', 'fingresocampana', 'fechaingresocampana'],
  terminationDate: ['fcese', 'fechacese', 'fechadecese', 'fegreso', 'fechasalida'],
  tenureLabel: ['antiguedad', 'rangoantiguedad', 'antiguedadempresa', 'antiguedadlabel'],
  gestion: ['gestion', 'factorgestion', 'tgestion', 'gestionfactor'],
  pv: ['pv', 'puntosventa', 'puntoventa'],
  sph: ['sph', 'salesperhour', 'ventashora', 'ventasporhora', 'ventashoras'],
  sa: ['sa'],
  dif: ['dif', 'diferencia'],
  pct1: ['%', 'porcentaje', 'pct', 'porcentaje1', 'pct1'],
  ac: ['ac'],
  pct2: ['%2', 'porcentaje2', 'pct2', 'porcentajeacum'],
  quartile: ['cuartil', 'cuartilsph', 'cuartiloperacional', 'q'],
  sourceStatus: ['estado'],
  condition: ['condicion'],
  fte: ['fte'],
  modality: ['modalidad'],
  shiftRaw: ['turno'],
  campaign: ['campana'],
  company: ['empresa', 'compania', 'cliente'],
  site: ['sede'],
  indicators: ['indicadores', 'indicador']
};

export function matchHeaderToField(header: string): string | null {
  const norm = normalizeHeaderKey(header);
  for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
    if (patterns.includes(norm)) {
      return field;
    }
  }
  // Secondary substring check for special headers
  if (norm.includes('fingreso') || (norm.includes('fecha') && norm.includes('ingreso') && !norm.includes('campana'))) {
    return 'hireDate';
  }
  if (norm.includes('fcampana') || (norm.includes('fecha') && norm.includes('campana'))) {
    return 'campaignStartDate';
  }
  if (norm.includes('fcese') || (norm.includes('fecha') && norm.includes('cese'))) {
    return 'terminationDate';
  }
  if (norm.includes('asesor')) return 'name';
  if (norm.includes('supervis')) return 'supervisor';
  if (norm.includes('horario')) return 'schedule';
  if (norm === 'turno') return 'shiftRaw';
  if (norm.includes('antigue')) return 'tenureLabel';
  if (norm === 'sph' || norm.includes('sph')) return 'sph';
  if (norm === 'pv') return 'pv';
  if (norm === 'sa') return 'sa';
  if (norm === 'dif') return 'dif';
  if (norm === 'ac') return 'ac';
  if (norm === '%' || norm === 'porcentaje') return 'pct1';
  if (norm === '%2' || norm === 'porcentaje2') return 'pct2';
  if (norm.includes('cuartil')) return 'quartile';
  if (norm.includes('gestion')) return 'gestion';
  if (norm === 'estado') return 'sourceStatus';
  if (norm.includes('condicion')) return 'condition';
  if (norm === 'fte') return 'fte';
  if (norm.includes('modalidad')) return 'modality';
  if (norm === 'campana') return 'campaign';
  if (norm === 'sede') return 'site';
  if (norm.includes('indicador')) return 'indicators';

  return null;
}

// Clean string representation of DNI, preserving text/zeros
export function cleanDni(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // If scientific notation e.g. 1.2345678e+7
  if (/^[0-9]+(\.[0-9]+)?e\+[0-9]+$/i.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = num.toLocaleString('fullwide', { useGrouping: false });
    }
  }
  return str.replace(/\s+/g, '');
}

// Clean advisor name: trim, collapse spaces, preserve accents and ñ
export function cleanAdvisorName(value: any): string {
  if (!value) return '';
  return String(value)
    .trim()
    .replace(/\s+/g, ' ');
}

// Parse date flexibly: Excel serial, dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd
export function parseExcelDate(value: any): { dateString?: string; isPending: boolean; rawText: string } {
  if (value === null || value === undefined) {
    return { isPending: true, rawText: '' };
  }

  const str = String(value).trim();
  if (!str || str === '#N/D' || str === '#N/A' || str === 'null' || str === 'undefined' || str === '-' || str === 'PENDIENTE') {
    return { isPending: true, rawText: str };
  }

  // If XLSX gave a Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return { dateString: `${yyyy}-${mm}-${dd}`, isPending: false, rawText: str };
  }

  // If numeric Excel Serial Date
  if (typeof value === 'number' && value > 1000 && value < 100000) {
    try {
      const dateObj = XLSX.SSF.parse_date_code(value);
      if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
        const yyyy = dateObj.y;
        const mm = String(dateObj.m).padStart(2, '0');
        const dd = String(dateObj.d).padStart(2, '0');
        return { dateString: `${yyyy}-${mm}-${dd}`, isPending: false, rawText: str };
      }
    } catch {
      // ignore and continue string parsing
    }
  }

  // Check dd/mm/yyyy or d/m/yyyy
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      const yyyy = String(year);
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { dateString: `${yyyy}-${mm}-${dd}`, isPending: false, rawText: str };
    }
  }

  // Check yyyy-mm-dd
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      const yyyy = String(year);
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { dateString: `${yyyy}-${mm}-${dd}`, isPending: false, rawText: str };
    }
  }

  return { isPending: true, rawText: str };
}

// Parse SPH as decimal number (handles commas, percent signs, etc.)
export function parseSph(value: any): { value: number | null; raw: any; isValid: boolean } {
  if (value === null || value === undefined || value === '') {
    return { value: null, raw: value, isValid: false };
  }
  if (typeof value === 'number') {
    if (isNaN(value)) return { value: null, raw: value, isValid: false };
    return { value: Number(value.toFixed(4)), raw: value, isValid: true };
  }
  const str = String(value).trim().replace(',', '.');
  if (str === '#N/D' || str === '#N/A' || str === '-' || str === '') {
    return { value: null, raw: value, isValid: false };
  }
  const num = parseFloat(str);
  if (isNaN(num)) {
    return { value: null, raw: value, isValid: false };
  }
  return { value: Number(num.toFixed(4)), raw: value, isValid: true };
}

// Main parser function
export async function parseAndValidateExcel(
  file: File,
  existingAdvisors: Advisor[],
  existingUsers: User[]
): Promise<ExcelValidationResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!workbook.SheetNames.length) throw new Error('El archivo seleccionado está vacío.');

  const usesSheetCampaigns = workbook.SheetNames.length > 1;
  const columnMappingSummary: Record<string, string> = {};
  const supervisorsList = existingUsers.filter(u => u.role === 'SUPERVISOR' || u.role === 'ADMINISTRADOR');
  const supervisorCounts: Record<string, { count: number; matchedId?: string; matchedName?: string }> = {};

  const existingDniMap = new Map<string, Advisor>();
  existingAdvisors.forEach(a => {
    if (a.dni) existingDniMap.set(cleanDni(a.dni), a);
  });

  const dniSeenInFile = new Set<string>();
  const normalizedRows: NormalizedAdvisorRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
    if (!rawGrid.length) continue;

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rawGrid.length, 15); i++) {
      const normalized = rawGrid[i].map(cell => normalizeHeaderKey(String(cell)));
      if (normalized.includes('dni') && normalized.some(value => value === 'asesor' || value === 'asesores' || value === 'nombre' || value === 'nombres')) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex < 0) continue;

    const columnMapping: Record<number, string> = {};
    rawGrid[headerRowIndex].forEach((header, colIdx) => {
      const label = String(header || '').trim();
      const field = matchHeaderToField(label);
      if (label && field) {
        columnMapping[colIdx] = field;
        columnMappingSummary[`${sheetName}: ${label}`] = field;
      }
    });
    const mappedFields = Object.values(columnMapping);
    if (!mappedFields.includes('dni') || !mappedFields.includes('name')) continue;

    for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const rowData = rawGrid[r];
    // Check if entire row is empty
    if (!rowData || rowData.every(c => c === '' || c === null || c === undefined)) {
      continue;
    }

    const rowObj: Record<string, any> = {};
    rowData.forEach((cellVal, colIdx) => {
      const fieldName = columnMapping[colIdx];
      if (fieldName) {
        rowObj[fieldName] = cellVal;
      }
    });

    const dni = cleanDni(rowObj.dni);
    const name = cleanAdvisorName([rowObj.name, rowObj.lastName].filter(Boolean).join(' '));
    const supervisorRaw = String(rowObj.supervisor || '').trim();
    const schedule = rowObj.schedule ? String(rowObj.schedule).trim() : undefined;
    const importedTenureLabel = rowObj.tenureLabel ? String(rowObj.tenureLabel).trim() : undefined;
    const campaignName = cleanAdvisorName(rowObj.campaign) || sheetName.trim();

    const hireDateParsed = parseExcelDate(rowObj.hireDate);
    const campaignDateParsed = parseExcelDate(rowObj.campaignStartDate);
    const terminationDateParsed = parseExcelDate(rowObj.terminationDate);

    const sphParsed = parseSph(rowObj.sph);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validation 1: DNI
    if (!dni) {
      errors.push('DNI vacío o no detectado en la fila');
    } else if (dniSeenInFile.has(dni)) {
      warnings.push(`DNI duplicado (${dni}) dentro del Excel; se omitirá esta fila`);
    } else {
      dniSeenInFile.add(dni);
    }

    // Validation 2: Name
    if (!name) {
      errors.push('Nombre del asesor vacío');
    }

    // Validation 3: SPH
    if (!sphParsed.isValid && rowObj.sph !== undefined && rowObj.sph !== '' && rowObj.sph !== '#N/D') {
      errors.push(`SPH con formato inválido ("${rowObj.sph}")`);
    }

    // Warnings on dates
    if (hireDateParsed.isPending) {
      warnings.push('F. INGRESO no disponible (#N/D o vacía). Asesor quedará con estado "Fecha pendiente"');
    }

    if (campaignDateParsed.isPending && rowObj.campaignStartDate) {
      warnings.push('F. CAMPAÑA con valor no disponible o pendiente');
    }

    // Supervisor matching
    let matchedSupervisorId: string | undefined = undefined;
    if (supervisorRaw) {
      const normSup = supervisorRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const foundSup = supervisorsList.find(s => {
        const normExisting = s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normExisting.includes(normSup) || normSup.includes(normExisting);
      });

      if (foundSup) {
        matchedSupervisorId = foundSup.id;
      } else {
        warnings.push(`Supervisor "${supervisorRaw}" no vinculado a usuario existente`);
      }

      if (!supervisorCounts[supervisorRaw]) {
        supervisorCounts[supervisorRaw] = {
          count: 0,
          matchedId: foundSup?.id,
          matchedName: foundSup?.name
        };
      }
      supervisorCounts[supervisorRaw].count++;
    }

    // Existing advisor check
    const existingAdvisor = dni ? existingDniMap.get(dni) : undefined;
    const duplicateInWorkbook = Boolean(dni && dniSeenInFile.has(dni) && normalizedRows.some(item => item.dni === dni));
    const actionType: 'NEW' | 'UPDATE' | 'SKIP' = duplicateInWorkbook
      ? 'SKIP'
      : existingAdvisor
        ? (usesSheetCampaigns ? 'SKIP' : 'UPDATE')
        : 'NEW';
    if (existingAdvisor && usesSheetCampaigns) warnings.push('DNI ya existente; se omitirá sin sobrescribir información');

    let status: 'READY' | 'WARNING' | 'ERROR' = 'READY';
    if (errors.length > 0) {
      status = 'ERROR';
    } else if (warnings.length > 0) {
      status = 'WARNING';
    }

    normalizedRows.push({
      sheetName,
      rowIndex: r + 1,
      dni,
      name,
      supervisorRaw,
      supervisorId: matchedSupervisorId,
      schedule,
      hireDate: hireDateParsed.dateString,
      hireDateRaw: hireDateParsed.rawText,
      hireDatePending: hireDateParsed.isPending,
      campaignStartDate: campaignDateParsed.dateString,
      campaignStartDateRaw: campaignDateParsed.rawText,
      terminationDate: terminationDateParsed.dateString,
      terminationDateRaw: terminationDateParsed.rawText,
      importedTenureLabel,
      managementFactor: rowObj.gestion,
      pv: rowObj.pv,
      sph: sphParsed.value,
      sphRaw: rowObj.sph,
      sa: rowObj.sa,
      dif: rowObj.dif,
      sourcePercentage1: rowObj.pct1,
      ac: rowObj.ac,
      sourcePercentage2: rowObj.pct2,
      quartile: rowObj.quartile ? String(rowObj.quartile).trim() : undefined,
      companyName: rowObj.company ? String(rowObj.company).trim() : undefined,
      sourceStatus: rowObj.sourceStatus ? String(rowObj.sourceStatus).trim() : undefined,
      condition: rowObj.condition ? String(rowObj.condition).trim() : undefined,
      fte: rowObj.fte,
      modality: rowObj.modality ? String(rowObj.modality).trim() : undefined,
      shiftRaw: rowObj.shiftRaw ? String(rowObj.shiftRaw).trim() : undefined,
      campaignName,
      site: rowObj.site ? String(rowObj.site).trim() : undefined,
      indicators: rowObj.indicators,
      status,
      actionType,
      errors,
      warnings,
      existingAdvisor
    });
    }
  }

  if (!normalizedRows.length) {
    throw new Error('No se encontraron hojas con los encabezados DNI y ASESOR.');
  }

  // Sort rows by SPH ascending (menor a mayor SPH)
  normalizedRows.sort((a, b) => {
    const sphA = a.sph !== null && a.sph !== undefined ? a.sph : 999999;
    const sphB = b.sph !== null && b.sph !== undefined ? b.sph : 999999;
    if (sphA !== sphB) return sphA - sphB;
    return (a.name || '').localeCompare(b.name || '');
  });

  const detectedSupervisors = Object.entries(supervisorCounts).map(([nameRaw, data]) => ({
    nameRaw,
    matchedUserId: data.matchedId,
    matchedUserName: data.matchedName,
    count: data.count
  }));

  const readyRows = normalizedRows.filter(r => r.status === 'READY').length;
  const warningRows = normalizedRows.filter(r => r.status === 'WARNING').length;
  const errorRows = normalizedRows.filter(r => r.status === 'ERROR').length;
  const newCount = normalizedRows.filter(r => r.status !== 'ERROR' && r.actionType === 'NEW').length;
  const updateCount = normalizedRows.filter(r => r.status !== 'ERROR' && r.actionType === 'UPDATE').length;
  const duplicateCount = normalizedRows.filter(r => r.actionType === 'SKIP').length;
  const invalidCount = normalizedRows.filter(r => r.status === 'ERROR').length;

  return {
    fileName: file.name,
    fileSize: file.size,
    totalRows: normalizedRows.length,
    readyRows,
    warningRows,
    errorRows,
    newCount,
    updateCount,
    duplicateCount,
    invalidCount,
    usesSheetCampaigns,
    detectedCampaigns: workbook.SheetNames.filter(name => normalizedRows.some(row => row.sheetName === name)),
    rows: normalizedRows,
    detectedSupervisors,
    columnMappingSummary
  };
}

export async function getExcelSheetNames(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', bookSheets: true });
  return workbook.SheetNames;
}

export type StaffingTemplateSource = {
  companies?: Array<{ name: string }>;
  campaigns?: Array<{ name: string }>;
  supervisors?: Array<{ name: string }>;
};

const uniqueLabels = (items: Array<{ name: string }> = []) =>
  [...new Set(items.map(item => String(item.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

/** Generates a real XLSX file with Excel data validations backed by a hidden list sheet. */
export function generateSampleExcelTemplate(source: StaffingTemplateSource = {}): void {
  const headers = ['DNI *', 'Nombre *', 'Apellido *', 'Supervisor', 'Cuartil', 'Campaña', 'Empresa'];
  const rows = [headers, ['', '', '', '', '', '', '']];
  const companies = uniqueLabels(source.companies);
  const campaigns = uniqueLabels(source.campaigns);
  const supervisors = uniqueLabels(source.supervisors);
  const lists = [
    ['Empresas', 'Campañas', 'Supervisores'],
    ...Array.from({ length: Math.max(1, companies.length, campaigns.length, supervisors.length) }, (_, index) => [companies[index] || '', campaigns[index] || '', supervisors[index] || ''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:14},{wch:22},{wch:24},{wch:28},{wch:12},{wch:28},{wch:24}];
  const listSheet = XLSX.utils.aoa_to_sheet(lists);
  const last = (count: number) => Math.max(2, count + 1);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dotación');
  XLSX.utils.book_append_sheet(wb, listSheet, 'Listas');
  wb.Workbook = {
    Sheets: [{ Hidden: 0 }, { Hidden: 1 }],
    Names: [
      { Name: 'EmpresasDotacion', Ref: `Listas!$A$2:$A$${last(companies.length)}` },
      { Name: 'CampanasDotacion', Ref: `Listas!$B$2:$B$${last(campaigns.length)}` },
      { Name: 'SupervisoresDotacion', Ref: `Listas!$C$2:$C$${last(supervisors.length)}` }
    ]
  };
  const validations = '<dataValidations count="3">' +
    '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valor no permitido" error="Selecciona un valor de la lista de la plataforma." sqref="D2:D1001"><formula1>=SupervisoresDotacion</formula1></dataValidation>' +
    '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valor no permitido" error="Selecciona un valor de la lista de la plataforma." sqref="F2:F1001"><formula1>=CampanasDotacion</formula1></dataValidation>' +
    '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valor no permitido" error="Selecciona un valor de la lista de la plataforma." sqref="G2:G1001"><formula1>=EmpresasDotacion</formula1></dataValidation>' +
    '</dataValidations>';
  const download = (content: BlobPart) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Plantilla_Dotacion_3C.xlsx';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  try {
    const cfb: any = (XLSX as any).CFB.read(XLSX.write(wb, { type: 'binary', bookType: 'xlsx' }), { type: 'binary' });
    const sheetXml: any = (XLSX as any).CFB.find(cfb, 'sheet1.xml');
    if (!sheetXml) throw new Error('No se encontró la hoja principal para aplicar las listas.');
    const xml = typeof sheetXml.content === 'string' ? sheetXml.content : new TextDecoder().decode(sheetXml.content);
    // CFB accepts a binary XML string in both the browser and Node builds of SheetJS.
    sheetXml.content = xml.replace('</worksheet>', `${validations}</worksheet>`);
    const output: any = (XLSX as any).CFB.write(cfb, { type: 'binary', fileType: 'zip' });
    const bytes = typeof output === 'string'
      ? Uint8Array.from(output, byte => byte.charCodeAt(0))
      : output instanceof ArrayBuffer ? new Uint8Array(output)
      : ArrayBuffer.isView(output) ? new Uint8Array(output.buffer, output.byteOffset, output.byteLength)
      : new Uint8Array(output);
    download(bytes);
  } catch (error) {
    // A download must never fail merely because a browser blocks advanced ZIP rewriting.
    console.warn('No se pudieron insertar las listas desplegables; se descarga la plantilla base.', error);
    download(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  }
}
