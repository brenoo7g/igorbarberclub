import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { launchChannel } from './config';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <img src="/images/logo-mark.png" width="42" height="42" alt="" />
      <img
        className="brand-wordmark"
        src="/images/logo-wordmark.png"
        width="147"
        height="30"
        alt="Gradefy"
      />
    </span>
  );
}

export function LinkButton({
  children,
  className = '',
  variant = 'primary',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <a className={`button button-${variant} ${className}`} {...props}>
      {children}
    </a>
  );
}

export function LaunchLink({
  children = 'Acompanhar lançamento',
  className = '',
  variant = 'secondary',
}: {
  children?: ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary';
}) {
  if (!launchChannel) return null;
  return (
    <LinkButton
      href={launchChannel}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      className={className}
    >
      {children}
      <ArrowUpRight size={17} aria-hidden="true" />
    </LinkButton>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span aria-hidden="true" />
      {children}
    </p>
  );
}

export function LaunchBadge() {
  return (
    <span className="launch-badge">
      <Sparkles size={14} aria-hidden="true" />
      Lançamento em breve
    </span>
  );
}
