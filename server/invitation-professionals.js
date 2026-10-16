import { randomUUID } from 'node:crypto';
import { domainError, lockEntitlements, requireProfessionalCapacity } from './entitlements.js';
import { lockCatalog } from './scheduling-locks.js';
import { insertProfessional } from './professionals.js';
import { setProfessionalLink } from './professional-links.js';
import { agendaCompanyState } from './agenda.js';

export async function validateInvitationProfessional(tx, cid, intent, email) {
  if (!intent || intent.mode === 'new') return;
  const p = await tx.get(
    'SELECT b.id,u.user_id,a.email FROM barbers b LEFT JOIN professional_users u ON u.company_id=b.company_id AND u.barber_id=b.id LEFT JOIN users a ON a.id=u.user_id WHERE b.company_id=? AND b.id=?',
    [cid, intent.professionalId],
  );
  if (!p) domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado nesta empresa.');
  if (p.user_id && p.email !== email)
    domainError(
      409,
      'PROFESSIONAL_ALREADY_LINKED',
      'Este profissional já possui outra conta vinculada.',
    );
}
export async function acceptInvitationProfessional(tx, row, user, credentialHash) {
  const intent = await tx.get(
    'SELECT * FROM company_invitation_professionals WHERE company_id=? AND invitation_id=?',
    [row.company_id, row.id],
  );
  if (!intent) return null; // Previously issued/API legacy invitations keep their explicit manual association.
  const cid = row.company_id;
  await lockEntitlements(tx, cid);
  const state = await agendaCompanyState(tx, cid, true);
  if (state.entitlement.valid) await requireProfessionalCapacity(tx, cid, 0);
  const previous = await tx.get(
    'SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?',
    [cid, user.id],
  );
  if (previous && (intent.mode === 'new' || previous.barber_id !== intent.barber_id))
    domainError(
      409,
      'MEMBER_ALREADY_LINKED',
      'Esta conta já está vinculada a um profissional. Peça ao proprietário para escolher esse cadastro no convite.',
    );
  let id = intent.barber_id;
  if (intent.mode === 'new') {
    id = randomUUID();
    await lockCatalog(tx, cid, true);
    await insertProfessional(tx, cid, { id, name: user.name });
  } else
    await validateInvitationProfessional(
      tx,
      cid,
      { mode: 'existing', professionalId: id },
      user.email,
    );
  // The owner pre-authorized this exact association. Never match by display name,
  // replace another association or activate an existing/draft professional.
  await setProfessionalLink(tx, cid, row.created_by, user.id, id, {
    expected: previous?.barber_id ?? null,
    confirm: true,
    professionalRole: false,
  });
  await tx.run(
    'UPDATE company_invitation_professionals SET barber_id=?,accepted_token_hash=? WHERE company_id=? AND invitation_id=?',
    [id, credentialHash, cid, row.id],
  );
  return id;
}
