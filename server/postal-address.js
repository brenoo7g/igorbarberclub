import { z } from 'zod';
import { domainError } from './entitlements.js';

export const brazilStates = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];
export const postalCode = z
  .string()
  .trim()
  .regex(/^\d{5}-?\d{3}$/, 'Informe um CEP com oito números.')
  .transform((v) => v.replace('-', ''));
const text = (max) => z.string().trim().max(max).optional();
export const structuredAddress = {
  postal_code: z.union([z.literal(''), postalCode]).optional(),
  street: text(120),
  neighborhood: text(100),
  address_number: text(20),
  address_complement: text(100),
};
export function formatAddress(data) {
  if (
    !data.street &&
    !data.postal_code &&
    !data.neighborhood &&
    !data.address_number &&
    !data.address_complement
  )
    return data.address;
  return [
    data.street && [data.street, data.address_number].filter(Boolean).join(', '),
    data.neighborhood,
    data.address_complement,
  ]
    .filter(Boolean)
    .join(' - ');
}
export function validateAddress(data, ctx) {
  const structured =
    data.postal_code ||
    data.street ||
    data.neighborhood ||
    data.address_number ||
    data.address_complement;
  if (!structured) return;
  if (!data.street)
    ctx.addIssue({ code: 'custom', path: ['street'], message: 'Informe a rua ou logradouro.' });
  if (!data.address_number)
    ctx.addIssue({
      code: 'custom',
      path: ['address_number'],
      message: 'Informe o número do imóvel (ou s/n).',
    });
  if ((formatAddress(data) || '').length > 250)
    ctx.addIssue({
      code: 'custom',
      path: ['address'],
      message: 'O endereço completo deve ter no máximo 250 caracteres.',
    });
}
export const invalidateStructuredAddress = (tx, cid) =>
  tx.run(
    'UPDATE company_settings SET postal_code=NULL,street=NULL,neighborhood=NULL,address_number=NULL,address_complement=NULL WHERE company_id=?',
    [cid],
  );
export async function lookupPostalCode(code, fetcher = fetch) {
  try {
    const response = await fetcher(`https://viacep.com.br/ws/${postalCode.parse(code)}/json/`, {
      signal: AbortSignal.timeout(4500),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('provider unavailable');
    const data = await response.json();
    if (data.erro)
      domainError(
        404,
        'POSTAL_CODE_NOT_FOUND',
        'CEP não encontrado. Preencha o endereço manualmente.',
      );
    return z
      .object({
        street: z.string().max(120),
        neighborhood: z.string().max(100),
        city: z.string().min(2).max(100),
        region: z.enum(brazilStates),
      })
      .parse({
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade,
        region: data.uf,
      });
  } catch (error) {
    if (error.code === 'POSTAL_CODE_NOT_FOUND') throw error;
    domainError(
      503,
      'POSTAL_CODE_UNAVAILABLE',
      'Não foi possível consultar o CEP. Preencha o endereço manualmente.',
    );
  }
}
