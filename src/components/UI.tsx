import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Check, LoaderCircle, Scissors, X } from 'lucide-react';
import { statusLabels } from '../lib';
import type { Appointment } from '../types';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" aria-label="Igor Barber Club — início" className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <Scissors size={25} strokeWidth={1.6} />
        <i />
      </span>
      <span className="brand-word">
        IGOR<span>BARBER CLUB</span>
      </span>
    </Link>
  );
}
export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`eyebrow ${light ? 'light' : ''}`}>
      <span />
      {children}
    </div>
  );
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Carregando...</span>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error-box">
      {message}
    </div>
  ) : null;
}
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Status({ status }: { status: Appointment['status'] }) {
  return (
    <span className={`status ${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <span className="check-item">
      <Check size={16} />
      {children}
    </span>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-link">
      {children}
      <ArrowUpRight size={18} />
    </Link>
  );
}
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const timer = setTimeout(() => {
        try {
          document
            .getElementById(decodeURIComponent(hash.slice(1)))
            ?.scrollIntoView({ behavior: 'smooth' });
        } catch {
          /* An invalid hash must not break navigation. */
        }
      }, 80);
      return () => clearTimeout(timer);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
