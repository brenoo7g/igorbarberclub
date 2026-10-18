import type { PublicSite } from '../../types';

export function miniLinks(settings: PublicSite['settings']) {
  let whatsapp: string | null = null,
    instagram: string | null = null,
    location: string | null = null;
  const digits = settings.whatsapp?.replace(/\D/g, '') || '';
  if (/^[1-9]\d{9,12}$/.test(digits))
    whatsapp = 'https://wa.me/' + (digits.length <= 11 ? '55' : '') + digits;
  try {
    const url = new URL(settings.instagram_url || '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^(www\.)?instagram\.com$/.test(url.hostname) &&
      /^\/[A-Za-z0-9_.]+\/?$/.test(url.pathname)
    )
      instagram = url.href;
  } catch {}
  try {
    const url = new URL(settings.location_url || '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ((/^(www\.)?google\.com$/.test(url.hostname) && url.pathname.startsWith('/maps')) ||
        url.hostname === 'maps.google.com' ||
        url.hostname === 'maps.app.goo.gl')
    )
      location = url.href;
  } catch {}
  if (!location && settings.address?.trim()) {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set(
      'query',
      [settings.address, settings.city, settings.region].filter(Boolean).join(', '),
    );
    location = url.href;
  }
  return { whatsapp, instagram, location };
}
