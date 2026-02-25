import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            'w-full rounded-lg border bg-bg-2 px-4 py-2.5 text-sm text-ink placeholder:text-muted',
            'transition-all duration-200 outline-none',
            'focus:border-brand/50 focus:ring-1 focus:ring-brand/30',
            error ? 'border-err/50' : 'border-line',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-err">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input, type InputProps };
