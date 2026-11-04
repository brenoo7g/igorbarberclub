import { Bell, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import { GradefyLogo } from './components';
import './mobile-business-header.css';

export function MobileBusinessHeader({ companyId }: { companyId: string }) {
  const { user } = useApp();
  return (
    <header className="gf-mobile-business-header">
      <GradefyLogo />
      <div>
        <Link
          to={
            '/app/dashboard?empresa=' +
            encodeURIComponent(companyId) +
            '#dashboard-email-notifications'
          }
          aria-label="Ver notificações"
        >
          <Bell size={20} aria-hidden="true" />
        </Link>
        <Link to={'/app/conta?empresa=' + encodeURIComponent(companyId)} aria-label="Abrir perfil">
          {user?.name?.trim() ? (
            <span aria-hidden="true">
              {user.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}
            </span>
          ) : (
            <UserRound size={19} aria-hidden="true" />
          )}
        </Link>
      </div>
    </header>
  );
}
