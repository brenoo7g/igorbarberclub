import { getLegacyCompanyId } from './company-context.js';
import { companyOnboardingSchema } from './company-onboarding.js';
import { domainError, getCompanyEntitlements, lockEntitlements } from './entitlements.js';
import { lockResource, lockCatalog, lockBarbers } from './scheduling-locks.js';
import { operationalSnapshot } from './operational-onboarding.js';
import { readAsset } from './site-assets.js';
import { publicAsset } from './public-site.js';

export const lockPublication = (tx, cid, shared = false) =>
  lockResource(tx, cid, 'site-publication', 'visibility', shared);

// Called inside the editor transaction, after its authorization and visibility locks.
export async function validatePublication(tx, row, storage) {
  const cid = row.company_id;
  const legacy = cid === getLegacyCompanyId();
  if (
    !companyOnboardingSchema.shape.slug.safeParse(row.slug).success ||
    !companyOnboardingSchema.shape.name.safeParse(row.name).success
  )
    domainError(409, 'INVALID_PUBLIC_IDENTITY', 'Revise o nome público e o endereço do site.');
  const template = await tx.get(
    'SELECT t.id FROM companies c JOIN templates t ON t.id=c.template_id AND t.niche_id=c.niche_id AND t.active=1 JOIN niches n ON n.id=c.niche_id AND n.active=1 WHERE c.id=?',
    [cid],
  );
  if (!template || template.id !== 'barber-classic')
    domainError(409, 'TEMPLATE_UNAVAILABLE', 'O template não está disponível para esta empresa.');
  const onboarding = await tx.get('SELECT status FROM company_onboarding WHERE company_id=?', [
    cid,
  ]);
  if (!legacy && onboarding?.status !== 'completed')
    domainError(
      409,
      'ONBOARDING_INCOMPLETE',
      'Conclua a configuração operacional antes de publicar.',
    );
  await lockEntitlements(tx, cid);
  if (!legacy) {
    const entitlement = await getCompanyEntitlements(tx, cid);
    if (!entitlement.valid)
      domainError(
        409,
        entitlement.reason,
        'É necessário um trial ou assinatura vigente para publicar.',
      );
  }
  await lockCatalog(tx, cid);
  const professionals = await tx.all(
    'SELECT id FROM barbers WHERE company_id=? AND active=1 ORDER BY id',
    [cid],
  );
  if (professionals.length) await lockBarbers(tx, cid, ...professionals.map((p) => p.id));
  const state = await operationalSnapshot(tx, { id: cid });
  const issues = [...state.issues];
  for (const person of professionals) {
    const settings = await tx.get(
      'SELECT barber_id FROM barber_settings WHERE company_id=? AND barber_id=?',
      [cid, person.id],
    );
    const count = await tx.get(
      'SELECT COUNT(*) AS n FROM barber_working_hours WHERE company_id=? AND barber_id=?',
      [cid, person.id],
    );
    if (!legacy && (!settings || Number(count.n) !== 7))
      issues.push('Configure explicitamente os horários de todos os profissionais ativos.');
  }
  if (issues.length) domainError(409, 'SITE_NOT_READY', issues.join(' '));
  // Images are optional. Managed images must be readable; never fetch arbitrary external URLs.
  for (const [field, purpose] of [
    ['logo_url', 'logo'],
    ['hero_image_url', 'banner'],
  ]) {
    const value = row[field];
    if (!value) continue;
    if (value.startsWith('asset:')) {
      const id = value.slice(6);
      if (
        !(await tx.get(
          "SELECT id FROM company_site_assets WHERE company_id=? AND id=? AND purpose=? AND status='ready'",
          [cid, id, purpose],
        ))
      )
        domainError(
          409,
          'SITE_IMAGE_UNAVAILABLE',
          'Uma imagem do site está indisponível. Substitua ou remova a imagem.',
        );
      await readAsset(tx, storage, cid, id);
    } else if (!publicAsset(value))
      domainError(409, 'SITE_IMAGE_UNAVAILABLE', 'Uma imagem do site possui endereço inválido.');
  }
  for (const photo of await tx.all('SELECT asset_id FROM portfolio_assets WHERE company_id=?', [
    cid,
  ]))
    await readAsset(tx, storage, cid, photo.asset_id);
}
