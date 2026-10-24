import { installServiceRoutes } from './services.js';
import { emailConfigured } from './transactional-email.js';
import { installEmailWebhooks } from './email-webhooks.js';
import { installEmailCenter } from './email-center.js';
import { createSiteStorage } from './site-storage.js';
import { installCompanySite } from './company-site.js';
import { installDashboard } from './dashboard.js';
import { installAgendaRoutes, agendaAccess, checkExpected, reservationExpected } from './agenda.js';
import { installClientRoutes, findClient, linkAppointmentClient } from './clients.js';
import { installFinanceRoutes, appointmentFinance } from './finance.js';
import { installReportRoutes } from './reports.js';
import { installTeamRoutes } from './team.js';
import { jwtSecret } from './jwt-secret.js';
import {
  installProfessionalPanel,
  professionalAccess,
  professionalCompletionSchema,
  checkOwnExpected,
} from './professional-panel.js';
import { lockProfessionalAccess, professionalEvent } from './professional-links.js';
import {
  installOperationalSettings,
  readPolicies,
  lockOperational,
  intersectDay,
  policyAccess,
  noticeSlots,
  enforceCustomerNotice,
} from './operational-settings.js';
import { installSiteAssetRoutes } from './site-assets.js';
import { installOperationalOnboarding } from './operational-onboarding.js';
import {
  resolveCompanyContext,
  resolvePublicCompany,
  requireCompanyRole,
  listUserCompanies,
  canManageCompany,
} from './company-access.js';
import { requireCompanyId, getLegacyCompanyId } from './company-context.js';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  availableSlots,
  addDays,
  clock,
  dateInBrazil,
  dateInTimezone,
  isFuture,
  overlaps,
  weekday,
} from './domain.js';
import { getCompanyMetrics } from './company-metrics.js';
import { enqueueNotification } from './notifications.js';
import { demoMode } from './seed.js';
import { installProfileRoutes, publicUser } from './profile.js';
import { parseRegistration } from './registration.js';
import {
  getAvailablePlan,
  getPlanCatalog,
  publicPlan,
  domainError,
  getCompanyEntitlements,
  currentTime,
} from './entitlements.js';
import { lockPublication } from './site-publication.js';
import { installPortfolioRoutes } from './portfolio.js';
import { getPublicSite } from './public-site.js';
import { installOnboardingCatalog } from './onboarding-catalog.js';
import { installCompanyOnboarding } from './company-onboarding.js';
import { lockBarbers, lockAppointment, lockCatalog, lockResource } from './scheduling-locks.js';
import { idempotent, requestKey } from './idempotency.js';
import { installScheduleRoutes, readSchedule } from './schedule.js';
import {
  installProfessionalRoutes,
  publicProfessionals,
  performsServices,
} from './professionals.js';
import { dateAccess, minutes } from './schedule-domain.js';
import { installPasswordRecovery } from './password-recovery.js';
import { installGuestSessions, ownsAppointment, publicVisitor } from './guest-session.js';
import { createClientAuth } from './client-auth.js';
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(`${s}T12:00:00Z`)) &&
      new Date(`${s}T12:00:00Z`).toISOString().startsWith(s),
    'Data inválida.',
  );
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minuteOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(200)
  .transform((s) => s.toLowerCase());
const singleServiceSchema = z
  .array(z.string().min(1))
  .length(1, 'Escolha apenas um serviço por agendamento.');
const bookingSchema = z.object({
  services: singleServiceSchema,
  barberId: z.string().min(1),
  date: dateSchema,
  time: timeSchema,
  expectedTotal: z.number().int().nonnegative().optional(),
  expectedDuration: z.number().int().positive().optional(),
});
const guestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .transform((name) => name.replace(/\s+/g, ' '))
      .refine((name) => name.split(' ').length >= 2, 'Informe nome e sobrenome.'),
    email: emailSchema,
    phone: z
      .string()
      .max(30)
      .transform((phone) => phone.replace(/\D/g, ''))
      .refine((phone) => /^\d{10,13}$/.test(phone), 'Informe um telefone válido com DDD.'),
  })
  .strict();
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

