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
  calculateMetrics,
  clock,
  dateInBrazil,
  isFuture,
  overlaps,
  weekday,
} from './domain.js';
import { enqueueNotification } from './notifications.js';
import { demoMode } from './seed.js';
import { installProfileRoutes, passwordSchema, publicUser } from './profile.js';
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
const bookingSchema = z.object({
  services: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length),
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
  } = {},
) {
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
  const admin = (req, _res, next) =>
    req.user?.role === 'admin'
      ? next()
      : next(new HttpError(403, 'Acesso exclusivo da administração.'));
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
  app.get('/api/health', (_req, res) => res.json({ ok: true, database: db.dialect }));
  app.get('/api/config', (_req, res) =>
    res.json({
      demo: demoMode,
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
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
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
  const dummyHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);
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
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('session', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
    });
    res.json({ ok: true });
  });
  installProfileRoutes(app, db, { authenticated, login, authLimiter });
  app.get('/api/services', async (_req, res) =>
    res.json(await db.all('SELECT * FROM services WHERE active=1 ORDER BY price')),
  );
  app.get('/api/barbers', async (_req, res) =>
    res.json(await db.all('SELECT * FROM barbers WHERE active=1')),
  );

  const getServices = async (tx, ids) => {
    const services = await tx.all(
      `SELECT * FROM services WHERE active=1 AND id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    if (services.length !== ids.length)
      fail(400, 'Um dos serviços não está mais disponível. Atualize sua seleção.');
    return services;
  };
  const occupied = async (tx, barber, date, except = '') => [
    ...(await tx.all(
      "SELECT start_minute,end_minute FROM appointments WHERE barber_id=? AND date=? AND status IN ('confirmed','completed') AND id<>?",
      [barber, date, except],
    )),
    ...(await tx.all('SELECT start_minute,end_minute FROM blocks WHERE barber_id=? AND date=?', [
      barber,
      date,
    ])),
  ];
  const verifyDate = (date) => {
    if (date < dateInBrazil() || date > addDays(dateInBrazil(), 90))
      fail(400, 'Escolha uma data entre hoje e os próximos 90 dias.');
  };
  // Serialize schedule mutations across workers, including moves between barbers.
  const lockBarber = async (tx) => {
    if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789126)');
  };
  app.get('/api/availability', async (req, res) => {
    const date = dateSchema.parse(req.query.date);
    verifyDate(date);
    const barberId = z.string().parse(req.query.barberId);
    if (!(await db.get('SELECT id FROM barbers WHERE id=? AND active=1', [barberId])))
      fail(404, 'Profissional não encontrado.');
    const ids = z
      .array(z.string().min(1))
      .min(1)
      .max(10)
      .parse(String(req.query.services || '').split(','));
    const services = await getServices(db, [...new Set(ids)]);
    let except = '';
    if (req.query.except) {
      const existing = await db.get('SELECT * FROM appointments WHERE id=?', [
        String(req.query.except),
      ]);
      if (existing && (existing.user_id === req.user?.id || req.user?.role === 'admin'))
        except = existing.id;
    }
    const duration = services.reduce((sum, s) => sum + s.duration, 0);
    res.json({
      slots: availableSlots({
        date,
        duration,
        occupied: await occupied(db, barberId, date, except),
        open,
        close,
      }),
      duration,
    });
  });
  const appointmentList = async (where, args) => {
    const rows = await db.all(
      `SELECT a.*,COALESCE(u.name,a.guest_name) AS client_name,COALESCE(u.email,a.guest_email) AS client_email,COALESCE(u.phone,a.guest_phone) AS client_phone,b.name AS barber_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.id=a.barber_id ${where} ORDER BY a.date,a.start_minute`,
      args,
    );
    if (!rows.length) return [];
    const items = await db.all(
      `SELECT * FROM appointment_services WHERE appointment_id IN (${rows.map(() => '?').join(',')})`,
      rows.map((a) => a.id),
    );
    return rows.map((a) => ({
      ...a,
      time: clock(a.start_minute),
      services: items.filter((i) => i.appointment_id === a.id),
    }));
  };
  app.get('/api/appointments', authenticated, async (req, res) =>
    res.json(await appointmentList('WHERE a.user_id=?', [req.user.id])),
  );
  async function book(req, res, reschedule = false, asGuest = false) {
    const data = (
      asGuest ? bookingSchema.extend({ guest: guestSchema }).strict() : bookingSchema
    ).parse(req.body);
    verifyDate(data.date);
    const id = reschedule ? String(req.params.id) : randomUUID();
    await db.transaction(async (tx) => {
      if (!(await tx.get('SELECT id FROM barbers WHERE id=? AND active=1', [data.barberId])))
        fail(404, 'Profissional não encontrado.');
      await lockBarber(tx, data.barberId);
      let current;
      if (reschedule) {
        current = await tx.get('SELECT * FROM appointments WHERE id=?', [id]);
        if (!current || current.user_id !== req.user.id) fail(404, 'Agendamento não encontrado.');
        if (current.status !== 'confirmed' || !isFuture(current.date, current.start_minute))
          fail(400, 'Este agendamento não pode mais ser remarcado.');
      }
      const services = await getServices(tx, data.services);
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
      const slots = availableSlots({
        date: data.date,
        duration,
        occupied: await occupied(tx, data.barberId, data.date, reschedule ? id : ''),
        open,
        close,
      });
      if (!slots.includes(data.time))
        fail(409, 'Esse horário acabou de ficar indisponível. Escolha outro horário.');
      const start = minuteOf(data.time);
      if (reschedule) {
        await tx.run(
          'UPDATE appointments SET barber_id=?,date=?,start_minute=?,end_minute=?,total=? WHERE id=?',
          [data.barberId, data.date, start, start + duration, total, id],
        );
        await tx.run('DELETE FROM appointment_services WHERE appointment_id=?', [id]);
      } else
        await tx.run(
          'INSERT INTO appointments (id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [
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
          'INSERT INTO appointment_services (appointment_id,service_id,name,price,duration) VALUES (?,?,?,?,?)',
          [id, s.id, s.name, s.price, s.duration],
        );
      await enqueueNotification(tx, id, reschedule ? 'rescheduled' : 'confirmed');
    });
    res.status(reschedule ? 200 : 201).json((await appointmentList('WHERE a.id=?', [id]))[0]);
  }
  app.post('/api/appointments', authenticated, (req, res) => book(req, res));
  app.post(
    '/api/appointments/guest',
    rateLimit({
      windowMs: 15 * 60000,
      limit: test ? 1000 : 10,
      message: { error: 'Muitas tentativas de agendamento. Aguarde 15 minutos e tente novamente.' },
    }),
    (req, res) => book(req, res, false, true),
  );
  app.patch('/api/appointments/:id/reschedule', authenticated, (req, res) => book(req, res, true));
  app.patch('/api/appointments/:id/cancel', authenticated, async (req, res) => {
    await db.transaction(async (tx) => {
      const a = await tx.get('SELECT * FROM appointments WHERE id=?', [String(req.params.id)]);
      if (!a || a.user_id !== req.user.id) fail(404, 'Agendamento não encontrado.');
      await lockBarber(tx, a.barber_id);
      const fresh = await tx.get('SELECT * FROM appointments WHERE id=?', [a.id]);
      if (fresh.status !== 'confirmed' || !isFuture(fresh.date, fresh.start_minute))
        fail(400, 'Este agendamento não pode mais ser cancelado.');
      await tx.run("UPDATE appointments SET status='cancelled' WHERE id=?", [a.id]);
      await enqueueNotification(tx, a.id, 'cancelled');
    });
    res.json({ ok: true });
  });

  app.use('/api/admin', authenticated, admin);
  app.get('/api/admin/appointments', async (req, res) => {
    const from = dateSchema.parse(req.query.from || dateInBrazil()),
      to = dateSchema.parse(req.query.to || from);
    if (to < from || to > addDays(from, 366)) fail(400, 'Intervalo inválido.');
    res.json(await appointmentList('WHERE a.date>=? AND a.date<=?', [from, to]));
  });
  app.patch('/api/admin/appointments/:id/status', async (req, res) => {
    const status = z.enum(['completed', 'cancelled', 'no-show']).parse(req.body.status);
    await db.transaction(async (tx) => {
      const a = await tx.get('SELECT * FROM appointments WHERE id=?', [String(req.params.id)]);
      if (!a) fail(404, 'Agendamento não encontrado.');
      await lockBarber(tx, a.barber_id);
      const fresh = await tx.get('SELECT * FROM appointments WHERE id=?', [a.id]);
      if (fresh.status !== 'confirmed') fail(400, 'Este agendamento já foi finalizado.');
      if (status === 'completed' && isFuture(fresh.date, fresh.end_minute))
        fail(400, 'Aguarde o fim do horário para concluir o atendimento.');
      if (status === 'no-show' && isFuture(fresh.date, fresh.start_minute))
        fail(400, 'Aguarde o horário do atendimento para marcar ausência.');
      await tx.run('UPDATE appointments SET status=? WHERE id=?', [status, a.id]);
      if (status === 'cancelled') await enqueueNotification(tx, a.id, 'cancelled');
    });
    res.json({ ok: true });
  });
  app.post('/api/admin/services', async (req, res) => {
    const data = serviceSchema.parse(req.body),
      id = randomUUID();
    await db.run(
      'INSERT INTO services (id,name,description,duration,price,category) VALUES (?,?,?,?,?,?)',
      [id, data.name, data.description, data.duration, data.price, data.category],
    );
    res.status(201).json({ id, ...data, active: 1 });
  });
  app.put('/api/admin/services/:id', async (req, res) => {
    const data = serviceSchema.parse(req.body),
      id = String(req.params.id);
    if (!(await db.get('SELECT id FROM services WHERE id=? AND active=1', [id])))
      fail(404, 'Serviço não encontrado.');
    await db.run(
      'UPDATE services SET name=?,description=?,duration=?,price=?,category=? WHERE id=?',
      [data.name, data.description, data.duration, data.price, data.category, id],
    );
    res.json({ id, ...data, active: 1 });
  });
  app.delete('/api/admin/services/:id', async (req, res) => {
    if (!(await db.get('SELECT id FROM services WHERE id=? AND active=1', [String(req.params.id)])))
      fail(404, 'Serviço não encontrado.');
    await db.run('UPDATE services SET active=0 WHERE id=?', [String(req.params.id)]);
    res.json({ ok: true });
  });
  app.get('/api/admin/blocks', async (req, res) => {
    const from = dateSchema.parse(req.query.from || dateInBrazil()),
      to = dateSchema.parse(req.query.to || from);
    res.json(
      await db.all('SELECT * FROM blocks WHERE date>=? AND date<=? ORDER BY date,start_minute', [
        from,
        to,
      ]),
    );
  });
  app.post('/api/admin/blocks', async (req, res) => {
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
    if (start >= end || start < open * 60 || end > close * 60 || weekday(data.date) === 0)
      fail(400, 'Escolha um intervalo válido dentro do expediente.');
    await db.transaction(async (tx) => {
      if (!(await tx.get('SELECT id FROM barbers WHERE id=? AND active=1', [data.barberId])))
        fail(404, 'Profissional não encontrado.');
      await lockBarber(tx, data.barberId);
      if (overlaps(start, end, await occupied(tx, data.barberId, data.date)))
        fail(409, 'Há um agendamento ou bloqueio nesse intervalo.');
      await tx.run(
        'INSERT INTO blocks (id,barber_id,date,start_minute,end_minute,reason) VALUES (?,?,?,?,?,?)',
        [id, data.barberId, data.date, start, end, data.reason],
      );
    });
    res.status(201).json({ id });
  });
  app.delete('/api/admin/blocks/:id', async (req, res) => {
    await db.run('DELETE FROM blocks WHERE id=?', [String(req.params.id)]);
    res.json({ ok: true });
  });
  app.get('/api/admin/metrics', async (_req, res) => {
    const today = dateInBrazil();
    const start =
      `${today.slice(0, 4)}-01-01` < addDays(today, -29)
        ? `${today.slice(0, 4)}-01-01`
        : addDays(today, -29);
    const appointments = await db.all('SELECT * FROM appointments WHERE date>=? AND date<=?', [
      start,
      today,
    ]);
    const items = await db.all(
      'SELECT s.* FROM appointment_services s JOIN appointments a ON a.id=s.appointment_id WHERE a.date>=? AND a.date<=?',
      [addDays(today, -29), today],
    );
    res.json(calculateMetrics(appointments, items, today));
  });
  app.get('/api/admin/notifications', async (_req, res) =>
    res.json(
      await db.all(
        'SELECT channel,status,COUNT(*) AS count FROM notifications GROUP BY channel,status',
      ),
    ),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  if (serveStatic && existsSync(resolve('dist/index.html'))) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use((error, req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: ['/api/auth/profile', '/api/auth/password'].includes(req.path)
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
      error: error.status
        ? error.message
        : 'Não foi possível concluir a operação. Tente novamente.',
    });
  });
  return app;
}
