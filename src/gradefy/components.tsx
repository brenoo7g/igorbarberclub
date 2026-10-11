import { useId, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';

export function GradefyLogo() {
  return (
    <Link to="/app" className="gf-brand" aria-label="Gradefy — início">
      <img src="/gradefy/logo-mark.png" alt="" width="48" height="52" />
      <img
        className="gf-wordmark"
        src="/gradefy/logo-wordmark.png"
        alt="Gradefy"
        width="443"
        height="94"
      />
    </Link>
  );
}
export function Button({
  children,
  busy = false,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
      className={`gf-button gf-${variant} ${props.className || ''}`}
    >
      {busy && <LoaderCircle size={18} className="gf-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function ButtonLink({
  to,
  children,
  variant = 'primary',
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link to={to} className={`gf-button gf-${variant}`}>
      {children}
    </Link>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`gf-card ${className}`}>{children}</div>;
}
export function Input({
  label,
  error,
  hint,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  const generated = useId();
  const id = props.id || generated;
  const [show, setShow] = useState(false);
  const password = props.type === 'password';
  return (
    <div className="gf-field">
      <label htmlFor={id}>{label}</label>
      <div className={`gf-input-wrap ${error ? 'gf-invalid' : ''}`}>
        {icon && (
          <span className="gf-input-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          {...props}
          id={id}
          type={password && show ? 'text' : props.type}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
        />
        {password && (
          <button
            type="button"
            className="gf-eye"
            disabled={props.disabled}
            aria-label={`${show ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
            aria-pressed={show}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-help`} className={error ? 'gf-field-error' : 'gf-hint'}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function Feedback({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return children ? (
    <div
      className={`gf-feedback ${success ? 'gf-success' : ''}`}
      role={success ? 'status' : 'alert'}
    >
      {children}
    </div>
  ) : null;
}
export function Loading({ label = 'Carregando sua conta…' }: { label?: string } = {}) {
  return (
    <div className="gf-loading" role="status">
      <LoaderCircle className="gf-spin" size={26} />
      <span>{label}</span>
    </div>
  );
}
