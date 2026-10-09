import { createHash } from 'node:crypto';
import { lockResource } from './scheduling-locks.js';
import { requireCompanyId } from './company-context.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
// Canonical object order; array order remains meaningful.
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

export function requestKey(req, asGuest = false) {
  const key = req.get('Idempotency-Key');
  if (key === undefined) return null;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
    fail(
      400,
      'Idempotency-Key deve ter de 8 a 128 caracteres: letras, números, ponto, hífen, dois-pontos ou sublinhado.',
    );
  if (asGuest && (!req.visitorToken || (req.visitorSession && !req.visitor)))
    fail(428, 'Inicie uma sessão de visitante em /auth/me antes de usar Idempotency-Key.');
  return {
    keyHash: hash(key),
    actorHash: hash(asGuest ? `visitor:${req.visitorToken}` : `user:${req.user.id}`),
  };
}

export async function cleanIdempotency(db, companyId) {
  requireCompanyId(companyId);
  await db.run('DELETE FROM idempotency_keys WHERE company_id=? AND expires_at<=?', [
    companyId,
    new Date().toISOString(),
  ]);
}

// Executed INSIDE the business transaction: rollback removes both result and business data.
export async function idempotent(tx, companyId, operation, key, payload, perform) {
  requireCompanyId(companyId);
  if (!key) return perform();
  const { actorHash, keyHash } = key;
  // Per actor (not company): also serializes quota enforcement and visitor initialization.
  await lockResource(tx, companyId, 'idempotency-actor', actorHash);
  await cleanIdempotency(tx, companyId);
  const scope = [companyId, actorHash, operation, keyHash];
  const requestHash = hash(canonical(payload));
  const previous = await tx.get(
    'SELECT request_hash,response FROM idempotency_keys WHERE company_id=? AND actor_hash=? AND operation=? AND key_hash=?',
    scope,
  );
  if (previous) {
    if (previous.request_hash !== requestHash)
      fail(409, 'Idempotency-Key já utilizada com dados diferentes.');
    return JSON.parse(previous.response);
  }
  const count = await tx.get(
    'SELECT COUNT(*) AS total FROM idempotency_keys WHERE company_id=? AND actor_hash=?',
    [companyId, actorHash],
  );
  if (Number(count.total) >= 1000)
    fail(429, 'Limite diário de chaves atingido. Aguarde a expiração.');
  const result = await perform();
  const now = Date.now();
  await tx.run(
    'INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
    [
      ...scope,
      requestHash,
      JSON.stringify(result),
      new Date(now).toISOString(),
      new Date(now + 86400000).toISOString(),
    ],
  );
  return result;
}
