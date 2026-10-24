import assert from 'node:assert/strict';
export const notificationLeaseColumns = [
  'claim_token',
  'claimed_at',
  'lease_expires_at',
  'first_attempt_at',
  'delivery_payload',
];
// Upgrade fixtures have never been claimed; new nullable fields must start NULL.
export function assertUnclaimedMigration(rows) {
  for (const row of rows)
    if ('email_delivery_scope' in row) {
      assert.equal(row.email_delivery_scope, '');
      delete row.email_delivery_scope;
    }
  for (const row of rows)
    for (const field of [...notificationLeaseColumns, 'provider_message_id', 'submitted_at'])
      if (field in row) {
        assert.equal(row[field], null);
        delete row[field];
      }
}
