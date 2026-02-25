import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'brand' | 'violet' | 'ok' | 'err' | 'warn' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-brand/10 text-brand border-brand/20',
  brand: 'bg-brand/10 text-brand border-brand/20',
  violet: 'bg-violet/10 text-violet border-violet/20',
  ok: 'bg-ok/10 text-ok border-ok/20',
  err: 'bg-err/10 text-err border-err/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  muted: 'bg-muted/10 text-muted border-muted/20',
};

function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge, type BadgeVariant };
