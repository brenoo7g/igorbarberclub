import { IGOR_COMPANY_ID } from './company-bootstrap.js';
import { z } from 'zod';
import { addDays, clock, dateInBrazil, isFuture, weekday } from './domain.js';
import {
  automaticDates,
  dateAccess,
  fitsWorkingDay,
  minutes,
  monday,
  nextWeek,
  weekPeriod,
  validDate,
} from './schedule-domain.js';

export const lockSchedule = async (tx) => {
  if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789126)');
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const interval = z.object({ start_time: time, end_time: time }).strict();
const daySchema = interval
  .extend({
    weekday: z.number().int().min(0).max(6),
    active: z.boolean(),
    breaks: z.array(interval).max(4),
  })
  .strict();
const settingsSchema = z
  .object({
    agenda_mode: z.enum(['auto', 'manual']),
    max_days_ahead: z.number().int().min(1).max(90),
    version: z.number().int().nonnegative(),
    days: z.array(daySchema).length(7),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    if (new Set(value.days.map((d) => d.weekday)).size !== 7)
      bad('Informe cada dia da semana uma única vez.');
    if (!value.days.some((d) => d.active)) bad('Ative pelo menos um dia de funcionamento.');
    for (const day of value.days) {
      if (minutes(day.start_time) >= minutes(day.end_time))
        bad('O fim do expediente deve ser depois do início.');
      const breaks = [...day.breaks].sort((a, b) => a.start_time.localeCompare(b.start_time));
      for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i];
        if (
          b.start_time >= b.end_time ||
          b.start_time <= day.start_time ||
          b.end_time >= day.end_time
        )
          bad('Cada intervalo deve ficar dentro do expediente e terminar depois de começar.');
        if (i > 0 && b.start_time < breaks[i - 1].end_time)
          bad('Os intervalos não podem se sobrepor.');
      }
    }
  });

/** @returns {Promise<import('./schedule-domain.js').Schedule>} */
export async function readSchedule(db, barberId) {
  const settings = await db.get(
    'SELECT agenda_mode,max_days_ahead,version FROM barber_settings WHERE barber_id=?',
    [barberId],
  );
  const hours = await db.all(
    'SELECT * FROM barber_working_hours WHERE barber_id=? ORDER BY weekday',
    [barberId],
  );
  const extras = await db.all(
    'SELECT * FROM barber_working_breaks WHERE barber_id=? ORDER BY position',
    [barberId],
  );
  const days = hours.length
    ? hours.map((h) => ({
        weekday: h.weekday,
        active: h.active === 1,
        start_time: h.start_time,
        end_time: h.end_time,
        breaks: [
          ...(h.break_start ? [{ start_time: h.break_start, end_time: h.break_end }] : []),
          ...extras
            .filter((b) => b.weekday === h.weekday)
            .map(({ start_time, end_time }) => ({ start_time, end_time })),
        ],
      }))
    : Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        active: weekday !== 0,
        start_time: clock(Number(process.env.OPEN_HOUR || 9) * 60),
        end_time: clock(Number(process.env.CLOSE_HOUR || 19) * 60),
        breaks: [],
      }));
  return {
    settings: settings || { agenda_mode: 'auto', max_days_ahead: 90, version: 0 },
    days,
    released_weeks: await db.all(
      'SELECT week_start,start_date,end_date FROM released_weeks WHERE barber_id=? AND week_start>=? ORDER BY week_start',
      [barberId, monday(dateInBrazil())],
    ),
  };
}

