import type { InputHTMLAttributes } from 'react';

export function Field({ label, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-list-600 focus:outline-none focus:ring-2 focus:ring-list-500/30 aria-invalid:border-red-600"
        {...props}
      />
      {error && (
        <p id={`${id}-err`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
