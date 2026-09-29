import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Instagram, MapPin, Menu, UserRound, X } from 'lucide-react';
import { Brand } from './UI';
import { Avatar } from './Avatar';
import { useApp } from '../context';

export function Layout() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const { user, visitor } = useApp();
  const identity = user || visitor;
  const close = () => setMenu(false);
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          if (location.pathname === '/redefinir-senha') {
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Navegação principal" className={menu ? 'main-nav open' : 'main-nav'}>
            <NavLink
              to="/"
              onClick={close}
              className={location.pathname === '/' && !location.hash ? 'active' : ''}
            >
              Início
            </NavLink>
            <Link to="/#sobre" onClick={close}>
              A barbearia
            </Link>
            <Link to="/#servicos" onClick={close}>
              Serviços
            </Link>
            <Link to="/#galeria" onClick={close}>
              Nosso trabalho
            </Link>
            <Link to="/#contato" onClick={close}>
              Contato
            </Link>
            <Link to="/minha-conta" className="mobile-account-link" onClick={close}>
              Minha conta
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              to="/minha-conta"
              className="account-link"
              aria-label={identity ? 'Minha conta' : 'Entrar na minha conta'}
            >
              {identity ? (
                <Avatar name={identity.name} avatar={user?.avatar || null} />
              ) : (
                <UserRound size={18} />
              )}
              <span>{identity ? identity.name.split(' ')[0] : 'Minha conta'}</span>
            </Link>
            <Link to="/agendar" className="button primary header-book" onClick={close}>
              Agendar horário
              <ArrowUpRight size={17} />
            </Link>
            <button
              className="icon-button menu-toggle"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menu}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Brand />
              <p>Mais que um corte. Sua identidade.</p>
            </div>
            <div className="footer-links">
              <Link to="/#servicos">Serviços</Link>
              <Link to="/agendar">Agendamento</Link>
              <Link to="/minha-conta">Minha conta</Link>
              <Link to="/admin">
                Área do barbeiro
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <a
              className="instagram-link"
              href="https://www.instagram.com/igor_barber_club/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={19} />
              <span>@igor_barber_club</span>
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} Igor Barber Club. Todos os direitos reservados.
            </span>
            <span>
              <MapPin size={13} />
              Campo Grande, Rio de Janeiro
              <span className="barber-stripes" />
            </span>
          </div>
        </div>
      </footer>
      {!['/esqueci-senha', '/redefinir-senha'].includes(location.pathname) && (
        <Link to="/agendar" className="mobile-book">
          <CalendarDays size={18} />
          Agendar meu horário
          <ArrowUpRight size={18} />
        </Link>
      )}
    </>
  );
}
