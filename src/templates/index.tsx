import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AppProvider } from '../context';
import { api, ApiError, errorMessage } from '../lib';
import type { PublicSite, Service, Barber } from '../types';
import type { PortfolioPhoto } from '../components/Portfolio';
import { SiteContext } from '../site-context';
import { Layout } from '../components/Layout';
import Home from '../pages/Home';
import { previewApi, previewSite } from './barber-classic/preview';

import { MiniLayout, MiniHome } from './gradefy-minisite';
import { useSite } from '../site-context';
import { miniPreviewSite, miniPreviewApi } from './gradefy-minisite/preview';
export const templates = {
  'barber-classic': { Layout, Home },
  'gradefy-minisite': { Layout: MiniLayout, Home: MiniHome },
} as const;
export function TemplateHome() {
  const { site } = useSite();
  const Template = templates[site.company.template as keyof typeof templates];
  return Template ? <Template.Home /> : null;
}

export function SiteShell({
  preview = false,
  admin = false,
  privatePreview = false,
  children,
}: {
  preview?: boolean;
  admin?: boolean;
  privatePreview?: boolean;
  children?: ReactNode;
}) {
  const { companySlug, previewCompanyId } = useParams();
  const location = useLocation();
  const demoMini = preview && location.pathname.startsWith('/preview/gradefy-minisite');
  // The legacy root uses the existing backend alias. Unknown slugs never use this alias.
  const slug = admin ? undefined : companySlug;
  return (
    <ResolvedSite
      key={
        privatePreview
          ? previewCompanyId
          : preview
            ? demoMini
              ? 'mini-preview'
              : 'preview'
            : slug || 'legacy'
      }
      slug={slug}
      preview={preview}
      demoMini={demoMini}
      admin={admin}
      privateCompany={privatePreview ? previewCompanyId : undefined}
      children={children}
    />
  );
}
function ResolvedSite({
  slug,
  preview,
  admin,
  children,
  privateCompany,
  demoMini,
}: {
  demoMini?: boolean;
  slug?: string;
  preview: boolean;
  admin: boolean;
  children?: ReactNode;
  privateCompany?: string;
}) {
  const location = useLocation();
  const isPreview = preview || !!privateCompany;
  const [previewData, setPreviewData] = useState<{
    site: PublicSite;
    services: Service[];
    professionals: Barber[];
    portfolio: PortfolioPhoto[];
  } | null>(null);
  const [reservationsOnly, setReservationsOnly] = useState(false);
  const [site, setSite] = useState<PublicSite | null>(
    preview ? (demoMini ? miniPreviewSite : previewSite) : null,
  );
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const apiBase = slug ? `/api/public/${encodeURIComponent(slug)}` : '/api';
  const basePath = privateCompany
    ? `/preview/site/${encodeURIComponent(privateCompany)}`
    : preview
      ? demoMini
        ? '/preview/gradefy-minisite'
        : '/preview/barber-classic'
      : slug
        ? `/${encodeURIComponent(slug)}`
        : '';
  const siteApi = useMemo<typeof api>(
    () =>
      privateCompany
        ? async <T,>(path: string, options: RequestInit = {}) => {
            if (options.method && options.method !== 'GET')
              throw new ApiError('A prévia não realiza agendamentos.', 403);
            if (path === '/auth/me') return { user: null, visitor: null } as T;
            const data: Record<string, unknown> = {
              '/services': previewData?.services,
              '/barbers': previewData?.professionals,
              '/portfolio': previewData?.portfolio,
            };
            if (!(path in data)) throw new ApiError('Operação indisponível na prévia.', 403);
            return structuredClone(data[path]) as T;
          }
        : preview
          ? demoMini
            ? miniPreviewApi
            : previewApi
          : <T,>(path: string, options: RequestInit = {}) =>
              api<T>(
                path,
                options,
                site?.company.template !== 'gradefy-minisite' &&
                  (/^\/auth\/(?:login|register|profile|password|forgot-password|reset-password)$/.test(
                    path,
                  ) ||
                    path === '/config')
                  ? '/api'
                  : apiBase,
                site?.company.template === 'gradefy-minisite'
                  ? 'client:' + apiBase
                  : 'public:' + apiBase,
              ),
    [apiBase, preview, privateCompany, previewData, demoMini, site?.company.template],
  );
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setError('');
    setMissing(false);
    setReservationsOnly(false);
    const load = privateCompany
      ? api<NonNullable<typeof previewData>>('/company-site/preview', {
          signal: controller.signal,
          headers: { 'X-Gradefy-Company-Id': privateCompany },
        }).then((data) => {
          if (!controller.signal.aborted) setPreviewData(data);
          return data.site;
        })
      : api<PublicSite>('/site', { signal: controller.signal }, apiBase).catch(async (e) => {
          if (
            e instanceof ApiError &&
            e.status === 404 &&
            slug &&
            [
              'minha-conta',
              'minha-conta/perfil',
              'minhas-reservas',
              'entrar',
              'cadastro',
              'esqueci-senha',
              'redefinir-senha',
            ].some((path) => location.pathname.replace(/\/$/, '') === `/${slug}/${path}`)
          ) {
            // Unknown slugs must stay 404, even on the reservation path.
            const session = await api<{ template?: string }>(
              '/auth/me',
              { signal: controller.signal },
              apiBase,
            );
            setReservationsOnly(true);
            // Neutral shell exposes no unpublished business content. Reservation APIs still authorize ownership.
            return {
              ...(session.template === 'gradefy-minisite' ? miniPreviewSite : previewSite),
              company: {
                ...(session.template === 'gradefy-minisite'
                  ? miniPreviewSite.company
                  : previewSite.company),
                name: 'Minhas reservas',
                slug,
              },
              settings: {
                ...(session.template === 'gradefy-minisite'
                  ? miniPreviewSite.settings
                  : previewSite.settings),
                description: null,
                logo_url: null,
                hero_image_url: null,
                slogan: null,
                favicon_url: null,
                address: null,
                sections: { about: false, gallery: false },
              },
              counts: { services: 0, professionals: 0, portfolio: 0 },
            };
          }
          throw e;
        });
    load
      .then((result) => {
        if (!controller.signal.aborted) setSite(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setSite(null);
          setPreviewData(null);
          setMissing(e instanceof ApiError && e.status === 404);
          setError(errorMessage(e));
        }
      });
    const expire = () => {
      setSite(null);
      setPreviewData(null);
      setError('Sua sessão expirou. Entre novamente para visualizar a prévia.');
    };
    const refresh = () => setRetry((n) => n + 1);
    const accountChannel =
      privateCompany && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('igor-account')
        : null;
    if (accountChannel) accountChannel.onmessage = refresh;
    if (privateCompany) {
      window.addEventListener('session-expired', expire);
      window.addEventListener('focus', refresh);
    }
    return () => {
      controller.abort();
      accountChannel?.close();
      window.removeEventListener('session-expired', expire);
      window.removeEventListener('focus', refresh);
    };
  }, [apiBase, preview, privateCompany, retry, location.pathname]);
  useEffect(() => {
    document.title = site
      ? `${site.company.name} — ${site.company.template === 'gradefy-minisite' ? 'Agendamento online' : 'Seu estilo. Sua identidade.'}`
      : 'Agendamento online';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description)
      description.content =
        site?.settings.description ||
        (site?.company.template === 'gradefy-minisite'
          ? 'Conheça o estabelecimento e agende seu horário online.'
          : 'Seu estilo merece respeito. Agende seu horário online.');
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon)
      icon.href =
        site?.settings.favicon_url ||
        site?.settings.logo_url ||
        (site?.company.template === 'gradefy-minisite'
          ? '/gradefy/logo-mark.png'
          : '/images/barber-classic-icon.svg');
  }, [site]);
  if (error)
    return (
      <main className="container not-found">
        <h1>{missing ? 'Página não encontrada' : 'Estabelecimento indisponível'}</h1>
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => setRetry((n) => n + 1)}>
          Tentar novamente
        </button>
        {privateCompany && (
          <Link className="button ghost" to="/app/meu-site">
            Voltar ao Meu Site ou entrar na sua conta
          </Link>
        )}
      </main>
    );
  if (!site)
    return (
      <div className="loading" role="status">
        Carregando...
      </div>
    );
  if (!(site.company.template in templates) || site.company.niche !== 'barbershop')
    return (
      <main className="container not-found">
        <h1>Template indisponível</h1>
      </main>
    );
  const style = {
    ...(site.settings.primary_color ? { '--blue': site.settings.primary_color } : {}),
    ...(site.settings.secondary_color ? { '--red': site.settings.secondary_color } : {}),
  } as CSSProperties;
  const Template = templates[site.company.template as keyof typeof templates];
  return (
    <SiteContext.Provider
      value={{
        site,
        preview: isPreview,
        privatePreview: !!privateCompany,
        reservationsOnly,
        basePath,
        api: siteApi,
      }}
    >
      <div
        style={style}
        className={`${site.company.template === 'gradefy-minisite' ? 'gradefy-minisite' : 'barber-classic'} ${site.company.id !== 'igor-barber-club' && site.company.id !== 'preview' ? 'company-site' : ''}`}
      >
        {demoMini && (
          <p className="site-preview-notice">
            Demonstração · Imagens ilustrativas · Agendamentos desativados
          </p>
        )}
        {privateCompany && (
          <div className="site-preview-notice">
            <strong>Prévia privada · Agendamentos desativados</strong>
            <Link to={`/app/meu-site?empresa=${encodeURIComponent(privateCompany)}`}>
              Voltar ao Meu Site
            </Link>
          </div>
        )}
        {reservationsOnly && (
          <p className="site-preview-notice">
            Site fora do ar. Você ainda pode consultar e cancelar suas reservas anteriores.
          </p>
        )}
        <AppProvider
          loadConfig={!isPreview && site.company.template !== 'gradefy-minisite'}
          sessionScope={
            site.company.template === 'gradefy-minisite' ? 'client:' + apiBase : undefined
          }
        >
          {admin ? children : <Template.Layout />}
        </AppProvider>
      </div>
    </SiteContext.Provider>
  );
}
