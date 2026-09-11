// @ts-check
/** @typedef {{start_time: string, end_time: string}} Break */
/** @typedef {{weekday: number, active: boolean, start_time: string, end_time: string, breaks: Break[]}} WorkingDay */
/** @typedef {{agenda_mode: 'auto'|'manual', max_days_ahead: number, version: number}} Settings */
/** @typedef {{week_start: string, start_date: string, end_date: string}} ReleasedWeek */
/** @typedef {{settings: Settings, days: WorkingDay[], released_weeks: ReleasedWeek[]}} Schedule */
import { addDays, weekday } from './domain.js';

export const CLOSED_WEEK =
  'A agenda para este período ainda não foi aberta pelo barbeiro. Volte em breve!';
/** @param {string} date */
export function validDate(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
/** @param {string} time */
export const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
/** @param {string} date */
export const monday = (date) => addDays(date, -((weekday(date) + 6) % 7));
/** @param {WorkingDay[]} days @param {string} today @param {number} count */
export function automaticDates(days, today, count) {
  const active = new Set(days.filter((d) => d.active).map((d) => d.weekday));
  const result = [];
  if (!active.size) return result;
  for (let offset = 0; result.length < count && offset <= 730; offset++) {
    const date = addDays(today, offset);
    if (active.has(weekday(date))) result.push(date);
  }
  return result;
}
/** @param {WorkingDay[]} days @param {string} weekStart */
export function weekPeriod(days, weekStart) {
  const active = new Set(days.filter((d) => d.active).map((d) => d.weekday));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((date) =>
    active.has(weekday(date)),
  );
  return dates.length
    ? { week_start: weekStart, start_date: dates[0], end_date: dates[dates.length - 1] }
    : null;
}
/** @param {Schedule} schedule @param {string} today */
export function nextWeek(schedule, today) {
  const released = new Set(schedule.released_weeks.map((w) => w.week_start));
  for (let i = 0; i < 104; i++) {
    const start = addDays(monday(today), i * 7);
    const period = weekPeriod(schedule.days, start);
    if (period && period.end_date >= today && !released.has(start)) return period;
  }
  return null;
}
/** @param {Schedule} schedule @param {string} date @param {string} today */
export function dateAccess(schedule, date, today) {
  if (date < today || date > addDays(today, 730))
    return {
      allowed: false,
      reason: 'range',
      message: 'Escolha uma data futura dentro do período disponível.',
    };
  if (
    schedule.settings.agenda_mode === 'manual' &&
    !schedule.released_weeks.some(
      (w) => w.week_start === monday(date) && date >= w.start_date && date <= w.end_date,
    )
  )
    return { allowed: false, reason: 'unreleased', message: CLOSED_WEEK };
  const day = schedule.days.find((d) => d.weekday === weekday(date));
  if (!day?.active)
    return {
      allowed: false,
      reason: 'off',
      message: 'O profissional não atende neste dia. Escolha outro dia.',
    };
  if (schedule.settings.agenda_mode === 'auto') {
    const dates = automaticDates(schedule.days, today, schedule.settings.max_days_ahead);
    if (date > dates[dates.length - 1])
      return {
        allowed: false,
        reason: 'window',
        message: 'Este dia ainda está fora do período disponível para agendamento.',
      };
  }
  return { allowed: true, reason: null, message: null };
}
/** @param {WorkingDay|undefined} day @param {number} start @param {number} end */
export function fitsWorkingDay(day, start, end) {
  return (
    !!day?.active &&
    start >= minutes(day.start_time) &&
    end <= minutes(day.end_time) &&
    end > start &&
    !day.breaks.some((b) => start < minutes(b.end_time) && end > minutes(b.start_time))
  );
}
