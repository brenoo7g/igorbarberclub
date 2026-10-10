import express from 'express';
import { z } from 'zod';
import { getPendingBusiness } from './company-onboarding.js';
import { getOnboardingCatalog } from './onboarding-catalog.js';
import {
  getAvailablePlan,
  domainError,
  activeProfessionalCount,
  startTrialInTransaction,
} from './entitlements.js';
import { idempotent, requestKey } from './idempotency.js';
import { lockResource } from './scheduling-locks.js';
import { installServiceRoutes, serviceSchema } from './services.js';
import { installProfessionalRoutes, professional } from './professionals.js';
import { installScheduleRoutes, readSchedule, settingsSchema } from './schedule.js';
import { availableSlots } from './domain.js';

const stepSchema = z
  .object({ step: z.enum(['services', 'professionals', 'schedule', 'review']) })
  .strict();
const lockOnboarding = (tx, id) => lockResource(tx, id, 'onboarding-state', 'configuration');
async function owned(tx, userId, companyId, pending = true) {
  const business = await getPendingBusiness(tx, userId);
  if (!business || business.id !== companyId)
    domainError(403, 'COMPANY_ACCESS_DENIED', 'Sem acesso a esta configuração.');
  if (pending && business.onboardingStatus !== 'pending')
    domainError(409, 'ONBOARDING_COMPLETED', 'A configuração já foi concluída.');
  return business;
}
async function pendingCapacity(tx, companyId, additional) {
  const row = await tx.get(
    "SELECT plan_id FROM company_onboarding WHERE company_id=? AND status='pending'",
    [companyId],
  );
  if (!row) domainError(409, 'ONBOARDING_COMPLETED', 'A configuração já foi concluída.');
  const plan = await getAvailablePlan(tx, row.plan_id);
  if (
    plan.max_professionals !== null &&
    (await activeProfessionalCount(tx, companyId)) + additional > plan.max_professionals
  )
    domainError(
      409,
      'PROFESSIONAL_LIMIT_REACHED',
      'O limite de profissionais ativos do plano foi atingido.',
    );
}
export async function operationalSnapshot(tx, business) {
  const companyId = business.id;
  const services = await tx.all('SELECT * FROM services WHERE company_id=? ORDER BY name,id', [
    companyId,
  ]);
  const ids = await tx.all('SELECT id FROM barbers WHERE company_id=? ORDER BY name,id', [
    companyId,
  ]);
  const professionals = [],
    schedules = [];
  // A transaction uses one PostgreSQL client; do not queue concurrent client.query calls.
  for (const { id } of ids) {
    professionals.push(await professional(tx, companyId, id));
    schedules.push({ professionalId: id, ...(await readSchedule(tx, companyId, id)) });
  }
  const issues = [];
  const activeServices = services.filter(
    (s) => s.active === 1 && serviceSchema.safeParse(s).success,
  );
  const activeProfessionals = professionals.filter((p) => p.active === 1);
  if (!activeServices.length) issues.push('Cadastre pelo menos um serviço ativo válido.');
  if (!activeProfessionals.length) issues.push('Cadastre pelo menos um profissional ativo.');
  for (const person of activeProfessionals) {
    const related = activeServices.filter((s) => person.services.includes(s.id));
    if (!related.length) issues.push(`Associe um serviço ativo a ${person.name}.`);
    const schedule = schedules.find((s) => s.professionalId === person.id);
    const valid =
      schedule && settingsSchema.safeParse({ ...schedule.settings, days: schedule.days }).success;
    if (!valid) issues.push(`Configure um expediente válido para ${person.name}.`);
    else if (
      !related.some((service) =>
        schedule.days.some(
          (day) =>
            availableSlots({
              date: '2099-01-01',
              duration: service.duration,
              workingDay: day,
              now: new Date(0),
            }).length,
        ),
      )
    )
      issues.push(
        `O expediente de ${person.name} precisa comportar a duração de um serviço associado.`,
      );
  }
  for (const service of activeServices)
    if (!activeProfessionals.some((p) => p.services.includes(service.id)))
      issues.push(`Associe ${service.name} a um profissional ativo.`);
  return { company: business, services, professionals, schedules, issues };
}

