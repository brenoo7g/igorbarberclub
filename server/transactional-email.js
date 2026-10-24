import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const denied = (reason) => Object.assign(new Error(reason), { code: 'EMAIL_POLICY_BLOCKED' });
const address = z.string().email().max(254);
export function emailConfiguration() {
  const mode = process.env.EMAIL_DELIVERY_MODE || 'disabled';
  const scope = process.env.EMAIL_DELIVERY_SCOPE || '';
  const from = process.env.EMAIL_FROM || '';
  const sender = address.safeParse(from).success
    ? from
    : /^[^<>\r\n]+ <([^<>\s]+@[^<>\s]+)>$/.exec(from)?.[1];
  const allowlist = (process.env.EMAIL_TEST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let publicUrl = false;
  try {
    const url = new URL(process.env.APP_URL);
    publicUrl =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !/^(localhost|127\.|\[?::1\]?)/i.test(url.hostname);
  } catch {
    /* Missing/private URLs cannot be advertised as public links. */
  }
  const restricted = mode === 'test' || process.env.NODE_ENV !== 'production';
  const configured =
    ['test', 'live'].includes(mode) &&
    /^[A-Za-z0-9_-]{16,100}$/.test(scope) &&
    /^re_[A-Za-z0-9_]{10,}$/.test(process.env.RESEND_API_KEY || '') &&
    Boolean(sender && address.safeParse(sender).success) &&
    publicUrl &&
    (!restricted ||
      (process.env.EMAIL_TEST_DATABASE === 'isolated-fixtures' &&
        allowlist.length > 0 &&
        allowlist.every((v) => address.safeParse(v).success)));
  return { mode, scope, from, allowlist, restricted, configured };
}
export const emailConfigured = () => emailConfiguration().configured;
// Never backfill this activation stamp on historical queue rows.
export const emailDeliveryScope = () => (emailConfigured() ? emailConfiguration().scope : '');
export function assertEmailPolicy(payload, context = {}) {
  const config = emailConfiguration();
  if (!config.configured) throw denied('Envio desabilitado ou configuração de e-mail incompleta.');
  if (context.scope !== config.scope)
    throw denied('Evento de outra rodada ou histórico: revisão manual necessária.');
  if (payload.from !== config.from)
    throw denied('Remetente incompatível com a configuração atual.');
  if (
    !Array.isArray(payload.to) ||
    payload.to.length !== 1 ||
    !address.safeParse(payload.to[0]).success ||
    payload.cc ||
    payload.bcc
  )
    throw denied('Destinatário inválido.');
  if (config.restricted && !config.allowlist.includes(payload.to[0].toLowerCase()))
    throw denied('Destinatário fora da lista autorizada.');
  if (!payload.subject || /[\r\n]/.test(payload.subject) || !payload.html || !payload.text)
    throw denied('Mensagem transacional inválida.');
}
// Every send path passes through this gate; recipients are never rewritten.
export function sendTransactionalEmail(payload, key, timeout = 15000, context = {}) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  assertEmailPolicy(data, context);
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(data),
  });
}
// Audit ledger, not a second queue. Existing outboxes still own leases/retries.
// No recipient, body, invitation code or recovery token is persisted here.
export async function deliverTransactionalEmail(db, context, payload, key, timeout = 15000) {
  const id = createHash('sha256')
    .update(JSON.stringify([context.companyId || null, context.kind, key]))
    .digest('hex');
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO email_deliveries(id,company_id,source_id,kind,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    [id, context.companyId || null, context.sourceId, context.kind, 'processing', now, now],
  );
  await db.run(
    "UPDATE email_deliveries SET status='processing',updated_at=? WHERE id=? AND status IN ('pending','failed','review')",
    [now, id],
  );
  const attempt = randomUUID();
  await db.run(
    'INSERT INTO email_delivery_attempts(id,delivery_id,started_at,status) VALUES(?,?,?,?)',
    [attempt, id, now, 'processing'],
  );
  try {
    const response = await sendTransactionalEmail(payload, key, timeout, context);
    if (!response.ok)
      throw Object.assign(new Error(`O provedor retornou HTTP ${response.status}`), {
        httpStatus: response.status,
      });
    let providerId = null;
    try {
      const body = await response.clone().json();
      if (typeof body.id === 'string' && body.id.length <= 200) providerId = body.id;
    } catch {
      /* Acceptance without ID requires review, never assert delivery. */
    }
    await db.transaction(async (tx) => {
      if (providerId && tx.dialect === 'postgres')
        await tx.run('SELECT pg_advisory_xact_lock(hashtext(?))', [providerId]);
      await tx.run(
        "UPDATE email_delivery_attempts SET status='accepted',finished_at=? WHERE id=?",
        [new Date().toISOString(), attempt],
      );
      await tx.run(
        "UPDATE email_deliveries SET status=CASE WHEN status IN ('processing','pending','failed') THEN ? ELSE status END,provider_message_id=COALESCE(provider_message_id,?),updated_at=? WHERE id=?",
        [providerId ? 'accepted' : 'review', providerId, new Date().toISOString(), id],
      );
      if (providerId) await reconcileEmailEvents(tx, providerId);
    });
    return response;
  } catch (error) {
    const blocked = error.code === 'EMAIL_POLICY_BLOCKED';
    const status = blocked ? 'review' : 'failed';
    await db.transaction(async (tx) => {
      await tx.run(
        'UPDATE email_delivery_attempts SET status=?,finished_at=?,error_code=? WHERE id=?',
        [
          status,
          new Date().toISOString(),
          blocked
            ? 'policy_blocked'
            : error.httpStatus
              ? `http_${error.httpStatus}`
              : 'transport_error',
          attempt,
        ],
      );
      await tx.run(
        "UPDATE email_deliveries SET status=?,updated_at=? WHERE id=? AND status IN ('processing','pending','failed','review')",
        [status, new Date().toISOString(), id],
      );
    });
    throw error;
  }
}
export async function reconcileEmailEvents(tx, providerId) {
  const events = await tx.all(
    'SELECT event_type,occurred_at,id FROM email_webhook_events WHERE provider_message_id=? ORDER BY occurred_at,id',
    [providerId],
  );
  const rank = {
    accepted: 1,
    delayed: 2,
    delivered: 3,
    failed: 4,
    rejected: 5,
    suppressed: 6,
    complained: 7,
  };
  const states = {
    'email.sent': 'accepted',
    'email.delivery_delayed': 'delayed',
    'email.delivered': 'delivered',
    'email.failed': 'failed',
    'email.bounced': 'rejected',
    'email.suppressed': 'suppressed',
    'email.complained': 'complained',
  };
  const strongest = events.reduce(
    (best, e) =>
      rank[states[e.event_type]] > (rank[best?.status] || 0)
        ? { status: states[e.event_type], date: e.occurred_at }
        : best,
    null,
  );
  if (strongest)
    await tx.run('UPDATE email_deliveries SET status=?,updated_at=? WHERE provider_message_id=?', [
      strongest.status,
      strongest.date,
      providerId,
    ]);
}
