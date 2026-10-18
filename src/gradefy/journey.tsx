import type { ReactNode } from 'react';
import { GradefyLogo } from './components';
import './journey.css';

/** Shared presentation only: company access and mutations remain in their existing modules. */
export function JourneyFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`gf-journey-stage ${className}`}>
      <section className="gf-journey-card">
        <div className="gf-journey-brand">
          <GradefyLogo />
        </div>
        {children}
        <footer className="gf-journey-footer">
          Gradefy <span aria-hidden="true">·</span> Feito para quem vive de horários.
        </footer>
      </section>
    </div>
  );
}

export function DetailTile({
  icon,
  label,
  children,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`gf-detail-tile ${className}`}>
      <span className="gf-journey-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span className="gf-detail-label">{label}</span>
        <strong>{children}</strong>
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  pending = false,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  return (
    <span className={`gf-journey-badge${pending ? ' gf-journey-pending' : ''}`}>{children}</span>
  );
}
