import { z } from 'zod';
import { agendaAccess, agendaDate } from './agenda.js';
import { appointmentTotals, companyClock, dashboardPeriod, metricInteger } from './dashboard.js';
import { addDays } from './domain.js';
import { currentTime, domainError } from './entitlements.js';
import { financialDaily, financialTotals } from './financial-ledger.js';

const querySchema = z
  .object({
    area: z
      .enum(['overview', 'finance', 'appointments', 'services', 'professionals'])
      .default('overview'),
    period: z
      .enum(['today', 'last7', 'last30', 'month', 'previous-month', 'custom'])
      .default('month'),
    from: agendaDate.optional(),
    to: agendaDate.optional(),
    professionalId: z.string().min(1).max(200).optional(),
    serviceId: z.string().min(1).max(200).optional(),
    status: z.enum(['confirmed', 'completed', 'cancelled', 'no-show']).optional(),
    type: z.enum(['all', 'payments', 'expenses']).optional(),
    method: z.enum(['pix', 'cash', 'debit', 'credit', 'transfer', 'other']).optional(),
    sort: z.enum(['quantity', 'value']).default('quantity'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export function reportPeriod(today, q) {
  if (q.period !== 'custom' && (q.from || q.to))
    domainError(
      400,
      'INVALID_REPORT_FILTER',
      'Datas personalizadas exigem o período personalizado.',
    );
  let range;
  switch (q.period) {
    case 'today':
      range = { from: today, to: today };
      break;
    case 'last7':
      range = { from: addDays(today, -6), to: today };
      break;
    case 'last30':
      range = { from: addDays(today, -29), to: today };
      break;
    case 'month':
    case 'previous-month': {
      const anchor = q.period === 'month' ? today : addDays(today.slice(0, 8) + '01', -1);
      const p = dashboardPeriod(anchor, 'month');
      range = { from: p.start, to: p.end };
      break;
    }
    default:
      range = { from: q.from, to: q.to };
  }
  if (
    !range.from ||
    !range.to ||
    range.from > range.to ||
    Date.parse(range.to + 'T12:00Z') - Date.parse(range.from + 'T12:00Z') > 366 * 86400000
  )
    domainError(400, 'INVALID_REPORT_PERIOD', 'Selecione início e fim válidos, com até 367 dias.');
  agendaDate.parse(range.from);
  agendaDate.parse(range.to);
  return range;
}
function validFilters(q) {
  const operational = Boolean(q.professionalId || q.serviceId || q.status);
  const cash = Boolean(q.type || q.method);
  if (
    (q.area === 'overview' && (operational || cash)) ||
    (q.area === 'finance' && operational) ||
    (!['overview', 'finance'].includes(q.area) && cash) ||
    (['services', 'professionals'].includes(q.area) && q.status) ||
    (q.method && q.type !== 'payments') ||
    (q.sort !== 'quantity' && !['services', 'professionals'].includes(q.area))
  )
    domainError(
      400,
      'INVALID_REPORT_FILTER',
      'Esta combinação de filtros não se aplica ao relatório selecionado.',
    );
}
function appointmentWhere(cid, range, q) {
  const parts = ['a.company_id=?', 'a.date>=?', 'a.date<=?'],
    args = [cid, range.from, range.to];
  if (q.professionalId) {
    parts.push('a.barber_id=?');
    args.push(q.professionalId);
  }
  if (q.serviceId) {
    parts.push(
      'EXISTS(SELECT 1 FROM appointment_services f WHERE f.company_id=a.company_id AND f.appointment_id=a.id AND f.service_id=?)',
    );
    args.push(q.serviceId);
  }
  if (q.status) {
    parts.push('a.status=?');
    args.push(q.status);
  }
  return { sql: parts.join(' AND '), args };
}
function integers(row, fields) {
  const result = { ...row };
  for (const f of fields) result[f] = metricInteger(row[f]);
  return result;
}
const appointmentFields = ['total', 'confirmed', 'completed', 'cancelled', 'noShow', 'future'];
function appointmentCounts(today, minute) {
  // Literal date/minute are validated company clock data, but remain SQL parameters.
  return {
    sql: `COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN a.status='confirmed' THEN 1 ELSE 0 END),0) AS confirmed,
    COALESCE(SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END),0) AS completed,
    COALESCE(SUM(CASE WHEN a.status='cancelled' THEN 1 ELSE 0 END),0) AS cancelled,
    COALESCE(SUM(CASE WHEN a.status='no-show' THEN 1 ELSE 0 END),0) AS "noShow",
    COALESCE(SUM(CASE WHEN a.status='confirmed' AND (a.date>? OR (a.date=? AND a.start_minute>?)) THEN 1 ELSE 0 END),0) AS future`,
    // start_minute is an integer: > floor(now) is equivalent to > now, including
    // seconds, and prevents PostgreSQL from receiving a fractional integer bind.
    args: [today, today, Math.floor(minute)],
  };
}
const serviceFields = ['quantity', 'valueCents'];
async function serviceRows(tx, cid, range, q, limit, offset = 0) {
  const w = appointmentWhere(cid, range, q);
  // Group on the stored name AND service ID: renamed services retain their old label.
  const source = `SELECT s.service_id AS id,s.name,v.active,COUNT(*) AS quantity,SUM(s.price) AS "valueCents"
    FROM appointments a JOIN appointment_services s ON s.company_id=a.company_id AND s.appointment_id=a.id
    JOIN services v ON v.company_id=s.company_id AND v.id=s.service_id
    WHERE ${w.sql} AND a.status='completed'${q.serviceId ? ' AND s.service_id=?' : ''}
    GROUP BY s.service_id,s.name,v.active`;
  const args = [...w.args, ...(q.serviceId ? [q.serviceId] : [])];
  const totals = await tx.get(
    `SELECT COUNT(*) AS n,COALESCE(SUM("valueCents"),0) AS value FROM (${source}) ranked`,
    args,
  );
  const denominator = metricInteger(totals.value);
  const order =
    q.sort === 'value' ? '"valueCents" DESC,quantity DESC' : 'quantity DESC,"valueCents" DESC';
  const items = (
    await tx.all(`${source} ORDER BY ${order},s.name,s.service_id LIMIT ? OFFSET ?`, [
      ...args,
      limit,
      offset,
    ])
  ).map((r) => ({
    ...integers(r, serviceFields),
    sharePercent: denominator
      ? Number(((metricInteger(r.valueCents) * 100) / denominator).toFixed(2))
      : null,
  }));
  return { items, total: metricInteger(totals.n), serviceValueCents: denominator };
}
async function professionalRows(tx, cid, range, q, limit, offset = 0) {
  const w = appointmentWhere(cid, range, q);
  const source = `SELECT b.id,b.name,b.active,
    SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END) AS quantity,
    SUM(CASE WHEN a.status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN a.status='no-show' THEN 1 ELSE 0 END) AS "noShow",
    SUM(CASE WHEN a.status='completed' THEN a.total ELSE 0 END) AS "valueCents"
    FROM appointments a JOIN barbers b ON b.company_id=a.company_id AND b.id=a.barber_id
    WHERE ${w.sql} GROUP BY b.id,b.name,b.active`;
  const total = metricInteger(
    (await tx.get(`SELECT COUNT(*) AS n FROM (${source}) ranked`, w.args)).n,
  );
  const order =
    q.sort === 'value' ? '"valueCents" DESC,quantity DESC' : 'quantity DESC,"valueCents" DESC';
  const items = (
    await tx.all(`${source} ORDER BY ${order},b.name,b.id LIMIT ? OFFSET ?`, [
      ...w.args,
      limit,
      offset,
    ])
  ).map((r) => integers(r, ['quantity', 'cancelled', 'noShow', 'valueCents']));
  return { items, total };
}
function fillDays(range, rows, zero) {
  const map = new Map(rows.map((r) => [r.date, r])),
    result = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1))
    result.push(map.get(date) || { date, ...zero });
  return result;
}
export async function reportsSnapshot(tx, cid, userId, query = {}, exporting = false, nowOverride) {
  const q = querySchema.parse(query);
  validFilters(q);
  const access = await agendaAccess(tx, cid, userId),
    now = nowOverride || (await currentTime(tx)),
    local = companyClock(now, access.company.timezone);
  const range = reportPeriod(local.today, q);
  for (const [id, table, code] of [
    [q.professionalId, 'barbers', 'PROFESSIONAL_NOT_FOUND'],
    [q.serviceId, 'services', 'SERVICE_NOT_FOUND'],
  ])
    if (id && !(await tx.get(`SELECT id FROM ${table} WHERE company_id=? AND id=?`, [cid, id])))
      domainError(404, code, 'O filtro não pertence a esta empresa.');
  const result = {
    company: access.company,
    editable: access.editable,
    today: local.today,
    ...range,
    filters: q,
    page: q.page,
    pageSize: 30,
  };
  if (['overview', 'finance'].includes(q.area)) {
    const totals = await appointmentTotals(tx, cid, range.from, range.to);
    result.metrics = {
      expectedCents: totals.expected,
      completedCents: totals.completed_value,
      ...(await financialTotals(tx, cid, range.from, range.to, q)),
    };
    result.financialSeries = fillDays(
      range,
      await financialDaily(tx, cid, range.from, range.to, q),
      { receivedCents: 0, paidExpensesCents: 0, balanceCents: 0 },
    );
  }
  if (q.area !== 'finance') {
    const w = appointmentWhere(cid, range, q),
      counts = appointmentCounts(local.today, local.minute);
    result.appointments = integers(
      await tx.get(`SELECT ${counts.sql} FROM appointments a WHERE ${w.sql}`, [
        ...counts.args,
        ...w.args,
      ]),
      appointmentFields,
    );
    result.appointmentSeries = fillDays(
      range,
      (
        await tx.all(
          `SELECT a.date,${counts.sql} FROM appointments a WHERE ${w.sql} GROUP BY a.date ORDER BY a.date`,
          [...counts.args, ...w.args],
        )
      ).map((r) => integers(r, appointmentFields)),
      Object.fromEntries(appointmentFields.map((k) => [k, 0])),
    );
  }
  if (['overview', 'services'].includes(q.area)) {
    result.services = await serviceRows(
      tx,
      cid,
      range,
      q,
      exporting ? 10001 : q.area === 'overview' ? 8 : 30,
      exporting || q.area === 'overview' ? 0 : (q.page - 1) * 30,
    );
    if (q.area === 'services')
      result.topServices = (await serviceRows(tx, cid, range, { ...q, sort: 'quantity' }, 8)).items;
  }
  if (q.area === 'professionals')
    result.professionals = await professionalRows(
      tx,
      cid,
      range,
      q,
      exporting ? 10001 : 30,
      exporting ? 0 : (q.page - 1) * 30,
    );
  if (exporting && (result.services?.total > 10000 || result.professionals?.total > 10000))
    domainError(
      413,
      'REPORT_EXPORT_LIMIT',
      'A exportação aceita até 10.000 linhas agrupadas. Reduza o período ou filtre serviço/profissional.',
    );
  if (!exporting && ['appointments', 'services', 'professionals'].includes(q.area)) {
    result.catalog = {
      professionals: await tx.all(
        'SELECT id,name,active FROM barbers WHERE company_id=? ORDER BY name,id LIMIT 1001',
        [cid],
      ),
      services: await tx.all(
        'SELECT id,name,active FROM services WHERE company_id=? ORDER BY name,id LIMIT 1001',
        [cid],
      ),
    };
    result.catalog.truncated =
      result.catalog.professionals.length > 1000 || result.catalog.services.length > 1000;
    result.catalog.professionals = result.catalog.professionals.slice(0, 1000);
    result.catalog.services = result.catalog.services.slice(0, 1000);
  }
  return result;
}

export function csvCell(value) {
  let text = String(value ?? '').replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,
    '',
  );
  if (typeof value !== 'number' && /^[=+@-]/.test(text.trimStart())) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
// Money cells are validated integers rendered without floating-point conversion.
const csvMoney = (n) => {
  metricInteger(n);
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
};
export function reportCSV(data) {
  const q = data.filters,
    rows = [
      [
        'Relatório',
        {
          overview: 'Visão geral',
          finance: 'Financeiro',
          appointments: 'Atendimentos',
          services: 'Serviços',
          professionals: 'Profissionais',
        }[q.area],
      ],
      ['Empresa', data.company.name],
      ['Período', data.from, data.to],
      ['Fuso', data.company.timezone],
      ['Filtros', JSON.stringify({ ...q, page: undefined })],
      [
        'Critério',
        'Recebimentos manuais; reversões na data da correção. Valores operacionais pela data do atendimento. Saldo não é lucro líquido.',
      ],
      [],
    ];
  const cashHeader = [
    'Data',
    'Recebimentos registrados (R$)',
    'Despesas pagas (R$)',
    'Saldo operacional registrado (R$)',
  ];
  const moneyCell = (n) => ({ money: csvMoney(n) });
  if (data.metrics) {
    rows.push(['Indicador', 'Valor (R$)']);
    for (const [key, label] of [
      ['expectedCents', 'Valor previsto'],
      ['completedCents', 'Serviços concluídos'],
      ['receivedCents', 'Recebimentos registrados'],
      ['paidExpensesCents', 'Despesas pagas'],
      ['balanceCents', 'Saldo operacional registrado'],
    ])
      rows.push([label, moneyCell(data.metrics[key])]);
    rows.push([]);
  }
  if (data.financialSeries) {
    rows.push(cashHeader);
    for (const r of data.financialSeries)
      rows.push([
        r.date,
        moneyCell(r.receivedCents),
        moneyCell(r.paidExpensesCents),
        moneyCell(r.balanceCents),
      ]);
    rows.push([]);
  }
  if (data.appointmentSeries) {
    rows.push([
      'Data',
      'Agendamentos',
      'Confirmados',
      'Concluídos',
      'Cancelados',
      'Não compareceu',
      'Futuros confirmados',
    ]);
    for (const r of data.appointmentSeries)
      rows.push([r.date, ...appointmentFields.map((k) => r[k])]);
    rows.push([]);
  }
  if (data.services) {
    rows.push([
      'Serviço (nome histórico)',
      'Situação atual',
      'Atendimentos concluídos',
      'Valor histórico concluído (R$)',
      'Participação no valor (%)',
    ]);
    for (const r of data.services.items)
      rows.push([
        r.name,
        r.active ? 'Ativo' : 'Inativo',
        r.quantity,
        moneyCell(r.valueCents),
        r.sharePercent === null
          ? ''
          : r.sharePercent.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
      ]);
  }
  if (data.professionals) {
    rows.push([
      'Profissional',
      'Situação atual',
      'Atendimentos concluídos',
      'Cancelamentos',
      'Não compareceu',
      'Valor histórico concluído (R$)',
    ]);
    for (const r of data.professionals.items)
      rows.push([
        r.name,
        r.active ? 'Ativo' : 'Inativo',
        r.quantity,
        r.cancelled,
        r.noShow,
        moneyCell(r.valueCents),
      ]);
  }
  return (
    '\ufeff' +
    rows
      .map((r) =>
        r
          .map((v) =>
            typeof v === 'object' && v !== null && 'money' in v ? '"' + v.money + '"' : csvCell(v),
          )
          .join(';'),
      )
      .join('\r\n') +
    '\r\n'
  );
}
export function installReportRoutes(router, db, cid) {
  router.use('/admin/reports', (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    next();
  });
  router.get('/admin/reports', async (req, res) =>
    res.json(
      await db.transaction((tx) => reportsSnapshot(tx, cid, req.user.id, req.query), {
        readOnly: true,
      }),
    ),
  );
  router.get('/admin/reports/export', async (req, res) => {
    const data = await db.transaction(
      (tx) => reportsSnapshot(tx, cid, req.user.id, req.query, true),
      { readOnly: true },
    );
    res.set(
      'Content-Disposition',
      `attachment; filename="gradefy-${data.filters.area}-${data.from}-${data.to}.csv"`,
    );
    res.type('text/csv; charset=utf-8').send(reportCSV(data));
  });
}
