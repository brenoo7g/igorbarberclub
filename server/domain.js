export const TZ = 'America/Sao_Paulo';
export const dateInBrazil = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const addDays = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const overlaps = (start, end, existing) =>
  existing.some((x) => start < x.end_minute && end > x.start_minute);
export function isFuture(date, minute, now = new Date()) {
  return new Date(`${date}T${clock(minute)}:00-03:00`) > now;
}
export function availableSlots({
  date,
  duration,
  occupied = [],
  open = 9,
  close = 19,
  now = new Date(),
}) {
  if (weekday(date) === 0 || !Number.isInteger(duration) || duration <= 0) return [];
  const slots = [];
  const opening = open * 60,
    closing = close * 60;
  const busy = occupied
    .filter((interval) => interval.end_minute > opening && interval.start_minute < closing)
    .map((interval) => ({
      start: Math.max(opening, interval.start_minute),
      end: Math.min(closing, interval.end_minute),
    }))
    .sort((a, b) => a.start - b.start);
  const addFreeInterval = (from, until) => {
    for (let start = from; start + duration <= until; start += duration) {
      if (isFuture(date, start, now)) slots.push(clock(start));
    }
  };
  // Pack each free interval using the selected services' combined duration.
  // Resume immediately after reservations/blocks, including older off-grid bookings.
  let cursor = opening;
  for (const interval of busy) {
    addFreeInterval(cursor, interval.start);
    cursor = Math.max(cursor, interval.end);
  }
  addFreeInterval(cursor, closing);
  return slots;
}
export function calculateMetrics(appointments, items, today = dateInBrazil()) {
  const done = appointments.filter((a) => a.status === 'completed');
  const weekStart = addDays(today, -((weekday(today) + 6) % 7));
  const sum = (rows) => rows.reduce((total, a) => total + a.total, 0);
  const month = done.filter((a) => a.date.slice(0, 7) === today.slice(0, 7) && a.date <= today);
  const period = done.filter((a) => a.date >= addDays(today, -29) && a.date <= today);
  const days = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  const byDay = days.map((name, i) => ({
    name,
    revenue: sum(period.filter((a) => weekday(a.date) === i)),
    count: period.filter((a) => weekday(a.date) === i).length,
  }));
  const periodIds = new Set(period.map((a) => a.id));
  const sales = new Map();
  for (const item of items.filter((i) => periodIds.has(i.appointment_id))) {
    const previous = sales.get(item.service_id) || { name: item.name, count: 0, revenue: 0 };
    previous.count++;
    previous.revenue += item.price;
    sales.set(item.service_id, previous);
  }
  return {
    daily: sum(done.filter((a) => a.date === today)),
    weekly: sum(done.filter((a) => a.date >= weekStart && a.date <= today)),
    monthly: sum(month),
    yearly: sum(done.filter((a) => a.date.slice(0, 4) === today.slice(0, 4) && a.date <= today)),
    averageTicket: period.length ? Math.round(sum(period) / period.length) : 0,
    clients: new Set(
      period.map((a) => (a.user_id ? `user:${a.user_id}` : `guest:${a.guest_email || a.id}`)),
    ).size,
    visits: period.length,
    bestRevenueDay: period.length ? [...byDay].sort((a, b) => b.revenue - a.revenue)[0] : null,
    bestVolumeDay: period.length ? [...byDay].sort((a, b) => b.count - a.count)[0] : null,
    topServices: [...sales.values()].sort((a, b) => b.count - a.count),
    chart: Array.from({ length: 14 }, (_, i) => {
      const date = addDays(today, i - 13);
      return {
        date,
        revenue: sum(done.filter((a) => a.date === date)),
        count: done.filter((a) => a.date === date).length,
      };
    }),
  };
}
