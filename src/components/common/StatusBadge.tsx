import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export type StatusType = 
  | 'CUMPLE'
  | 'NO_CUMPLE'
  | 'NO_APLICA'
  | 'CRITICO' 
  | 'EN_DESARROLLO' 
  | 'ESPERADO' 
  | 'DOMINADO' 
  | 'VENTA' 
  | 'NO_VENTA' 
  | 'OBSERVADA'
  | 'DIAGNOSTICO'
  | 'SEGUIMIENTO'
  | 'COACHING'
  | 'REEVALUACION'
  | 'CERTIFICACION';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'sm',
  className = '',
  showIcon = true
}) => {
  const norm = String(status).toUpperCase();

  let styles = 'bg-[#F2F4F7] text-[#344054] border-[#E5E8EC]';
  let icon: React.ReactNode = null;
  let text = label || status;

  if (norm === 'CUMPLE' || norm === 'C') {
    styles = 'bg-emerald-50 text-[#027A48] border-emerald-200';
    icon = <CheckCircle2 className="w-3 h-3 text-[#039855]" />;
    text = label || 'Cumple';
  } else if (norm === 'NO_CUMPLE' || norm === 'NC' || norm === 'NO CUMPLE') {
    styles = 'bg-rose-50 text-[#D92D20] border-rose-200';
    icon = <XCircle className="w-3 h-3 text-[#D92D20]" />;
    text = label || 'No Cumple';
  } else if (norm === 'NO_APLICA' || norm === 'NA' || norm === 'N/A' || norm === 'NO APLICA') {
    styles = 'bg-slate-100 text-[#475467] border-slate-200';
    icon = <AlertCircle className="w-3 h-3 text-[#667085]" />;
    text = label || 'No Aplica';
  } else if (norm.includes('CRITIC') || norm === 'ALTA' || norm === 'CRÍTICO' || norm === 'NIVEL 1') {
    styles = 'bg-red-50 text-[#D92D20] border-red-200';
    icon = <AlertCircle className="w-3 h-3 text-[#D92D20]" />;
    text = label || 'Crítico';
  } else if (norm.includes('DESARROLLO') || norm === 'MEDIA' || norm === 'NIVEL 2') {
    styles = 'bg-amber-50 text-[#B54708] border-amber-200';
    icon = <AlertTriangle className="w-3 h-3 text-[#DC6803]" />;
    text = label || 'En Desarrollo';
  } else if (norm.includes('ESPERADO') || norm === 'NIVEL 3') {
    styles = 'bg-slate-100 text-[#031E3C] border-slate-200';
    icon = <ShieldCheck className="w-3 h-3 text-[#031E3C]" />;
    text = label || 'Esperado';
  } else if (norm.includes('DOMINADO') || norm === 'NIVEL 4' || norm === 'EXCELENTE') {
    styles = 'bg-emerald-50 text-[#027A48] border-emerald-200';
    icon = <CheckCircle2 className="w-3 h-3 text-[#039855]" />;
    text = label || 'Dominado';
  } else if (norm.includes('VENTA_CONCRETADA') || norm === 'VENTA' || norm === 'TRUE') {
    styles = 'bg-emerald-50 text-[#027A48] border-emerald-200';
    icon = <CheckCircle2 className="w-3 h-3 text-[#039855]" />;
    text = label || 'Venta';
  } else if (norm.includes('NO_VENTA') || norm === 'FALSE') {
    styles = 'bg-[#102640] text-[#D7E6F5] border-[#365575]';
    icon = <XCircle className="w-3 h-3 text-[#AFC5D9]" />;
    text = label || 'No Venta';
  } else if (norm.includes('REEVALUACION') || norm.includes('REEVALUACIÓN')) {
    styles = 'bg-[#F8F9FA] text-[#031E3C] border-[#D0D5DD]';
    text = label || 'Reevaluación';
  } else if (norm.includes('DIAGNOSTICO') || norm.includes('DIAGNÓSTICO')) {
    styles = 'bg-[#F8F9FA] text-[#031E3C] border-[#D0D5DD]';
    text = label || 'Diagnóstico';
  } else if (norm.includes('SEGUIMIENTO')) {
    styles = 'bg-[#F8F9FA] text-[#031E3C] border-[#D0D5DD]';
    text = label || 'Seguimiento';
  }

  const sizeCls = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span 
      className={`inline-flex items-center gap-1 font-medium rounded-md border tracking-tight ${sizeCls} ${styles} ${className}`}
    >
      {showIcon && icon}
      <span>{text}</span>
    </span>
  );
};
