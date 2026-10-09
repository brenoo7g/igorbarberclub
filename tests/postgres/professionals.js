import { assertProfessionalsMigration } from '../helpers/professionals-migration.js';
import { assertProfessionalsPlans } from '../helpers/professionals-plans.js';
// Called exclusively by the guarded disposable PostgreSQL runner.
export async function assertPostgresProfessionals(t, db, second) {
  await assertProfessionalsMigration(t, db);
  await assertProfessionalsPlans(t, db, second, 10);
}
