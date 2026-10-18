import { previewSite, previewApi } from '../barber-classic/preview';
import type { PublicSite } from '../../types';
export const miniPreviewSite: PublicSite = {
  ...previewSite,
  company: { ...previewSite.company, template: 'gradefy-minisite', name: 'Barbearia Horizonte' },
  settings: {
    ...previewSite.settings,
    logo_url: '/images/minisite-demo-logo.svg',
    hero_image_url: '/images/shop.webp',
    slogan: 'Seu estilo, seu horário, sem complicação.',
    address: null,
  },
  counts: { services: 1, professionals: 1, portfolio: 5 },
  hours: null,
};
// Explicit, static illustration only. Never used as fallback for real businesses.
export async function miniPreviewApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  if ((!options.method || options.method === 'GET') && path === '/portfolio')
    return ['hero.webp', 'classic.webp', 'jaca.webp', 'classic.png', 'hero.png'].map((file, i) => ({
      id: 'demo-' + i,
      title: 'Fotografia ilustrativa ' + (i + 1),
      category: 'Demonstração',
      version: 1,
      image: '/images/' + file,
    })) as T;
  return previewApi<T>(path, options);
}
