import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState, IconButton } from './Primitives';

export const TableFrame: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => <div className={clsx('cm-table-frame', className)} {...props} />;
export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => <table className={clsx('cm-table', className)} {...props} />;
export const DataTable = Table;
export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = props => <thead {...props} />;
export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = props => <tbody {...props} />;
export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = props => <tr {...props} />;
export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = props => <th {...props} />;
export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = props => <td {...props} />;
export const TableEmpty: React.FC<{ colSpan: number; title?: string; description?: string }> = ({ colSpan, title, description }) => <tr><td colSpan={colSpan}><EmptyState title={title} description={description} /></td></tr>;

export interface PaginationProps { page: number; pageCount: number; onPageChange: (page: number) => void; total?: number; pageSize?: number; }
export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, onPageChange, total, pageSize }) => <nav className="cm-pagination" aria-label="Paginación"><span>{total !== undefined && pageSize ? `${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} de ${total}` : `Página ${page} de ${Math.max(pageCount, 1)}`}</span><div><IconButton size="sm" label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></IconButton><IconButton size="sm" label="Página siguiente" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight /></IconButton></div></nav>;

export interface TableAction { label: string; onClick: () => void; destructive?: boolean; disabled?: boolean; }
export const TableActionsMenu: React.FC<{ label?: string; actions: TableAction[] }> = ({ label = 'Abrir acciones', actions }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  return <div className="cm-table-actions" ref={root}><IconButton size="sm" label={label} aria-expanded={open} onClick={() => setOpen(value => !value)}><MoreHorizontal /></IconButton>{open && <div className="cm-table-actions__menu" role="menu">{actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={action.destructive ? 'is-danger' : undefined} onClick={() => { action.onClick(); setOpen(false); }}>{action.label}</button>)}</div>}</div>;
};
