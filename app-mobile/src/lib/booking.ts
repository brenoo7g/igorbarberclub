import { services } from '../data/services.ts';

export type Booking = {
  id: string;
  serviceId: string;
  date: string;
  time: string;
  customer: string;
  status: 'local' | 'cancelled';
  createdAt: string;
};
export type Profile = { name: string };
export type SavedData = { version: 1; profile: Profile; bookings: Booking[] };
export const emptyData: SavedData = { version: 1, profile: { name: '' }, bookings: [] };
export const brazilDay = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
};
export const atTime = (date: string, time: string) => new Date(date + 'T' + time + ':00-03:00');
export const dateLabel = (date: string, short = false) =>
  atTime(date, '12:00').toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: short ? 'short' : 'long',
    ...(short ? {} : { weekday: 'long' as const }),
  });
export function nextDays(now = new Date()) {
  const start = atTime(brazilDay(now), '12:00');
  return Array.from({ length: 21 }, (_, offset) => {
    const date = new Date(start.getTime() + offset * 86400000);
    return { date: brazilDay(date), closed: date.getUTCDay() === 0 };
  });
}
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const demoTimes = Array.from({ length: 14 }, (_, i) =>
  i < 4 ? 540 + i * 40 : 780 + (i - 4) * 40,
)
  .filter((value) => value + 40 <= 1080)
  .map(
    (value) =>
      String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'),
  );
export function isAvailable(date: string, time: string, bookings: Booking[], now = new Date()) {
  if (!nextDays(now).some((day) => day.date === date && !day.closed) || !demoTimes.includes(time))
    return false;
  if (atTime(date, time).getTime() <= now.getTime()) return false;
  return !bookings.some(
    (booking) =>
      booking.status === 'local' &&
      booking.date === date &&
      Math.abs(minutes(booking.time) - minutes(time)) < 40,
  );
}
export function createBooking(
  input: { serviceId: string; date: string; time: string; customer: string },
  bookings: Booking[],
  now = new Date(),
): Booking {
  if (!services.some((service) => service.id === input.serviceId))
    throw new Error('Escolha um serviço válido.');
  if (input.customer.trim().length < 2 || input.customer.trim().length > 80)
    throw new Error('Informe seu nome (de 2 a 80 caracteres).');
  if (!isAvailable(input.date, input.time, bookings, now))
    throw new Error('Esse horário não está disponível. Escolha outro.');
  return {
    ...input,
    customer: input.customer.trim(),
    id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    status: 'local',
    createdAt: now.toISOString(),
  };
}
export function parseSavedData(raw: string | null): SavedData {
  if (!raw) return emptyData;
  const value = JSON.parse(raw) as SavedData;
  if (
    value?.version !== 1 ||
    typeof value.profile?.name !== 'string' ||
    !Array.isArray(value.bookings)
  )
    throw new Error('Dados locais inválidos.');
  for (const booking of value.bookings) {
    if (
      !booking ||
      typeof booking.id !== 'string' ||
      typeof booking.customer !== 'string' ||
      !services.some((service) => service.id === booking.serviceId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(booking.date) ||
      !demoTimes.includes(booking.time) ||
      !['local', 'cancelled'].includes(booking.status) ||
      !Number.isFinite(Date.parse(booking.createdAt))
    )
      throw new Error('Agendamentos locais inválidos.');
  }
  return value;
}
