// Exclusively for Playwright visual comparison. Never imported by application code.
const names = [
  'Gabriel Almeida',
  'Lucas Ferreira',
  'Matheus Silva',
  'Rafael Costa',
  'Diego Henrique',
  'Carlos Mendes',
  'Felipe Rocha',
];
const times = ['09:00', '10:00', '11:00', '14:00', '15:30', '17:00', '18:30'];
const services = [
  'Corte Degradê',
  'Barba + Corte',
  'Corte Social',
  'Barba',
  'Corte + Sobrancelha',
  'Corte Degradê',
  'Barba + Corte',
];
const pros = ['Bruno', 'Thiago', 'Marina', 'Camila'];

export function presentationDashboard(original) {
  const date = original.clock.today;
  const appointments = names.map((clientName, index) => ({
    id: `visual-only-${index}`,
    date,
    time: times[index],
    duration: index % 2 ? 50 : 40,
    status: index === 5 ? 'confirmed' : index === 0 ? 'completed' : 'confirmed',
    clientName,
    professionalName: pros[index % pros.length],
    professionalId: `visual-pro-${index % pros.length}`,
    services: [services[index]],
    totalCents: 4000 + index * 500,
  }));
  return {
    ...original,
    clock: { ...original.clock, now: new Date(`${date}T11:00:00-03:00`).toISOString() },
    metrics: { ...original.metrics, todayAppointments: 7, completedAppointments: 1 },
    agenda: { ...original.agenda, total: 7, items: appointments },
    nextAppointment: { ...appointments[5], date: original.clock.today },
    professionals: pros.map((name, index) => ({ id: `visual-pro-${index}`, name, active: 1 })),
  };
}

export function presentationReport(original) {
  const month = original.today.slice(0, 7);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const financialSeries = Array.from({ length: days }, (_, index) => {
    const receivedCents = 12000 + index * 1500 + Math.round(6000 * Math.sin(index * 0.72));
    return {
      date: `${month}-${String(index + 1).padStart(2, '0')}`,
      receivedCents,
      paidExpensesCents: 0,
      balanceCents: receivedCents,
    };
  });
  const receivedCents = financialSeries.reduce((sum, row) => sum + row.receivedCents, 0);
  const quantities = [124, 98, 76, 42];
  const titles = ['Corte Degradê', 'Barba', 'Corte Social', 'Sobrancelha'];
  return {
    ...original,
    metrics: { ...original.metrics, receivedCents, balanceCents: receivedCents },
    financialSeries,
    services: {
      ...original.services,
      items: titles.map((name, index) => ({
        id: `visual-service-${index}`,
        name,
        active: 1,
        quantity: quantities[index],
        valueCents: quantities[index] * 4000,
        sharePercent: (quantities[index] / 340) * 100,
      })),
      total: 340,
    },
  };
}

export function presentationNotifications(original) {
  const now = new Date().toISOString();
  return {
    ...original,
    items: [
      {
        kind: 'appointment',
        source_id: 'visual-reservation-1',
        event: 'confirmed',
        queue_status: 'sent',
        created_at: now,
      },
      {
        kind: 'appointment',
        source_id: 'visual-reservation-2',
        event: 'cancelled',
        queue_status: 'sent',
        created_at: now,
      },
      {
        kind: 'invitation',
        source_id: 'visual-invitation-1',
        queue_status: 'pending',
        created_at: now,
      },
    ],
  };
}
