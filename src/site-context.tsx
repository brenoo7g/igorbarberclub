import { createContext, useContext } from 'react';
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom';
import type { LinkProps, NavLinkProps } from 'react-router-dom';
import type { PublicSite } from './types';
import { api } from './lib';

export interface SiteContext {
  site: PublicSite;
  preview: boolean;
  privatePreview?: boolean;
  reservationsOnly?: boolean;
  basePath: string;
  api: typeof api;
}
export const SiteContext = createContext<SiteContext | null>(null);
export const useSite = () => {
  const value = useContext(SiteContext);
  if (!value) throw new Error('SiteContext necessário');
  return value;
};
export const useOptionalSite = () => useContext(SiteContext);
export const siteLocation = (site: PublicSite) =>
  [site.settings.city, site.settings.region].filter(Boolean).join(', ');
export const instagramHandle = (url: string) =>
  '@' + new URL(url).pathname.split('/').filter(Boolean)[0];

export function scopedPath(path: LinkProps['to'], base: string) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('/admin')) return path;
  return `${base}${path === '/' ? '' : path}` || '/';
}
// These wrappers reuse React Router and preserve the active site's path for all CTAs.
export function SiteLink(props: LinkProps) {
  const context = useOptionalSite();
  if (
    (context?.privatePreview || context?.reservationsOnly) &&
    typeof props.to === 'string' &&
    /^\/(agendar|minha-conta|admin)(?:[/?]|$)/.test(props.to)
  )
    return (
      <span
        className={props.className}
        aria-disabled="true"
        title={
          context.preview
            ? 'Demonstração: agendamentos desativados.'
            : 'Site fora do ar: novos agendamentos indisponíveis.'
        }
      >
        {props.children}
      </span>
    );
  return <RouterLink {...props} to={scopedPath(props.to, context?.basePath || '')} />;
}
export function SiteNavLink(props: NavLinkProps) {
  const context = useOptionalSite();
  return <RouterNavLink {...props} to={scopedPath(props.to, context?.basePath || '')} />;
}
