import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input {...props} id={id} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <div className={`notice ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>
      {children}
    </div>
  );
}
