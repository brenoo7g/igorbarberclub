import { agendaDate } from './agenda.js';
import { addDays, dateInTimezone, weekday } from './domain.js';
import { currentTime, domainError } from './entitlements.js';
import { monday } from './schedule-domain.js';

// A single company-scoped read replaces one schedule request per professional.
export function installTeamOverview(app, db, companyId, authorize) {
  app.get('/admin/team/weekly', async (req, res) => {
    const result = await db.transaction(
      async (tx) => {
        await authorize(tx, req, false);
        const company = await tx.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
        const today = dateInTimezone(await currentTime(tx), company.timezone);
        const from = agendaDate.parse(req.query.week || monday(today));
        if (from !== monday(from) || from < addDays(today, -366) || from > addDays(today, 366))
          domainError(400, 'INVALID_TEAM_WEEK', 'Selecione uma semana válida.');
        const to = addDays(from, 6);
        const rows = await tx.all(
          'SELECT id,name,active FROM barbers WHERE company_id=? ORDER BY name,id LIMIT 201',
          [companyId],
        );
        const people = rows.slice(0, 200);
        const ids = people.map((person) => person.id);
        const scope = ids.map(() => '?').join(',');
        const [hours, extraBreaks, blocks, settings, releases] = ids.length
          ? await Promise.all([
              tx.all(
                `SELECT barber_id,weekday,active,start_time,end_time,break_start,break_end FROM barber_working_hours WHERE company_id=? AND barber_id IN (${scope}) ORDER BY barber_id,weekday`,
                [companyId, ...ids],
              ),
              tx.all(
                `SELECT barber_id,weekday,start_time,end_time FROM barber_working_breaks WHERE company_id=? AND barber_id IN (${scope}) ORDER BY barber_id,weekday,position`,
                [companyId, ...ids],
              ),
              tx.all(
                `SELECT barber_id,date,start_minute,end_minute FROM blocks WHERE company_id=? AND barber_id IN (${scope}) AND date>=? AND date<=? ORDER BY date,start_minute`,
                [companyId, ...ids, from, to],
              ),
              tx.all(
                `SELECT barber_id,agenda_mode FROM barber_settings WHERE company_id=? AND barber_id IN (${scope})`,
                [companyId, ...ids],
              ),
              tx.all(
                `SELECT barber_id,start_date,end_date FROM released_weeks WHERE company_id=? AND barber_id IN (${scope}) AND week_start=?`,
                [companyId, ...ids, from],
              ),
            ])
          : [[], [], [], [], []];
        const dates = Array.from({ length: 7 }, (_, index) => addDays(from, index));
        return {
          from,
          to,
          today,
          timezone: company.timezone,
          truncated: rows.length > 200,
          people: people.map((person) => ({
            ...person,
            agendaMode: settings.find((row) => row.barber_id === person.id)?.agenda_mode || 'auto',
            days: dates.map((date) => {
              const day = hours.find(
                (row) => row.barber_id === person.id && Number(row.weekday) === weekday(date),
              );
              return {
                date,
                configured: Boolean(day),
                active: Boolean(day?.active),
                released:
                  (settings.find((row) => row.barber_id === person.id)?.agenda_mode || 'auto') !==
                    'manual' ||
                  releases.some(
                    (row) =>
                      row.barber_id === person.id && date >= row.start_date && date <= row.end_date,
                  ),
                start: day?.start_time || null,
                end: day?.end_time || null,
                breaks: day
                  ? [
                      ...(day.break_start ? [{ start: day.break_start, end: day.break_end }] : []),
                      ...extraBreaks
                        .filter(
                          (row) =>
                            row.barber_id === person.id && Number(row.weekday) === weekday(date),
                        )
                        .map((row) => ({ start: row.start_time, end: row.end_time })),
                    ]
                  : [],
                blocks: blocks
                  .filter((row) => row.barber_id === person.id && row.date === date)
                  .map((row) => ({
                    startMinute: Number(row.start_minute),
                    endMinute: Number(row.end_minute),
                  })),
              };
            }),
          })),
        };
      },
      { readOnly: true },
    );
    res.json(result);
  });
}
