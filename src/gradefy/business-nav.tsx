import { Link, useLocation } from 'react-router-dom';
import { useContext, useState } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  UsersRound,
  UserRound,
  Scissors,
  Globe,
  Wallet,
  ChartNoAxesCombined,
  ShieldCheck,
  Settings2,
  Crown,
  ChevronRight,
} from 'lucide-react';
import './business-management.css';
import './business-design.css';
import './mobile-navigation.css';
import { GradefyLogo } from './components';
import { BusinessCompanyContext } from './company-access';
export const businessLinks = [
  { path: '/app/dashboard', label: 'Visão geral', short: 'Início', icon: LayoutDashboard },
  { path: '/app/agenda', label: 'Minha agenda', short: 'Agenda', icon: CalendarDays },
  { path: '/app/clientes', label: 'Clientes', short: 'Clientes', icon: UserRound },
  { path: '/app/servicos', label: 'Serviços', short: 'Serviços', icon: Scissors },
  { path: '/app/profissionais', label: 'Profissionais', short: 'Profis.', icon: UsersRound },
  { path: '/app/financeiro', label: 'Financeiro', short: 'Finanças', icon: Wallet },
  { path: '/app/relatorios', label: 'Relatórios', short: 'Relat.', icon: ChartNoAxesCombined },
  { path: '/app/equipe', label: 'Equipe e acessos', short: 'Equipe', icon: ShieldCheck },
  { path: '/app/meu-site', label: 'Meu Site', short: 'Site', icon: Globe },
  { path: '/app/configuracoes', label: 'Configurações', short: 'Config.', icon: Settings2 },
];
export function BusinessNav({
  companyId,
  mobile = false,
}: {
  companyId: string;
  mobile?: boolean;
}) {
  const { pathname } = useLocation();
  const selectedCompany = useContext(BusinessCompanyContext);
  const company = selectedCompany?.id === companyId ? selectedCompany : null;
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = [
    { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/app/agenda', label: 'Agenda', icon: CalendarDays },
    { path: '/app/clientes', label: 'Clientes', icon: UsersRound },
    { path: '/app/financeiro', label: 'Pagamentos', icon: Wallet },
    { path: '/app/conta', label: 'Perfil', icon: UserRound },
  ];
  const mobileLinks = mobileItems.map((l) => (
    <Link
      key={l.path}
      to={l.path + '?empresa=' + encodeURIComponent(companyId)}
      aria-current={pathname === l.path ? 'page' : undefined}
      className={pathname === l.path ? 'gf-nav-active' : ''}
      aria-label={l.label}
    >
      <l.icon size={22} aria-hidden="true" />
      <span>{l.label}</span>
    </Link>
  ));
  const desktopItems = [
    [businessLinks[0], 'Dashboard'],
    [businessLinks[1], 'Agenda'],
    [businessLinks[2], 'Clientes'],
    [businessLinks[7], 'Equipe'],
    [businessLinks[3], 'Serviços'],
    [businessLinks[5], 'Pagamentos'],
    [businessLinks[6], 'Relatórios'],
    [businessLinks[9], 'Configurações'],
  ] as const;
  const extraItems = [businessLinks[4], businessLinks[8]];
  const extraActive = extraItems.some((item) => item.path === pathname);
  const desktopLink = (item: (typeof businessLinks)[number], label = item.label) => (
    <Link
      key={item.path}
      to={item.path + '?empresa=' + encodeURIComponent(companyId)}
      aria-current={pathname === item.path ? 'page' : undefined}
      className={pathname === item.path ? 'gf-nav-active' : ''}
    >
      <item.icon size={19} aria-hidden="true" />
      {label}
    </Link>
  );
  const subscriptionExpired =
    company?.subscription_ends_at && Date.parse(company.subscription_ends_at) <= Date.now();
  const subscription = subscriptionExpired
    ? company?.subscription_status === 'trialing'
      ? 'Teste grátis encerrado'
      : 'Assinatura encerrada'
    : company?.subscription_status === 'trialing'
      ? 'Teste grátis em andamento'
      : company?.subscription_status === 'active'
        ? 'Assinatura ativa'
        : company?.subscription_status === 'pending'
          ? 'Assinatura pendente'
          : company?.subscription_status
            ? 'Sem assinatura vigente'
            : 'Sem assinatura';
  return mobile ? (
    <nav className="gf-mobile-navigation" aria-label="Navegação principal">
      {mobileLinks}
    </nav>
  ) : (
    <aside
      className="gf-dashboard-sidebar gf-business-nav-desktop"
      aria-label="Navegação empresarial"
    >
      <GradefyLogo />
      <nav aria-label="Áreas da empresa">
        {desktopItems.map(([item, label]) => desktopLink(item, label))}
        <details
          className={'gf-sidebar-more' + (extraActive ? ' has-active' : '')}
          open={extraActive || moreOpen}
          onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        >
          <summary>
            Mais áreas <ChevronRight size={15} aria-hidden="true" />
          </summary>
          {extraItems.map((item) => desktopLink(item))}
        </details>
      </nav>
      <div className="gf-sidebar-bottom">
        <div className="gf-sidebar-promo gf-desktop-plan">
          <Crown size={24} aria-hidden="true" />
          <strong>Seu negócio em outro nível</strong>
          <p>
            {company
              ? company.plan_name
                ? `Plano ${company.plan_name}`
                : 'Plano não definido'
              : 'Carregando empresa…'}
          </p>
          {company && <small>{subscription}</small>}
          {company?.site_published !== undefined && (
            <small>Mini Site: {company.site_published === 1 ? 'publicado' : 'não publicado'}</small>
          )}
        </div>
        <Link to="/app/conta" className="gf-sidebar-account">
          <UserRound size={19} /> Minha conta
        </Link>
        {company && (
          <div className="gf-sidebar-company">
            <span aria-hidden="true">{company.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong title={company.name}>{company.name}</strong>
              {company.plan_name && <small>Plano {company.plan_name}</small>}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
