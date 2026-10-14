// Reconstruction for disposable tests only; never used as a production rollback.
export async function reconstructBeforeProfessionalPanel(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=17'))) return;
  await db.run('DROP TABLE professional_activity_events');
  await db.run('DELETE FROM schema_migrations WHERE version=17');
}
