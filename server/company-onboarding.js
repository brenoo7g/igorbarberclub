import { createHash } from 'node:crypto';
import { z } from 'zod';
import { listUserCompanies } from './company-access.js';
import { getAvailablePlan, domainError } from './entitlements.js';
import { getOnboardingCatalog } from './onboarding-catalog.js';
import { idempotent, requestKey } from './idempotency.js';
import { lockResource } from './scheduling-locks.js';
import { companySlugSchema } from './company-slugs.js';
import { MINI_SITE } from './site-templates.js';
import {
  structuredAddress,
  validateAddress,
  formatAddress,
  postalCode,
  lookupPostalCode,
} from './postal-address.js';

const phone = z
  .string()
  .max(30)
  .transform((value) => value.replace(/\D/g, ''));
const optionalPhone = phone.refine(
  (value) => !value || /^\d{10,13}$/.test(value),
  'Informe um telefone com DDD.',
);
const fields = {
  name: z.string().trim().min(2, 'Informe o nome do estabelecimento.').max(100),
  slug: companySlugSchema,
  description: z.string().trim().max(1000).default(''),
  phone: phone.refine((value) => /^\d{10,13}$/.test(value), 'Informe um telefone com DDD.'),
  whatsapp: optionalPhone.default(''),
  instagram: z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) => !value || /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(value),
      'Informe o link do perfil no Instagram.',
    )
    .default(''),
  city: z.string().trim().min(2, 'Informe sua cidade.').max(100),
  region: z.enum([
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ]),
  address: z.string().trim().max(250).default(''),
};
export const companyOnboardingSchema = z
  .object({
    ...fields,
    ...structuredAddress,
    planCode: z.enum(['individual', 'team']),
    nicheCode: z.string().min(1).max(80),
    templateCode: z.string().min(1).max(80).default(MINI_SITE),
  })
  .strict()
  .superRefine(validateAddress);

// Stable identity for this initial onboarding, independent of slug or request key.
// This lets the existing company-scoped idempotency record reference the newly created company.
const initialCompanyId = (userId) =>
  `company-${createHash('sha256').update(`gradefy-onboarding-v1:${userId}`).digest('hex')}`;

export async function getPendingBusiness(db, userId) {
  const row = await db.get(
    "SELECT c.id,c.name,c.slug,c.niche_id,c.template_id,o.plan_id,o.current_step,o.completed_at,o.subscription_id,o.status AS onboarding_status,s.description,s.phone,s.whatsapp,s.instagram_url,s.city,s.region,s.address,s.postal_code,s.street,s.neighborhood,s.address_number,s.address_complement,p.name AS plan_name,n.name AS niche_name,t.name AS template_name FROM company_onboarding o JOIN companies c ON c.id=o.company_id JOIN company_members m ON m.company_id=c.id JOIN company_settings s ON s.company_id=c.id JOIN plans p ON p.id=o.plan_id JOIN niches n ON n.id=c.niche_id JOIN templates t ON t.id=c.template_id WHERE o.created_by=? AND m.user_id=? AND m.role='owner' AND m.status='active' AND c.site_published=0 AND ((o.status='pending' AND c.status='suspended') OR (o.status='completed' AND c.status='active'))",
    [userId, userId],
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    onboardingStatus: row.onboarding_status,
    currentStep: row.current_step,
    completedAt: row.completed_at,
    trial: row.subscription_id
      ? await db.get(
          'SELECT status,trial_started_at,trial_ends_at FROM subscriptions WHERE company_id=? AND id=?',
          [row.id, row.subscription_id],
        )
      : null,
    plan: { code: row.plan_id, name: row.plan_name },
    niche: { code: row.niche_id, name: row.niche_name },
    template: { code: row.template_id, name: row.template_name },
    settings: {
      description: row.description,
      phone: row.phone,
      whatsapp: row.whatsapp,
      instagram: row.instagram_url,
      city: row.city,
      region: row.region,
      address: row.address,
      postal_code: row.postal_code,
      street: row.street,
      neighborhood: row.neighborhood,
      address_number: row.address_number,
      address_complement: row.address_complement,
    },
  };
}

