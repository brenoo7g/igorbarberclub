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
} from 'lucide-react';
import './business-management.css';
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
  const links = businessLinks.map((l) => (
    <Link
      key={l.path}
      to={l.path + '?empresa=' + encodeURIComponent(companyId)}
      aria-current={pathname === l.path ? 'page' : undefined}
      className={pathname === l.path ? 'gf-nav-active' : ''}
      aria-label={l.label}
    >
      <l.icon size={mobile ? 20 : 19} />
      {mobile ? l.short : l.label}
    </Link>
  ));
  return mobile ? (
    <nav
      ref={mobileNav}
      className="gf-dashboard-mobile-nav gf-business-mobile"
      aria-label="Navegação móvel"
    >
      {links}
    </nav>
  ) : (
    <aside className="gf-dashboard-sidebar" aria-label="Navegação empresarial">
      <div className="gf-sidebar-caption">ESPAÇO DE GESTÃO</div>
      <nav>{links}</nav>
      <div className="gf-sidebar-bottom">
        <p>
          Seu negócio.
          <br />
          No seu ritmo.
        </p>
        <Link to="/app/conta">Minha conta</Link>
      </div>
    </aside>
  );
}
