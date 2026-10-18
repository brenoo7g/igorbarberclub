// Only disposable schema reconstruction. Never used in application startup.
export async function reconstructBeforeMinisite(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=20'))) return;
  await db.run("DELETE FROM templates WHERE id='gradefy-minisite'");
  await db.run('DELETE FROM schema_migrations WHERE version=20');
}
