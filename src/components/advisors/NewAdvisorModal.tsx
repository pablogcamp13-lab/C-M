import React, { useState } from 'react';
import { useApp, formatAdvisorUsername } from '../../context/AppContext';
import { Advisor } from '../../types';
import { X, Save, UserPlus, Gauge, Clock, TrendingUp, KeyRound, ShieldCheck } from 'lucide-react';
import { parseTimeToMinutes } from '../../utils/calculations';

interface NewAdvisorModalProps {
  onClose: () => void;
  onSuccess?: (advisor: Advisor) => void;
}

export const NewAdvisorModal: React.FC<NewAdvisorModalProps> = ({ onClose, onSuccess }) => {
  const { campaigns, teams, users, addAdvisor } = useApp();

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState(`ADV-${Math.floor(100 + Math.random() * 900)}`);
  const [dni, setDni] = useState('');
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '');
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [supervisorId, setSupervisorId] = useState(users.find(u => u.role === 'SUPERVISOR')?.id || '');
  const [shift, setShift] = useState<'MANANA' | 'TARDE' | 'COMPLETO'>('MANANA');

  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [campaignStartDate, setCampaignStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [schedule, setSchedule] = useState('09:00 - 18:00');

  // Nivel 2: Línea Base Operacional
  const [baselineConnectionTime, setBaselineConnectionTime] = useState('06:00');
  const [baselineSph, setBaselineSph] = useState('0.20');
  const [baselineDate, setBaselineDate] = useState(new Date().toISOString().split('T')[0]);
  const [baselinePeriod, setBaselinePeriod] = useState('Línea Base Inicial');

  const supervisors = users.filter(u => u.role === 'SUPERVISOR');

  const generatedUsername = name.trim() ? formatAdvisorUsername(name) : 'nombre.apellido';
  const generatedPassword = dni.trim() || 'DNI del asesor';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dni.trim()) return;

    const sphNum = parseFloat(baselineSph) || 0.20;
    const connMinutes = parseTimeToMinutes(baselineConnectionTime) || 360;

    const newAdv = addAdvisor({
      name: name.trim(),
      employeeCode,
      dni: dni.trim(),
      campaignId,
      teamId,
      supervisorId,
      shift,
      status: 'ACTIVO',
      hireDate: hireDate || new Date().toISOString().split('T')[0],
      campaignStartDate: campaignStartDate || undefined,
      schedule: schedule.trim() || undefined,
      hasOperationalBaseline: true,
      baselineConnectionTime: baselineConnectionTime.trim() || '06:00',
      baselineConnectionMinutes: connMinutes,
      baselineSph: Number(sphNum.toFixed(2)),
      baselineDate: baselineDate || new Date().toISOString().split('T')[0],
      baselinePeriod: baselinePeriod.trim() || 'Línea Base Inicial'
    });

    if (onSuccess) onSuccess(newAdv);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="cm-modal max-w-lg w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 text-[#031E3C]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Registrar Nuevo Asesor</h3>
              <p className="text-[11px] text-slate-500">Datos del asesor y configuración de línea base</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Identificación */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Laura Morales"
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código de Empleado</label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">DNI *</label>
              <input
                type="text"
                required
                maxLength={8}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="74839201"
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Supervisor a Cargo *</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
            >
              {supervisors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Equipo</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Turno</label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C]"
              >
                <option value="MANANA">Mañana</option>
                <option value="TARDE">Tarde</option>
                <option value="COMPLETO">Completo</option>
              </select>
            </div>
          </div>

          {/* Fechas de Antigüedad y Horario */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">F. Ingreso (Empresa) *</label>
              <input
                type="date"
                required
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] text-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">F. Campaña</label>
              <input
                type="date"
                value={campaignStartDate}
                onChange={(e) => setCampaignStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] text-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Horario</label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="09:00 - 18:00"
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] text-slate-800"
              />
            </div>
          </div>

          {/* NIVEL 2 – LÍNEA BASE OPERACIONAL */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#031E3C]" />
              <span className="font-bold text-xs text-slate-800">Línea Base Operacional (Nivel 2)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Punto de partida del asesor para medir el impacto de las intervenciones 3C sobre SPH y tiempo de conexión.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Tiempo Conexión Base</span>
                </label>
                <input
                  type="text"
                  value={baselineConnectionTime}
                  onChange={(e) => setBaselineConnectionTime(e.target.value)}
                  placeholder="06:00 (HH:MM)"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] font-mono text-slate-800"
                />
                <span className="text-[10px] text-slate-400">Formato HH:MM (ej. 06:15)</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  <span>SPH Base</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={baselineSph}
                  onChange={(e) => setBaselineSph(e.target.value)}
                  placeholder="0.20"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] font-mono text-slate-800"
                />
                <span className="text-[10px] text-slate-400">Ventas por hora (ej. 0.22)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha de Línea Base</label>
                <input
                  type="date"
                  value={baselineDate}
                  onChange={(e) => setBaselineDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Período de Referencia</label>
                <input
                  type="text"
                  value={baselinePeriod}
                  onChange={(e) => setBaselinePeriod(e.target.value)}
                  placeholder="Ej: Enero 2026"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#031E3C] text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* GENERACIÓN AUTOMÁTICA DE USUARIO Y CREDENCIALES */}
          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Cuenta de Usuario Autogenerada</span>
              </div>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                Rol: ASESOR
              </span>
            </div>
            
            <p className="text-[11px] text-emerald-800 leading-tight">
              Al guardar este asesor, se creará automáticamente su usuario para acceder a su portal de evaluaciones y planes de acción:
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-white p-2 rounded-lg border border-emerald-200">
                <span className="text-[10px] text-slate-500 font-sans block font-semibold">Usuario (Nombre.apellido):</span>
                <span className="text-[#031E3C] font-bold break-all">{generatedUsername}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-emerald-200">
                <span className="text-[10px] text-slate-500 font-sans block font-semibold flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-emerald-600" />
                  <span>Contraseña (DNI):</span>
                </span>
                <span className="text-[#031E3C] font-bold">{generatedPassword}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#031E3C] hover:bg-[#02152b] rounded-lg shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Asesor</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
