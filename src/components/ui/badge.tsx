import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30',
  success: 'bg-green-500/10 text-green-400 border border-green-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  danger: 'bg-red-500/10 text-red-400 border border-red-500/30',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
};

function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };
