import { randomBytes } from 'node:crypto';

// Persistent databases must never silently change their signing key on restart.
export function jwtSecret(
  secret = process.env.JWT_SECRET,
  { test = false, ephemeral = false } = {},
) {
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (secret && (secret.trim().length >= 32 || (test && !production))) return secret;
  if (!production && !secret && (test || ephemeral)) return randomBytes(48).toString('hex');
  throw new Error(
    'Defina JWT_SECRET com pelo menos 32 caracteres aleatórios no ambiente local (.env) ou de produção. Preserve o mesmo valor entre reinicializações.',
  );
}