export async function createOnboardingBusiness(db, userId, input, key = null) {
  const payload = companyOnboardingSchema.parse(input);
  const companyId = initialCompanyId(userId);
  return db
    .transaction(async (tx) => {
      await lockResource(tx, companyId, 'onboarding-user', userId);
      if (await tx.get('SELECT id FROM companies WHERE id=?', [companyId])) {
        const owner = await tx.get(
          "SELECT user_id FROM company_members WHERE company_id=? AND user_id=? AND role='owner' AND status='active'",
          [companyId, userId],
        );
        if (!owner) domainError(403, 'COMPANY_ACCESS_DENIED', 'Sem acesso a esta empresa.');
      }
      return idempotent(tx, companyId, 'company-create', key, payload, async () => {
        if (
          (await listUserCompanies(tx, userId)).length ||
          (await tx.get('SELECT id FROM companies WHERE id=?', [companyId]))
        )
          domainError(
            409,
            'COMPANY_ALREADY_CONFIGURED',
            'Você já tem um estabelecimento. Retome a configuração pela sua conta.',
          );
        await getAvailablePlan(tx, payload.planCode);
        // Preserve explicit legacy integrations; new Gradefy clients only see Mini Site.
        const catalog = await getOnboardingCatalog(tx, { legacy: true });
        if (
          !catalog.niches.some((niche) => niche.code === payload.nicheCode) ||
          !catalog.templates.some(
            (template) =>
              template.code === payload.templateCode && template.nicheCode === payload.nicheCode,
          )
        )
          domainError(
            409,
            'SELECTION_UNAVAILABLE',
            'Escolha um segmento e um template disponíveis.',
          );
        // Shared namespace: two different creators cannot reserve the same slug concurrently.
        await lockResource(tx, 'gradefy-onboarding', 'slug', payload.slug);
        if (await tx.get('SELECT id FROM companies WHERE slug=?', [payload.slug]))
          domainError(409, 'SLUG_UNAVAILABLE', 'Esse nome público já está em uso. Escolha outro.');
        const now = new Date().toISOString();
        await tx.run(
          "INSERT INTO companies(id,slug,name,niche_id,template_id,status,site_published,created_at,updated_at) VALUES(?,?,?,?,?,'suspended',0,?,?)",
          [
            companyId,
            payload.slug,
            payload.name,
            payload.nicheCode,
            payload.templateCode,
            now,
            now,
          ],
        );
        await tx.run(
          "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?)",
          [companyId, userId, now],
        );
        await tx.run(
          'INSERT INTO company_settings(company_id,description,phone,whatsapp,instagram_url,city,region,address,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            companyId,
            payload.description,
            payload.phone,
            payload.whatsapp,
            payload.instagram,
            payload.city,
            payload.region,
            formatAddress(payload),
            now,
          ],
        );
        await tx.run(
          'UPDATE company_settings SET postal_code=?,street=?,neighborhood=?,address_number=?,address_complement=? WHERE company_id=?',
          [
            payload.postal_code || null,
            payload.street || null,
            payload.neighborhood || null,
            payload.address_number || null,
            payload.address_complement || null,
            companyId,
          ],
        );
        await tx.run(
          'INSERT INTO company_onboarding(company_id,created_by,plan_id,created_at,updated_at) VALUES(?,?,?,?,?)',
          [companyId, userId, payload.planCode, now, now],
        );
        return { company: await getPendingBusiness(tx, userId) };
      });
    })
    .catch((error) => {
      if (
        error.constraint === 'companies_slug_key' ||
        error.message?.includes('UNIQUE constraint failed: companies.slug')
      )
        domainError(409, 'SLUG_UNAVAILABLE', 'Esse nome público já está em uso. Escolha outro.');
      throw error;
    });
}

export function installCompanyOnboarding(app, db, authenticated, lookup = lookupPostalCode) {
  app.get('/api/address/cep/:cep', authenticated, async (req, res) =>
    res.json(await lookup(postalCode.parse(req.params.cep))),
  );
  app.get('/api/onboarding/business', authenticated, async (req, res) =>
    res.json({ company: await getPendingBusiness(db, req.user.id) }),
  );
  app.post('/api/onboarding/business', authenticated, async (req, res) => {
    const key = requestKey(req);
    res.status(201).json(await createOnboardingBusiness(db, req.user.id, req.body, key));
  });
}