export function installScheduleRoutes(app, db, { authenticated, admin }) {
  const exists = async (tx, barberId) => {
    if (!(await tx.get('SELECT id FROM barbers WHERE id=? AND active=1', [barberId])))
      fail(404, 'Profissional não encontrado.');
  };
  app.get('/api/barbers/:id/schedule', async (req, res) => {
    const result = await db.transaction(async (tx) => {
      await lockSchedule(tx);
      await exists(tx, req.params.id);
      const schedule = await readSchedule(tx, req.params.id);
      const today = dateInBrazil();
      const dates =
        schedule.settings.agenda_mode === 'auto'
          ? automaticDates(schedule.days, today, schedule.settings.max_days_ahead)
          : Array.from({ length: 731 }, (_, i) => addDays(today, i)).filter(
              (date) => dateAccess(schedule, date, today).allowed,
            );
      return {
        mode: schedule.settings.agenda_mode,
        active_days: schedule.days.filter((d) => d.active).map((d) => d.weekday),
        dates,
        max_date:
          schedule.settings.agenda_mode === 'auto' ? dates.at(-1) || today : addDays(today, 730),
      };
    });
    res.json(result);
  });
  app.get('/api/admin/barbers/:id/schedule', authenticated, admin, async (req, res) => {
    const result = await db.transaction(async (tx) => {
      await lockSchedule(tx);
      await exists(tx, req.params.id);
      const schedule = await readSchedule(tx, req.params.id);
      return { ...schedule, next_week: nextWeek(schedule, dateInBrazil()) };
    });
    res.json(result);
  });
  app.put('/api/admin/barbers/:id/schedule', authenticated, admin, async (req, res) => {
    const data = settingsSchema.parse(req.body);
    const days = data.days.map((d) => ({
      ...d,
      breaks: [...d.breaks].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }));
    await db.transaction(async (tx) => {
      await lockSchedule(tx);
      await exists(tx, req.params.id);
      const current = await readSchedule(tx, req.params.id);
      if (current.settings.version !== data.version)
        fail(409, 'A agenda foi alterada em outra aba. Atualize as configurações antes de salvar.');
      const appointments = await tx.all(
        "SELECT date,start_minute,end_minute FROM appointments WHERE barber_id=? AND status='confirmed' AND date>=? ORDER BY date,start_minute",
        [req.params.id, dateInBrazil()],
      );
      const conflict = appointments.find(
        (a) =>
          isFuture(a.date, a.end_minute) &&
          !fitsWorkingDay(
            days.find((d) => d.weekday === weekday(a.date)),
            a.start_minute,
            a.end_minute,
          ),
      );
      if (conflict)
        fail(
          409,
          `Esta alteração afeta o agendamento de ${conflict.date.split('-').reverse().join('/')} às ${clock(conflict.start_minute)}. Remarque ou cancele esse atendimento antes de alterar o expediente.`,
        );
      await tx.run(
        `INSERT INTO barber_settings (company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?) ON CONFLICT(barber_id) DO UPDATE SET agenda_mode=excluded.agenda_mode,max_days_ahead=excluded.max_days_ahead,version=excluded.version`,
        [req.params.id, data.agenda_mode, data.max_days_ahead, data.version + 1],
      );
      await tx.run('DELETE FROM barber_working_breaks WHERE barber_id=?', [req.params.id]);
      await tx.run('DELETE FROM barber_working_hours WHERE barber_id=?', [req.params.id]);
      for (const day of days) {
        await tx.run(
          `INSERT INTO barber_working_hours (company_id,barber_id,weekday,active,start_time,end_time,break_start,break_end) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?,?,?)`,
          [
            req.params.id,
            day.weekday,
            day.active ? 1 : 0,
            day.start_time,
            day.end_time,
            day.breaks[0]?.start_time || null,
            day.breaks[0]?.end_time || null,
          ],
        );
        for (let i = 1; i < day.breaks.length; i++)
          await tx.run(
            `INSERT INTO barber_working_breaks (company_id,barber_id,weekday,position,start_time,end_time) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?)`,
            [req.params.id, day.weekday, i, day.breaks[i].start_time, day.breaks[i].end_time],
          );
      }
      // An opened calendar week follows the new active days; never reinsert an existing cycle.
      for (const released of current.released_weeks) {
        const period = weekPeriod(days, released.week_start);
        if (period)
          await tx.run(
            'UPDATE released_weeks SET start_date=?,end_date=? WHERE barber_id=? AND week_start=?',
            [period.start_date, period.end_date, req.params.id, released.week_start],
          );
      }
    });
    res.json({ ok: true });
  });
  app.post('/api/admin/barbers/:id/released-weeks', authenticated, admin, async (req, res) => {
    const data = z
      .object({ week_start: z.string().refine(validDate), version: z.number().int().nonnegative() })
      .strict()
      .parse(req.body);
    const period = await db.transaction(async (tx) => {
      await lockSchedule(tx);
      await exists(tx, req.params.id);
      const schedule = await readSchedule(tx, req.params.id);
      if (schedule.settings.agenda_mode !== 'manual')
        fail(409, 'Selecione e salve o modo manual antes de liberar uma semana.');
      const existing = schedule.released_weeks.find((w) => w.week_start === data.week_start);
      if (existing) return existing; // Retrying a completed request must not release the following week.
      const next = nextWeek(schedule, dateInBrazil());
      if (
        schedule.settings.version !== data.version ||
        !next ||
        next.week_start !== data.week_start
      )
        fail(409, 'O período disponível mudou. Atualize a agenda antes de liberar a semana.');
      await tx.run(
        `INSERT INTO released_weeks (company_id,barber_id,week_start,start_date,end_date,created_at) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?)`,
        [req.params.id, next.week_start, next.start_date, next.end_date, new Date().toISOString()],
      );
      await tx.run('UPDATE barber_settings SET version=version+1 WHERE barber_id=?', [
        req.params.id,
      ]);
      return next;
    });
    const url = new URL('/agendar', process.env.APP_URL || 'http://localhost:5173');
    url.searchParams.set('semana', period.start_date);
    url.searchParams.set('profissional', req.params.id);
    const format = (date) => date.split('-').reverse().join('/');
    const text = `Agenda aberta no Igor Barber Club! Reserve seu horário de ${format(period.start_date)} a ${format(period.end_date)}: ${url.href}`;
    res.json({
      ...period,
      url: url.href,
      text,
      whatsapp_url: `https://wa.me/?text=${encodeURIComponent(text)}`,
    });
  });
}
