import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../server/database.js';
import { invitationCode, invitationToken } from '../server/invitation-code.js';
import { assertTeamCodes } from './helpers/team-code.js';

test('invitation representation preserves all 256 bits, normalization and canonical padding', () => {
  for (const token of [
    '0'.repeat(64),
    'f'.repeat(64),
    ...Array.from({ length: 100 }, () => randomBytes(32).toString('hex')),
  ]) {
    const code = invitationCode(token);
    assert.equal(invitationToken(code), token);
    assert.equal(invitationToken(code.toLowerCase().replaceAll('-', ' ')), token);
    assert.equal(invitationToken(code.slice(0, -1) + '1'), null);
  }
  for (const code of [
    '',
    null,
    'I'.repeat(52),
    'A'.repeat(51),
    'A'.repeat(53),
    '0'.repeat(161),
    '0'.repeat(51) + '_',
  ])
    assert.equal(invitationToken(code), null);
  assert.throws(() => invitationCode('short'));
});
test('Gradefy 7F.3A.1 SQLite shared invite codes, identity, rollback, races and permissions', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertTeamCodes(t, db);
});
