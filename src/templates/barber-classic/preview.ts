import type { PublicSite, Service, Barber } from '../../types';
import { ApiError } from '../../lib';
export const previewSite: PublicSite = {
  company: {
    id: 'preview',
    slug: 'preview',
    name: '[Nome da sua barbearia]',
    template: 'barber-classic',
    niche: 'barbershop',
    timezone: 'America/Sao_Paulo',
  },
  settings: {
    logo_url: null,
    favicon_url: null,
    wordmark_title: null,
    wordmark_subtitle: null,
    slogan: null,
    hero_image_url: null,
    about_image_url: null,
    description: '[Sua equipe]',
    about_detail: null,
    whatsapp: null,
    phone: null,
    instagram_url: null,
    address: '[Sua localização]',
    city: null,
    region: null,
    location_url: null,
    primary_color: null,
    secondary_color: null,
    featured_service_ids: [],
    highlight_service_id: null,
  },
  counts: { services: 1, professionals: 1, portfolio: 1 },
};
const services: Service[] = [
  {
    id: 'preview-service',
    name: '[Seus serviços]',
    description: '',
    price: 3000,
    duration: 40,
    category: 'Corte',
    active: 1,
  },
];
const professionals: Barber[] = [
  {
    id: 'preview-professional',
    name: '[Sua equipe]',
    specialty: '',
    service_ids: ['preview-service'],
  },
];
export async function previewApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (options.method && options.method !== 'GET')
    throw new ApiError('A demonstração não realiza agendamentos.', 403);
  const data: Record<string, unknown> = {
    '/services': services,
    '/barbers': professionals,
    '/portfolio': [],
    '/auth/me': { user: null, visitor: null },
    '/config': {
      demo: false,
      open: 9,
      close: 19,
      timezone: 'America/Sao_Paulo',
      notifications: { email: false, whatsapp: false },
    },
  };
  if (!(path in data)) throw new ApiError('Página indisponível na demonstração.', 404);
  return structuredClone(data[path]) as T;
}