export function createApp(
  db,
  {
    secret = process.env.JWT_SECRET,
    test = false,
    siteStorage = createSiteStorage(),
    serveStatic = true,
    testGuestAccess = false,
    invitationEmail,
    postalLookup,
  } = {},
) {
  if (
    testGuestAccess &&
    (!demoMode ||
      process.env.VERCEL ||
      process.env.NODE_ENV === 'production' ||
      db.dialect !== 'sqlite' ||
      db.ephemeral !== true)
  )
    throw new Error('Acesso sem verificação exige demonstração com banco temporário isolado.');
  secret = jwtSecret(secret, { test, ephemeral: db.ephemeral === true });
  const app = express();
  const allowedOrigins = new Set([new URL(process.env.APP_URL || 'http://localhost:5173').origin]);
  if (process.env.VERCEL && process.env.VERCEL_URL)
    allowedOrigins.add(`https://${process.env.VERCEL_URL}`);
  const secureCookies = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const open = Number(process.env.OPEN_HOUR || 9),
    close = Number(process.env.CLOSE_HOUR || 19);
  if (
    !Number.isInteger(open) ||
    !Number.isInteger(close) ||
    open < 0 ||
    close > 23 ||
    open >= close
  )
    throw new Error('Horário de funcionamento inválido.');
  app.disable('x-powered-by');
  // Vercel overwrites forwarding headers at its trusted edge.
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  installEmailWebhooks(app, db);
  app.use('/api/auth/profile', express.json({ limit: '768kb' }));
  app.use(/^\/api\/public\/[^/]+\/auth\/profile$/, express.json({ limit: '768kb' }));
  app.use('/api/admin/portfolio', express.json({ limit: '1500kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !allowedOrigins.has(req.headers.origin)
    )
      return res.status(403).json({ error: 'Origem não permitida.' });
    next();
  });
  if (!test)
    app.use(
      '/api',
      rateLimit({
        windowMs: 60000,
        limit: 200,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Muitas solicitações. Aguarde um minuto.' },
      }),
    );
  app.use('/api', async (req, _res, next) => {
    let payload;
    try {
      if (req.cookies.session) {
        payload = jwt.verify(req.cookies.session, secret, {
          algorithms: ['HS256'],
          issuer: 'igor-barber-club',
          audience: 'barber-web',
        });
      }
    } catch {
      /* Expired and invalid cookies are treated as unauthenticated. */
    }
    if (payload) {
      // Database outages are server failures, not expired sessions.
      const user = await db.get('SELECT * FROM users WHERE id=?', [payload.sub]);
      req.sessionVersion = payload.version ?? 0;
      if (user && user.session_version === req.sessionVersion) req.user = user;
    }
    next();
  });
  const authenticated = (req, _res, next) =>
    req.user ? next() : next(new HttpError(401, 'Entre na sua conta para continuar.'));
  const admin = requireCompanyRole;
  const login = (res, user) => {
    const token = jwt.sign({ version: user.session_version || 0 }, secret, {
      subject: user.id,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
    res.cookie('session', token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: 7 * 86400000,
      path: '/',
    });
  };
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: test ? 1000 : 20,
    skipSuccessfulRequests: true,
    message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  });
  installProfileRoutes(app, db, { authenticated, login, authLimiter });
  installPasswordRecovery(app, db, { secret, secureCookies });
  const installCompanyTeam = installTeamRoutes(app, db, {
    authenticated,
    secret,
    email: invitationEmail,
  });
  app.get('/api/companies', authenticated, async (req, res) =>
    res.json(await listUserCompanies(db, req.user.id)),
  );
  app.get('/api/plans', authenticated, async (_req, res) => res.json(await getPlanCatalog(db)));
  installOnboardingCatalog(app, db, authenticated);
  installCompanyOnboarding(app, db, authenticated, postalLookup);
  installOperationalOnboarding(app, db, authenticated);
  installCompanySite(app, db, { authenticated, storage: siteStorage });
  installDashboard(app, db, authenticated);
  app.post('/api/onboarding/plan-selection', authenticated, async (req, res) => {
    const { planCode } = z
      .object({ planCode: z.enum(['individual', 'team']) })
      .strict()
      .parse(req.body);
    if ((await listUserCompanies(db, req.user.id)).length)
      domainError(
        409,
        'COMPANY_ALREADY_CONFIGURED',
        'Você já tem um estabelecimento. Acesse sua conta empresarial.',
      );
    // Validation only. A draft choice must never create a company/subscription or start a trial.
    const selected = await getAvailablePlan(db, planCode);
    res.json({ plan: publicPlan(selected) });
  });
  // Same authentication, independent of any public company/visitor context.
  // Requests without this explicit scope still use the legacy company router.
  app.get('/api/auth/me', (req, res, next) => {
    if (req.query.scope !== 'gradefy') return next();
    res.json({ user: publicUser(req.user), visitor: null });
  });
  app.post('/api/auth/logout', (req, res, next) => {
    if (req.query.scope !== 'gradefy') return next();
    res.clearCookie('session', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
    });
    res.json({ ok: true });
  });
  const dummyHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);
  const clientAuth = createClientAuth(db, { secret, secureCookies, authLimiter, dummyHash });
  app.get('/api/health', (_req, res) => res.json({ ok: true, database: db.dialect }));
  app.get('/api/config', (_req, res) =>
    res.json({
      demo: demoMode,
      testGuestAccess,
      open,
      close,
      timezone: 'America/Sao_Paulo',
      notifications: {
        email: emailConfigured(),
        whatsapp: !!(
          process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_WHATSAPP_FROM &&
          process.env.TWILIO_CONTENT_SID
        ),
      },
    }),
  );
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const data = parseRegistration(req.body);
    const user = { id: randomUUID(), ...data, role: 'client' };
    const hash = await bcrypt.hash(data.password, 12);
    try {
      await db.run(
        'INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)',
        [user.id, data.name, data.email, data.phone, hash, 'client', new Date().toISOString()],
      );
    } catch (e) {
      if (e.code === '23505' || String(e.message).includes('UNIQUE'))
        fail(409, 'Este e-mail já tem uma conta. Use a opção Entrar.');
      throw e;
    }
    login(res, user);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const data = z
      .object({ email: emailSchema, password: z.string().min(1).max(72) })
      .parse(req.body);
    const user = await db.get('SELECT * FROM users WHERE email=?', [data.email]);
    const valid = await bcrypt.compare(data.password, user?.password_hash || dummyHash);
    if (!user || !valid) fail(401, 'E-mail ou senha incorretos.');
    login(res, user);
    res.json({ user: publicUser(user) });
  });
  // Only routing is cached, never company status, memberships or permissions.
  // Keep the limiter outside the cache so router eviction cannot reset it.
  const guestBookingLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: test ? 1000 : 10,
    message: { error: 'Muitas tentativas de agendamento. Aguarde 15 minutos e tente novamente.' },
  });
  const routers = new Map();
  const dispatch = (req, res, next) => {
    const companyId = req.companyContext.companyId;
    let router = routers.get(companyId);
    if (!router) {
      router = createCompanyRouter(companyId);
      if (routers.size >= 64) routers.delete(routers.keys().next().value);
      routers.set(companyId, router);
    }
    return router(req, res, next);
  };
  app.use('/api/public/:companySlug', async (req, res, next) => {
    const reservations =
      (req.method === 'GET' && ['/appointments', '/auth/me'].includes(req.path)) ||
      (req.method === 'PATCH' && /^\/appointments\/[^/]+\/cancel$/.test(req.path)) ||
      (req.method === 'POST' &&
        /^\/auth\/(?:logout|login|register|forgot-password|reset-password)$/.test(req.path)) ||
      (req.method === 'PATCH' && /^\/auth\/(?:profile|password)$/.test(req.path));
    req.companyContext = await resolvePublicCompany(db, req.params.companySlug, { reservations });
    if (/^\/(?:admin|professional)(?:\/|$)/i.test(req.path))
      return res.status(404).json({ error: 'Rota não encontrada.' });
    const company = await db.get('SELECT template_id FROM companies WHERE id=?', [
      req.companyContext.companyId,
    ]);
    if (company.template_id === 'gradefy-minisite') {
      req.miniClientMode = true;
      await clientAuth.read(req);
    }
    return dispatch(req, res, next);
  });
  app.use('/api', async (req, res, next) => {
    req.companyContext = /^\/(?:admin|professional)(?:\/|$)/i.test(req.path)
      ? await resolveCompanyContext(db, req.user, req.get('X-Gradefy-Company-Id'))
      : await resolvePublicCompany(db);
    return dispatch(req, res, next);
  });
  function createCompanyRouter(companyId) {
    const app = express.Router();
    clientAuth.install(app, companyId);
    app.get('/site', async (_req, res) => res.json(await getPublicSite(db, companyId)));

    const visitors = installGuestSessions(app, db, companyId, { secureCookies, testGuestAccess });
    if (testGuestAccess)
      app.post('/auth/test-access', authLimiter, async (req, res) => {
        if (req.miniClientMode) return res.status(404).json({ error: 'Rota não encontrada.' });
        const { email } = z.object({ email: emailSchema }).strict().parse(req.body);
        const result = await visitors.restoreTestAccess(email);
        if (!result) fail(404, 'Faça primeiro um agendamento de teste com esse e-mail.');
        res.clearCookie('session', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: secureCookies,
        });
        visitors.setCookie(res, result.token);
        res.json({ visitor: publicVisitor(result.visitor) });
      });
    const bookingAuthenticated = (req, _res, next) =>
      req.user || (!req.miniClientMode && req.visitor)
        ? next()
        : next(
            new HttpError(401, 'Acesse pelo navegador usado no agendamento ou entre na sua conta.'),
          );
    app.get('/auth/me', (req, res) => {
      visitors.prepare(req, res);
      res.json({ user: publicUser(req.user), visitor: publicVisitor(req.visitor) });
    });

    app.post('/auth/logout', async (req, res) => {
      await visitors.forget(req, res);
      res.clearCookie('session', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies,
      });
      res.json({ ok: true });
    });
    installPortfolioRoutes(app, db, companyId, {
      authenticated,
      admin,
      authLimiter,
      storage: siteStorage,
    });
    installSiteAssetRoutes(app, db, companyId, siteStorage);
    installScheduleRoutes(app, db, companyId, {
      authenticated,
      admin,
      authorize: (tx, req, write) => agendaAccess(tx, companyId, req.user.id, write),
    });
    app.get('/services', async (_req, res) =>
      res.json(
        await db.all('SELECT * FROM services WHERE company_id=? AND active=1 ORDER BY price', [
          companyId,
        ]),
      ),
    );
    app.get('/barbers', async (req, res) => {
      const selected =
        req.query.services === undefined
          ? undefined
          : singleServiceSchema.parse(String(req.query.services).split(','))[0];
      res.json(await publicProfessionals(db, companyId, selected));
    });

    const getServices = async (tx, companyId, ids) => {
      requireCompanyId(companyId);
      const services = await tx.all(
        `SELECT * FROM services WHERE company_id=? AND active=1 AND id IN (${ids.map(() => '?').join(',')})`,
        [companyId, ...ids],
      );
      if (services.length !== ids.length)
        fail(400, 'Um dos serviços não está mais disponível. Atualize sua seleção.');
      return services;
    };
    const occupied = async (tx, companyId, barber, date, except = '', buffer = 0) => [
      ...(
        await tx.all(
          "SELECT date,start_minute,end_minute FROM appointments WHERE company_id=? AND barber_id=? AND date>=? AND date<=? AND status IN ('confirmed','completed') AND id<>?",
          [
            companyId,
            barber,
            addDays(date, buffer ? -1 : 0),
            addDays(date, buffer ? 1 : 0),
            except,
          ],
        )
      ).map((a) => ({
        start_minute: a.start_minute + (a.date < date ? -1440 : a.date > date ? 1440 : 0) - buffer,
        end_minute: a.end_minute + (a.date < date ? -1440 : a.date > date ? 1440 : 0) + buffer,
      })),
      ...(await tx.all(
        'SELECT start_minute,end_minute FROM blocks WHERE company_id=? AND barber_id=? AND date=?',
        [companyId, barber, date],
      )),
    ];
    const verifyDate = (date, today = dateInBrazil()) => {
      if (date < today || date > addDays(today, 730))
        fail(400, 'Escolha uma data entre hoje e os próximos dois anos.');
    };
    async function availability(req, internal = false) {
      if (internal)
        z.object({
          date: dateSchema,
          barberId: z.string().min(1),
          services: z.string().min(1),
          except: z.string().min(1).optional(),
        })
          .strict()
          .parse(req.query);
      const date = dateSchema.parse(req.query.date);
      const result = await db.transaction(
        async (tx) => {
          const company = internal
            ? (await agendaAccess(tx, companyId, req.user.id, true)).company
            : await tx.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
          const now = await currentTime(tx),
            today = dateInTimezone(now, company.timezone);
          verifyDate(date, today);
          const barberId = z.string().parse(req.query.barberId);
          if (
            !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
              companyId,
              barberId,
            ]))
          )
            fail(404, 'Profissional não encontrado.');
          const ids = (
            internal && req.query.except
              ? z.array(z.string().min(1)).min(1).max(100)
              : singleServiceSchema
          ).parse(String(req.query.services || '').split(','));
          let services = await getServices(tx, companyId, ids);
          let except = '';
          if (req.query.except) {
            const existing = await tx.get(
              'SELECT * FROM appointments WHERE company_id=? AND id=?',
              [companyId, String(req.query.except)],
            );
            if (
              existing &&
              ((await canManageCompany(tx, req.user?.id, companyId)) ||
                (await ownsAppointment(tx, companyId, req, existing)))
            )
              except = existing.id;
            if (internal) {
              if (
                !existing ||
                existing.status !== 'confirmed' ||
                !isFuture(existing.date, existing.start_minute, now, company.timezone)
              )
                fail(400, 'Este agendamento não pode mais ser remarcado.');
              const stored = await tx.all(
                'SELECT service_id AS id,name,price,duration FROM appointment_services WHERE company_id=? AND appointment_id=? ORDER BY service_id',
                [companyId, existing.id],
              );
              if (
                JSON.stringify(stored.map((s) => s.id).sort()) !== JSON.stringify([...ids].sort())
              )
                fail(400, 'Preserve os serviços da reserva ao reagendar.');
              services = stored;
            }
          }
          const duration = services.reduce((sum, s) => sum + s.duration, 0);
          if (!(await performsServices(tx, companyId, barberId, ids)))
            return {
              slots: [],
              duration,
              reason: 'professional-service-unavailable',
              message: 'Este profissional não realiza o serviço selecionado.',
            };
          const schedule = await readSchedule(tx, companyId, barberId);
          const policies = await readPolicies(tx, companyId);
          if (except && !internal) {
            const current = await tx.get(
              'SELECT date,start_minute FROM appointments WHERE company_id=? AND id=?',
              [companyId, except],
            );
            try {
              enforceCustomerNotice(policies, current, 'reschedule', now, company.timezone);
            } catch (error) {
              return { slots: [], duration, reason: 'reschedule-notice', message: error.message };
            }
          }
          const policy = policyAccess(policies, date, now, company.timezone, internal, !!except);
          const access = policy.allowed ? dateAccess(schedule, date, today) : policy;
          return {
            slots: access.allowed
              ? noticeSlots(
                  availableSlots({
                    date,
                    duration,
                    occupied: await occupied(
                      tx,
                      companyId,
                      barberId,
                      date,
                      except,
                      policies.buffer_minutes,
                    ),
                    workingDay: intersectDay(
                      schedule.days.find((d) => d.weekday === weekday(date)),
                      policies,
                      date,
                    ),
                    buffer: policies.buffer_minutes,
                    now,
                    timezone: company.timezone,
                  }),
                  policies,
                  date,
                  now,
                  company.timezone,
                  internal,
                )
              : [],
            reason: access.reason,
            message: access.message,
            duration,
          };
        },
        { readOnly: true },
      );
      return result;
    }
    app.get('/availability', async (req, res) => res.json(await availability(req)));
    const appointmentList = async (companyId, where, args, source = db, pagination = null) => {
      requireCompanyId(companyId);
      const rows = await source.all(
        `SELECT a.*,ca.client_id,COALESCE(a.guest_name,u.name) AS client_name,COALESCE(a.guest_email,u.email) AS client_email,COALESCE(a.guest_phone,u.phone) AS client_phone,b.name AS barber_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN client_appointments ca ON ca.company_id=a.company_id AND ca.appointment_id=a.id JOIN barbers b ON b.id=a.barber_id AND b.company_id=a.company_id WHERE a.company_id=? AND (${where}) ORDER BY a.date,a.start_minute,a.barber_id,a.id${pagination ? ' LIMIT ? OFFSET ?' : ''}`,
        [companyId, ...args, ...(pagination ? [pagination.limit, pagination.offset] : [])],
      );
      if (!rows.length) return [];
      const items = await source.all(
        `SELECT * FROM appointment_services WHERE company_id=? AND appointment_id IN (${rows.map(() => '?').join(',')})`,
        [companyId, ...rows.map((a) => a.id)],
      );
      return rows.map((a) => ({
        ...a,
        time: clock(a.start_minute),
        services: items.filter((i) => i.appointment_id === a.id),
      }));
    };
    app.get('/appointments', bookingAuthenticated, async (req, res) =>
      res.json(
        await appointmentList(
          companyId,
          req.user
            ? 'a.user_id=?'
            : 'a.user_id IS NULL AND a.id IN (SELECT appointment_id FROM guest_appointments WHERE company_id=a.company_id AND visitor_id=?)',
          [req.user ? req.user.id : req.visitor.id],
        ),
      ),
    );
    async function book(
      companyId,
      req,
      res,
      reschedule = false,
      asGuest = false,
      internal = false,
    ) {
      if (req.miniClientMode && (asGuest || !req.clientUser))
        domainError(
          401,
          'CLIENT_LOGIN_REQUIRED',
          'Entre como cliente para agendar neste estabelecimento.',
        );
      const internalSchema = bookingSchema
        .extend({
          services: reschedule ? z.array(z.string().min(1)).min(1).max(100) : singleServiceSchema,
          guest: guestSchema.optional(),
          userId: z.string().min(1).max(200).optional(),
          clientId: z.string().min(1).max(200).optional(),
          notes: z.string().trim().max(1000).optional(),
          expected: reservationExpected.optional(),
        })
        .strict()
        .superRefine((data, ctx) => {
          if (!reschedule && [data.guest, data.userId, data.clientId].filter(Boolean).length !== 1)
            ctx.addIssue({
              code: 'custom',
              path: ['guest'],
              message: 'Informe os contatos do cliente ou selecione um cliente existente.',
            });
          if (reschedule && (data.guest || data.userId || data.clientId))
            ctx.addIssue({
              code: 'custom',
              message: 'A identidade do cliente não pode ser alterada no reagendamento.',
            });
        });
      const data = (
        internal
          ? internalSchema
          : asGuest
            ? bookingSchema.extend({ guest: guestSchema }).strict()
            : bookingSchema
      ).parse(req.body);
      const key = reschedule && !internal ? null : requestKey(req, asGuest);
      const id = reschedule ? String(req.params.id) : randomUUID();
      let guestSession;
      const result = await db.transaction(async (tx) => {
        await lockPublication(tx, companyId, true);
        await lockOperational(tx, companyId, true);
        const company = internal
          ? (await agendaAccess(tx, companyId, req.user.id, true)).company
          : await tx.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
        let now = await currentTime(tx),
          today = dateInTimezone(now, company.timezone);
        if (
          !internal &&
          !(await tx.get(
            "SELECT id FROM companies WHERE id=? AND status='active' AND site_published=1",
            [companyId],
          ))
        )
          fail(404, 'Estabelecimento indisponível para novos agendamentos.');
        // Existing legacy companies retain their established policy without an automatic plan.
        if (
          await tx.get('SELECT company_id FROM company_onboarding WHERE company_id=?', [companyId])
        ) {
          const entitlement = await getCompanyEntitlements(tx, companyId);
          if (!entitlement.valid)
            domainError(
              409,
              entitlement.reason,
              'O agendamento deste estabelecimento está indisponível.',
            );
        }
        return idempotent(
          tx,
          companyId,
          internal
            ? reschedule
              ? 'managed-reschedule'
              : 'manual-booking'
            : asGuest
              ? 'guest-booking'
              : 'booking',
          key,
          internal && reschedule ? { id, ...data } : data,
          async () => {
            verifyDate(data.date, today);
            if (
              !(await tx.get("SELECT id FROM companies WHERE id=? AND status='active'", [
                companyId,
              ]))
            )
              fail(404, 'Empresa não encontrada.');
            if (asGuest && req.visitorToken)
              await lockResource(tx, companyId, 'visitor', req.visitorToken);
            await lockCatalog(tx, companyId, true);
            if (reschedule) await lockAppointment(tx, companyId, id);
            if (
              !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
                companyId,
                data.barberId,
              ]))
            )
              fail(404, 'Profissional não encontrado.');
            let current;
            if (reschedule) {
              current = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
                companyId,
                id,
              ]);
              if (!current || (!internal && !(await ownsAppointment(tx, companyId, req, current))))
                fail(404, 'Agendamento não encontrado.');
              if (
                current.status !== 'confirmed' ||
                !isFuture(current.date, current.start_minute, now, company.timezone)
              )
                fail(400, 'Este agendamento não pode mais ser remarcado.');
            }
            await lockBarbers(
              tx,
              companyId,
              data.barberId,
              ...(current ? [current.barber_id] : []),
            );
            if (current) {
              // A block can cancel while this request waits for the existing barber lock.
              // Never move the historical dates or emit a reschedule for a cancelled row.
              const fresh = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
                companyId,
                id,
              ]);
              if (!fresh || fresh.status !== 'confirmed')
                fail(409, 'Este atendimento foi cancelado ou finalizado. Atualize sua agenda.');
              current = fresh;
            }
            now = await currentTime(tx);
            today = dateInTimezone(now, company.timezone);
            const policies = await readPolicies(tx, companyId);
            if (current && !internal)
              enforceCustomerNotice(policies, current, 'reschedule', now, company.timezone);
            if (current && !internal && !(await ownsAppointment(tx, companyId, req, current, true)))
              fail(404, 'Agendamento não encontrado.');
            if (current && internal) checkExpected(current, data.expected);
            let services = await getServices(tx, companyId, data.services);
            if (current && internal) {
              const stored = await tx.all(
                'SELECT service_id AS id,name,price,duration FROM appointment_services WHERE company_id=? AND appointment_id=? ORDER BY service_id',
                [companyId, id],
              );
              if (
                JSON.stringify(stored.map((s) => s.id).sort()) !==
                JSON.stringify([...data.services].sort())
              )
                fail(400, 'Preserve os serviços da reserva ao reagendar.');
              services = stored;
            }
            if (
              internal &&
              data.userId &&
              !(await tx.get(
                'SELECT id FROM appointments WHERE company_id=? AND user_id=? LIMIT 1',
                [companyId, data.userId],
              ))
            )
              fail(404, 'Cliente não encontrado nesta empresa.');
            if (!(await performsServices(tx, companyId, data.barberId, data.services)))
              fail(409, 'Este profissional não está disponível para o serviço selecionado.');
            const duration = services.reduce((sum, s) => sum + s.duration, 0);
            const total = services.reduce((sum, s) => sum + s.price, 0);
            if (
              current &&
              total !== current.total &&
              (await tx.get(
                'SELECT id FROM financial_payments WHERE company_id=? AND appointment_id=? LIMIT 1',
                [companyId, id],
              ))
            )
              domainError(
                409,
                'FINANCIAL_HISTORY_PRICE_LOCKED',
                'Um atendimento com histórico financeiro deve manter seu valor registrado ao reagendar.',
              );
            if (
              (data.expectedTotal !== undefined && data.expectedTotal !== total) ||
              (data.expectedDuration !== undefined && data.expectedDuration !== duration)
            )
              fail(
                412,
                'O preço ou a duração mudou. Atualize a página para revisar os serviços antes de confirmar.',
              );
            const schedule = await readSchedule(tx, companyId, data.barberId);
            const policy = policyAccess(
              policies,
              data.date,
              now,
              company.timezone,
              internal,
              reschedule,
            );
            const access = policy.allowed ? dateAccess(schedule, data.date, today) : policy;
            if (!access.allowed) fail(409, access.message);
            const slots = noticeSlots(
              availableSlots({
                date: data.date,
                duration,
                occupied: await occupied(
                  tx,
                  companyId,
                  data.barberId,
                  data.date,
                  reschedule ? id : '',
                  policies.buffer_minutes,
                ),
                workingDay: intersectDay(
                  schedule.days.find((d) => d.weekday === weekday(data.date)),
                  policies,
                  data.date,
                ),
                buffer: policies.buffer_minutes,
                now,
                timezone: company.timezone,
              }),
              policies,
              data.date,
              now,
              company.timezone,
              internal,
            );
            if (!slots.includes(data.time))
              fail(409, 'Esse horário acabou de ficar indisponível. Escolha outro horário.');
            const start = minuteOf(data.time);
            const selectedClient =
              internal && data.clientId ? await findClient(tx, companyId, data.clientId) : null;
            const accountId =
              selectedClient?.source_kind === 'user'
                ? selectedClient.source_id
                : internal
                  ? data.userId || null
                  : asGuest
                    ? null
                    : req.user?.id || null;
            const contact =
              selectedClient ||
              data.guest ||
              (accountId
                ? await tx.get('SELECT name,email,phone FROM users WHERE id=?', [accountId])
                : null);
            if (reschedule) {
              await tx.run(
                'UPDATE appointments SET barber_id=?,date=?,start_minute=?,end_minute=?,total=? WHERE company_id=? AND id=?',
                [data.barberId, data.date, start, start + duration, total, companyId, id],
              );
              await tx.run(
                'DELETE FROM appointment_services WHERE company_id=? AND appointment_id=?',
                [companyId, id],
              );
            } else
              await tx.run(
                `INSERT INTO appointments (company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                  companyId,
                  id,
                  accountId,
                  data.barberId,
                  data.date,
                  start,
                  start + duration,
                  total,
                  'confirmed',
                  new Date().toISOString(),
                  selectedClient?.name || data.guest?.name || null,
                  selectedClient ? selectedClient.email || '' : data.guest?.email || null,
                  selectedClient?.phone || data.guest?.phone || null,
                ],
              );
            if (internal)
              await tx.run('UPDATE appointments SET notes=? WHERE company_id=? AND id=?', [
                data.notes ?? current?.notes ?? '',
                companyId,
                id,
              ]);
            for (const s of services)
              await tx.run(
                `INSERT INTO appointment_services (company_id,appointment_id,service_id,name,price,duration) VALUES (?,?,?,?,?,?)`,
                [companyId, id, s.id, s.name, s.price, s.duration],
              );
            if (asGuest) {
              guestSession = await visitors.save(tx, req, data.guest);
              if (key && guestSession.token !== req.visitorToken)
                fail(428, 'Renove a sessão de visitante antes de repetir esta reserva.');
              await tx.run(
                `INSERT INTO guest_appointments (company_id,appointment_id,visitor_id) VALUES (?,?,?)`,
                [companyId, id, guestSession.visitor.id],
              );
            }
            if (!reschedule)
              await linkAppointmentClient(tx, companyId, id, {
                clientId: data.clientId,
                userId: accountId,
                visitorId: guestSession?.visitor.id,
                contact,
              });
            await enqueueNotification(tx, companyId, id, reschedule ? 'rescheduled' : 'confirmed');
            return {
              ...(await appointmentList(companyId, 'a.id=?', [id], tx))[0],
              ...(guestSession ? { visitor: publicVisitor(guestSession.visitor) } : {}),
            };
          },
        );
      });
      if (guestSession) visitors.setCookie(res, guestSession.token);
      res.status(reschedule ? 200 : 201).json(result);
    }
    app.post('/appointments', authenticated, (req, res) => book(companyId, req, res));
    app.post('/appointments/guest', guestBookingLimiter, (req, res) =>
      book(companyId, req, res, false, true),
    );
    app.patch('/appointments/:id/reschedule', bookingAuthenticated, (req, res) =>
      book(companyId, req, res, true),
    );
    app.patch('/appointments/:id/cancel', bookingAuthenticated, async (req, res) => {
      await db.transaction(async (tx) => {
        await lockOperational(tx, companyId, true);
        await lockAppointment(tx, companyId, String(req.params.id));
        const a = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
        if (!a) fail(404, 'Agendamento não encontrado.');
        await lockBarbers(tx, companyId, a.barber_id);
        if (!(await ownsAppointment(tx, companyId, req, a, true)))
          fail(404, 'Agendamento não encontrado.');
        const fresh = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          a.id,
        ]);
        const company = await tx.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
        const now = await currentTime(tx);
        if (
          fresh.status !== 'confirmed' ||
          !isFuture(fresh.date, fresh.start_minute, now, company.timezone)
        )
          fail(400, 'Este agendamento não pode mais ser cancelado.');
        enforceCustomerNotice(
          await readPolicies(tx, companyId),
          fresh,
          'cancel',
          now,
          company.timezone,
        );
        await tx.run("UPDATE appointments SET status='cancelled' WHERE company_id=? AND id=?", [
          companyId,
          a.id,
        ]);
        await enqueueNotification(tx, companyId, a.id, 'cancelled');
      });
      res.json({ ok: true });
    });

    app.use('/admin', authenticated, admin);
    const authorizeManagement = (tx, req, write) => agendaAccess(tx, companyId, req.user.id, write);
    installOperationalSettings(app, db, companyId);
    installProfessionalRoutes(app, db, companyId, { authorize: authorizeManagement });
    app.get('/admin/appointments', async (req, res) => {
      const from = dateSchema.parse(req.query.from || dateInBrazil()),
        to = dateSchema.parse(req.query.to || from);
      if (to < from || to > addDays(from, 366)) fail(400, 'Intervalo inválido.');
      res.json(await appointmentList(companyId, 'a.date>=? AND a.date<=?', [from, to]));
    });
    async function updateStatus(req, internal = false, own = false) {
      const data = own
        ? { ...professionalCompletionSchema.parse(req.body), status: 'completed' }
        : internal
          ? z
              .object({
                status: z.enum(['completed', 'cancelled']),
                expected: reservationExpected.optional(),
              })
              .strict()
              .parse(req.body)
          : { status: z.enum(['completed', 'cancelled', 'no-show']).parse(req.body.status) };
      const status = data.status,
        id = String(req.params.id),
        key = internal ? requestKey(req) : null;
      return db.transaction(async (tx) => {
        if (own) await lockProfessionalAccess(tx, companyId, true);
        let access = own ? await professionalAccess(tx, companyId, req.user.id, true) : null;
        if (
          own &&
          !(await tx.get(
            'SELECT id FROM appointments WHERE company_id=? AND barber_id=? AND id=?',
            [companyId, access.professional.id, id],
          ))
        )
          fail(404, 'Atendimento não encontrado.');
        const company = own
          ? access.company
          : internal
            ? (await agendaAccess(tx, companyId, req.user.id, true)).company
            : await tx.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
        return idempotent(
          tx,
          companyId,
          'managed-status',
          key,
          { id, ...data, ...(own ? { scope: 'own-professional' } : {}) },
          async () => {
            await lockAppointment(tx, companyId, String(req.params.id));
            const a = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
              companyId,
              String(req.params.id),
            ]);
            if (!a) fail(404, 'Agendamento não encontrado.');
            await lockBarbers(tx, companyId, a.barber_id);
            if (own) {
              access = await professionalAccess(tx, companyId, req.user.id, true);
              if (a.barber_id !== access.professional.id) fail(404, 'Atendimento não encontrado.');
            }
            const fresh = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
              companyId,
              a.id,
            ]);
            // Without a key, repeated terminal status is still a no-op, never another outbox event.
            if (internal && fresh.status === status) return { ok: true };
            if (own) checkOwnExpected(fresh, data.expected);
            else if (internal) checkExpected(fresh, data.expected);
            if (fresh.status !== 'confirmed') fail(400, 'Este agendamento já foi finalizado.');
            const now = await currentTime(tx);
            if (
              status === 'completed' &&
              isFuture(fresh.date, fresh.end_minute, now, company.timezone)
            )
              fail(400, 'Aguarde o fim do horário para concluir o atendimento.');
            if (
              status === 'no-show' &&
              isFuture(fresh.date, fresh.start_minute, now, company.timezone)
            )
              fail(400, 'Aguarde o horário do atendimento para marcar ausência.');
            await tx.run('UPDATE appointments SET status=? WHERE company_id=? AND id=?', [
              status,
              companyId,
              a.id,
            ]);
            if (own)
              await professionalEvent(tx, companyId, req.user.id, 'completed', {
                professional: fresh.barber_id,
                appointment: fresh.id,
              });
            if (status === 'cancelled')
              await enqueueNotification(tx, companyId, a.id, 'cancelled', {
                cancellationSource: 'business',
              });
            return { ok: true };
          },
        );
      });
    }
    app.patch('/admin/appointments/:id/status', async (req, res) => {
      await updateStatus(req);
      res.json({ ok: true });
    });
    installProfessionalPanel(app, db, companyId, { authenticated, updateStatus });
    installAgendaRoutes(app, db, companyId, {
      appointmentFinance,
      appointmentList,
      availability,
      updateStatus,
      book: (req, res, reschedule) => book(companyId, req, res, reschedule, false, true),
    });
    installClientRoutes(app, db, companyId, { appointmentList });
    installFinanceRoutes(app, db, companyId);
    installReportRoutes(app, db, companyId);
    installCompanyTeam(app, companyId);
    installServiceRoutes(app, db, companyId, { authorize: authorizeManagement });
    app.get('/admin/blocks', async (req, res) => {
      const from = dateSchema.parse(req.query.from || dateInBrazil()),
        to = dateSchema.parse(req.query.to || from);
      res.json(
        await db.all(
          'SELECT * FROM blocks WHERE company_id=? AND date>=? AND date<=? ORDER BY date,start_minute',
          [companyId, from, to],
        ),
      );
    });
    app.post('/admin/blocks', async (req, res) => {
      const data = z
        .object({
          barberId: z.string(),
          date: dateSchema,
          start: timeSchema,
          end: timeSchema,
          reason: z.string().trim().min(2).max(120),
        })
        .parse(req.body);
      const key = requestKey(req);
      const start = minuteOf(data.start),
        end = minuteOf(data.end),
        id = randomUUID();
      const result = await db.transaction(async (tx) =>
        idempotent(tx, companyId, 'block', key, data, async () => {
          verifyDate(data.date);
          await lockBarbers(tx, companyId, data.barberId);
          if (
            !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
              companyId,
              data.barberId,
            ]))
          )
            fail(404, 'Profissional não encontrado.');
          const day = (await readSchedule(tx, companyId, data.barberId)).days.find(
            (d) => d.weekday === weekday(data.date),
          );
          if (
            !day?.active ||
            start >= end ||
            start < minutes(day.start_time) ||
            end > minutes(day.end_time)
          )
            fail(400, 'Escolha um intervalo válido dentro do expediente.');
          if (overlaps(start, end, await occupied(tx, companyId, data.barberId, data.date)))
            fail(409, 'Há um agendamento ou bloqueio nesse intervalo.');
          await tx.run(
            `INSERT INTO blocks (company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES (?,?,?,?,?,?,?)`,
            [companyId, id, data.barberId, data.date, start, end, data.reason],
          );
          return { id };
        }),
      );
      res.status(201).json(result);
    });
    app.delete('/admin/blocks/:id', async (req, res) => {
      await db.transaction(async (tx) => {
        const block = await tx.get('SELECT barber_id FROM blocks WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
        if (block) await lockBarbers(tx, companyId, block.barber_id);
        await tx.run('DELETE FROM blocks WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
      });
      res.json({ ok: true });
    });
    app.get('/admin/metrics', async (_req, res) => {
      res.json(await getCompanyMetrics(db, companyId, dateInBrazil()));
    });
    installEmailCenter(app, db, companyId);
    app.get('/admin/notifications', async (_req, res) =>
      res.json(
        await db.all(
          'SELECT channel,status,COUNT(*) AS count FROM notifications WHERE company_id=? GROUP BY channel,status',
          [companyId],
        ),
      ),
    );
    app.use('/', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

    return app;
  }
  if (serveStatic && existsSync(resolve('dist/index.html'))) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use((error, req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: [
          '/api/auth/profile',
          '/api/auth/password',
          '/api/auth/forgot-password',
          '/api/auth/reset-password',
        ].includes(req.path)
          ? error.issues[0]?.message || 'Confira os dados informados.'
          : 'Confira os dados informados.',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'JSON inválido.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'O arquivo ou os dados enviados são muito grandes.' });
    if (!error.status) console.error(error);
    res.status(error.status || 500).json({
      ...(error.code && error.status ? { code: error.code } : {}),
      error: error.status
        ? error.message
        : 'Não foi possível concluir a operação. Tente novamente.',
    });
  });
  return app;
}
