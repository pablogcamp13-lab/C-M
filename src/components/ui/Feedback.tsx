import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton, statusIcon } from './Primitives';

type ToastTone = keyof typeof statusIcon | 'error';
interface ToastItem { id: number; title: string; description?: string; tone: ToastTone; }
interface ToastContextValue { toast: (toast: Omit<ToastItem, 'id'>) => void; }
const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), []);
  const toast = useCallback((item: Omit<ToastItem, 'id'>) => { const id = Date.now() + Math.random(); setItems(current => [...current, { ...item, id }]); window.setTimeout(() => remove(id), 5000); }, [remove]);
  const value = useMemo(() => ({ toast }), [toast]);
  return <ToastContext.Provider value={value}>{children}<div className="cm-toast-viewport" aria-live="polite">{items.map(item => { const Icon = item.tone === 'error' ? statusIcon.danger : statusIcon[item.tone]; return <div className={`cm-toast cm-toast--${item.tone}`} key={item.id}><Icon /><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div><IconButton size="sm" label="Cerrar notificación" onClick={() => remove(item.id)}><X /></IconButton></div>; })}</div></ToastContext.Provider>;
};

export const useToast = () => {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider');
  return value;
};
