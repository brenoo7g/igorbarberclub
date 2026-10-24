import { Bell, Building2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context';

export function subscriptionLabel(
  entitlement?: {
    planCode: string | null;
    subscriptionStatus: string | null;
    valid: boolean;
  } | null,
) {
  if (!entitlement?.planCode) return '';
  if (entitlement.valid && entitlement.subscriptionStatus === 'trialing')
    return 'Teste grátis ativo';
  if (entitlement.valid && entitlement.subscriptionStatus === 'active') return 'Assinatura ativa';
  if (entitlement.subscriptionStatus === 'pending') return 'Assinatura pendente';
  return 'Sem assinatura vigente';
}

export function ManagementTopbar({
  companyName,
  companyId,
  description,
  searchValue,
  onSearch,
  searchPlaceholder,
}: {
  companyName?: string;
  companyId: string;
  description: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const { user } = useApp();
  return (
    <header className="gf-management-topbar">
      <div>
        <h1>Olá, {user?.name?.trim().split(/\s+/)[0] || 'bem-vindo'}!</h1>
        <p>{description}</p>
      </div>
      <div className="gf-management-topbar-actions">
        {onSearch && (
          <label className="gf-management-topbar-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Busca rápida no cabeçalho"
              placeholder={searchPlaceholder || 'Buscar...'}
              value={searchValue || ''}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
        )}
        <Link
          className="gf-management-notifications"
          to={
            '/app/dashboard?empresa=' +
            encodeURIComponent(companyId) +
            '#dashboard-email-notifications'
          }
          aria-label="Ver notificações no painel"
        >
          <Bell size={19} aria-hidden="true" />
        </Link>
        <span className="gf-management-company-chip">
          <Building2 size={18} aria-hidden="true" />
          {companyName || 'Estabelecimento'}
        </span>
      </div>
    </header>
  );
}
