import { addDays } from '../lib';
export const agendaDateLabel = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00Z'));
export const monday = (date: string) =>
  addDays(date, -((new Date(date + 'T12:00Z').getUTCDay() + 6) % 7));
