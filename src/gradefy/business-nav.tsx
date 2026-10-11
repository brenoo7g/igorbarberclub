import { Link, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  UsersRound,
  UserRound,
  Scissors,
  Globe,
} from 'lucide-react';
import './business-management.css';
export const businessLinks = [
  { path: '/app/dashboard', label: 'Visão geral', short: 'Início', icon: LayoutDashboard },
  { path: '/app/agenda', label: 'Minha agenda', short: 'Agenda', icon: CalendarDays },
  { path: '/app/clientes', label: 'Clientes', short: 'Clientes', icon: UserRound },
  { path: '/app/servicos', label: 'Serviços', short: 'Serviços', icon: Scissors },
  { path: '/app/profissionais', label: 'Profissionais', short: 'Equipe', icon: UsersRound },
  { path: '/app/meu-site', label: 'Meu Site', short: 'Site', icon: Globe },
];
export function BusinessNav({
  companyId,
  mobile = false,
}: {
  companyId: string;
  mobile?: boolean;
}) {
  const { pathname } = useLocation();
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
    <nav className="gf-dashboard-mobile-nav gf-business-mobile" aria-label="Navegação móvel">
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
