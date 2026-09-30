import { getLegacyCompanyId } from './company-context.js';

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code });
};
const managementRoles = new Set(['owner', 'manager']);

export async function listUserCompanies(db, userId) {
  return db.all(
    "SELECT c.id,c.name,c.slug,c.status,c.niche_id AS niche,c.template_id AS template,m.role FROM companies c JOIN company_members m ON m.company_id=c.id WHERE m.user_id=? AND m.status='active' AND c.status='active' ORDER BY c.name,c.id",
    [userId],
  );
}

export async function resolveCompanyContext(db, user, selector) {
  if (!user) fail(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  if (
    selector !== undefined &&
    (typeof selector !== 'string' ||
      !selector.trim() ||
      selector.length > 200 ||
      selector.includes(','))
  )
    fail(400, 'INVALID_COMPANY_SELECTOR', 'Seleção de empresa inválida.');
  const memberships = await listUserCompanies(db, user.id);
  if (!memberships.length) fail(403, 'COMPANY_ACCESS_DENIED', 'Sem acesso a esta empresa.');
  if (selector === undefined && memberships.length > 1)
    fail(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
  const company =
    selector === undefined ? memberships[0] : memberships.find((c) => c.id === selector);
  if (!company) fail(403, 'COMPANY_ACCESS_DENIED', 'Sem acesso a esta empresa.');
  return Object.freeze({
    companyId: company.id,
    company,
    role: company.role,
    userId: user.id,
    kind: 'member',
  });
}

export function requireCompanyRole(req, _res, next) {
  const context = req.companyContext;
  if (
    context?.kind !== 'member' ||
    context.userId !== req.user?.id ||
    !managementRoles.has(context.role)
  )
    return next(
      Object.assign(new Error('Acesso exclusivo da gestão desta empresa.'), {
        status: 403,
        code: 'COMPANY_ROLE_DENIED',
      }),
    );
  next();
}

export async function canManageCompany(db, userId, companyId) {
  if (!userId) return false;
  const row = await db.get(
    "SELECT m.role FROM company_members m JOIN companies c ON c.id=m.company_id WHERE m.company_id=? AND m.user_id=? AND m.status='active' AND c.status='active'",
    [companyId, userId],
  );
  return managementRoles.has(row?.role);
}

export async function resolvePublicCompany(db, slug) {
  const company =
    slug === undefined
      ? await db.get("SELECT id,name,slug,status FROM companies WHERE id=? AND status='active'", [
          getLegacyCompanyId(),
        ])
      : await db.get("SELECT id,name,slug,status FROM companies WHERE slug=? AND status='active'", [
          slug,
        ]);
  if (!company) fail(404, 'COMPANY_NOT_FOUND', 'Estabelecimento não encontrado.');
  return Object.freeze({ companyId: company.id, company, kind: 'public' });
}
