import { z } from 'zod';

const reserved = new Set([
  'admin',
  'app',
  'api',
  'preview',
  'agendar',
  'minha-conta',
  'esqueci-senha',
  'redefinir-senha',
  'images',
  'media',
  'assets',
  'gradefy',
  'favicon',
  'robots',
  'sitemap',
  'index',
  'login',
  'cadastro',
]);
export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens.')
  .refine((value) => !reserved.has(value), 'Esse nome público é reservado pelo sistema.');
