import { createHash } from 'node:crypto';
import { requireCompanyId } from './company-context.js';

// Stable across processes/deployments. Hash collisions only serialize extra work.
export async function lockResource(tx, companyId, kind, resource, shared = false) {
  requireCompanyId(companyId);
  if (tx.dialect !== 'postgres') return; // SQLite owns a database-wide write transaction.
  const key = createHash('sha256')
    .update(JSON.stringify(['gradefy-v1', companyId, kind, resource]))
    .digest()
    .readBigInt64BE()
    .toString();
  await tx.run(
    `SELECT ${shared ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock'}(?::bigint)`,
    [key],
  );
}

export async function lockBarbers(tx, companyId, ...ids) {
  requireCompanyId(companyId);
  if (!ids.length || ids.some((id) => typeof id !== 'string' || !id.trim()))
    throw new Error('Profissional obrigatório para bloquear a agenda.');
  for (const id of [...new Set(ids)].sort()) await lockResource(tx, companyId, 'barber', id);
}

export const lockCatalog = (tx, companyId, shared = false) =>
  lockResource(tx, companyId, 'catalog', 'services', shared);
export const lockAppointment = (tx, companyId, id) =>
  lockResource(tx, companyId, 'appointment', id);
