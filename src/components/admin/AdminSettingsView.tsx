import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp, formatAdvisorUsername } from '../../context/AppContext';
import { FiltersBar } from '../common/FiltersBar';
import { UserRole, User, Campaign, Team } from '../../types';
import { adminUsersApi } from '../../api/sharedRepository';
import { 
  Settings, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Users, 
  Briefcase, 
  PlusCircle, 
  Sliders, 
  UserPlus, 
  Trash2, 
  LogIn, 
  Sparkles, 
  ShieldCheck, 
  UserCheck, 
  Search, 
  Building,
  Database,
  Check,
  KeyRound,
  Copy
} from 'lucide-react';

export const AdminSettingsView: React.FC = () => {
  const { 
    config, 
    updateConfig, 
    clearAllData, 
    campaigns, 
    users, 
    teams, 
    advisors, 
    currentUser, 
    setCurrentUser,
    addUser,
    updateUser,
    deleteUser,
    createUsersForAdvisorsWithoutAccount,
    addCampaign,
    addTeam
  } = useApp();

  const [activeTab, setActiveTab] = useState<'users' | 'methodology' | 'campaigns' | 'database'>('users');

  // Methodology form state
  const [connectWeight, setConnectWeight] = useState<number>(config.weights.CONECTAR || config.weights.connect || 30);
  const [clarifyWeight, setClarifyWeight] = useState<number>(config.weights.CLARIFICAR || config.weights.clarify || 35);
  const [convertWeight, setConvertWeight] = useState<number>(config.weights.CONVERTIR || config.weights.convert || 35);

  const [level1Pct, setLevel1Pct] = useState<number>(config.scaleValues[1]);
  const [level2Pct, setLevel2Pct] = useState<number>(config.scaleValues[2]);
  const [level3Pct, setLevel3Pct] = useState<number>(config.scaleValues[3]);
  const [level4Pct, setLevel4Pct] = useState<number>(config.scaleValues[4]);

  const [highGapMax, setHighGapMax] = useState<number>(config.priorityThresholds.highGapMax);
  const [mediumGapMax, setMediumGapMax] = useState<number>(config.priorityThresholds.mediumGapMax);
  const [expectedMax, setExpectedMax] = useState<number>(config.priorityThresholds.expectedMax);

  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<boolean>(false);

  // User form modal & state
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<UserRole>('ASESOR');
  const [userStatus, setUserStatus] = useState<'ACTIVO' | 'INACTIVO'>('ACTIVO');
  const [userAdvisorId, setUserAdvisorId] = useState<string>('');
  const [userTeamId, setUserTeamId] = useState<string>('');
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');

  // Campaign form state
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState<boolean>(false);
  const [campName, setCampName] = useState<string>('');
  const [campClient, setCampClient] = useState<string>('');
  const [campDescription, setCampDescription] = useState<string>('');

  // Notifications
  const [notificationMsg, setNotificationMsg] = useState<string>('');

  const totalWeights = connectWeight + clarifyWeight + convertWeight;
  const isWeightValid = totalWeights === 100;

  const showNotification = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(''), 4000);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWeightValid) return;

    updateConfig({
      weights: {
        CONECTAR: connectWeight,
        CLARIFICAR: clarifyWeight,
        CONVERTIR: convertWeight,
        connect: connectWeight,
        clarify: clarifyWeight,
        convert: convertWeight
      },
      scaleValues: {
        1: level1Pct,
        2: level2Pct,
        3: level3Pct,
        4: level4Pct
      },
      priorityThresholds: {
        highGapMax,
        mediumGapMax,
        expectedMax
      }
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Open user create modal
  const handleOpenUserModal = () => {
    setUserName('');
    setUserEmail('');
    setUserRole('ASESOR');
    setUserStatus('ACTIVO');
    setUserAdvisorId(advisors[0]?.id || '');
    setUserTeamId(teams[0]?.id || '');
    setIsUserModalOpen(true);
  };

  // Save new user
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) {
      alert('Por favor completa el nombre y el correo electrónico.');
      return;
    }

    const created = addUser({
      name: userName.trim(),
      email: userEmail.trim(),
      role: userRole,
      status: userStatus,
      advisorId: userRole === 'ASESOR' ? userAdvisorId : undefined,
      teamId: userRole === 'SUPERVISOR' ? userTeamId : undefined
    });

    showNotification(`Usuario "${created.name}" creado exitosamente.`);
    setIsUserModalOpen(false);
  };

  // Bulk create users for advisors
  const handleAutoCreateAdvisorUsers = () => {
    const count = createUsersForAdvisorsWithoutAccount();
    if (count > 0) {
      showNotification(`Se crearon automáticamente ${count} cuentas de usuario para los asesores.`);
    } else {
      showNotification('Todos los asesores ya cuentan con un usuario asignado.');
    }
  };

  // Switch active session to this user (for testing perspective)
  const handleSimulateUser = (user: User) => {
    setCurrentUser(user);
    showNotification(`Sesión cambiada a: ${user.name} (${user.role}). Ahora ves la plataforma desde su perspectiva.`);
  };
  const handleEditUser = async (user: User) => {
    const name = window.prompt('Nombre del usuario', user.name); if (name === null) return;
    const email = window.prompt('Correo electrónico', user.email); if (email === null) return;
    try { const result = await adminUsersApi.update(user.id, { name, email, status: user.status, role: user.role, advisorId: user.advisorId, teamId: user.teamId }); updateUser(user.id, result.user); showNotification('Usuario actualizado.'); }
    catch (error) { alert(error instanceof Error ? error.message : 'No fue posible actualizar el usuario.'); }
  };
  const handleResetPassword = async (user: User) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${user.name} a 12345678?`)) return;
    try { await adminUsersApi.resetPassword(user.id); updateUser(user.id, { mustChangePassword: true }); showNotification('Contraseña restablecida. Se solicitará el cambio al ingresar.'); }
    catch (error) { alert(error instanceof Error ? error.message : 'No fue posible restablecer la contraseña.'); }
  };
  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`¿Eliminar usuario ${user.name}?`)) return;
    try { await adminUsersApi.remove(user.id); deleteUser(user.id); showNotification('Usuario eliminado.'); }
    catch (error) { alert(error instanceof Error ? error.message : 'No fue posible eliminar el usuario.'); }
  };

  // Save new campaign
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim()) return;

    addCampaign({
      name: campName.trim(),
      client: campClient.trim() || 'Cliente Principal',
      status: 'ACTIVA',
      products: ['Servicio Móvil', 'BiPay Digital'],
      description: campDescription.trim() || 'Campaña comercial activa'
    });

    setCampName('');
    setCampClient('');
    setCampDescription('');
    setIsCampaignModalOpen(false);
    showNotification('Nueva campaña creada exitosamente.');
  };

  // When selecting an advisor in user form, auto-fill name and email
  const handleAdvisorSelectForUser = (advId: string) => {
    setUserAdvisorId(advId);
    const adv = advisors.find(a => a.id === advId);
    if (adv && !userName) {
      setUserName(adv.name);
      const clean = adv.name.toLowerCase().replace(/[^a-z0-9]/g, '.');
      setUserEmail(`${clean}@asesores3c.com`);
    }
  };

  const filteredUsersList = users.filter(u => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const advisorsWithoutUser = advisors.filter(adv => !users.some(u => u.role === 'ASESOR' && u.advisorId === adv.id));

  return (
    <div className="cm-workspace cm-admin flex-1 overflow-y-auto bg-[#F7F8FA] text-[#031E3C]">
      
      {/* Global Filters */}
      <FiltersBar />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E5E8EC] rounded-xl p-5 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-700 flex items-center justify-center font-bold">
                <Settings className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-[#031E3C] tracking-tight font-heading">
                Configuración del Sistema & Gestión de Usuarios
              </h2>
            </div>
            <p className="text-xs text-[#667085] mt-0.5">
              Crea usuarios para asesores, supervisores y administradores, y ajusta las ponderaciones metodológicas 3C.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setClearConfirmOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Limpiar Datos (Poner Propios)</span>
            </button>
          </div>
        </div>

        {/* Global Notification Banner */}
        {notificationMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notificationMsg}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-[#E5E8EC] bg-white rounded-t-xl px-4 pt-3 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'border-[#FF6B00] text-[#031E3C] font-bold'
                : 'border-transparent text-[#667085] hover:text-[#031E3C]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios & Accesos ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('methodology')}
            className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'methodology'
                ? 'border-[#FF6B00] text-[#031E3C] font-bold'
                : 'border-transparent text-[#667085] hover:text-[#031E3C]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Parámetros Metodología 3C</span>
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'campaigns'
                ? 'border-[#FF6B00] text-[#031E3C] font-bold'
                : 'border-transparent text-[#667085] hover:text-[#031E3C]'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Campañas & Equipos ({campaigns.length})</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: GESTIÓN DE USUARIOS & ACCESOS                                      */}
        {/* ========================================================================= */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E5E8EC] rounded-xl p-3.5 shadow-2xs">
              
              {/* Search */}
              <div className="flex items-center bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg px-2.5 py-1.5 w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-[#98A2B3] mr-2 shrink-0" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, correo, rol..."
                  className="bg-transparent text-xs text-[#031E3C] focus:outline-none w-full"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {advisorsWithoutUser.length > 0 && (
                  <button
                    onClick={handleAutoCreateAdvisorUsers}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    title="Crear cuentas automáticamente para todos los asesores sin usuario"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                    <span>Crear Cuentas a Asesores ({advisorsWithoutUser.length})</span>
                  </button>
                )}

                <button
                  onClick={handleOpenUserModal}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#FF6B00] hover:bg-[#e05e00] text-white rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Usuario</span>
                </button>
              </div>

            </div>

            {/* Users Table */}
            <div className="cm-admin-users bg-white border border-[#E5E8EC] rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[#F7F8FA] text-[11px] font-bold text-[#667085] uppercase border-b border-[#E5E8EC]">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Credenciales de Acceso</th>
                      <th className="py-3 px-4">Rol & Permisos</th>
                      <th className="py-3 px-4">Asignación / Vínculo</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E8EC]">
                    {filteredUsersList.map(user => {
                      const linkedAdvisor = advisors.find(a => a.id === user.advisorId);
                      const isCurrent = currentUser?.id === user.id;
                      const displayUsername = user.username || formatAdvisorUsername(user.name);
                      const displayPassword = user.mustChangePassword ? '12345678 · cambio pendiente' : 'Contraseña configurada';

                      return (
                        <tr key={user.id} className={`hover:bg-[#F7F8FA]/70 transition-colors ${isCurrent ? 'bg-orange-50/40' : ''}`}>
                          
                          {/* Usuario Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                user.role === 'ADMINISTRADOR' ? 'bg-purple-100 text-purple-800' :
                                user.role === 'SUPERVISOR' ? 'bg-sky-100 text-sky-800' :
                                user.role === 'FORMADOR' ? 'bg-amber-100 text-amber-800' :
                                user.role === 'ASESOR' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[#031E3C]">{user.name}</span>
                                  {isCurrent && (
                                    <span className="text-[10px] bg-[#FF6B00] text-white px-1.5 py-0.2 rounded font-bold">
                                      Sesión Activa
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#667085] block">{user.email}</span>
                              </div>
                            </div>
                          </td>

                          {/* Credenciales de Acceso */}
                          <td className="py-3 px-4">
                            <div className="space-y-0.5 font-mono text-[11px]">
                              <div className="flex items-center gap-1 text-[#031E3C]">
                                <span className="text-[10px] text-[#667085] font-sans font-semibold">Usuario:</span>
                                <span className="font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">{displayUsername}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[#031E3C]">
                                <span className="text-[10px] text-[#667085] font-sans font-semibold">Clave (DNI):</span>
                                <span className="font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  {displayPassword}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Rol */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              user.role === 'ADMINISTRADOR' ? 'bg-purple-100 text-purple-800' :
                              user.role === 'SUPERVISOR' ? 'bg-sky-100 text-sky-800' :
                              user.role === 'FORMADOR' ? 'bg-amber-100 text-amber-800' :
                              user.role === 'ASESOR' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              <ShieldCheck className="w-3 h-3" />
                              <span>{user.role}</span>
                            </span>
                          </td>

                          {/* Asignacion */}
                          <td className="py-3 px-4 text-[#667085]">
                            {user.role === 'ASESOR' ? (
                              linkedAdvisor ? (
                                <div className="flex items-center gap-1 text-emerald-900 font-semibold text-xs">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Asesor: {linkedAdvisor.name} ({linkedAdvisor.employeeCode})</span>
                                </div>
                              ) : (
                                <span className="text-amber-700 text-[11px] italic">Sin asesor vinculado</span>
                              )
                            ) : user.role === 'SUPERVISOR' && user.teamId ? (
                              <span>Equipo: {teams.find(t => t.id === user.teamId)?.name || user.teamId}</span>
                            ) : (
                              <span className="text-[11px] text-[#98A2B3]">Acceso Global</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              user.status === 'ACTIVO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {user.status}
                            </span>
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-right space-x-1">
                            <button onClick={() => void handleEditUser(user)} className="text-[10px] px-2 py-1 text-[#031E3C] hover:bg-sky-50 rounded" title="Editar usuario">Editar</button>
                            <button onClick={() => void handleResetPassword(user)} className="text-[10px] px-2 py-1 text-sky-700 hover:bg-sky-50 rounded" title="Restablecer contraseña">Resetear clave</button>
                            {!isCurrent && (
                              <button
                                onClick={() => handleSimulateUser(user)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded bg-[#F7F8FA] hover:bg-[#FF6B00] hover:text-white text-[#031E3C] transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Iniciar sesión como este usuario para ver su portal"
                              >
                                <LogIn className="w-3 h-3" />
                                <span>Ver como</span>
                              </button>
                            )}

                            {users.length > 1 && (
                              <button
                                onClick={() => void handleDeleteUser(user)}
                                className="text-[10px] p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PARÁMETROS METODOLÓGICOS 3C                                        */}
        {/* ========================================================================= */}
        {activeTab === 'methodology' && (
          <form onSubmit={handleSaveConfig} className="space-y-6">
            
            {saveSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Parámetros guardados y actualizados correctamente.</span>
              </div>
            )}

            {/* Ponderaciones 3C */}
            <div className="bg-white border border-[#E5E8EC] rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E8EC] pb-3">
                <div>
                  <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider">
                    1. Ponderaciones de las Dimensiones 3C (Total: 100%)
                  </h3>
                  <p className="text-[11px] text-[#667085]">
                    Define el peso de cada dimensión en el cálculo de la nota final de la llamada.
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${isWeightValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  Suma: {totalWeights}% {isWeightValid ? '✓' : '(Debe ser 100%)'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-sky-50/60 border border-sky-200 p-3.5 rounded-xl">
                  <label className="block font-bold text-sky-900 text-xs mb-1">C1: CONECTAR (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={connectWeight}
                    onChange={(e) => setConnectWeight(Number(e.target.value))}
                    className="w-full bg-white border border-sky-300 rounded-lg p-2 font-bold text-sky-900 text-sm"
                  />
                  <span className="text-[10px] text-sky-700 mt-1 block">Fluidez, Voz, Seguridad</span>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 p-3.5 rounded-xl">
                  <label className="block font-bold text-amber-900 text-xs mb-1">C2: CLARIFICAR (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={clarifyWeight}
                    onChange={(e) => setClarifyWeight(Number(e.target.value))}
                    className="w-full bg-white border border-amber-300 rounded-lg p-2 font-bold text-amber-900 text-sm"
                  />
                  <span className="text-[10px] text-amber-700 mt-1 block">Dominio, Organización, BiPay</span>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3.5 rounded-xl">
                  <label className="block font-bold text-emerald-900 text-xs mb-1">C3: CONVERTIR (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={convertWeight}
                    onChange={(e) => setConvertWeight(Number(e.target.value))}
                    className="w-full bg-white border border-emerald-300 rounded-lg p-2 font-bold text-emerald-900 text-sm"
                  />
                  <span className="text-[10px] text-emerald-700 mt-1 block">Beneficios, Objeciones, Cierre</span>
                </div>
              </div>
            </div>

            {/* Escala de Evaluación */}
            <div className="bg-white border border-[#E5E8EC] rounded-xl p-5 shadow-2xs space-y-4">
              <div className="border-b border-[#E5E8EC] pb-3">
                <h3 className="text-xs font-bold text-[#031E3C] uppercase tracking-wider">
                  2. Equivalencias de la Escala de Evaluación (1 al 4)
                </h3>
                <p className="text-[11px] text-[#667085]">
                  Porcentaje asignado a cada nivel de cumplimiento en los ítems de calidad.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#F7F8FA] border border-[#E5E8EC] p-3 rounded-lg">
                  <label className="block font-bold text-rose-700 mb-1">Nivel 1 (No cumple)</label>
                  <input
                    type="number"
                    value={level1Pct}
                    onChange={(e) => setLevel1Pct(Number(e.target.value))}
                    className="w-full bg-white border border-[#E5E8EC] rounded p-1.5 font-bold"
                  />
                </div>
                <div className="bg-[#F7F8FA] border border-[#E5E8EC] p-3 rounded-lg">
                  <label className="block font-bold text-amber-700 mb-1">Nivel 2 (Parcial bajo)</label>
                  <input
                    type="number"
                    value={level2Pct}
                    onChange={(e) => setLevel2Pct(Number(e.target.value))}
                    className="w-full bg-white border border-[#E5E8EC] rounded p-1.5 font-bold"
                  />
                </div>
                <div className="bg-[#F7F8FA] border border-[#E5E8EC] p-3 rounded-lg">
                  <label className="block font-bold text-sky-700 mb-1">Nivel 3 (Parcial alto)</label>
                  <input
                    type="number"
                    value={level3Pct}
                    onChange={(e) => setLevel3Pct(Number(e.target.value))}
                    className="w-full bg-white border border-[#E5E8EC] rounded p-1.5 font-bold"
                  />
                </div>
                <div className="bg-[#F7F8FA] border border-[#E5E8EC] p-3 rounded-lg">
                  <label className="block font-bold text-emerald-700 mb-1">Nivel 4 (Cumple total)</label>
                  <input
                    type="number"
                    value={level4Pct}
                    onChange={(e) => setLevel4Pct(Number(e.target.value))}
                    className="w-full bg-white border border-[#E5E8EC] rounded p-1.5 font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!isWeightValid}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#FF6B00] hover:bg-[#e05e00] disabled:bg-slate-300 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Parámetros Metodológicos</span>
              </button>
            </div>

          </form>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CAMPAÑAS & EQUIPOS                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            
            <div className="flex items-center justify-between bg-white border border-[#E5E8EC] rounded-xl p-3.5 shadow-2xs">
              <span className="font-bold text-xs text-[#031E3C]">Estructura Organizacional & Campañas Activas</span>
              <button
                onClick={() => setIsCampaignModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e05e00] text-white rounded-lg text-xs font-bold transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Nueva Campaña</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campaigns.map(c => (
                <div key={c.id} className="bg-white border border-[#E5E8EC] rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {c.status}
                    </span>
                    <span className="text-[10px] text-[#667085]">{c.client}</span>
                  </div>
                  <h4 className="font-bold text-sm text-[#031E3C] mt-2">{c.name}</h4>
                  <p className="text-xs text-[#667085] mt-1">{c.description}</p>
                  
                  <div className="mt-3 pt-3 border-t border-[#E5E8EC] flex items-center gap-1 flex-wrap">
                    {c.products.map(p => (
                      <span key={p} className="text-[10px] font-semibold bg-[#F7F8FA] border border-[#E5E8EC] px-2 py-0.5 rounded text-[#031E3C]">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL CREAR USUARIO                                                       */}
      {/* ========================================================================= */}
      {isUserModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
          <div className="cm-modal my-auto max-w-md w-full p-6">
            <h3 className="font-bold text-base text-[#031E3C] mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#FF6B00]" />
              <span>Crear Nuevo Usuario</span>
            </h3>
            <p className="text-xs text-[#667085] mb-4">
              Crea credenciales para que los asesores, supervisores o formadores ingresen y vean sus intervenciones.
            </p>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              
              {/* Rol */}
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Rol en la Plataforma *</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2 font-bold text-[#031E3C]"
                >
                  <option value="ASESOR">ASESOR (Ve sus evaluaciones, intervenciones y planes de acción)</option>
                  <option value="SUPERVISOR">SUPERVISOR (Gestiona su equipo)</option>
                  <option value="FORMADOR">FORMADOR (Asigna y ejecuta intervenciones)</option>
                  <option value="CONSULTOR">CONSULTOR (Auditoría 3C y calidad)</option>
                  <option value="ADMINISTRADOR">ADMINISTRADOR (Acceso total)</option>
                  <option value="GERENCIA">GERENCIA (Métricas y KPIs)</option>
                </select>
              </div>

              {/* Si es ASESOR: selector para vincular asesor */}
              {userRole === 'ASESOR' && (
                <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-lg space-y-2">
                  <label className="block font-bold text-emerald-900">Vincular con Asesor del Directorio *</label>
                  {advisors.length === 0 ? (
                    <p className="text-[11px] text-amber-800">No hay asesores creados todavía en el directorio.</p>
                  ) : (
                    <select
                      value={userAdvisorId}
                      onChange={(e) => handleAdvisorSelectForUser(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-md p-1.5 font-semibold text-emerald-900"
                    >
                      {advisors.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.employeeCode || a.dni})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Ej: Jorge Ramírez Vega"
                  className="w-full bg-white border border-[#E5E8EC] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="jorge.ramirez@asesores3c.com"
                  className="w-full bg-white border border-[#E5E8EC] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                />
              </div>

              {/* Estado */}
              <div>
                <label className="block font-semibold text-[#031E3C] mb-1">Estado de la Cuenta</label>
                <select
                  value={userStatus}
                  onChange={(e) => setUserStatus(e.target.value as any)}
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2 font-medium"
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#E5E8EC]">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#667085] hover:bg-[#F7F8FA] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#FF6B00] hover:bg-[#e05e00] rounded-lg shadow-xs"
                >
                  Crear Usuario
                </button>
              </div>

            </form>
          </div>
        </div>, document.body)}

      {/* ========================================================================= */}
      {/* MODAL CREAR CAMPAÑA                                                       */}
      {/* ========================================================================= */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#031E3C]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="cm-modal max-w-md w-full p-6">
            <h3 className="font-bold text-base text-[#031E3C] mb-3">Crear Nueva Campaña</h3>
            <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Nombre de la Campaña *</label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="Ej: Campaña Portabilidad & BiPay"
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Cliente / Operación</label>
                <input
                  type="text"
                  value={campClient}
                  onChange={(e) => setCampClient(e.target.value)}
                  placeholder="Ej: Bitel Perú"
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Descripción</label>
                <textarea
                  rows={2}
                  value={campDescription}
                  onChange={(e) => setCampDescription(e.target.value)}
                  placeholder="Objetivos de la campaña..."
                  className="w-full bg-[#F7F8FA] border border-[#E5E8EC] rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E8EC]">
                <button
                  type="button"
                  onClick={() => setIsCampaignModalOpen(false)}
                  className="px-3.5 py-1.5 text-[#667085] hover:bg-[#F7F8FA] rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#FF6B00] hover:bg-[#e05e00] text-white rounded-lg font-bold shadow-xs"
                >
                  Guardar Campaña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL LIMPIAR TODOS LOS DATOS                                             */}
      {/* ========================================================================= */}
      {clearConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-[#031E3C]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="cm-modal max-w-md w-full p-6 border border-rose-400/50">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#031E3C] mb-1">¿Limpiar y dejar la plataforma en blanco?</h3>
            <p className="text-xs text-[#667085] mb-4 leading-relaxed">
              Esta acción eliminará todas las evaluaciones, intervenciones, asesores y mediciones previas para que puedas ingresar tus propios datos limpios desde cero.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#667085] hover:bg-[#F7F8FA] rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAllData();
                  setClearConfirmOpen(false);
                  showNotification('Base de datos limpiada. La plataforma está lista para tus datos.');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs"
              >
                Sí, Limpiar Todo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
