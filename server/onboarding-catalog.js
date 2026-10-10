import { z } from 'zod';
import { listUserCompanies } from './company-access.js';
import { domainError, getAvailablePlan } from './entitlements.js';

// A database row alone is not a renderable template. Only shipped templates are offered.
export async function getOnboardingCatalog(db) {
  const templates = await db.all(
    "SELECT t.id AS code,t.name,t.niche_id AS niche_code FROM templates t JOIN niches n ON n.id=t.niche_id WHERE t.active=1 AND n.active=1 AND t.id='barber-classic' AND t.niche_id='barbershop' ORDER BY t.id",
  );
  const niches = templates.length
    ? await db.all("SELECT id AS code,name FROM niches WHERE id='barbershop' AND active=1")
    : [];
  return {
    niches,
    templates: templates.map(({ niche_code, ...item }) => ({ ...item, nicheCode: niche_code })),
  };
}

export function installOnboardingCatalog(app, db, authenticated) {
  app.get('/api/onboarding/catalog', authenticated, async (_req, res) =>
    res.json(await getOnboardingCatalog(db)),
  );
  for (const step of ['niche', 'template']) {
    app.post(`/api/onboarding/${step}-selection`, authenticated, async (req, res) => {
      const shape = {
        planCode: z.enum(['individual', 'team']),
        nicheCode: z.string().min(1).max(80),
        ...(step === 'template' ? { templateCode: z.string().min(1).max(80) } : {}),
      };
      const selection = z.object(shape).strict().parse(req.body);
      if ((await listUserCompanies(db, req.user.id)).length)
        domainError(
          409,
          'COMPANY_ALREADY_CONFIGURED',
          'Você já tem um estabelecimento. Acesse sua conta empresarial.',
        );
      await getAvailablePlan(db, selection.planCode);
      const catalog = await getOnboardingCatalog(db);
      const niche = catalog.niches.find((item) => item.code === selection.nicheCode);
      const template = catalog.templates.find(
        (item) => item.code === selection.templateCode && item.nicheCode === selection.nicheCode,
      );
      if (!niche || (step === 'template' && !template))
        domainError(409, 'SELECTION_UNAVAILABLE', 'Escolha um segmento e um template disponíveis.');
      // Read-only validation, not a durable onboarding or an activation.
      res.json({ niche, ...(template ? { template } : {}) });
    });
  }
}
