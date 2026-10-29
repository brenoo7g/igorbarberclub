// Visual-only data. Intercepted in Playwright; never written to a database.
const cents = [12000, 8000, 5000, -2000];
const spending = [4000, 2500];

export function financePresentation(base) {
  const dates = [
    base.from,
    base.from.slice(0, 8) + '05',
    base.from.slice(0, 8) + '11',
    base.from.slice(0, 8) + '18',
    base.from.slice(0, 8) + '22',
    base.from.slice(0, 8) + '25',
    base.to,
  ];
  const entry = (id, type, description, amount_cents, index, method, status) => ({
    id,
    type,
    description,
    appointment_id: type.startsWith('payment') ? 'fixture-appointment' : null,
    amount_cents,
    date: dates[index],
    occurred_at: dates[index] + 'T13:00:00.000Z',
    status,
    method,
    version: type === 'expense' ? 1 : null,
    category: type === 'expense' ? 'materials' : null,
  });
  return {
    ...base,
    metrics: {
      expectedCents: 34000,
      completedCents: 29000,
      receivedCents: 23000,
      paidExpensesCents: 6500,
      balanceCents: 16500,
    },
    methodTotals: [
      { method: 'pix', amountCents: 10000 },
      { method: 'credit', amountCents: 8000 },
      { method: 'cash', amountCents: 5000 },
    ],
    total: 37,
    items: [
      entry('fixture-1', 'payment', 'Corte completo · Ana Souza', 12000, 0, 'pix', 'received'),
      entry('fixture-2', 'payment', 'Barba e corte · Pedro Lima', 8000, 1, 'credit', 'received'),
      entry('fixture-3', 'payment', 'Tratamento · João Reis', 5000, 2, 'cash', 'received'),
      entry(
        'fixture-4',
        'payment-reversal',
        'Estorno parcial solicitado',
        -2000,
        3,
        'pix',
        'reversed',
      ),
      entry('fixture-5', 'expense', 'Materiais de atendimento', 4000, 4, null, 'paid'),
      entry('fixture-6', 'expense', 'Manutenção pendente', 3000, 5, null, 'pending'),
      entry('fixture-7', 'expense', 'Compra de produtos', 2500, 6, null, 'paid'),
    ],
  };
}

export function reportPresentation(base) {
  const financialSeries = (base.financialSeries || []).map((row, index) => ({
    ...row,
    receivedCents: cents[index] || 0,
    paidExpensesCents: index === 4 ? spending[0] : index === 5 ? spending[1] : 0,
    balanceCents: (cents[index] || 0) - (index === 4 ? spending[0] : index === 5 ? spending[1] : 0),
  }));
  const totals = [3, 5, 2, 4, 3];
  const completed = [1, 3, 1, 2, 1];
  const appointmentSeries = (base.appointmentSeries || []).map((row, index) => ({
    ...row,
    total: totals[index] || 0,
    completed: completed[index] || 0,
    confirmed: index < 3 ? 1 : 0,
    cancelled: index < 3 ? 1 : 0,
    noShow: index === 4 ? 1 : 0,
    future: 0,
  }));
  const topServices = [
    {
      id: 'fixture-cut',
      name: 'Corte completo',
      active: 1,
      quantity: 5,
      valueCents: 18000,
      sharePercent: 62.5,
    },
    {
      id: 'fixture-beard',
      name: 'Barba e corte',
      active: 1,
      quantity: 3,
      valueCents: 11000,
      sharePercent: 37.5,
    },
  ];
  const professionals = [
    {
      id: 'fixture-ana',
      name: 'Ana Souza',
      active: 1,
      quantity: 5,
      cancelled: 2,
      noShow: 0,
      valueCents: 18000,
    },
    {
      id: 'fixture-pedro',
      name: 'Pedro Lima',
      active: 1,
      quantity: 3,
      cancelled: 1,
      noShow: 1,
      valueCents: 11000,
    },
  ];
  return {
    ...base,
    ...(base.metrics && {
      metrics: {
        expectedCents: 34000,
        completedCents: 29000,
        receivedCents: 23000,
        paidExpensesCents: 6500,
        balanceCents: 16500,
      },
    }),
    ...(base.appointments && {
      appointments: { total: 17, confirmed: 5, completed: 8, cancelled: 3, noShow: 1, future: 0 },
    }),
    ...(base.financialSeries && { financialSeries }),
    ...(base.appointmentSeries && { appointmentSeries }),
    ...(base.topServices && { topServices }),
    ...(base.services && {
      services: { ...base.services, items: topServices, total: 2, serviceValueCents: 29000 },
    }),
    ...(base.professionals && {
      professionals: { ...base.professionals, items: professionals, total: 2 },
    }),
  };
}

export function settingsPresentation(base, readOnly = false) {
  return {
    ...base,
    editable: !readOnly && base.editable,
    timezoneLocked: true,
    working_days: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      active: weekday !== 0,
      start_time: '09:00',
      end_time: weekday === 6 ? '15:00' : '18:00',
      breaks: weekday === 0 ? [] : [{ start_time: '12:00', end_time: '13:00' }],
    })),
    minimum_notice_minutes: 60,
    maximum_booking_days: 30,
    buffer_minutes: 10,
    cancel_notice_minutes: 120,
    reschedule_notice_minutes: 120,
  };
}
