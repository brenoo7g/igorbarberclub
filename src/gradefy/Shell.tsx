import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppProvider } from '../context';
import { gradefyApi } from './api';
import { gradefyTokens } from './tokens';
import { GradefyLogo } from './components';
import './styles.css';
import './journey.css';

const variables = {
  ...Object.fromEntries(
    Object.entries(gradefyTokens.colors).map(([key, value]) => [`--gf-${key}`, value]),
  ),
  '--gf-font-heading': gradefyTokens.fonts.heading,
  '--gf-font-body': gradefyTokens.fonts.body,
  ...Object.fromEntries(
    Object.entries(gradefyTokens.radius).map(([key, value]) => [
      `--gf-radius-${key}`,
      `${value}px`,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(gradefyTokens.spacing).map(([key, value]) => [
      `--gf-space-${key}`,
      `${value}px`,
    ]),
  ),
} as CSSProperties;
export default function GradefyShell() {
  const pathname = useLocation().pathname;
  const journey = ['/app/conta', '/app/convite', '/app/minha-agenda/configurar'].includes(pathname);
  const management = [
    '/app/dashboard',
    '/app/agenda',
    '/app/clientes',
    '/app/servicos',
    '/app/profissionais',
    '/app/financeiro',
    '/app/relatorios',
    '/app/equipe',
    '/app/configuracoes',
    '/app/minha-agenda',
    '/app/minha-agenda/configurar',
  ].includes(useLocation().pathname);
  useEffect(() => {
    const title = document.title;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const previousIcon = icon?.getAttribute('href');
    document.title = 'Gradefy — sua agenda, seu negócio';
    icon?.setAttribute('href', '/gradefy/logo-mark.png');
    document.body.classList.add('gf-body');
    return () => {
      document.body.classList.remove('gf-body');
      document.title = title;
      if (previousIcon) icon?.setAttribute('href', previousIcon);
    };
  }, []);
  return (
    <div
      className={
        'gf-app' + (management ? ' gf-management' : '') + (journey ? ' gf-journey-root' : '')
      }
      style={variables}
    >
      <AppProvider api={gradefyApi} loadConfig={false} sessionScope="gradefy">
        <a className="gf-skip" href="#gradefy-main">
          Ir para o conteúdo
        </a>
        <header className="gf-header">
          <GradefyLogo />
          <span className="gf-header-note">Gestão inteligente. Rotina leve.</span>
        </header>
        <main id="gradefy-main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="gf-footer">
          Gradefy <span aria-hidden="true">·</span> Feito para quem vive de horários.
        </footer>
      </AppProvider>
    </div>
  );
}
