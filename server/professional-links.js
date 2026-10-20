import { randomUUID } from 'node:crypto';
import { currentTime, domainError } from './entitlements.js';
import { lockResource, lockBarbers } from './scheduling-locks.js';

export const lockProfessionalAccess = (tx, cid, shared = false) =>
  lockResource(tx, cid, 'team', 'access', shared);
export async function professionalEvent(
  tx,
  cid,
  actor,
  action,
  { affected = null, previous = null, professional = null, appointment = null } = {},
) {
  await tx.run(
    'INSERT INTO professional_activity_events(id,company_id,actor_user_id,affected_user_id,previous_barber_id,barber_id,appointment_id,action,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      cid,
      actor,
      affected,
      previous,
      professional,
      appointment,
      action,
      (await currentTime(tx)).toISOString(),
    ],
  );
}
export async function requireLinkOwner(tx, cid, actor) {
  // Preserve the existing owner's initial setup before the company becomes active.
  const owner = await tx.get(
    "SELECT m.user_id FROM company_members m JOIN companies c ON c.id=m.company_id LEFT JOIN company_onboarding o ON o.company_id=c.id WHERE m.company_id=? AND m.user_id=? AND m.status='active' AND m.role='owner' AND (c.status='active' OR (c.status='suspended' AND o.status='pending' AND o.created_by=?))",
    [cid, actor, actor],
  );
  if (!owner)
    domainError(
      403,
      'TEAM_OWNER_REQUIRED',
      'Somente o proprietário pode alterar vínculos de contas.',
    );
}
// Caller holds the existing team access lock EXCLUSIVELY for the whole transaction.
export async function setProfessionalLink(
  tx,
  cid,
  actor,
  userId,
  next,
  {
    expected,
    confirm,
    professionalRole = true,
  } = /** @type {{expected?: string|null, confirm?: boolean, professionalRole?: boolean}} */ ({}),
) {
  await requireLinkOwner(tx, cid, actor);
  const member = await tx.get(
    'SELECT role,status FROM company_members WHERE company_id=? AND user_id=?',
    [cid, userId],
  );
  if (
    !member ||
    (next && member.status !== 'active') ||
    (next && professionalRole && member.role !== 'professional')
  )
    domainError(
      400,
      'INVALID_PROFESSIONAL_MEMBER',
      'Selecione um membro profissional ativo desta empresa.',
    );
  const previous =
    (
      await tx.get('SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?', [
        cid,
        userId,
      ])
    )?.barber_id ?? null;
  if (expected !== undefined && expected !== previous)
    domainError(
      409,
      'PROFESSIONAL_LINK_CHANGED',
      'O vínculo mudou. Atualize a equipe e confirme novamente.',
    );
  if (next === previous) return;
  if (previous || next) await lockBarbers(tx, cid, ...[previous, next].filter(Boolean));
  if ((previous || expected !== undefined) && !confirm)
    domainError(400, 'LINK_CONFIRMATION_REQUIRED', 'Confirme a alteração do vínculo profissional.');
  if (next) {
    const p = await tx.get('SELECT active FROM barbers WHERE company_id=? AND id=?', [cid, next]);
    if (!p)
      domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado nesta empresa.');
    if (p.active !== 1 && professionalRole)
      domainError(409, 'PROFESSIONAL_INACTIVE', 'Selecione um profissional ativo.');
    const other = await tx.get(
      'SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?',
      [cid, next],
    );
    if (other && other.user_id !== userId)
      domainError(
        409,
        'PROFESSIONAL_ALREADY_LINKED',
        'Este profissional já possui uma conta vinculada.',
      );
  }
  await tx.run('DELETE FROM professional_users WHERE company_id=? AND user_id=?', [cid, userId]);
  if (next)
    await tx.run(
      'INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,?,?)',
      [cid, next, userId, (await currentTime(tx)).toISOString()],
    );
  await professionalEvent(tx, cid, actor, !next ? 'unlinked' : previous ? 'relinked' : 'linked', {
    affected: userId,
    previous,
    professional: next,
  });
}
