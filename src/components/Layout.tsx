import {
  SiteLink as Link,
  SiteNavLink as NavLink,
  useSite,
  siteLocation,
  instagramHandle,
} from '../site-context';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Instagram, MapPin, Menu, UserRound, X } from 'lucide-react';
import { Brand } from './UI';
import { Avatar } from './Avatar';
import { useApp } from '../context';

export function Layout() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const { user, visitor } = useApp();
  const { site, basePath, preview } = useSite();
  const settings = site.settings;
  const address = siteLocation(site);
  const identity = user || visitor;
  const close = () => setMenu(false);
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          if (location.pathname.endsWith('/redefinir-senha')) {
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
              className={location.pathname === (basePath || '/') && !location.hash ? 'active' : ''}
            >
              Início
            </NavLink>
            {(preview ||
              settings.description ||
              settings.about_detail ||
              settings.about_image_url) && (
              <Link to="/#sobre" onClick={close}>
                A barbearia
              </Link>
            )}
            {(preview || site.counts.services > 0) && (
              <Link to="/#servicos" onClick={close}>
                Serviços
              </Link>
            )}
            {(preview || site.counts.portfolio > 0) && (
              <Link to="/#galeria" onClick={close}>
                Nosso trabalho
              </Link>
            )}
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
              <p>{settings.slogan || 'Mais que um corte. Sua identidade.'}</p>
            </div>
            <div className="footer-links">
              <Link to="/#servicos">Serviços</Link>
              <Link to="/agendar">Agendamento</Link>
              <Link to="/minha-conta">Minha conta</Link>
              {!preview && (
                <Link to="/admin">
                  Área do barbeiro
                  <ArrowUpRight size={14} />
                </Link>
              )}
            </div>
            {settings.instagram_url && (
              <a
                className="instagram-link"
                href={settings.instagram_url!}
                target="_blank"
                rel="noreferrer"
              >
                <Instagram size={19} />
                <span>{instagramHandle(settings.instagram_url!)}</span>
                <ArrowUpRight size={16} />
              </a>
            )}
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {site.company.name}. Todos os direitos reservados.
            </span>
            {address && (
              <span>
                <MapPin size={13} />
                {address}
                <span className="barber-stripes" />
              </span>
            )}
          </div>
        </div>
      </footer>
      {!preview &&
        !['/esqueci-senha', '/redefinir-senha'].some((path) =>
          location.pathname.endsWith(path),
        ) && (
          <Link to="/agendar" className="mobile-book">
            <CalendarDays size={18} />
            Agendar meu horário
            <ArrowUpRight size={18} />
          </Link>
        )}
    </>
  );
}
