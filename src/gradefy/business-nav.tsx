import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
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
import { GradefyLogo } from './components';
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
  companyName,
  planName,
  showPlanPromo = false,
  subscriptionLabel,
  sitePublished,
}: {
  companyId: string;
  mobile?: boolean;
  companyName?: string;
  planName?: string | null;
  showPlanPromo?: boolean;
  subscriptionLabel?: string;
  sitePublished?: boolean;
}) {
  const { pathname } = useLocation();
  const mobileNav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const nav = mobileNav.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    const align = () => {
      if (nav && active && nav.clientWidth)
        nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    };
    align();
    window.addEventListener('resize', align);
    return () => window.removeEventListener('resize', align);
  }, [mobile, pathname]);
  const desktopNames: Record<string, string> = {
    '/app/dashboard': 'Dashboard',
    '/app/agenda': 'Agenda',
    '/app/equipe': 'Equipe',
    '/app/financeiro': 'Pagamentos',
  };
  const links = businessLinks.map((l) => (
    <Link
      key={l.path}
      to={l.path + '?empresa=' + encodeURIComponent(companyId)}
      aria-current={pathname === l.path ? 'page' : undefined}
      className={pathname === l.path ? 'gf-nav-active' : ''}
      aria-label={
        mobile || !showPlanPromo || !desktopNames[l.path]
          ? l.label
          : `${desktopNames[l.path]} — ${l.label}`
      }
    >
      <l.icon size={mobile ? 20 : 19} />
      {mobile ? l.short : showPlanPromo ? desktopNames[l.path] || l.label : l.label}
    </Link>
  ));
  const desktopOrder = showPlanPromo ? [0, 1, 2, 7, 3, 5, 6, 9] : [0, 1, 2, 7, 3, 5, 6, 9, 4, 8];
  return mobile ? (
    <nav
      ref={mobileNav}
      className="gf-dashboard-mobile-nav gf-business-mobile"
      aria-label="Navegação móvel"
    >
      {links}
    </nav>
  ) : (
    <aside
      className="gf-dashboard-sidebar gf-business-nav-desktop"
      aria-label="Navegação empresarial"
    >
      <GradefyLogo />
      <nav aria-label="Áreas da empresa">
        {desktopOrder.map((index) => links[index])}
        {showPlanPromo && (
          <details className="gf-sidebar-more">
            <summary>
              Mais áreas <ChevronRight size={15} />
            </summary>
            {links[4]}
            {links[8]}
          </details>
        )}
      </nav>
      <div className="gf-sidebar-bottom">
        {showPlanPromo && (
          <div className="gf-sidebar-promo gf-desktop-plan">
            <Crown size={24} aria-hidden="true" />
            <strong>Seu negócio em outro nível</strong>
            <p>
              {planName ? `Plano ${planName}` : 'Sem plano selecionado'} · {subscriptionLabel}
            </p>
            <small>Mini Site: {sitePublished ? 'publicado' : 'não publicado'}</small>
            <Link to="/app/onboarding/plan">
              Conhecer planos <ChevronRight size={17} />
            </Link>
          </div>
        )}
        <Link to="/app/conta" className="gf-sidebar-account">
          <UserRound size={19} /> Minha conta
        </Link>
        {companyName && (
          <div className="gf-sidebar-company">
            <span aria-hidden="true">{companyName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{companyName}</strong>
              {planName && <small>Plano {planName}</small>}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
