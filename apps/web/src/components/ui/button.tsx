import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-list-600 text-white hover:bg-list-700 disabled:opacity-60',
  ghost: 'bg-transparent text-list-700 hover:bg-list-500/10',
};

// Veliki touch target (min 48px) — mobile-first, rukavice na traktoru
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-list-600 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
