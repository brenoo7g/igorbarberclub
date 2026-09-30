import { requireCompanyId } from './company-context.js';
import { addDays, calculateMetrics } from './domain.js';

export async function getCompanyMetrics(db, companyId, today) {
  requireCompanyId(companyId);
  const start =
    `${today.slice(0, 4)}-01-01` < addDays(today, -29)
      ? `${today.slice(0, 4)}-01-01`
      : addDays(today, -29);
  const appointments = await db.all(
    'SELECT * FROM appointments WHERE company_id=? AND date>=? AND date<=?',
    [companyId, start, today],
  );
  const items = await db.all(
    'SELECT s.* FROM appointment_services s JOIN appointments a ON a.id=s.appointment_id AND a.company_id=s.company_id WHERE s.company_id=? AND a.date>=? AND a.date<=?',
    [companyId, addDays(today, -29), today],
  );
  return calculateMetrics(appointments, items, today);
}
