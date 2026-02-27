import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'brand' | 'violet' | 'ok' | 'err' | 'warn' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-brand/10 text-brand border-brand/25',
  brand: 'bg-brand/10 text-brand border-brand/25',
  violet: 'bg-violet/10 text-violet border-violet/25',
  ok: 'bg-ok/12 text-ok border-ok/30',
  err: 'bg-err/12 text-err border-err/30',
  warn: 'bg-warn/15 text-warn border-warn/35',
  muted: 'bg-muted/10 text-ink-2 border-line',
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
