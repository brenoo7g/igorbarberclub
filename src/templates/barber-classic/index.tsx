import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AppProvider } from '../../context';
import { api, errorMessage } from '../../lib';
import type { PublicSite } from '../../types';
import { SiteContext } from '../../site-context';
import { Layout } from '../../components/Layout';
import Home from '../../pages/Home';
import { previewApi, previewSite } from './preview';

export const templates = { 'barber-classic': { Layout, Home } } as const;
export function TemplateHome() {
  return <Home />;
}

export function SiteShell({
  preview = false,
  admin = false,
  children,
}: {
  preview?: boolean;
  admin?: boolean;
  children?: ReactNode;
}) {
  const { companySlug } = useParams();
  // The legacy root uses the existing backend alias. Unknown slugs never use this alias.
  const slug = admin ? undefined : companySlug;
  return (
    <ResolvedSite
      key={preview ? 'preview' : slug || 'legacy'}
      slug={slug}
      preview={preview}
      admin={admin}
      children={children}
    />
  );
}
function ResolvedSite({
  slug,
  preview,
  admin,
  children,
}: {
  slug?: string;
  preview: boolean;
  admin: boolean;
  children?: ReactNode;
}) {
  const [site, setSite] = useState<PublicSite | null>(preview ? previewSite : null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const apiBase = slug ? `/api/public/${encodeURIComponent(slug)}` : '/api';
  const basePath = preview ? '/preview/barber-classic' : slug ? `/${encodeURIComponent(slug)}` : '';
  const siteApi = useMemo<typeof api>(
    () =>
      preview
        ? previewApi
        : <T,>(path: string, options: RequestInit = {}) =>
            api<T>(
              path,
              options,
              /^\/auth\/(?:login|register|profile|password|forgot-password|reset-password)$/.test(
                path,
              ) || path === '/config'
                ? '/api'
                : apiBase,
            ),
    [apiBase, preview],
  );
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setError('');
    api<PublicSite>('/site', { signal: controller.signal }, apiBase)
      .then(setSite)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [apiBase, preview, retry]);
  useEffect(() => {
    document.title = site
      ? `${site.company.name} — Seu estilo. Sua identidade.`
      : 'Agendamento online';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description)
      description.content =
        site?.settings.description || 'Seu estilo merece respeito. Agende seu horário online.';
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon)
      icon.href =
        site?.settings.favicon_url || site?.settings.logo_url || '/images/barber-classic-icon.svg';
  }, [site]);
  if (error)
    return (
      <main className="container not-found">
        <h1>Estabelecimento indisponível</h1>
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => setRetry((n) => n + 1)}>
          Tentar novamente
        </button>
      </main>
    );
  if (!site)
    return (
      <div className="loading" role="status">
        Carregando...
      </div>
    );
  if (site.company.template !== 'barber-classic' || site.company.niche !== 'barbershop')
    return (
      <main className="container not-found">
        <h1>Template indisponível</h1>
      </main>
    );
  const style = {
    ...(site.settings.primary_color ? { '--blue': site.settings.primary_color } : {}),
    ...(site.settings.secondary_color ? { '--red': site.settings.secondary_color } : {}),
  } as CSSProperties;
  const Template = templates['barber-classic'];
  return (
    <SiteContext.Provider value={{ site, preview, basePath, api: siteApi }}>
      <div style={style} className="barber-classic">
        <AppProvider>{admin ? children : <Template.Layout />}</AppProvider>
      </div>
    </SiteContext.Provider>
  );
}