export async function finishOperationalOnboarding(db, userId, companyId, key) {
  return db.transaction(async (tx) => {
    await lockOnboarding(tx, companyId);
    const business = await owned(tx, userId, companyId, false);
    return idempotent(tx, companyId, 'onboarding-complete', key, {}, async () => {
      if (business.onboardingStatus === 'completed') return { company: business };
      const plan = await getAvailablePlan(tx, business.plan.code);
      const catalog = await getOnboardingCatalog(tx);
      if (
        plan.trial_days !== 7 ||
        !catalog.templates.some(
          (t) => t.code === business.template.code && t.nicheCode === business.niche.code,
        )
      )
        domainError(
          409,
          'SELECTION_UNAVAILABLE',
          'Revise o plano, segmento e template antes de concluir.',
        );
      const state = await operationalSnapshot(tx, business);
      if (state.issues.length) domainError(409, 'ONBOARDING_INCOMPLETE', state.issues.join(' '));
      await pendingCapacity(tx, companyId, 0);
      // Private company activation and the existing trial operation commit together.
      await tx.run(
        "UPDATE companies SET status='active',site_published=0,updated_at=? WHERE id=?",
        [new Date().toISOString(), companyId],
      );
      const subscription = await startTrialInTransaction(tx, companyId, plan.id);
      await tx.run(
        "UPDATE company_onboarding SET status='completed',current_step='review',completed_at=?,updated_at=?,subscription_id=? WHERE company_id=?",
        [subscription.trial_started_at, subscription.trial_started_at, subscription.id, companyId],
      );
      return { company: await getPendingBusiness(tx, userId) };
    });
  });
}

export function installOperationalOnboarding(app, db, authenticated) {
  app.use('/api/onboarding/operations', authenticated, async (req, res, next) => {
    const business = await getPendingBusiness(db, req.user.id);
    if (!business)
      domainError(
        403,
        'COMPANY_ACCESS_DENIED',
        'Crie sua empresa antes de configurar serviços e equipe.',
      );
    const companyId = business.id;
    if (req.get('X-Gradefy-Company-Id') && req.get('X-Gradefy-Company-Id') !== companyId)
      domainError(403, 'COMPANY_ACCESS_DENIED', 'Sem acesso a esta configuração.');
    if (req.path === '/' && req.method === 'GET')
      return res.json(
        await db.transaction(async (tx) => {
          await lockOnboarding(tx, companyId);
          return operationalSnapshot(tx, await owned(tx, req.user.id, companyId, false));
        }),
      );
    if (req.path === '/complete' && req.method === 'POST') {
      z.object({}).strict().parse(req.body);
      return res.json(
        await finishOperationalOnboarding(db, req.user.id, companyId, requestKey(req)),
      );
    }
    const guarded = {
      ...db,
      transaction: (perform) =>
        db.transaction(async (tx) => {
          await lockOnboarding(tx, companyId);
          await owned(tx, req.user.id, companyId);
          return perform(tx);
        }),
    };
    if (req.path === '/progress' && req.method === 'PUT') {
      const { step } = stepSchema.parse(req.body);
      await guarded.transaction((tx) =>
        tx.run('UPDATE company_onboarding SET current_step=?,updated_at=? WHERE company_id=?', [
          step,
          new Date().toISOString(),
          companyId,
        ]),
      );
      return res.json({ step });
    }
    await owned(db, req.user.id, companyId);
    // Expose only the existing resource handlers needed by onboarding, never an admin router.
    const schedule =
      /^\/professionals\/[^/]+\/schedule$/.test(req.path) && ['GET', 'PUT'].includes(req.method);
    const resource =
      /^\/services(?:\/[^/]+)?$/.test(req.path) ||
      /^\/professionals(?:\/[^/]+(?:\/status)?)?$/.test(req.path);
    if (!schedule && !resource) return res.status(404).json({ error: 'Rota não encontrada.' });
    const router = express.Router();
    installServiceRoutes(router, guarded, companyId, { onboarding: true });
    installProfessionalRoutes(router, guarded, companyId, { requireCapacity: pendingCapacity });
    const authorized = (_req, _res, done) => done();
    installScheduleRoutes(router, guarded, companyId, {
      authenticated: authorized,
      admin: authorized,
      includeInactive: true,
    });
    req.url = schedule
      ? req.url.replace(/^\/professionals\//, '/admin/barbers/')
      : `/admin${req.url}`;
    return router(req, res, (error) =>
      error ? next(error) : res.status(404).json({ error: 'Rota não encontrada.' }),
    );
  });
}
