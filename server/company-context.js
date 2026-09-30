import { IGOR_COMPANY_ID } from './company-bootstrap.js';

// Temporary composition boundary. Never resolve this value from an HTTP request.
export const getLegacyCompanyId = () => IGOR_COMPANY_ID;

export function requireCompanyId(companyId) {
  if (typeof companyId !== 'string' || !companyId.trim())
    throw new TypeError('O contexto empresarial é obrigatório.');
  return companyId;
}
