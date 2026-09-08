import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const publicUser = (user) =>
  user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar || null,
        profileVersion: user.profile_version || 0,
      }
    : null;

export const passwordSchema = (minimum = 8) =>
  z
    .string()
    .min(minimum, `Use pelo menos ${minimum} caracteres na senha.`)
    .max(72, 'A senha deve ter no máximo 72 bytes.')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'A senha deve ter no máximo 72 bytes.',
    );

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(100),
    email: z
      .string()
      .trim()
      .email('Informe um e-mail válido.')
      .max(200)
      .transform((s) => s.toLowerCase()),
    phone: z
      .string()
      .max(30)
      .transform((s) => s.replace(/\D/g, ''))
      .refine((s) => /^\d{10,13}$/.test(s), 'Informe um telefone válido com DDD.'),
    avatar: z.string().max(700000).nullable(),
    profileVersion: z.number().int().nonnegative(),
    currentPassword: z.string().max(72).optional(),
  })
  .strict();

async function normalizeAvatar(value) {
  if (value === null) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, 'Escolha uma foto JPG, PNG ou WebP válida.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 512 * 1024) fail(413, 'A foto enviada é muito grande. Escolha outra foto.');
  try {
    const { default: sharp } = await import('sharp');
    const image = sharp(buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== match[1] || (metadata.pages || 1) > 1)
      fail(400, 'Escolha uma foto estática JPG, PNG ou WebP.');
    const result = await image
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    return `data:image/webp;base64,${result.toString('base64')}`;
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'Não foi possível ler essa foto. Escolha outro arquivo JPG, PNG ou WebP.');
  }
}

export function installProfileRoutes(app, db, { authenticated, login, authLimiter }) {
  async function lockedUser(tx, req) {
    const user = await tx.get(
      `SELECT * FROM users WHERE id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
      [req.user.id],
    );
    if (!user || user.session_version !== req.sessionVersion)
      fail(401, 'Sua sessão expirou. Entre novamente para continuar.');
    return user;
  }
  app.patch('/api/auth/profile', authenticated, authLimiter, async (req, res) => {
    const data = profileSchema.parse(req.body);
    const avatar =
      data.avatar === req.user.avatar ? data.avatar : await normalizeAvatar(data.avatar);
    let user;
    let changedEmail = false;
    try {
      user = await db.transaction(async (tx) => {
        const current = await lockedUser(tx, req);
        if (current.profile_version !== data.profileVersion)
          fail(409, 'Seu perfil foi alterado em outra aba. Recarregue os dados antes de salvar.');
        changedEmail = current.email !== data.email;
        if (
          changedEmail &&
          (!data.currentPassword ||
            !(await bcrypt.compare(data.currentPassword, current.password_hash)))
        )
          fail(400, 'Informe sua senha atual corretamente para alterar o e-mail.');
        await tx.run(
          'UPDATE users SET name=?,email=?,phone=?,avatar=?,profile_version=profile_version+1,session_version=session_version+? WHERE id=?',
          [data.name, data.email, data.phone, avatar, changedEmail ? 1 : 0, current.id],
        );
        return tx.get('SELECT * FROM users WHERE id=?', [current.id]);
      });
    } catch (error) {
      if (error.code === '23505' || String(error.message).includes('UNIQUE'))
        fail(409, 'Este e-mail já está em uso. Escolha outro e-mail.');
      throw error;
    }
    if (changedEmail) login(res, user);
    res.json({ user: publicUser(user) });
  });
  app.patch('/api/auth/password', authenticated, authLimiter, async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().min(1).max(72),
        password: passwordSchema(req.user.role === 'admin' ? 12 : 8),
      })
      .strict()
      .parse(req.body);
    const user = await db.transaction(async (tx) => {
      const current = await lockedUser(tx, req);
      if (!(await bcrypt.compare(data.currentPassword, current.password_hash)))
        fail(400, 'A senha atual está incorreta.');
      if (await bcrypt.compare(data.password, current.password_hash))
        fail(400, 'Escolha uma senha diferente da atual.');
      const hash = await bcrypt.hash(data.password, 12);
      await tx.run(
        'UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',
        [hash, current.id],
      );
      return tx.get('SELECT * FROM users WHERE id=?', [current.id]);
    });
    login(res, user);
    res.json({ user: publicUser(user) });
  });
}
