import { clsx } from 'clsx';
import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-md border border-border bg-surface shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ children, className, ...props }: CardProps) {
  return (
    <div
      className={clsx('border-b border-border px-5 py-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function CardContent({ children, className, ...props }: CardProps) {
  return (
    <div className={clsx('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ children, className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'border-t border-border px-5 py-3 flex items-center justify-end gap-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, CardHeader, CardContent, CardFooter };
