import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { availabilityStatus } from './professional-availability.js';
import { currentTime, domainError } from './entitlements.js';
import { lockResource } from './scheduling-locks.js';
import { emailConfigured, sendTransactionalEmail } from './transactional-email.js';
import { invitationCode, invitationToken } from './invitation-code.js';
import { setProfessionalLink } from './professional-links.js';
import { agendaCompanyState } from './agenda.js';
import {
  validateInvitationProfessional,
  acceptInvitationProfessional,
} from './invitation-professionals.js';

export const INVITATION_DAYS = 7;
const digest = (token) => createHash('sha256').update(token).digest('hex');
const tokenSchema = z.union([
  z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z
    .object({ code: z.string().max(160) })
    .strict()
    .transform(({ code }) => {
      const token = invitationToken(code);
      if (!token) unavailable();
      return { token };
    }),
]);
const role = z.enum(['manager', 'professional']);
const inviteSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    role,
    professional: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('new') }).strict(),
        z
          .object({ mode: z.literal('existing'), professionalId: z.string().min(1).max(200) })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (data) => !data.professional || data.role === 'professional',
    'Somente convites de profissional podem criar ou vincular um cadastro.',
  );
const confirmation = z.object({ confirm: z.literal(true) }).strict();
const changeSchema = z
  .object({
    role,
    expectedRole: role,
    expectedStatus: z.literal('active'),
    confirm: z.literal(true),
  })
  .strict();
const revokeSchema = z
  .object({
    expectedRole: role,
    expectedStatus: z.literal('active'),
    confirm: z.literal(true),
  })
  .strict();
const unavailable = () =>
  domainError(
    410,
    'INVITATION_UNAVAILABLE',
    'Este convite é inválido, expirou ou já foi utilizado. Solicite um novo convite ao proprietário.',
  );
