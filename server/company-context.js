import { IGOR_COMPANY_ID } from './company-bootstrap.js';

// Canonical identity for legacy public aliases/imports only. Authenticated
// company selection and authorization live in company-access.js.
export const getLegacyCompanyId = () => IGOR_COMPANY_ID;

export function requireCompanyId(companyId) {
  if (typeof companyId !== 'string' || !companyId.trim())
    throw new TypeError('O contexto empresarial é obrigatório.');
  return companyId;
}
