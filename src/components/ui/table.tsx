'use client';

import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';

type SortDirection = 'asc' | 'desc' | null;

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

function Table({ children, className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={clsx('w-full text-sm border-collapse', className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function TableHead({ children, className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={clsx('border-b border-border', className)} {...props}>
      {children}
    </thead>
  );
}

function TableBody({ children, className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={clsx('divide-y divide-border', className)} {...props}>
      {children}
    </tbody>
  );
}

function TableRow({ children, className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx('hover:bg-muted/50 transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
}

function TableCell({ children, className, ...props }: TableCellProps) {
  return (
    <td
      className={clsx('px-4 py-3 text-text whitespace-nowrap', className)}
      {...props}
    >
      {children}
    </td>
  );
}

interface SortableHeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  sortDirection?: SortDirection;
  onSort?: () => void;
}

function SortableHeader({
  children,
  sortDirection,
  onSort,
  className,
  ...props
}: SortableHeaderProps) {
  const SortIcon =
    sortDirection === 'asc'
      ? ChevronUp
      : sortDirection === 'desc'
        ? ChevronDown
        : ChevronsUpDown;

  const ariaSort = sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined;

  return (
    <th
      className={clsx(
        'px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider',
        onSort && 'cursor-pointer select-none hover:text-text',
        className,
      )}
      onClick={onSort}
      aria-sort={ariaSort}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {onSort && <SortIcon className="h-3.5 w-3.5" />}
      </span>
    </th>
  );
}

function TableHeader({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx(
        'px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export { Table, TableHead, TableBody, TableRow, TableCell, SortableHeader, TableHeader };
export type { SortDirection };
