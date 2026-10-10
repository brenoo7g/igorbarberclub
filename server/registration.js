import { z } from 'zod';
import { passwordSchema } from './profile.js';

const name = z.string().trim().min(2, 'Informe seu nome.').max(100);
const email = z
  .string()
  .trim()
  .email()
  .max(200)
  .transform((value) => value.toLowerCase());
const password = passwordSchema();
const gradefy = z
  .object({
    scope: z.literal('gradefy'),
    name,
    email,
    password,
    confirmPassword: z.string().max(72),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });
const legacy = z.object({
  scope: z.undefined().optional(),
  name: name.min(3).refine((value) => value.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
  email,
  password,
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => /^\d{10,13}$/.test(value), 'Telefone inválido.'),
});

export function parseRegistration(body) {
  if (body?.scope !== 'gradefy') return legacy.parse(body);
  const data = gradefy.parse(body);
  // The legacy column is NOT NULL. Empty means not collected, never a invented phone.
  return { name: data.name, email: data.email, password: data.password, phone: '' };
}
