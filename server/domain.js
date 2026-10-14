export const TZ = 'America/Sao_Paulo';
export const dateInTimezone = (now = new Date(), timezone = TZ) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const dateInBrazil = (now = new Date()) => dateInTimezone(now);
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
const offsetCache = new Map();
// Resolve local wall time only when it identifies exactly one instant. Both
// nonexistent and ambiguous DST times are unavailable, never guessed silently.
export function localInstant(date, minute, timezone = TZ) {
  const base = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  const key = `${timezone}:${date}`;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (instant) =>
    Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  let offsets = offsetCache.get(key);
  if (!offsets) {
    offsets = [
      ...new Set(
        [-36, -12, 12, 36].map((hour) => {
          const probe = Date.parse(`${date}T12:00:00Z`) + hour * 3600000,
            p = parts(probe);
          return (
            Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - probe
          );
        }),
      ),
    ];
    if (offsetCache.size > 512) offsetCache.clear();
    offsetCache.set(key, offsets);
  }
  const matches = offsets
    .map((offset) => base - offset)
    .filter((instant) => {
      const p = parts(instant);
      return (
        `${p.year}-${p.month}-${p.day}` === date &&
        Number(p.hour) * 60 + Number(p.minute) === minute
      );
    });
  return matches.length === 1 ? new Date(matches[0]) : null;
}
export function isFuture(date, minute, now = new Date(), timezone = TZ) {
  const localDate = dateInTimezone(now, timezone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const current =
    Number(parts.hour) * 60 +
    Number(parts.minute) +
    Number(parts.second) / 60 +
    now.getUTCMilliseconds() / 60000;
  return date > localDate || (date === localDate && minute > current);
}
export function availableSlots({
  date,
  duration,
  occupied = [],
  open = 9,
  close = 19,
  now = new Date(),
  workingDay,
  timezone = TZ,
  buffer = 0,
}) {
  if (
    (workingDay === undefined ? weekday(date) === 0 : !workingDay?.active) ||
    !Number.isInteger(duration) ||
    duration <= 0 ||
    !Number.isInteger(buffer) ||
    buffer < 0
  )
    return [];
  const slots = [];
  const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const opening = workingDay ? minute(workingDay.start_time) : open * 60,
    closing = workingDay ? minute(workingDay.end_time) : close * 60;
  const breaks = workingDay
    ? workingDay.breaks.map((b) => ({
        start_minute: minute(b.start_time),
        end_minute: minute(b.end_time),
      }))
    : [];
  const busy = [...occupied, ...breaks]
    .filter((interval) => interval.end_minute > opening && interval.start_minute < closing)
    .map((interval) => ({
      start: Math.max(opening, interval.start_minute),
      end: Math.min(closing, interval.end_minute),
    }))
    .sort((a, b) => a.start - b.start);
  const addFreeInterval = (from, until) => {
    for (let start = from; start + duration <= until; start += duration + buffer) {
      const first = localInstant(date, start, timezone),
        last = localInstant(date, start + duration, timezone);
      if (
        isFuture(date, start, now, timezone) &&
        first &&
        last &&
        last.getTime() - first.getTime() === duration * 60000
      )
        slots.push(clock(start));
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
