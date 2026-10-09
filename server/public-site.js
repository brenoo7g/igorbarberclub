import { requireCompanyId } from './company-context.js';

// Only render URLs; never fetch arbitrary company URLs on the server.
export function publicAsset(value) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\\]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value)) {
    if (value === '/favicon.svg') return value;
    // Static media only. Do not let configuration reference another company's API images.
    return /^\/(?:images|media)\/[a-zA-Z0-9._/-]+$/.test(value) && !value.includes('..')
      ? value
      : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
const external = (value, host) => {
  const result = publicAsset(value);
  if (!result?.startsWith('https://')) return null;
  return !host || new URL(result).hostname.replace(/^www\./, '') === host ? result : null;
};
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const color = (value) => (/^#[a-fA-F0-9]{6}$/.test(value || '') ? value : null);

export async function getPublicSite(db, companyId) {
  requireCompanyId(companyId);
  const company = await db.get(
    "SELECT c.id,c.name,c.slug,c.timezone,c.niche_id AS niche,c.template_id AS template FROM companies c JOIN templates t ON t.id=c.template_id AND t.niche_id=c.niche_id AND t.active=1 WHERE c.id=? AND c.status='active'",
    [companyId],
  );
  if (!company || !company.name.trim())
    throw Object.assign(new Error('Estabelecimento indisponível.'), { status: 404 });
  const row =
    (await db.get('SELECT * FROM company_settings WHERE company_id=?', [companyId])) || {};
  let featured = [];
  try {
    const parsed = JSON.parse(row.featured_service_ids);
    if (Array.isArray(parsed)) featured = parsed.filter((x) => typeof x === 'string').slice(0, 20);
  } catch {
    /* Optional configuration. */
  }
  const settings = {
    logo_url: publicAsset(row.logo_url),
    favicon_url: publicAsset(row.favicon_url),
    hero_image_url: publicAsset(row.hero_image_url),
    about_image_url: publicAsset(row.about_image_url),
    wordmark_title: text(row.wordmark_title),
    wordmark_subtitle: text(row.wordmark_subtitle),
    slogan: text(row.slogan),
    description: text(row.description),
    about_detail: text(row.about_detail),
    city: text(row.city),
    region: text(row.region),
    address: text(row.address),
    phone: text(row.phone),
    whatsapp: /^\+?[0-9 ()-]{8,25}$/.test(row.whatsapp || '')
      ? row.whatsapp.replace(/\D/g, '')
      : null,
    instagram_url: external(row.instagram_url, 'instagram.com'),
    location_url: external(row.location_url),
    primary_color: color(row.primary_color),
    secondary_color: color(row.secondary_color),
    featured_service_ids: featured,
    highlight_service_id: text(row.highlight_service_id),
  };
  const counts = {};
  for (const [key, table, filter] of [
    ['services', 'services', ' AND active=1'],
    ['professionals', 'barbers', ' AND active=1'],
    ['portfolio', 'portfolio', ''],
  ])
    counts[key] = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id=?${filter}`, [companyId]))
        .n,
    );
  return { company, settings, counts };
}

// For a future publication workflow; reading optional content does not publish a business.
export const publicationIssues = (site) => [
  ...(!site.company.name?.trim() ? ['company.name'] : []),
  ...(site.company.template !== 'barber-classic' || site.company.niche !== 'barbershop'
    ? ['company.template']
    : []),
  ...(!site.counts.services ? ['services'] : []),
  ...(!site.counts.professionals ? ['professionals'] : []),
];
