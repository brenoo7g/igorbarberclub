import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseRegistration } from './registration.js';
import { installProfileRoutes, publicUser } from './profile.js';
import { installPasswordRecovery } from './password-recovery.js';

// Same credentials, hashing, signing secret and version revocation. A different
// cookie AND audience require an explicit customer login, without replacing /app.
export function createClientAuth(db, { secret, secureCookies, authLimiter, dummyHash }) {
  const cookie = secureCookies ? '__Host-gradefy-client' : 'gradefy-client';
  const options = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' };
  const present = (user) => (user ? { ...publicUser(user), role: 'client' } : null);
  const reject = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const login = (res, user) => {
    const token = jwt.sign({ version: user.session_version || 0 }, secret, {
      subject: user.id,
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: 'igor-barber-club',
      audience: 'gradefy-client',
    });
    res.cookie(cookie, token, { ...options, maxAge: 7 * 86400000 });
  };
  const authenticated = (req, _res, next) =>
    req.clientUser
      ? next()
      : next(
          Object.assign(new Error('Entre como cliente para continuar.'), {
            status: 401,
            code: 'CLIENT_LOGIN_REQUIRED',
          }),
        );
  async function read(req) {
    req.user = undefined;
    req.sessionVersion = undefined;
    let payload;
    try {
      payload = jwt.verify(req.cookies[cookie], secret, {
        algorithms: ['HS256'],
        issuer: 'igor-barber-club',
        audience: 'gradefy-client',
      });
    } catch {
      return;
    }
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.version)) return;
    const user = await db.get('SELECT * FROM users WHERE id=?', [payload.sub]);
    if (user && user.session_version === payload.version) {
      req.user = req.clientUser = user;
      req.sessionVersion = payload.version;
    }
  }
  function install(router, companyId) {
    const client = express.Router();
    client.get('/me', (req, res) =>
      res.json({ user: present(req.clientUser), visitor: null, template: 'gradefy-minisite' }),
    );
    client.post('/login', authLimiter, async (req, res) => {
      const data = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(200)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(1).max(72),
        })
        .strict()
        .parse(req.body);
      const user = await db.get('SELECT * FROM users WHERE email=?', [data.email]);
      const valid = await bcrypt.compare(data.password, user?.password_hash || dummyHash);
      if (!user || !valid) reject(401, 'E-mail ou senha incorretos.');
      login(res, user);
      res.json({ user: present(user) });
    });
    client.post('/register', authLimiter, async (req, res) => {
      const input = z
        .object({
          name: z.string(),
          email: z.string(),
          phone: z.string(),
          password: z.string(),
          confirmPassword: z.string(),
        })
        .strict()
        .refine((d) => d.password === d.confirmPassword, {
          message: 'As senhas não coincidem.',
          path: ['confirmPassword'],
        })
        .parse(req.body);
      const data = parseRegistration({
        name: input.name,
        email: input.email,
        phone: input.phone,
        password: input.password,
      });
      const user = { id: randomUUID(), ...data, role: 'client' };
      const hash = await bcrypt.hash(data.password, 12);
      try {
        await db.run(
          'INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
          [user.id, user.name, user.email, user.phone, hash, 'client', new Date().toISOString()],
        );
      } catch (e) {
        if (e.code === '23505' || String(e.message).includes('UNIQUE'))
          reject(409, 'Este e-mail já tem uma conta. Use a opção Entrar.');
        throw e;
      }
      login(res, user);
      res.status(201).json({ user: present(user) });
    });
    client.post('/logout', (_req, res) => {
      res.clearCookie(cookie, options);
      res.json({ ok: true });
    });
    installProfileRoutes(client, db, {
      authenticated,
      login,
      authLimiter,
      prefix: '',
      present,
      clientCompanyId: companyId,
    });
    installPasswordRecovery(client, db, {
      secret,
      secureCookies,
      prefix: '',
      clientCompanyId: companyId,
      clientCookie: cookie,
      limiter: authLimiter,
    });
    client.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
    router.use('/auth', (req, res, next) => (req.miniClientMode ? client(req, res, next) : next()));
  }
  return { read, install };
}
