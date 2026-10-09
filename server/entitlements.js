import { randomUUID } from 'node:crypto';
import { requireCompanyId } from './company-context.js';
import { lockResource } from './scheduling-locks.js';

export const domainError = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code });
};
export const lockEntitlements = (tx, companyId) =>
  lockResource(tx, companyId, 'entitlements', 'professionals');
export const activeProfessionalCount = async (db, companyId) => {
  requireCompanyId(companyId);
  return Number(
    (
      await db.get('SELECT COUNT(*) AS count FROM barbers WHERE company_id=? AND active=1', [
        companyId,
      ])
    ).count,
  );
};
const currentSubscription = (db, companyId) =>
  db.get(
    "SELECT * FROM subscriptions WHERE company_id=? AND status IN ('pending','active','trialing')",
    [companyId],
  );
const currentTime = async (db) =>
  db.dialect === 'postgres'
    ? new Date((await db.get('SELECT clock_timestamp() AS now')).now)
    : new Date();
async function company(db, companyId) {
  requireCompanyId(companyId);
  if (!(await db.get("SELECT id FROM companies WHERE id=? AND status='active'", [companyId])))
    domainError(404, 'COMPANY_NOT_FOUND', 'Empresa não encontrada.');
}
async function plan(db, code) {
  const row = await db.get('SELECT * FROM plans WHERE id=? AND active=1', [code]);
  if (!row || !Number.isInteger(row.price_cents))
    domainError(409, 'PLAN_UNAVAILABLE', 'Plano indisponível.');
  return row;
}
export async function getCompanyEntitlements(db, companyId) {
  await company(db, companyId);
  const subscription = await currentSubscription(db, companyId);
  const selected = subscription
    ? await db.get('SELECT * FROM plans WHERE id=?', [subscription.plan_id])
    : null;
  const now = (await currentTime(db)).getTime();
  let reason = 'PLAN_REQUIRED';
  if (subscription && selected?.active === 1) {
    if (subscription.status === 'trialing')
      reason =
        Date.parse(subscription.trial_started_at) <= now &&
        Date.parse(subscription.trial_ends_at) > now
          ? null
          : 'TRIAL_EXPIRED';
    else if (subscription.status === 'active')
      reason =
        (subscription.starts_at === null || Date.parse(subscription.starts_at) <= now) &&
        (subscription.ends_at === null || Date.parse(subscription.ends_at) > now)
          ? null
          : 'SUBSCRIPTION_EXPIRED';
  }
  return {
    planCode: selected?.id ?? null,
    subscriptionStatus: subscription?.status ?? null,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    maxProfessionals: selected?.max_professionals ?? null,
    valid: reason === null,
    reason,
  };
}
// Caller holds lockEntitlements for the entire count/validate/write operation.
export async function requireProfessionalCapacity(tx, companyId, additionalActive = 1) {
  const entitlement = await getCompanyEntitlements(tx, companyId);
  if (!entitlement.valid)
    domainError(
      409,
      entitlement.reason,
      'Associe um plano ou trial válido para criar ou reativar profissionais.',
    );
  if (
    entitlement.maxProfessionals !== null &&
    (await activeProfessionalCount(tx, companyId)) + additionalActive > entitlement.maxProfessionals
  )
    domainError(
      409,
      'PROFESSIONAL_LIMIT_REACHED',
      'O limite de profissionais ativos do plano foi atingido.',
    );
  return entitlement;
}
async function fitsPlan(tx, companyId, selected) {
  if (
    selected.max_professionals !== null &&
    (await activeProfessionalCount(tx, companyId)) > selected.max_professionals
  )
    domainError(
      409,
      'PLAN_DOWNGRADE_REQUIRES_ACTION',
      'Desative os profissionais excedentes antes de escolher este plano.',
    );
}
// Trusted domain operation only; no public onboarding/billing endpoint.
export async function startTrial(db, companyId, planCode) {
  return db.transaction(async (tx) => {
    await lockEntitlements(tx, companyId);
    await company(tx, companyId);
    const selected = await plan(tx, planCode);
    if (await tx.get('SELECT id FROM subscriptions WHERE company_id=? LIMIT 1', [companyId]))
      domainError(409, 'TRIAL_UNAVAILABLE', 'O trial é exclusivo do ciclo inicial da empresa.');
    await fitsPlan(tx, companyId, selected);
    const now = await currentTime(tx),
      end = new Date(now.getTime() + selected.trial_days * 86400000);
    const id = randomUUID();
    await tx.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,starts_at,ends_at,trial_started_at,trial_ends_at,created_at,updated_at) VALUES(?,?,?,'trialing','manual',?,?,?,?,?,?)",
      [
        id,
        companyId,
        selected.id,
        now.toISOString(),
        end.toISOString(),
        now.toISOString(),
        end.toISOString(),
        now.toISOString(),
        now.toISOString(),
      ],
    );
    return tx.get('SELECT * FROM subscriptions WHERE company_id=? AND id=?', [companyId, id]);
  });
}
export async function changeCompanyPlan(db, companyId, planCode) {
  return db.transaction(async (tx) => {
    await lockEntitlements(tx, companyId);
    await company(tx, companyId);
    const selected = await plan(tx, planCode),
      entitlement = await getCompanyEntitlements(tx, companyId);
    if (!entitlement.valid)
      domainError(409, entitlement.reason, 'Não há assinatura vigente para trocar o plano.');
    await fitsPlan(tx, companyId, selected);
    const subscription = await currentSubscription(tx, companyId);
    await tx.run('UPDATE subscriptions SET plan_id=?,updated_at=? WHERE company_id=? AND id=?', [
      selected.id,
      (await currentTime(tx)).toISOString(),
      companyId,
      subscription.id,
    ]);
    return getCompanyEntitlements(tx, companyId);
  });
}
