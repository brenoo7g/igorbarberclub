import {
  resolveCompanyContext,
  resolvePublicCompany,
  requireCompanyRole,
  listUserCompanies,
  canManageCompany,
} from './company-access.js';
import { requireCompanyId } from './company-context.js';
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
  isFuture,
  overlaps,
  weekday,
} from './domain.js';
import { getCompanyMetrics } from './company-metrics.js';
import { enqueueNotification } from './notifications.js';
import { demoMode } from './seed.js';
import { installProfileRoutes, passwordSchema, publicUser } from './profile.js';
import { installPortfolioRoutes } from './portfolio.js';
import { installScheduleRoutes, readSchedule, lockSchedule } from './schedule.js';
import { dateAccess, minutes } from './schedule-domain.js';
import { installPasswordRecovery } from './password-recovery.js';
import { installGuestSessions, ownsAppointment, publicVisitor } from './guest-session.js';
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
const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(250),
  duration: z.number().int().min(10).max(480),
  price: z.number().int().min(0).max(1000000),
  category: z.string().trim().min(2).max(40),
});
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
    secret = process.env.JWT_SECRET || randomBytes(48).toString('hex'),
    test = false,
    serveStatic = true,
    testGuestAccess = false,
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
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  app.use('/api/auth/profile', express.json({ limit: '768kb' }));
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
  app.get('/api/companies', authenticated, async (req, res) =>
    res.json(await listUserCompanies(db, req.user.id)),
  );
  const dummyHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);
  app.get('/api/health', (_req, res) => res.json({ ok: true, database: db.dialect }));
  app.get('/api/config', (_req, res) =>
    res.json({
      demo: demoMode,
      testGuestAccess,
      open,
      close,
      timezone: 'America/Sao_Paulo',
      notifications: {
        email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
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
    const data = z
      .object({
        name: z
          .string()
          .trim()
          .min(3)
          .max(100)
          .refine((n) => n.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
        email: emailSchema,
        phone: z
          .string()
          .transform((p) => p.replace(/\D/g, ''))
          .refine((p) => /^\d{10,13}$/.test(p), 'Telefone inválido.'),
        password: passwordSchema(),
      })
      .parse(req.body);
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
    req.companyContext = await resolvePublicCompany(db, req.params.companySlug);
    if (/^\/admin(?:\/|$)/i.test(req.path))
      return res.status(404).json({ error: 'Rota não encontrada.' });
    return dispatch(req, res, next);
  });
  app.use('/api', async (req, res, next) => {
    req.companyContext = /^\/admin(?:\/|$)/i.test(req.path)
      ? await resolveCompanyContext(db, req.user, req.get('X-Gradefy-Company-Id'))
      : await resolvePublicCompany(db);
    return dispatch(req, res, next);
  });
  function createCompanyRouter(companyId) {
    const app = express.Router();

    const visitors = installGuestSessions(app, db, companyId, { secureCookies, testGuestAccess });
    if (testGuestAccess)
      app.post('/auth/test-access', authLimiter, async (req, res) => {
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
      req.user || req.visitor
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
    installPortfolioRoutes(app, db, companyId, { authenticated, admin, authLimiter });
    installScheduleRoutes(app, db, companyId, { authenticated, admin });
    app.get('/services', async (_req, res) =>
      res.json(
        await db.all('SELECT * FROM services WHERE company_id=? AND active=1 ORDER BY price', [
          companyId,
        ]),
      ),
    );
    app.get('/barbers', async (_req, res) =>
      res.json(await db.all('SELECT * FROM barbers WHERE company_id=? AND active=1', [companyId])),
    );

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
    const occupied = async (tx, companyId, barber, date, except = '') => [
      ...(await tx.all(
        "SELECT start_minute,end_minute FROM appointments WHERE company_id=? AND barber_id=? AND date=? AND status IN ('confirmed','completed') AND id<>?",
        [companyId, barber, date, except],
      )),
      ...(await tx.all(
        'SELECT start_minute,end_minute FROM blocks WHERE company_id=? AND barber_id=? AND date=?',
        [companyId, barber, date],
      )),
    ];
    const verifyDate = (date) => {
      if (date < dateInBrazil() || date > addDays(dateInBrazil(), 730))
        fail(400, 'Escolha uma data entre hoje e os próximos dois anos.');
    };
    // Serialize schedule mutations across workers, including moves between barbers.
    const lockBarber = lockSchedule;
    app.get('/availability', async (req, res) => {
      const date = dateSchema.parse(req.query.date);
      verifyDate(date);
      const result = await db.transaction(async (tx) => {
        await lockSchedule(tx);
        const barberId = z.string().parse(req.query.barberId);
        if (
          !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
            companyId,
            barberId,
          ]))
        )
          fail(404, 'Profissional não encontrado.');
        const ids = singleServiceSchema.parse(String(req.query.services || '').split(','));
        const services = await getServices(tx, companyId, ids);
        let except = '';
        if (req.query.except) {
          const existing = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
            companyId,
            String(req.query.except),
          ]);
          if (
            existing &&
            ((await canManageCompany(tx, req.user?.id, companyId)) ||
              (await ownsAppointment(tx, companyId, req, existing)))
          )
            except = existing.id;
        }
        const duration = services.reduce((sum, s) => sum + s.duration, 0);
        const schedule = await readSchedule(tx, companyId, barberId);
        const access = dateAccess(schedule, date, dateInBrazil());
        return {
          slots: access.allowed
            ? availableSlots({
                date,
                duration,
                occupied: await occupied(tx, companyId, barberId, date, except),
                workingDay: schedule.days.find((d) => d.weekday === weekday(date)),
              })
            : [],
          reason: access.reason,
          message: access.message,
          duration,
        };
      });
      res.json(result);
    });
    const appointmentList = async (companyId, where, args) => {
      requireCompanyId(companyId);
      const rows = await db.all(
        `SELECT a.*,COALESCE(u.name,a.guest_name) AS client_name,COALESCE(u.email,a.guest_email) AS client_email,COALESCE(u.phone,a.guest_phone) AS client_phone,b.name AS barber_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.id=a.barber_id AND b.company_id=a.company_id WHERE a.company_id=? AND (${where}) ORDER BY a.date,a.start_minute`,
        [companyId, ...args],
      );
      if (!rows.length) return [];
      const items = await db.all(
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
    async function book(companyId, req, res, reschedule = false, asGuest = false) {
      const data = (
        asGuest ? bookingSchema.extend({ guest: guestSchema }).strict() : bookingSchema
      ).parse(req.body);
      verifyDate(data.date);
      const id = reschedule ? String(req.params.id) : randomUUID();
      let guestSession;
      await db.transaction(async (tx) => {
        if (
          !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
            companyId,
            data.barberId,
          ]))
        )
          fail(404, 'Profissional não encontrado.');
        await lockBarber(tx, data.barberId);
        let current;
        if (reschedule) {
          current = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
            companyId,
            id,
          ]);
          if (!current || !(await ownsAppointment(tx, companyId, req, current, true)))
            fail(404, 'Agendamento não encontrado.');
          if (current.status !== 'confirmed' || !isFuture(current.date, current.start_minute))
            fail(400, 'Este agendamento não pode mais ser remarcado.');
        }
        const services = await getServices(tx, companyId, data.services);
        const duration = services.reduce((sum, s) => sum + s.duration, 0);
        const total = services.reduce((sum, s) => sum + s.price, 0);
        if (
          (data.expectedTotal !== undefined && data.expectedTotal !== total) ||
          (data.expectedDuration !== undefined && data.expectedDuration !== duration)
        )
          fail(
            412,
            'O preço ou a duração mudou. Atualize a página para revisar os serviços antes de confirmar.',
          );
        const schedule = await readSchedule(tx, companyId, data.barberId);
        const access = dateAccess(schedule, data.date, dateInBrazil());
        if (!access.allowed) fail(409, access.message);
        const slots = availableSlots({
          date: data.date,
          duration,
          occupied: await occupied(tx, companyId, data.barberId, data.date, reschedule ? id : ''),
          workingDay: schedule.days.find((d) => d.weekday === weekday(data.date)),
        });
        if (!slots.includes(data.time))
          fail(409, 'Esse horário acabou de ficar indisponível. Escolha outro horário.');
        const start = minuteOf(data.time);
        if (reschedule) {
          await tx.run(
            'UPDATE appointments SET barber_id=?,date=?,start_minute=?,end_minute=?,total=? WHERE company_id=? AND id=?',
            [data.barberId, data.date, start, start + duration, total, companyId, id],
          );
          await tx.run('DELETE FROM appointment_services WHERE company_id=? AND appointment_id=?', [
            companyId,
            id,
          ]);
        } else
          await tx.run(
            `INSERT INTO appointments (company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              companyId,
              id,
              asGuest ? null : req.user.id,
              data.barberId,
              data.date,
              start,
              start + duration,
              total,
              'confirmed',
              new Date().toISOString(),
              asGuest ? data.guest.name : null,
              asGuest ? data.guest.email : null,
              asGuest ? data.guest.phone : null,
            ],
          );
        for (const s of services)
          await tx.run(
            `INSERT INTO appointment_services (company_id,appointment_id,service_id,name,price,duration) VALUES (?,?,?,?,?,?)`,
            [companyId, id, s.id, s.name, s.price, s.duration],
          );
        if (asGuest) {
          guestSession = await visitors.save(tx, req, data.guest);
          await tx.run(
            `INSERT INTO guest_appointments (company_id,appointment_id,visitor_id) VALUES (?,?,?)`,
            [companyId, id, guestSession.visitor.id],
          );
        }
        await enqueueNotification(tx, companyId, id, reschedule ? 'rescheduled' : 'confirmed');
      });
      if (guestSession) visitors.setCookie(res, guestSession.token);
      res.status(reschedule ? 200 : 201).json({
        ...(await appointmentList(companyId, 'a.id=?', [id]))[0],
        ...(guestSession ? { visitor: publicVisitor(guestSession.visitor) } : {}),
      });
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
        const a = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
        if (!a) fail(404, 'Agendamento não encontrado.');
        await lockBarber(tx, a.barber_id);
        if (!(await ownsAppointment(tx, companyId, req, a, true)))
          fail(404, 'Agendamento não encontrado.');
        const fresh = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          a.id,
        ]);
        if (fresh.status !== 'confirmed' || !isFuture(fresh.date, fresh.start_minute))
          fail(400, 'Este agendamento não pode mais ser cancelado.');
        await tx.run("UPDATE appointments SET status='cancelled' WHERE company_id=? AND id=?", [
          companyId,
          a.id,
        ]);
        await enqueueNotification(tx, companyId, a.id, 'cancelled');
      });
      res.json({ ok: true });
    });

    app.use('/admin', authenticated, admin);
    app.get('/admin/appointments', async (req, res) => {
      const from = dateSchema.parse(req.query.from || dateInBrazil()),
        to = dateSchema.parse(req.query.to || from);
      if (to < from || to > addDays(from, 366)) fail(400, 'Intervalo inválido.');
      res.json(await appointmentList(companyId, 'a.date>=? AND a.date<=?', [from, to]));
    });
    app.patch('/admin/appointments/:id/status', async (req, res) => {
      const status = z.enum(['completed', 'cancelled', 'no-show']).parse(req.body.status);
      await db.transaction(async (tx) => {
        const a = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
        if (!a) fail(404, 'Agendamento não encontrado.');
        await lockBarber(tx, a.barber_id);
        const fresh = await tx.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          companyId,
          a.id,
        ]);
        if (fresh.status !== 'confirmed') fail(400, 'Este agendamento já foi finalizado.');
        if (status === 'completed' && isFuture(fresh.date, fresh.end_minute))
          fail(400, 'Aguarde o fim do horário para concluir o atendimento.');
        if (status === 'no-show' && isFuture(fresh.date, fresh.start_minute))
          fail(400, 'Aguarde o horário do atendimento para marcar ausência.');
        await tx.run('UPDATE appointments SET status=? WHERE company_id=? AND id=?', [
          status,
          companyId,
          a.id,
        ]);
        if (status === 'cancelled') await enqueueNotification(tx, companyId, a.id, 'cancelled');
      });
      res.json({ ok: true });
    });
    app.post('/admin/services', async (req, res) => {
      const data = serviceSchema.parse(req.body),
        id = randomUUID();
      await db.run(
        `INSERT INTO services (company_id,id,name,description,duration,price,category) VALUES (?,?,?,?,?,?,?)`,
        [companyId, id, data.name, data.description, data.duration, data.price, data.category],
      );
      res.status(201).json({ id, ...data, active: 1 });
    });
    app.put('/admin/services/:id', async (req, res) => {
      const data = serviceSchema.parse(req.body),
        id = String(req.params.id);
      await db.transaction(async (tx) => {
        await lockSchedule(tx);
        if (
          !(await tx.get('SELECT id FROM services WHERE company_id=? AND id=? AND active=1', [
            companyId,
            id,
          ]))
        )
          fail(404, 'Serviço não encontrado.');
        await tx.run(
          'UPDATE services SET name=?,description=?,duration=?,price=?,category=? WHERE company_id=? AND id=?',
          [data.name, data.description, data.duration, data.price, data.category, companyId, id],
        );
      });
      res.json({ id, ...data, active: 1 });
    });
    app.delete('/admin/services/:id', async (req, res) => {
      await db.transaction(async (tx) => {
        await lockSchedule(tx);
        if (
          !(await tx.get('SELECT id FROM services WHERE company_id=? AND id=? AND active=1', [
            companyId,
            String(req.params.id),
          ]))
        )
          fail(404, 'Serviço não encontrado.');
        await tx.run('UPDATE services SET active=0 WHERE company_id=? AND id=?', [
          companyId,
          String(req.params.id),
        ]);
      });
      res.json({ ok: true });
    });
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
      verifyDate(data.date);
      const start = minuteOf(data.start),
        end = minuteOf(data.end),
        id = randomUUID();
      await db.transaction(async (tx) => {
        if (
          !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=? AND active=1', [
            companyId,
            data.barberId,
          ]))
        )
          fail(404, 'Profissional não encontrado.');
        await lockBarber(tx, data.barberId);
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
      });
      res.status(201).json({ id });
    });
    app.delete('/admin/blocks/:id', async (req, res) => {
      await db.transaction(async (tx) => {
        await lockSchedule(tx);
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
