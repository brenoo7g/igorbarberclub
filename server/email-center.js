import { emailConfigured } from './transactional-email.js';

export function installEmailCenter(router, db, companyId) {
  // Mounted after authenticated company owner/manager authorization, like the existing counters.
  router.get('/admin/email-notifications', async (_req, res) => {
    const rows = await db.all(
      `SELECT n.id AS source_id,'appointment' AS kind,n.event,n.status AS queue_status,n.attempts,n.error,n.created_at,d.id AS delivery_id,d.status AS delivery_status,d.provider_message_id,d.updated_at FROM notifications n LEFT JOIN email_deliveries d ON d.company_id=n.company_id AND d.source_id=n.id AND d.kind='appointment' WHERE n.company_id=? AND n.channel='email' ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,
      [companyId],
    );
    const extras = await db.all(
      "SELECT id AS delivery_id,source_id,kind,status AS delivery_status,provider_message_id,created_at,updated_at FROM email_deliveries WHERE company_id=? AND kind<>'appointment' ORDER BY created_at DESC,id DESC LIMIT 100",
      [companyId],
    );
    const counts = await db.all(
      `SELECT COALESCE(d.status,CASE n.status WHEN 'sending' THEN 'processing' WHEN 'sent' THEN 'accepted' ELSE n.status END) AS status,COUNT(*) AS count FROM notifications n LEFT JOIN email_deliveries d ON d.company_id=n.company_id AND d.source_id=n.id AND d.kind='appointment' WHERE n.company_id=? AND n.channel='email' GROUP BY COALESCE(d.status,CASE n.status WHEN 'sending' THEN 'processing' WHEN 'sent' THEN 'accepted' ELSE n.status END)`,
      [companyId],
    );
    const otherCounts = await db.all(
      "SELECT status,COUNT(*) AS count FROM email_deliveries WHERE company_id=? AND kind<>'appointment' GROUP BY status",
      [companyId],
    );
    const totals = {};
    for (const row of [...counts, ...otherCounts])
      totals[row.status] = (totals[row.status] || 0) + Number(row.count);
    const attempts = await db.all(
      'SELECT a.id,a.delivery_id,a.started_at,a.finished_at,a.status,a.error_code FROM email_delivery_attempts a JOIN email_deliveries d ON d.id=a.delivery_id WHERE d.company_id=? ORDER BY a.started_at DESC,a.id DESC LIMIT 300',
      [companyId],
    );
    res.json({
      configured: emailConfigured(),
      counts: totals,
      items: [...rows, ...extras]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 100),
      attempts,
    });
  });
}
