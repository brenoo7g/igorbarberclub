import { createHash, createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { passwordSchema } from './profile.js';
import {
  emailConfigured,
  emailDeliveryScope,
  deliverTransactionalEmail,
} from './transactional-email.js';
import { emailTemplate } from './email-templates.js';

const message =
  'Se existir uma conta com esse e-mail, você receberá um link para redefinir sua senha. Confira também a caixa de spam.';
const invalid = 'Este link é inválido ou expirou. Solicite um novo link de recuperação.';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const tokenFor = (secret, id) =>
  createHmac('sha256', secret).update(`password-recovery:${id}`).digest('hex');
const fail = (status, text) => {
  throw Object.assign(new Error(text), { status });
};
const configured = emailConfigured;
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, invalid);
const miniContext = (id) => {
  const match = /^minisite:([A-Za-z0-9_-]+):(agendar|reservas):/.exec(id);
  return match
    ? { companyId: Buffer.from(match[1], 'base64url').toString('utf8'), destination: match[2] }
    : null;
};

export function installPasswordRecovery(
  app,
  db,
  {
    secret,
    secureCookies,
    prefix = '/api/auth',
    clientCompanyId,
    clientCookie = 'session',
    limiter: sharedLimiter,
  },
) {
  const limiter =
    sharedLimiter ||
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
    });
  app.post(`${prefix}/forgot-password`, limiter, async (req, res) => {
    const { email, scope, destination } = z
      .object({
        scope: z.literal('gradefy').optional(),
        destination: clientCompanyId
          ? z.enum(['agendar', 'reservas']).default('agendar')
          : z.undefined().optional(),
        email: z
          .string()
          .trim()
          .email('Informe um e-mail válido.')
          .max(200)
          .transform((value) => value.toLowerCase()),
      })
      .strict()
      .parse(req.body);
    if (!configured())
      fail(
        503,
        'A recuperação por e-mail está temporariamente indisponível. Tente novamente mais tarde.',
      );
    await db.transaction(async (tx) => {
      if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789129)');
      const now = new Date().toISOString();
      const windowStart = new Date(Date.now() - 15 * 60000).toISOString();
      await tx.run('DELETE FROM password_recovery_limits WHERE window_start<?', [windowStart]);
      await tx.run('DELETE FROM password_recovery WHERE created_at<?', [
        new Date(Date.now() - 86400000).toISOString(),
      ]);
      // Persist both limits across serverless instances, without storing addresses in the limiter.
      let allowed = true;
      for (const [identity, maximum] of [
        [`email:${email}`, 3],
        [`ip:${ipKeyGenerator(req.ip || '')}`, 10],
      ]) {
        const key = createHmac('sha256', secret).update(identity).digest('hex');
        const current = await tx.get('SELECT * FROM password_recovery_limits WHERE bucket_key=?', [
          key,
        ]);
        if (
          current &&
          (current.attempts >= maximum ||
            (identity.startsWith('email:') &&
              current.last_attempt_at > new Date(Date.now() - 60000).toISOString()))
        )
          allowed = false;
        await tx.run(
          'INSERT INTO password_recovery_limits (bucket_key,window_start,last_attempt_at,attempts) VALUES (?,?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET attempts=password_recovery_limits.attempts+1,last_attempt_at=excluded.last_attempt_at',
          [key, now, now],
        );
      }
      if (!allowed) return;
      const user = await tx.get('SELECT * FROM users WHERE email=?', [email]);
      if (!user) return;
      // Persist only a trusted presentation namespace; no caller-provided return URL.
      const id = clientCompanyId
        ? `minisite:${Buffer.from(clientCompanyId).toString('base64url')}:${destination}:${randomUUID()}`
        : `${scope === 'gradefy' ? 'gradefy-' : ''}${randomUUID()}`;
      await tx.run(
        'INSERT INTO password_recovery (id,user_id,email,session_version,token_hash,event,created_at,expires_at,next_attempt_at,email_delivery_scope) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          user.id,
          user.email,
          user.session_version,
          digest(tokenFor(secret, id)),
          'reset',
          now,
          new Date(Date.parse(now) + 30 * 60000).toISOString(),
          now,
          emailDeliveryScope(),
        ],
      );
    });
    // Delivery runs after the response; provider latency cannot reveal account existence.
    res.status(202).json({ message });
  });
  app.post(`${prefix}/reset-password`, limiter, async (req, res) => {
    const data = z
      .object({
        token: tokenSchema,
        password: passwordSchema(),
        confirmPassword: z.string().max(72),
      })
      .strict()
      .refine((value) => value.password === value.confirmPassword, 'As senhas não coincidem.')
      .parse(req.body);
    const hash = digest(data.token);
    const candidate = await db.get('SELECT id,user_id FROM password_recovery WHERE token_hash=?', [
      hash,
    ]);
    if (!candidate) fail(400, invalid);
    if (miniContext(candidate.id)?.companyId !== clientCompanyId) fail(400, invalid);
    await db.transaction(async (tx) => {
      // Same user lock as profile/password edits. Recheck after waiting for concurrent resets.
      const user = await tx.get(
        `SELECT * FROM users WHERE id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
        [candidate.user_id],
      );
      const row = await tx.get('SELECT * FROM password_recovery WHERE token_hash=?', [hash]);
      if (
        !user ||
        !row ||
        row.expires_at <= new Date().toISOString() ||
        row.session_version !== user.session_version ||
        row.email !== user.email
      )
        fail(400, invalid);
      passwordSchema(user.role === 'admin' ? 12 : 8).parse(data.password);
      if (await bcrypt.compare(data.password, user.password_hash))
        fail(400, 'Escolha uma senha diferente da atual.');
      const passwordHash = await bcrypt.hash(data.password, 12);
      if (row.expires_at <= new Date().toISOString()) fail(400, invalid);
      await tx.run(
        'UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',
        [passwordHash, user.id],
      );
      await tx.run(
        "UPDATE password_recovery SET token_hash=NULL,status='cancelled' WHERE user_id=? AND event='reset'",
        [user.id],
      );
      const now = new Date().toISOString();
      await tx.run(
        'INSERT INTO password_recovery (id,user_id,email,session_version,event,created_at,expires_at,next_attempt_at,email_delivery_scope) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          `${miniContext(row.id) ? row.id.split(':').slice(0, 3).join(':') + ':' : row.id.startsWith('gradefy-') ? 'gradefy-' : ''}${randomUUID()}`,
          user.id,
          user.email,
          user.session_version + 1,
          'changed',
          now,
          new Date(Date.now() + 86400000).toISOString(),
          now,
          emailDeliveryScope(),
        ],
      );
    });
    res.clearCookie(clientCookie, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
    });
    res.json({ message: 'Senha redefinida com sucesso. Entre com sua nova senha.' });
  });
  if (app.locals) app.locals.processPasswordEmails = createPasswordEmailProcessor(db, secret);
}

export function createPasswordEmailProcessor(db, secret) {
  let busy = false;
  return async () => {
    if (busy || !configured()) return;
    busy = true;
    try {
      const job = await db.transaction(async (tx) => {
        if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789129)');
        const now = new Date().toISOString();
        const row = await tx.get(
          "SELECT * FROM password_recovery WHERE status IN ('pending','sending') AND attempts<3 AND next_attempt_at<=? AND expires_at>? ORDER BY created_at LIMIT 1",
          [now, now],
        );
        if (!row) return null;
        await tx.run(
          "UPDATE password_recovery SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=?",
          [new Date(Date.now() + 30000).toISOString(), row.id],
        );
        return row;
      });
      if (!job) return;
      try {
        const user = await db.get('SELECT email,session_version FROM users WHERE id=?', [
          job.user_id,
        ]);
        if (
          !user ||
          user.email !== job.email ||
          (job.event === 'reset' &&
            (digest(tokenFor(secret, job.id)) !== job.token_hash ||
              user.session_version !== job.session_version))
        ) {
          await db.run(
            "UPDATE password_recovery SET status='cancelled',token_hash=NULL WHERE id=?",
            [job.id],
          );
          return;
        }
        const gradefy = job.id.startsWith('gradefy-');
        const mini = miniContext(job.id);
        const company =
          mini && (await db.get('SELECT name,slug FROM companies WHERE id=?', [mini.companyId]));
        if (mini && !company) throw new Error('Recovery company unavailable');
        const brand = mini ? company.name : gradefy ? 'Gradefy' : 'Igor Barber Club';
        const url = new URL(
          mini
            ? `/${encodeURIComponent(company.slug)}/redefinir-senha`
            : gradefy
              ? '/app/redefinir-senha'
              : '/redefinir-senha',
          process.env.APP_URL || 'http://localhost:5173',
        );
        if (mini) url.searchParams.set('destino', mini.destination);
        // Fragment keeps the token out of HTTP access logs and referrer headers.
        url.hash = `token=${tokenFor(secret, job.id)}`;
        const reset = job.event === 'reset';
        const response = await deliverTransactionalEmail(
          db,
          {
            companyId: mini?.companyId,
            sourceId: job.id,
            kind: 'password',
            scope: job.email_delivery_scope,
          },
          {
            from: process.env.EMAIL_FROM,
            to: [job.email],
            ...emailTemplate({
              subject: reset
                ? 'Redefina sua senha \u2014 Gradefy'
                : 'Sua senha foi alterada \u2014 Gradefy',
              title: reset ? 'Redefina sua senha' : 'Sua senha foi alterada',
              greeting: 'Ol\u00e1!',
              paragraphs: reset
                ? [
                    'Recebemos uma solicita\u00e7\u00e3o para redefinir sua senha em ' +
                      brand +
                      '.',
                    'Este link \u00e9 de uso \u00fanico e expira em 30 minutos ap\u00f3s a solicita\u00e7\u00e3o.',
                    'Se voc\u00ea n\u00e3o pediu essa altera\u00e7\u00e3o, ignore este e-mail. Sua senha permanece a mesma.',
                  ]
                : [
                    'Sua senha em ' +
                      brand +
                      ' foi redefinida com sucesso. As sess\u00f5es anteriores foram encerradas.',
                    'Se voc\u00ea n\u00e3o realizou esta altera\u00e7\u00e3o, solicite uma nova recupera\u00e7\u00e3o no site e contate o suporte.',
                  ],
              action: reset ? { label: 'Redefinir minha senha', url: url.href } : undefined,
              footer: brand,
            }),
          },
          'password-' + job.id,
          10000,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await db.run(
          "UPDATE password_recovery SET status='sent' WHERE id=? AND status='sending' AND attempts=?",
          [job.id, job.attempts + 1],
        );
      } catch (error) {
        // Never log provider bodies, tokens, URLs, passwords or recipient addresses.
        console.error('Falha no envio de recuperação de senha; consulte o Resend.');
        await db.run(
          'UPDATE password_recovery SET status=?,next_attempt_at=? WHERE id=? AND status=? AND attempts=?',
          [
            error.code === 'EMAIL_POLICY_BLOCKED' || job.attempts >= 2 ? 'failed' : 'pending',
            new Date(Date.now() + 60000 * 2 ** job.attempts).toISOString(),
            job.id,
            'sending',
            job.attempts + 1,
          ],
        );
        if (error.code !== 'EMAIL_POLICY_BLOCKED' && job.attempts < 2)
          await db.run(
            "UPDATE email_deliveries SET status='pending' WHERE source_id=? AND kind='password' AND status='failed'",
            [job.id],
          );
      }
    } catch {
      console.error('Falha no processamento da fila de recuperação de senha.');
    } finally {
      busy = false;
    }
  };
}
