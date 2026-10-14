// Shared transport for existing booking/recovery emails and team invitations.
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export function sendTransactionalEmail(payload, key, timeout = 15000) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}
