import { metricInteger } from './dashboard.js';

// One cash policy for Financeiro, reports, time series and exports. An original
// payment keeps its date; reversals are negative movements on the correction date.
export function financialSource(cid, from, to, { type = 'all', method } = {}) {
  const parts = [],
    args = [];
  if (type !== 'expenses') {
    const filter = method ? ' AND p.method=?' : '';
    parts.push(`SELECT p.received_date AS date,p.amount_cents AS received_cents,0 AS paid_cents
      FROM financial_payments p WHERE p.company_id=? AND p.received_date>=? AND p.received_date<=?${filter}`);
    args.push(cid, from, to, ...(method ? [method] : []));
    parts.push(`SELECT r.event_date AS date,-p.amount_cents AS received_cents,0 AS paid_cents
      FROM financial_payment_reversals r JOIN financial_payments p ON p.company_id=r.company_id AND p.id=r.payment_id
      WHERE r.company_id=? AND r.event_date>=? AND r.event_date<=?${filter}`);
    args.push(cid, from, to, ...(method ? [method] : []));
  }
  if (type !== 'payments') {
    parts.push(`SELECT paid_date AS date,0 AS received_cents,amount_cents AS paid_cents
      FROM financial_expenses WHERE company_id=? AND paid_date>=? AND paid_date<=?`);
    args.push(cid, from, to);
    parts.push(`SELECT event_date AS date,0 AS received_cents,-paid_reversal_cents AS paid_cents
      FROM financial_expense_events WHERE company_id=? AND action='void' AND event_date>=? AND event_date<=? AND paid_reversal_cents>0`);
    args.push(cid, from, to);
  }
  return { sql: '(' + parts.join(' UNION ALL ') + ') cash', args };
}
export async function financialTotals(tx, cid, from, to, filters = {}) {
  const { sql, args } = financialSource(cid, from, to, filters);
  const row = await tx.get(
    `SELECT COALESCE(SUM(received_cents),0) AS received,COALESCE(SUM(paid_cents),0) AS paid FROM ${sql}`,
    args,
  );
  const receivedCents = metricInteger(row.received),
    paidExpensesCents = metricInteger(row.paid);
  return {
    receivedCents,
    paidExpensesCents,
    balanceCents: metricInteger(receivedCents - paidExpensesCents),
  };
}
export async function financialDaily(tx, cid, from, to, filters = {}) {
  const { sql, args } = financialSource(cid, from, to, filters);
  return (
    await tx.all(
      `SELECT date,SUM(received_cents) AS received,SUM(paid_cents) AS paid FROM ${sql} GROUP BY date ORDER BY date`,
      args,
    )
  ).map((row) => ({
    date: row.date,
    receivedCents: metricInteger(row.received),
    paidExpensesCents: metricInteger(row.paid),
    balanceCents: metricInteger(metricInteger(row.received) - metricInteger(row.paid)),
  }));
}