const lockTeam = (tx, cid) => lockResource(tx, cid, 'team', 'access');
export async function requireTeamOwner(tx, cid, userId) {
  const company = await tx.get(
    "SELECT c.id,c.name FROM companies c JOIN company_members m ON m.company_id=c.id WHERE c.id=? AND c.status='active' AND m.user_id=? AND m.status='active' AND m.role='owner'",
    [cid, userId],
  );
  if (!company)
    domainError(
      403,
      'TEAM_OWNER_REQUIRED',
      'Somente o proprietário pode gerenciar os acessos desta empresa.',
    );
  return company;
}
const publicInvite = (row, now) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status === 'pending' && row.expires_at <= now ? 'expired' : row.status,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  delivery: row.delivery,
  ...(row.professional_mode
    ? { professional: { mode: row.professional_mode, professionalId: row.professional_id } }
    : {}),
});
async function audit(
  tx,
  cid,
  actor,
  action,
  { user = null, invitation = null, previousRole = null, nextRole = null } = {},
) {
  await tx.run(
    'INSERT INTO company_access_events(id,company_id,actor_user_id,affected_user_id,invitation_id,action,previous_role,next_role,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      cid,
      actor,
      user,
      invitation,
      action,
      previousRole,
      nextRole,
      (await currentTime(tx)).toISOString(),
    ],
  );
}
// A separate committed limiter transaction also counts invalid tokens/failed writes.
// HMAC buckets contain neither email addresses, tokens nor IP addresses in clear text.
async function attempt(db, secret, identity, maximum) {
  const bucket = createHmac('sha256', secret)
    .update('team-limit:' + identity)
    .digest('hex');
  const allowed = await db.transaction(async (tx) => {
    if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789130)');
    const now = await currentTime(tx),
      start = new Date(now.getTime() - 15 * 60000).toISOString();
    await tx.run('DELETE FROM company_invitation_limits WHERE window_start<=?', [start]);
    const previous = await tx.get(
      'SELECT attempts FROM company_invitation_limits WHERE bucket_key=?',
      [bucket],
    );
    if (previous && Number(previous.attempts) >= maximum) return false;
    await tx.run(
      'INSERT INTO company_invitation_limits(bucket_key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET attempts=company_invitation_limits.attempts+1',
      [bucket, now.toISOString()],
    );
    return true;
  });
  if (!allowed)
    domainError(429, 'INVITATION_RATE_LIMIT', 'Muitas tentativas de convite. Aguarde 15 minutos.');
}
function linkFor(token) {
  const url = new URL('/app/convite', process.env.APP_URL || 'http://localhost:5173');
  url.hash = 'token=' + token; // Never in HTTP paths, referers, logs or localStorage.
  return url.href;
}
async function issue(tx, cid, actor, data, previous) {
  await validateInvitationProfessional(tx, cid, data.professional, data.email);
  const now = await currentTime(tx),
    token = randomBytes(32).toString('hex'),
    expiresAt = new Date(now.getTime() + INVITATION_DAYS * 86400000).toISOString(),
    id = previous?.id || randomUUID();
  const user = await tx.get('SELECT id FROM users WHERE email=?', [data.email]);
  if (
    user &&
    (await tx.get(
      "SELECT user_id FROM company_members WHERE company_id=? AND user_id=? AND (status='active' OR role='owner')",
      [cid, user.id],
    ))
  )
    domainError(
      409,
      'MEMBER_ALREADY_EXISTS',
      'Esta pessoa já possui vínculo ativo ou de proprietário com a empresa.',
    );
  await tx.run(
    "UPDATE company_invitations SET status='expired',token_hash=NULL,updated_at=? WHERE company_id=? AND email=? AND status='pending' AND expires_at<=? AND id<>?",
    [now.toISOString(), cid, data.email, now.toISOString(), id],
  );
  if (
    await tx.get(
      "SELECT id FROM company_invitations WHERE company_id=? AND email=? AND status='pending' AND id<>?",
      [cid, data.email, id],
    )
  )
    domainError(
      409,
      'INVITATION_ALREADY_PENDING',
      'Já existe um convite pendente para este e-mail. Renove o convite existente.',
    );
  if (previous) {
    await tx.run(
      "UPDATE company_invitations SET token_hash=?,status='pending',expires_at=?,updated_at=?,delivery='manual' WHERE company_id=? AND id=?",
      [digest(token), expiresAt, now.toISOString(), cid, id],
    );
  } else {
    await tx.run(
      'INSERT INTO company_invitations(id,company_id,email,role,token_hash,created_by,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [
        id,
        cid,
        data.email,
        data.role,
        digest(token),
        actor,
        now.toISOString(),
        now.toISOString(),
        expiresAt,
      ],
    );
  }
  await audit(tx, cid, actor, previous ? 'invite-renewed' : 'invite-created', {
    invitation: id,
    nextRole: data.role,
  });
  if (!previous && data.professional)
    await tx.run(
      'INSERT INTO company_invitation_professionals(company_id,invitation_id,mode,barber_id) VALUES(?,?,?,?)',
      [
        cid,
        id,
        data.professional.mode,
        data.professional.mode === 'existing' ? data.professional.professionalId : null,
      ],
    );
  return {
    invitation: publicInvite(
      await tx.get('SELECT * FROM company_invitations WHERE company_id=? AND id=?', [cid, id]),
      now.toISOString(),
    ),
    link: linkFor(token),
    code: invitationCode(token),
    companyName: (await tx.get('SELECT name FROM companies WHERE id=?', [cid])).name,
  };
}
async function candidate(tx, token) {
  const row = await tx.get(
    "SELECT i.*,c.name AS company_name FROM company_invitations i JOIN companies c ON c.id=i.company_id WHERE i.token_hash=? AND i.status='pending' AND c.status='active'",
    [digest(token)],
  );
  if (!row || row.expires_at <= (await currentTime(tx)).toISOString()) unavailable();
  return row;
}
async function acceptanceCandidate(tx, token, userId) {
  try {
    return await candidate(tx, token);
  } catch (error) {
    if (error.code !== 'INVITATION_UNAVAILABLE') throw error;
    const previous = await tx.get(
      "SELECT i.*,c.name AS company_name FROM company_invitations i JOIN company_invitation_professionals p ON p.company_id=i.company_id AND p.invitation_id=i.id JOIN companies c ON c.id=i.company_id WHERE p.accepted_token_hash=? AND i.status='accepted' AND i.accepted_by=? AND c.status='active'",
      [digest(token), userId],
    );
    if (!previous) throw error;
    return previous;
  }
}
export function installTeamRoutes(
  app,
  db,
  { authenticated, secret, email = { configured: emailConfigured, send: sendTransactionalEmail } },
) {
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 60,
    message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
  });
  const limited = async (req, _res, next) => {
    await attempt(db, secret, 'ip:' + ipKeyGenerator(req.ip || ''), 60);
    next();
  };
  app.post('/api/team/invitations/inspect', limiter, limited, async (req, res) => {
    const { token } = tokenSchema.parse(req.body);
    const row = req.user
      ? await acceptanceCandidate(db, token, req.user.id)
      : await candidate(db, token);
    res.json({
      companyName: row.company_name,
      role: row.role,
      expiresAt: row.expires_at,
      emailHint: row.email.slice(0, 2) + '***@' + row.email.split('@')[1],
      emailMatches: req.user?.email === row.email,
      authenticated: Boolean(req.user),
    });
  });
  app.post('/api/team/invitations/accept', limiter, authenticated, limited, async (req, res) => {
    const { token } = tokenSchema.parse(req.body);
    // Discover the lock scope; all authorization and state are checked again after locking.
    const found = await acceptanceCandidate(db, token, req.user.id);
    const result = await db.transaction(async (tx) => {
      await lockTeam(tx, found.company_id);
      const row = await acceptanceCandidate(tx, token, req.user.id);
      const user = await tx.get(
        `SELECT id,name,email,session_version FROM users WHERE id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
        [req.user.id],
      );
      if (!user || user.session_version !== req.sessionVersion)
        domainError(401, 'AUTH_REQUIRED', 'Entre novamente na sua conta.');
      if (user.email !== row.email)
        domainError(
          403,
          'INVITATION_EMAIL_MISMATCH',
          'Entre com a conta do e-mail que recebeu o convite.',
        );
      const member = await tx.get(
        'SELECT role,status FROM company_members WHERE company_id=? AND user_id=?',
        [row.company_id, user.id],
      );
      if (row.status === 'accepted') {
        const link = await tx.get(
          'SELECT p.barber_id FROM company_invitation_professionals p JOIN professional_users u ON u.company_id=p.company_id AND u.barber_id=p.barber_id WHERE p.company_id=? AND p.invitation_id=? AND u.user_id=?',
          [row.company_id, row.id, user.id],
        );
        if (!member || member.status !== 'active' || !link)
          domainError(
            409,
            'INVITATION_ACCESS_CHANGED',
            'O acesso ou vínculo foi alterado. Fale com o proprietário.',
          );
        return {
          companyId: row.company_id,
          companyName: row.company_name,
          role: row.role,
          professionalId: link.barber_id,
          ...(row.role === 'professional'
            ? { nextPath: (await availabilityStatus(tx, row.company_id, link.barber_id)).nextPath }
            : {}),
        };
      }
      if (member && (member.status === 'active' || member.role === 'owner'))
        domainError(409, 'MEMBER_ALREADY_EXISTS', 'Esta conta já possui acesso à empresa.');
      const now = (await currentTime(tx)).toISOString();
      await tx.run(
        "INSERT INTO company_members(company_id,user_id,role,status,created_at) VALUES(?,?,?,'active',?) ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role,status='active'",
        [row.company_id, user.id, row.role, now],
      );
      const professionalId = await acceptInvitationProfessional(tx, row, user, digest(token));
      await tx.run(
        "UPDATE company_invitations SET status='accepted',token_hash=NULL,accepted_by=?,accepted_at=?,updated_at=? WHERE company_id=? AND id=?",
        [user.id, now, now, row.company_id, row.id],
      );
      await audit(tx, row.company_id, user.id, 'invite-accepted', {
        user: user.id,
        invitation: row.id,
        nextRole: row.role,
      });
      return {
        companyId: row.company_id,
        companyName: row.company_name,
        role: row.role,
        ...(professionalId ? { professionalId } : {}),
        ...(professionalId && row.role === 'professional'
          ? { nextPath: (await availabilityStatus(tx, row.company_id, professionalId)).nextPath }
          : {}),
      };
    });
    res.json(result);
  });
  async function deliver(cid, company, result) {
    let delivery = 'manual';
    if (email.configured()) {
      try {
        const r = await email.send(
          {
            from: process.env.EMAIL_FROM,
            to: [result.invitation.email],
            subject: `Convite para ${company.name} — Gradefy`,
            text: `Você recebeu um convite para acessar ${company.name} no Gradefy como ${result.invitation.role === 'manager' ? 'gestor' : 'profissional'}.\n\nEntre ou cadastre-se com este e-mail e confirme o aceite:\n${result.link}\n\nOu escolha "Sou colaborador" no Gradefy e digite este código individual:\n${result.code}\n\nO convite vale por 7 dias. Se não esperava este convite, ignore esta mensagem.`,
          },
          'team-' + result.invitation.id + '-' + digest(result.link),
        );
        delivery = r.ok ? 'sent' : 'failed';
      } catch {
        delivery = 'failed';
      } // Do not log provider responses, addresses or tokens.
    }
    // An older delivery completion cannot update a renewed/cancelled invitation.
    const token = new URLSearchParams(new URL(result.link).hash.slice(1)).get('token');
    await db.run(
      'UPDATE company_invitations SET delivery=? WHERE company_id=? AND id=? AND token_hash=?',
      [delivery, cid, result.invitation.id, digest(token)],
    );
    return { ...result, invitation: { ...result.invitation, delivery } };
  }
  return function installCompanyTeam(router, cid) {
    router.get('/admin/team', async (req, res) => {
      const result = await db.transaction(
        async (tx) => {
          const company = await requireTeamOwner(tx, cid, req.user.id),
            now = (await currentTime(tx)).toISOString();
          const members = await tx.all(
            'SELECT u.id,u.name,u.email,m.role,m.status,m.created_at AS joined_at,b.id AS professional_id,b.name AS professional_name FROM company_members m JOIN users u ON u.id=m.user_id LEFT JOIN professional_users p ON p.company_id=m.company_id AND p.user_id=m.user_id LEFT JOIN barbers b ON b.company_id=p.company_id AND b.id=p.barber_id WHERE m.company_id=? ORDER BY m.created_at,u.id',
            [cid],
          );
          const invitations = (
            await tx.all(
              'SELECT i.*,p.mode AS professional_mode,p.barber_id AS professional_id FROM company_invitations i LEFT JOIN company_invitation_professionals p ON p.company_id=i.company_id AND p.invitation_id=i.id WHERE i.company_id=? ORDER BY i.created_at DESC,i.id',
              [cid],
            )
          ).map((row) => publicInvite(row, now));
          const professionals = await tx.all(
            'SELECT b.id,b.name,b.active,p.user_id FROM barbers b LEFT JOIN professional_users p ON p.company_id=b.company_id AND p.barber_id=b.id WHERE b.company_id=? ORDER BY b.name,b.id',
            [cid],
          );
          const access = await agendaCompanyState(tx, cid).catch((e) => {
            if (e.code === 'ONBOARDING_INCOMPLETE') return { editable: false };
            throw e;
          });
          return { company, members, invitations, professionals, linksEditable: access.editable };
        },
        { readOnly: true },
      );
      res.json(result);
    });
    async function write(req, perform, { limitedWrite = false } = {}) {
      await requireTeamOwner(db, cid, req.user.id);
      if (limitedWrite) await attempt(db, secret, `create:${cid}:${req.user.id}`, 20);
      return db.transaction(async (tx) => {
        await lockTeam(tx, cid);
        const company = await requireTeamOwner(tx, cid, req.user.id);
        return perform(tx, company);
      });
    }
    router.post('/admin/team/invitations', async (req, res) => {
      const data = inviteSchema.parse(req.body);
      const { company, result } = await write(
        req,
        async (tx, company) => ({ company, result: await issue(tx, cid, req.user.id, data) }),
        { limitedWrite: true },
      );
      res.status(201).json(await deliver(cid, company, result));
    });
    router.patch('/admin/team/members/:userId/professional', async (req, res) => {
      const data = z
        .object({
          professionalId: z.string().min(1).max(200).nullable(),
          expectedProfessionalId: z.string().min(1).max(200).nullable(),
          confirm: z.literal(true),
        })
        .strict()
        .parse(req.body);
      await write(req, async (tx) => {
        await agendaCompanyState(tx, cid, true);
        await setProfessionalLink(
          tx,
          cid,
          req.user.id,
          String(req.params.userId),
          data.professionalId,
          { expected: data.expectedProfessionalId, confirm: data.confirm },
        );
      });
      res.json({ ok: true });
    });
    router.post('/admin/team/invitations/:id/renew', async (req, res) => {
      confirmation.parse(req.body);
      const { company, result } = await write(
        req,
        async (tx, company) => {
          const row = await tx.get(
            'SELECT * FROM company_invitations WHERE company_id=? AND id=?',
            [cid, req.params.id],
          );
          if (!row) domainError(404, 'INVITATION_NOT_FOUND', 'Convite não encontrado.');
          if (!['pending', 'expired'].includes(row.status))
            domainError(409, 'INVITATION_NOT_PENDING', 'Este convite não pode ser renovado.');
          return { company, result: await issue(tx, cid, req.user.id, row, row) };
        },
        { limitedWrite: true },
      );
      res.json(await deliver(cid, company, result));
    });
    router.post('/admin/team/invitations/:id/cancel', async (req, res) => {
      confirmation.parse(req.body);
      await write(req, async (tx) => {
        const row = await tx.get(
          'SELECT status FROM company_invitations WHERE company_id=? AND id=?',
          [cid, req.params.id],
        );
        if (!row) domainError(404, 'INVITATION_NOT_FOUND', 'Convite não encontrado.');
        if (!['pending', 'expired'].includes(row.status))
          domainError(409, 'INVITATION_NOT_PENDING', 'Este convite não pode ser cancelado.');
        await tx.run(
          "UPDATE company_invitations SET status='cancelled',token_hash=NULL,updated_at=? WHERE company_id=? AND id=?",
          [(await currentTime(tx)).toISOString(), cid, req.params.id],
        );
        await audit(tx, cid, req.user.id, 'invite-cancelled', { invitation: req.params.id });
      });
      res.json({ ok: true });
    });
    async function mutateMember(req, change) {
      const data = (change ? changeSchema : revokeSchema).parse(req.body);
      await write(req, async (tx) => {
        const member = await tx.get(
          'SELECT role,status FROM company_members WHERE company_id=? AND user_id=?',
          [cid, req.params.userId],
        );
        if (!member) domainError(404, 'MEMBER_NOT_FOUND', 'Membro não encontrado.');
        // Ownership transfer is deliberately unavailable; every owner is protected.
        if (member.role === 'owner')
          domainError(
            409,
            'OWNER_PROTECTED',
            'O acesso do proprietário não pode ser alterado nesta etapa.',
          );
        if (member.role !== data.expectedRole || member.status !== data.expectedStatus)
          domainError(
            409,
            'MEMBER_CHANGED',
            'Este acesso foi alterado. Atualize a equipe antes de continuar.',
          );
        await tx.run(
          change
            ? 'UPDATE company_members SET role=? WHERE company_id=? AND user_id=?'
            : "UPDATE company_members SET status='inactive' WHERE company_id=? AND user_id=?",
          change ? [data.role, cid, req.params.userId] : [cid, req.params.userId],
        );
        await audit(tx, cid, req.user.id, change ? 'role-changed' : 'access-revoked', {
          user: req.params.userId,
          previousRole: member.role,
          nextRole: change ? data.role : null,
        });
      });
    }
    router.patch('/admin/team/members/:userId/role', async (req, res) => {
      await mutateMember(req, true);
      res.json({ ok: true });
    });
    router.post('/admin/team/members/:userId/revoke', async (req, res) => {
      await mutateMember(req, false);
      res.json({ ok: true });
    });
  };
}
