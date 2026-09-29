import { createHash, randomBytes, randomUUID } from 'node:crypto';

const duration = 90 * 86400000;
const hash = (token) => createHash('sha256').update(token).digest('hex');
const active = (session) => session && session.expires_at > new Date().toISOString();
export const publicVisitor = (session) =>
  session
    ? {
        id: session.id,
        name: session.name,
        email: session.email,
        phone: session.phone,
      }
    : null;

export function installGuestSessions(app, db, { secureCookies }) {
  const cookieName = secureCookies ? '__Host-igor-visitor' : 'igor-visitor';
  const options = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' };
  const setCookie = (res, token) => res.cookie(cookieName, token, { ...options, maxAge: duration });
  app.use('/api', async (req, res, next) => {
    const token = req.cookies[cookieName];
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      req.visitorToken = token;
      const session = await db.get('SELECT * FROM guest_sessions WHERE token_hash=?', [
        hash(token),
      ]);
      req.visitorSession = session;
      if (active(session)) {
        req.visitor = session;
        if (
          req.path === '/auth/me' ||
          session.expires_at < new Date(Date.now() + duration - 86400000).toISOString()
        ) {
          const expires = new Date(Date.now() + duration).toISOString();
          await db.run('UPDATE guest_sessions SET expires_at=? WHERE id=? AND expires_at>?', [
            expires,
            session.id,
            new Date().toISOString(),
          ]);
          setCookie(res, token);
        }
      }
    }
    next();
  });
  return {
    // Seed an opaque cookie before the first booking, without creating a profile.
    // Parallel bookings from the same browser then share an identity under the booking lock.
    prepare(req, res) {
      if (!req.user && (!req.visitorToken || (req.visitorSession && !req.visitor)))
        setCookie(res, randomBytes(32).toString('hex'));
    },
    async forget(req, res) {
      if (req.visitorToken)
        await db.run('UPDATE guest_sessions SET expires_at=? WHERE token_hash=?', [
          new Date().toISOString(),
          hash(req.visitorToken),
        ]);
      res.clearCookie(cookieName, options);
    },
    async save(tx, req, contact) {
      let token = req.visitorToken || randomBytes(32).toString('hex');
      let session = await tx.get(
        `SELECT * FROM guest_sessions WHERE token_hash=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
        [hash(token)],
      );
      if (session && !active(session)) {
        // A revoked or expired credential must never reopen its old history.
        token = randomBytes(32).toString('hex');
        session = null;
      }
      const id = session?.id || randomUUID();
      const expires = new Date(Date.now() + duration).toISOString();
      if (session)
        await tx.run('UPDATE guest_sessions SET name=?,email=?,phone=?,expires_at=? WHERE id=?', [
          contact.name,
          contact.email,
          contact.phone,
          expires,
          id,
        ]);
      else
        await tx.run(
          'INSERT INTO guest_sessions (id,token_hash,name,email,phone,created_at,expires_at) VALUES (?,?,?,?,?,?,?)',
          [
            id,
            hash(token),
            contact.name,
            contact.email,
            contact.phone,
            new Date().toISOString(),
            expires,
          ],
        );
      return { token, visitor: { id, ...contact } };
    },
    setCookie,
  };
}

export async function ownsAppointment(db, req, appointment, lock = false) {
  if (req.user) return appointment.user_id === req.user.id;
  if (!req.visitor || appointment.user_id !== null) return false;
  const session = await db.get(
    `SELECT * FROM guest_sessions WHERE id=?${lock && db.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
    [req.visitor.id],
  );
  if (!active(session) || session.token_hash !== hash(req.visitorToken)) return false;
  return Boolean(
    await db.get(
      'SELECT appointment_id FROM guest_appointments WHERE appointment_id=? AND visitor_id=?',
      [appointment.id, session.id],
    ),
  );
}
