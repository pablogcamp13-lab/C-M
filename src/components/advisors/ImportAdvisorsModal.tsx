import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { 
  parseAndValidateExcel, 
  getExcelSheetNames,
  generateSampleExcelTemplate, 
  ExcelValidationResult, 
  NormalizedAdvisorRow 
} from '../../utils/excelImport';
import { 
  X, 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Download, 
  ArrowRight, 
  ArrowLeft, 
  Users, 
  Calendar, 
  Check, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  Info,
  RefreshCw
} from 'lucide-react';

interface ImportAdvisorsModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const ImportAdvisorsModal: React.FC<ImportAdvisorsModalProps> = ({ 
  onClose, 
  onSuccess 
}) => {
  const { companies, operations, campaigns, users, advisors, importAdvisorsBatch } = useApp();

  // Wizard step: 1 = Cargar & Parámetros, 2 = Validar & Previsualización, 3 = Confirmar / Resultado
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Import Parameters
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('');
  const [periodName, setPeriodName] = useState<string>('Agosto 2026');
  const [cutoffDate, setCutoffDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isBaseline, setIsBaseline] = useState<boolean>(false);
  const [baselineHandling, setBaselineHandling] = useState<'KEEP' | 'REPLACE'>('KEEP');

  // File parsing & validation state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sheetCount, setSheetCount] = useState<number | null>(null);
  const [validationResult, setValidationResult] = useState<ExcelValidationResult | null>(null);

  // Supervisor mapping adjustments in Step 2
  const [supervisorOverrides, setSupervisorOverrides] = useState<Record<string, string>>({});
  const [campaignMappings, setCampaignMappings] = useState<Record<string, string>>({});

  // Filter in preview table
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'READY' | 'WARNING' | 'ERROR'>('ALL');

  // Final Results
  const [importSummary, setImportSummary] = useState<{
    newCount: number;
    updateCount: number;
    measurementsCount: number;
    errorCount: number;
    warningCount: number;
    duplicateCount: number;
    invalidCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns[0];
  const supervisorsList = users.filter(u => u.role === 'SUPERVISOR' || u.role === 'ADMINISTRADOR');

  // Handle file reading
  const handleProcessFile = async (file: File) => {
    // Validate format
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setParseError('Formato de archivo no compatible. Por favor sube un archivo .xlsx, .xls o .csv.');
      return;
    }

    // Validate size (20MB)
    if (file.size > 20 * 1024 * 1024) {
      setParseError('El archivo excede el tamaño máximo permitido de 20 MB.');
      return;
    }

    setParseError(null);
    setIsParsing(true);

    try {
      const result = await parseAndValidateExcel(file, advisors, users);
      setValidationResult(result);
      const normalized = (value: string) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      setCampaignMappings(Object.fromEntries(result.detectedCampaigns.map(name => [
        name,
        campaigns.find(campaign => normalized(campaign.name) === normalized(name))?.id || '__NEW__'
      ])));

      // Initialize supervisor mappings
      const initialMap: Record<string, string> = {};
      result.detectedSupervisors.forEach(s => {
        if (s.matchedUserId) {
          initialMap[s.nameRaw] = s.matchedUserId;
        }
      });
      setSupervisorOverrides(initialMap);

      setStep(2);
    } catch (err: any) {
      console.error('Error parsing Excel:', err);
      setParseError(err?.message || 'Error al procesar el archivo Excel. Revisa el formato.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectedFile = async (file: File) => {
    const name=file.name.toLowerCase();
    if(!name.endsWith('.xlsx')&&!name.endsWith('.xls')&&!name.endsWith('.csv')) { setParseError('Formato de archivo no compatible. Por favor sube un archivo .xlsx, .xls o .csv.'); return; }
    if(file.size>20*1024*1024) { setParseError('El archivo excede el tamaño máximo permitido de 20 MB.'); return; }
    setParseError(null); setPendingFile(file);
    try {
      const names=await getExcelSheetNames(file); setSheetCount(names.length);
      if(names.length===1&&file.name.toLowerCase()==='plantilla_importacion_asesores_3c_completada.xlsx') {
        const company=companies.find(item=>item.name.trim().toLocaleLowerCase('es')==='talent up');
        const operation=operations.find(item=>item.companyId===company?.id&&campaigns.find(campaign=>campaign.id===item.campaignId)?.name.trim().toLocaleLowerCase('es')==='migra');
        if(company&&operation) { setSelectedCompanyId(company.id);setSelectedOperationId(operation.id);setSelectedCampaignId(operation.campaignId); }
      }
      if(names.length>1) await handleProcessFile(file);
    } catch(err:any) { setParseError(err?.message||'Error al leer la estructura del archivo.'); }
  };

  const handleContinueSingleSheet = () => {
    if(!pendingFile)return;
    if(!selectedOperationId) { setParseError('Selecciona la campaña de destino antes de continuar.'); return; }
    void handleProcessFile(pendingFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleSelectedFile(e.target.files[0]);
    }
  };

  // Supervisor override changer
  const handleSupervisorOverrideChange = (rawName: string, userId: string) => {
    setSupervisorOverrides(prev => ({
      ...prev,
      [rawName]: userId
    }));
  };

  // Confirm and execute import
  const handleExecuteImport = () => {
    if (!validationResult) return;
    if (!validationResult.usesSheetCampaigns && !selectedOperationId) { setParseError('Selecciona la campaña de destino antes de continuar.'); setStep(1); return; }

    // Apply supervisor mappings to rows
    const rowsWithMappedSupervisors = validationResult.rows.map(row => {
      const mappedUserId = supervisorOverrides[row.supervisorRaw];
      return {
        ...row,
        supervisorId: mappedUserId || row.supervisorId
      };
    });

    const summary = importAdvisorsBatch({
      campaignId: selectedCampaign?.id || '',
      campaignName: selectedCampaign?.name || 'Campaña importada',
      operationId: selectedOperationId || undefined,
      periodName: periodName.trim() || 'Periodo Actual',
      cutoffDate,
      isBaseline,
      baselineHandling,
      fileName: validationResult.fileName,
      fileSize: validationResult.fileSize,
      usesSheetCampaigns: validationResult.usesSheetCampaigns,
      campaignMappings,
      rows: rowsWithMappedSupervisors
    });

    setImportSummary(summary);
    setStep(3);
  };

  // Download error log report
  const handleDownloadReport = () => {
    if (!validationResult) return;

    const reportContent = {
      timestamp: new Date().toISOString(),
      archivo: validationResult.fileName,
      campaña: validationResult.usesSheetCampaigns ? validationResult.detectedCampaigns : [selectedCampaign?.name],
      periodo: periodName,
      fechaCorte: cutoffDate,
      resumen: {
        totalDetectadas: validationResult.totalRows,
        listas: validationResult.readyRows,
        advertencias: validationResult.warningRows,
        errores: validationResult.errorRows
      },
      filasConErrores: validationResult.rows
        .filter(r => r.status === 'ERROR')
        .map(r => ({
          hoja: r.sheetName,
          fila: r.rowIndex,
          dni: r.dni,
          asesor: r.name,
          errores: r.errors
        })),
      filasConAdvertencias: validationResult.rows
        .filter(r => r.status === 'WARNING')
        .map(r => ({
          hoja: r.sheetName,
          fila: r.rowIndex,
          dni: r.dni,
          asesor: r.name,
          advertencias: r.warnings
        }))
    };

    const blob = new Blob([JSON.stringify(reportContent, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Importacion_${validationResult.fileName.replace(/\.[^/.]+$/, "")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered rows for preview table
  const displayedRows = (validationResult?.rows || []).filter(r => {
    if (previewFilter === 'READY') return r.status === 'READY';
    if (previewFilter === 'WARNING') return r.status === 'WARNING';
    if (previewFilter === 'ERROR') return r.status === 'ERROR';
    return true;
  });

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="cm-modal max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#031E3C] text-white px-6 py-4 flex items-center justify-between border-b border-[#0B2B50]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight font-heading">
                IMPORTAR ASESORES
              </h3>
              <p className="text-xs text-slate-300">
                Carga masiva operacional y actualización periódica desde Excel (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Wizard Indicator */}
        <div className="bg-[#F6F7F9] border-b border-[#E5E8EC] px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-2 font-bold ${
              step === 1 ? 'text-[#031E3C]' : 'text-slate-400'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 1 ? 'bg-[#031E3C] text-white font-bold' : step > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {step > 1 ? '✓' : '1'}
              </span>
              <span>1. Cargar Archivo</span>
            </div>

            <div className={`w-8 h-px ${step > 1 ? 'bg-emerald-600' : 'bg-slate-300'}`} />

            <div className={`flex items-center gap-2 font-bold ${
              step === 2 ? 'text-[#031E3C]' : 'text-slate-400'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 2 ? 'bg-[#031E3C] text-white font-bold' : step > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {step > 2 ? '✓' : '2'}
              </span>
              <span>2. Validar & Previsualización</span>
            </div>

            <div className={`w-8 h-px ${step > 2 ? 'bg-emerald-600' : 'bg-slate-300'}`} />

            <div className={`flex items-center gap-2 font-bold ${
              step === 3 ? 'text-[#031E3C]' : 'text-slate-400'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 3 ? 'bg-[#031E3C] text-white font-bold' : 'bg-slate-300 text-slate-700'
              }`}>
                3
              </span>
              <span>3. Confirmación</span>
            </div>
          </div>

          <button
            type="button"
            onClick={generateSampleExcelTemplate}
            className="flex items-center gap-1.5 text-xs text-[#031E3C] hover:text-[#FF6B00] font-semibold transition-colors cursor-pointer bg-white px-2.5 py-1 rounded-md border border-[#E5E8EC]"
            title="Descargar archivo Excel con las 17 columnas reconocidas"
          >
            <Download className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span>Descargar Plantilla Excel</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ==================================================== */}
          {/* PASO 1: CARGAR ARCHIVO & PARÁMETROS                  */}
          {/* ==================================================== */}
          {step === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              
              {/* Contextual Parameters (Mandatory context for SPH) */}
              <div className="bg-white border border-[#E5E8EC] rounded-xl p-4 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-[#E5E8EC] pb-2">
                  <Calendar className="w-4 h-4 text-[#FF6B00]" />
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#031E3C] font-heading">
                    Contexto Temporal & Campaña (Obligatorio)
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Empresa destino</label>
                    <select value={selectedCompanyId} onChange={e=>{setSelectedCompanyId(e.target.value);setSelectedOperationId('');setSelectedCampaignId('');}} className="w-full bg-[#F6F7F9] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#031E3C]"><option value="">Según archivo</option>{companies.filter(c=>c.status==='ACTIVA').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Campaña destino</label>
                    <select value={selectedOperationId} disabled={!selectedCompanyId} onChange={e=>{const operation=operations.find(o=>o.id===e.target.value);setSelectedOperationId(e.target.value);setSelectedCampaignId(operation?.campaignId||'');}} className="w-full bg-[#F6F7F9] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#031E3C]"><option value="">Según archivo</option>{operations.filter(o=>o.status==='ACTIVA'&&o.companyId===selectedCompanyId).map(o=><option key={o.id} value={o.id}>{campaigns.find(c=>c.id===o.campaignId)?.name||o.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Periodo de Información *
                    </label>
                    <input
                      type="text"
                      value={periodName}
                      onChange={(e) => setPeriodName(e.target.value)}
                      placeholder="Ej: Agosto 2026 / Semana 34"
                      className="w-full bg-[#F6F7F9] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#031E3C] focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Fecha de Corte *
                    </label>
                    <input
                      type="date"
                      value={cutoffDate}
                      onChange={(e) => setCutoffDate(e.target.value)}
                      className="w-full bg-[#F6F7F9] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#031E3C] focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
                    />
                  </div>
                </div>

                {/* Baseline Option */}
                <div className="bg-[#F6F7F9] rounded-lg p-3 border border-[#E5E8EC] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isBaseline}
                      onChange={(e) => setIsBaseline(e.target.checked)}
                      className="rounded border-[#E5E8EC] text-[#031E3C] focus:ring-[#031E3C] w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[#031E3C]">
                      Utilizar esta carga como línea base operacional
                    </span>
                  </label>
                  <p className="text-[11px] text-[#667085] ml-6">
                    Si se selecciona, el primer SPH importado se registrará además como <strong className="text-[#031E3C]">baseline_sph</strong> para cada asesor.
                  </p>

                  {isBaseline && (
                    <div className="ml-6 pt-2 border-t border-slate-200 mt-2">
                      <span className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Si el asesor ya posee una línea base registrada:
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="baselineHandling"
                            checked={baselineHandling === 'KEEP'}
                            onChange={() => setBaselineHandling('KEEP')}
                            className="text-[#031E3C] focus:ring-[#031E3C]"
                          />
                          <span className="text-slate-700 font-medium">Mantener existente (Recomendado)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="baselineHandling"
                            checked={baselineHandling === 'REPLACE'}
                            onChange={() => setBaselineHandling('REPLACE')}
                            className="text-[#031E3C] focus:ring-[#031E3C]"
                          />
                          <span className="text-rose-700 font-semibold">Reemplazar línea base</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-[#FF6B00] bg-[#FF6B00]/5 scale-[1.01]' 
                    : 'border-[#E5E8EC] hover:border-[#031E3C] bg-white hover:bg-[#F6F7F9]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#031E3C]/5 text-[#031E3C] flex items-center justify-center mb-3">
                  <UploadCloud className="w-7 h-7 text-[#031E3C]" />
                </div>

                <h4 className="font-bold text-sm text-[#031E3C] font-heading">
                  Arrastra tu archivo Excel aquí o haz clic para seleccionar
                </h4>
                <p className="text-xs text-[#667085] mt-1">
                  Formatos soportados: <span className="font-mono font-semibold text-[#031E3C]">.xlsx, .xls, .csv</span> (hasta 20 MB)
                </p>

                {pendingFile && <p className="mt-2 text-xs font-bold text-emerald-700">Archivo seleccionado: {pendingFile.name}{sheetCount===1?' · 1 hoja':''}</p>}

                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#031E3C] text-white text-xs font-semibold rounded-lg shadow-xs hover:bg-[#0B2B50] transition-colors">
                  <FileSpreadsheet className="w-4 h-4 text-[#FF6B00]" />
                  <span>Explorar Archivo</span>
                </div>
              </div>

              {/* Parsing Spinner */}
              {isParsing && (
                <div className="flex items-center justify-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-[#031E3C]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#FF6B00]" />
                  <span>Analizando estructura de columnas y normalizando datos...</span>
                </div>
              )}

              {/* Error Message */}
              {parseError && (
                <div className="flex items-start gap-2.5 p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">{parseError.startsWith('Selecciona la campaña')?'Campaña requerida:':'Error al leer el archivo:'}</span>
                    <span>{parseError}</span>
                  </div>
                </div>
              )}

              {/* Column specifications & info */}
              <div className="bg-[#F6F7F9] border border-[#E5E8EC] rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-[#031E3C]">
                  <Info className="w-4 h-4 text-[#FF6B00]" />
                  <span>Columnas operacionales reconocidas automáticamente:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'DNI', 'ASESORES', 'SUPERVISOR', 'HORARIO', 'F. INGRESO', 
                    'F. CAMPAÑA', 'F. CESE', 'ANTIGÜEDAD', 'GESTION', 'PV', 
                    'SPH', 'SA', 'DIF', '%', 'AC', '%2', 'CUARTIL'
                  ].map(col => (
                    <span key={col} className="px-2 py-0.5 bg-white border border-[#E5E8EC] rounded text-[11px] font-mono text-[#031E3C] font-semibold">
                      {col}
                    </span>
                  ))}
                </div>
                  <p className="text-[11px] text-[#667085] pt-1">
                  💡 En archivos con varias hojas, cada hoja se importa como una campaña. Los encabezados se leen por nombre y el DNI se conserva como identificador.
                </p>
              </div>

            </div>
          )}

          {/* ==================================================== */}
          {/* PASO 2: VALIDAR & PREVISUALIZACIÓN                   */}
          {/* ==================================================== */}
          {step === 2 && validationResult && (
            <div className="space-y-4">
              
              {/* Validation Summary Metrics Bar */}
              <div className="bg-white border border-[#E5E8EC] rounded-xl p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8EC] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#031E3C] font-heading">
                        {validationResult.totalRows} filas detectadas
                      </span>
                      <span className="text-xs text-[#667085]">
                        en <strong className="text-[#031E3C]">{validationResult.fileName}</strong>
                      </span>
                    </div>
                    <div className="text-xs text-[#667085] mt-0.5 flex items-center gap-2">
                      <span>Campaña: <strong>{validationResult.usesSheetCampaigns ? validationResult.detectedCampaigns.join(', ') : selectedCampaign?.name}</strong></span>
                      <span>·</span>
                      <span>Periodo: <strong>{periodName}</strong></span>
                      <span>·</span>
                      <span>Corte: <strong>{cutoffDate}</strong></span>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{validationResult.readyRows} Listas</span>
                    </span>

                    {validationResult.warningRows > 0 && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{validationResult.warningRows} Advertencias</span>
                      </span>
                    )}

                    {validationResult.errorRows > 0 && (
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{validationResult.errorRows} Errores</span>
                      </span>
                    )}

                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-bold">
                      {validationResult.newCount} Nuevos
                    </span>
                    <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-md font-bold">
                      {validationResult.duplicateCount} Duplicados omitidos
                    </span>
                  </div>
                </div>

                {validationResult.usesSheetCampaigns && (
                  <div className="mt-3 grid gap-2 border-t border-[#E5E8EC] pt-3 sm:grid-cols-2">
                    {validationResult.detectedCampaigns.map(sourceName => (
                      <label key={sourceName} className="text-[11px] font-semibold text-slate-700">
                        Origen Excel: <strong>{sourceName}</strong>
                        <select
                          value={campaignMappings[sourceName] || '__NEW__'}
                          onChange={event => setCampaignMappings(previous => ({ ...previous, [sourceName]: event.target.value }))}
                          className="mt-1 w-full rounded-lg border border-[#E5E8EC] bg-[#F6F7F9] px-2.5 py-1.5 text-xs font-semibold text-[#031E3C]"
                        >
                          <option value="__NEW__">Crear nueva: {sourceName}</option>
                          {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}

                {/* Supervisor Mapping Alert & Selector */}
                {validationResult.detectedSupervisors.some(s => !s.matchedUserId) && (
                  <div className="mt-3 pt-3 bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Supervisores no vinculados a usuarios existentes:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {validationResult.detectedSupervisors
                        .filter(s => !s.matchedUserId)
                        .map(sup => (
                          <div key={sup.nameRaw} className="bg-white p-2 rounded border border-amber-200 space-y-1">
                            <span className="font-semibold text-slate-800 block text-[11px]">
                              Excel: "{sup.nameRaw}" ({sup.count} asesores)
                            </span>
                            <select
                              value={supervisorOverrides[sup.nameRaw] || ''}
                              onChange={(e) => handleSupervisorOverrideChange(sup.nameRaw, e.target.value)}
                              className="w-full bg-[#F6F7F9] border border-slate-300 rounded px-1.5 py-1 text-[11px] focus:outline-none"
                            >
                              <option value="">-- Conservar como texto --</option>
                              {supervisorsList.map(u => (
                                <option key={u.id} value={u.id}>
                                  Vincular a: {u.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Tabs for Preview Table */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 bg-[#F6F7F9] p-1 rounded-lg border border-[#E5E8EC]">
                  <button
                    onClick={() => setPreviewFilter('ALL')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'ALL' ? 'bg-[#031E3C] text-white' : 'text-[#667085] hover:text-[#031E3C]'
                    }`}
                  >
                    Todas ({validationResult.totalRows})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('READY')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'READY' ? 'bg-emerald-700 text-white' : 'text-[#667085] hover:text-emerald-700'
                    }`}
                  >
                    Listas ({validationResult.readyRows})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('WARNING')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'WARNING' ? 'bg-amber-700 text-white' : 'text-[#667085] hover:text-amber-700'
                    }`}
                  >
                    Advertencias ({validationResult.warningRows})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('ERROR')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'ERROR' ? 'bg-rose-700 text-white' : 'text-[#667085] hover:text-rose-700'
                    }`}
                  >
                    Errores ({validationResult.errorRows})
                  </button>
                </div>

                <div className="text-[11px] text-[#667085]">
                  Mostrando {displayedRows.length} de {validationResult.totalRows} filas
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white border border-[#E5E8EC] rounded-xl overflow-hidden shadow-2xs max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[#F6F7F9] border-b border-[#E5E8EC] text-[11px] font-bold text-[#667085] uppercase tracking-wider font-heading sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Fila</th>
                      <th className="py-2.5 px-3">DNI</th>
                      <th className="py-2.5 px-3">Asesor</th>
                      <th className="py-2.5 px-3">Campaña</th>
                      <th className="py-2.5 px-3">Supervisor</th>
                      <th className="py-2.5 px-3">F. Ingreso</th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1">
                          <span>SPH</span>
                          <span className="text-[9px] text-[#FF6B00] font-bold">▲ (asc)</span>
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">Tipo</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Detalle / Advertencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E8EC]">
                    {displayedRows.map((row) => (
                      <tr 
                        key={`${row.sheetName}-${row.rowIndex}`}
                        className={`transition-colors ${
                          row.status === 'ERROR' ? 'bg-rose-50/40 hover:bg-rose-50/70' :
                          row.status === 'WARNING' ? 'bg-amber-50/30 hover:bg-amber-50/60' :
                          'hover:bg-[#F6F7F9]'
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                          #{row.rowIndex}
                        </td>

                        <td className="py-2 px-3 font-mono font-bold text-[#031E3C]">
                          {row.dni || <span className="text-rose-600 italic">Vacío</span>}
                        </td>

                        <td className="py-2 px-3 font-semibold text-[#031E3C] max-w-xs truncate">
                          {row.name || <span className="text-rose-600 italic">Vacío</span>}
                        </td>

                        <td className="py-2 px-3 text-[#031E3C] font-semibold">{row.campaignName}</td>

                        <td className="py-2 px-3 text-[#667085] truncate max-w-[120px]">
                          {row.supervisorRaw || '-'}
                        </td>

                        <td className="py-2 px-3 font-mono text-[11px]">
                          {row.hireDate ? (
                            <span className="text-[#031E3C]">{row.hireDate}</span>
                          ) : row.actionType === 'UPDATE' ? (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold text-[10px]">
                              ACTUALIZAR
                            </span>
                          ) : (
                            <span className="text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded text-[10px] font-semibold">
                              Pendiente
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center font-mono font-bold text-[#031E3C]">
                          {row.sph !== null ? row.sph.toFixed(2) : '-'}
                        </td>

                        <td className="py-2 px-3 text-center">
                          {row.actionType === 'NEW' ? (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                              NUEVO
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold text-[10px]">
                              OMITIR
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3">
                          {row.status === 'READY' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                              <Check className="w-3 h-3" />
                              <span>Listo</span>
                            </span>
                          )}
                          {row.status === 'WARNING' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Advertencia</span>
                            </span>
                          )}
                          {row.status === 'ERROR' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                              <AlertCircle className="w-3 h-3" />
                              <span>Error</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-[11px] max-w-sm truncate">
                          {row.errors.length > 0 ? (
                            <span className="text-rose-700 font-semibold" title={row.errors.join('; ')}>
                              {row.errors.join('; ')}
                            </span>
                          ) : row.warnings.length > 0 ? (
                            <span className="text-amber-700" title={row.warnings.join('; ')}>
                              {row.warnings.join('; ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">Datos conformes</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Explanatory note */}
              <div className="flex items-center justify-between text-xs text-[#667085] pt-1">
                <span>
                  💡 <strong>Nota:</strong> Las filas con errores serán omitidas automáticamente para no bloquear la importación del resto del archivo.
                </span>
                {validationResult.errorRows > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="text-rose-700 hover:text-rose-900 font-semibold underline cursor-pointer"
                  >
                    Descargar detalle de errores (.json)
                  </button>
                )}
              </div>

            </div>
          )}

          {/* ==================================================== */}
          {/* PASO 3: CONFIRMACIÓN / RESULTADO FINAL               */}
          {/* ==================================================== */}
          {step === 3 && importSummary && (
            <div className="space-y-6 max-w-2xl mx-auto text-center py-4">
              
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-[#031E3C] font-heading">
                  ¡Importación Completada con Éxito!
                </h4>
                <p className="text-xs text-[#667085] mt-1">
                  Se procesó la dotación de <strong className="text-[#031E3C]">{validationResult?.usesSheetCampaigns ? validationResult.detectedCampaigns.length : 1} campaña(s)</strong> para el periodo <strong className="text-[#031E3C]">{periodName}</strong>.
                </p>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                    Nuevos importados
                  </span>
                  <span className="text-2xl font-black text-blue-900 mt-1 block">
                    {importSummary.newCount}
                  </span>
                  <span className="text-[10px] text-blue-700 mt-0.5 block">
                    Cuentas de usuario creadas
                  </span>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5">
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                    Duplicados omitidos
                  </span>
                  <span className="text-2xl font-black text-purple-900 mt-1 block">
                    {importSummary.duplicateCount}
                  </span>
                  <span className="text-[10px] text-purple-700 mt-0.5 block">
                    Sin sobrescribir datos
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                    Mediciones SPH
                  </span>
                  <span className="text-2xl font-black text-emerald-900 mt-1 block">
                    {importSummary.measurementsCount}
                  </span>
                  <span className="text-[10px] text-emerald-700 mt-0.5 block">
                    Registradas en histórico
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                    Registros inválidos
                  </span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block">
                    {importSummary.invalidCount}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Filas no procesadas
                  </span>
                </div>
              </div>

              {/* User credentials automatic note */}
              {importSummary.newCount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 text-left space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    <span>Cuentas de acceso generadas automáticamente:</span>
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Se crearon credenciales de acceso para los {importSummary.newCount} nuevos asesores con formato Usuario: <code>nombre.apellido</code> y Contraseña: <code>DNI</code>.
                  </p>
                </div>
              )}

              {/* Actions in step 3 */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="flex items-center gap-1.5 px-4 py-2 border border-[#E5E8EC] hover:bg-[#F6F7F9] text-[#031E3C] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>Descargar Reporte de Carga</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSuccess) onSuccess();
                  }}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#031E3C] hover:bg-[#0B2B50] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>Ver Asesores Importados</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className="bg-[#F6F7F9] border-t border-[#E5E8EC] px-6 py-3.5 flex items-center justify-between">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#031E3C] hover:text-[#FF6B00] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cambiar Archivo / Parámetros</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 3 && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E5E8EC] hover:bg-white text-slate-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            )}

            {step === 1 && pendingFile && sheetCount === 1 && (
              <button type="button" onClick={handleContinueSingleSheet} disabled={isParsing} className="flex items-center gap-1.5 rounded-lg bg-[#031E3C] px-5 py-2 text-xs font-semibold text-white disabled:bg-slate-300">
                <span>Continuar</span><ArrowRight className="h-3.5 w-3.5 text-[#FF6B00]" />
              </button>
            )}

            {step === 2 && validationResult && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={validationResult.readyRows + validationResult.warningRows === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#031E3C] hover:bg-[#0B2B50] disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <span>Confirmar Importación ({validationResult.readyRows + validationResult.warningRows} asesores)</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#FF6B00]" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#031E3C] hover:bg-[#0B2B50] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  , document.body);
};
