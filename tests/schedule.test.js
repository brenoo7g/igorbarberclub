import { IGOR_COMPANY_ID } from '../server/company-bootstrap.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { availableSlots, addDays, dateInBrazil, isFuture, weekday } from '../server/domain.js';
import {
  automaticDates,
  CLOSED_WEEK,
  dateAccess,
  fitsWorkingDay,
  minutes,
  monday,
  nextWeek,
  validDate,
  weekPeriod,
} from '../server/schedule-domain.js';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';

const days = () =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: weekday >= 2 && weekday <= 6,
    start_time: '09:00',
    end_time: '19:00',
    breaks: [{ start_time: '12:20', end_time: '14:00' }],
  }));
const schedule = () => ({
  settings: { agenda_mode: 'manual', max_days_ahead: 5, version: 0 },
  days: days(),
  released_weeks: [],
});

test('schedule boundaries: lunch, closing, multiple breaks, Sundays and duration invariants', () => {
  const day = days()[2];
  const now = new Date('2026-01-01T12:00:00Z');
  const slots = availableSlots({ date: '2026-09-15', duration: 40, workingDay: day, now });
  assert.deepEqual(slots.slice(0, 6), ['09:00', '09:40', '10:20', '11:00', '11:40', '14:00']);
  assert.ok(!slots.includes('12:00'));
  assert.equal(slots.at(-1), '18:00');
  assert.ok(!fitsWorkingDay(day, minutes('12:00'), minutes('12:40')));
  assert.ok(fitsWorkingDay(day, minutes('11:40'), minutes('12:20')));
  assert.ok(fitsWorkingDay(day, minutes('14:00'), minutes('14:40')));
  const occupied = [
    { start_minute: 550, end_minute: 590 },
    { start_minute: 905, end_minute: 965 },
  ];
  for (let duration = 1; duration <= 480; duration++) {
    const workingDay = {
      ...day,
      breaks: [...day.breaks, { start_time: '16:10', end_time: '16:25' }],
    };
    const result = availableSlots({ date: '2026-09-15', duration, workingDay, occupied, now });
    assert.equal(new Set(result).size, result.length);
    let previousEnd = 0;
    for (const time of result) {
      const start = minutes(time),
        end = start + duration;
      assert.ok(fitsWorkingDay(workingDay, start, end), `${duration}min at ${time}`);
      assert.ok(start >= previousEnd);
      assert.ok(!occupied.some((b) => start < b.end_minute && end > b.start_minute));
      previousEnd = end;
    }
  }
  assert.deepEqual(
    availableSlots({ date: '2026-09-14', duration: 40, workingDay: days()[1], now }),
    [],
  );
  assert.ok(
    availableSlots({ date: '2026-09-13', duration: 40, workingDay: { ...day, weekday: 0 }, now })
      .length > 0,
  );
});

test('weekly cycles and rolling windows use configured working days and Brazil dates', () => {
  assert.equal(dateInBrazil(new Date('2027-01-01T02:59:59Z')), '2026-12-31');
  assert.equal(dateInBrazil(new Date('2027-01-01T03:00:00Z')), '2027-01-01');
  assert.equal(isFuture('2026-09-15', 540, new Date('2026-09-15T11:59:59Z')), true);
  assert.equal(isFuture('2026-09-15', 540, new Date('2026-09-15T12:00:00Z')), false);
  assert.equal(monday('2027-01-01'), '2026-12-28');
  assert.deepEqual(automaticDates(days(), '2026-09-12', 3), [
    '2026-09-12',
    '2026-09-15',
    '2026-09-16',
  ]);
  assert.deepEqual(automaticDates(days(), '2026-09-13', 2), ['2026-09-15', '2026-09-16']);
  assert.deepEqual(
    automaticDates(
      days().map((d) => ({ ...d, active: false })),
      '2026-09-13',
      2,
    ),
    [],
  );
  const state = schedule();
  assert.deepEqual(nextWeek(state, '2026-09-14'), {
    week_start: '2026-09-14',
    start_date: '2026-09-15',
    end_date: '2026-09-19',
  });
  assert.equal(nextWeek(state, '2026-09-20').start_date, '2026-09-22');
  assert.equal(dateAccess(state, '2026-09-15', '2026-09-14').message, CLOSED_WEEK);
  state.released_weeks.push(nextWeek(state, '2026-09-14'));
  assert.equal(dateAccess(state, '2026-09-15', '2026-09-14').allowed, true);
  assert.equal(dateAccess(state, '2026-09-14', '2026-09-14').allowed, false);
  assert.equal(nextWeek(state, '2026-09-14').start_date, '2026-09-22');
  assert.deepEqual(
    weekPeriod(
      days().map((d) => ({ ...d, active: d.weekday === 0 })),
      '2026-09-14',
    ),
    { week_start: '2026-09-14', start_date: '2026-09-20', end_date: '2026-09-20' },
  );
  state.settings.agenda_mode = 'auto';
  state.settings.max_days_ahead = 2;
  assert.equal(dateAccess(state, '2026-09-16', '2026-09-14').allowed, true);
  assert.equal(dateAccess(state, '2026-09-17', '2026-09-14').reason, 'window');
  for (const invalid of ['2026-02-30', 'garbage', '2026-13-01', '2026-09-15T00:00:00Z', '2026-9-1'])
    assert.equal(validDate(invalid), false);
  assert.equal(validDate('2028-02-29'), true);
});

test('schedule API: permission, atomic changes, release idempotency and competing reservations/settings/blocks', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  await db.run(
    `INSERT INTO barbers (company_id,id,name,specialty) VALUES ('${IGOR_COMPANY_ID}',?,?,?)`,
    ['schedule-test', 'Agenda QA', 'Teste'],
  );
  const server = createApp(db, { test: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', body, cookie, extraHeaders = {}) {
    const r = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...extraHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const admin = (
    await request('/auth/login', 'POST', {
      email: 'admin@igorbarberclub.com.br',
      password: 'IgorDemo2026!',
    })
  ).cookie;
  const client = (
    await request('/auth/login', 'POST', {
      email: 'cliente@example.com',
      password: 'ClienteDemo2026!',
    })
  ).cookie;
  const route = '/admin/barbers/schedule-test/schedule';
  assert.equal((await request(route)).status, 401);
  assert.equal((await request(route, 'PUT', {}, client)).status, 403);
  assert.equal(
    (await request(route, 'PUT', {}, admin, { Origin: 'https://untrusted.example' })).status,
    403,
  );
  const initial = (await request(route, 'GET', undefined, admin)).data;
  assert.equal(initial.settings.agenda_mode, 'auto');
  const base = { agenda_mode: 'manual', max_days_ahead: 5, version: 0, days: days() };
  for (const invalid of [
    { ...base, days: base.days.slice(1) },
    { ...base, days: base.days.map((d) => ({ ...d, active: false })) },
    {
      ...base,
      days: base.days.map((d) => ({
        ...d,
        breaks: [
          { start_time: '12:20', end_time: '14:00' },
          { start_time: '13:30', end_time: '15:00' },
        ],
      })),
    },
    { ...base, max_days_ahead: 0 },
    { ...base, days: base.days.map((d) => ({ ...d, end_time: '08:00' })) },
  ]) {
    assert.equal((await request(route, 'PUT', invalid, admin)).status, 400);
    assert.equal((await request(route, 'GET', undefined, admin)).data.settings.version, 0);
  }
  const saves = await Promise.all([
    request(route, 'PUT', base, admin),
    request(route, 'PUT', base, admin),
  ]);
  assert.deepEqual(saves.map((s) => s.status).sort(), [200, 409]);
  let state = (await request(route, 'GET', undefined, admin)).data;
  const next = state.next_week;
  const availability = (date, services = 'corte') =>
    request(`/availability?barberId=schedule-test&date=${date}&services=${services}`);
  const future = next.start_date >= dateInBrazil() ? next.start_date : addDays(next.week_start, 8);
  assert.equal((await availability(future)).data.message, CLOSED_WEEK);
  const guest = { name: 'Cliente Agenda', email: 'agenda@example.com', phone: '21999998888' };
  const booking = (date, time = '11:40') => ({
    barberId: 'schedule-test',
    date,
    time,
    services: ['corte'],
    guest,
  });
  assert.equal((await request('/appointments/guest', 'POST', booking(future))).status, 409);
  const releaseRoute = '/admin/barbers/schedule-test/released-weeks';
  const payload = { version: state.settings.version, week_start: next.week_start };
  const releases = await Promise.all([
    request(releaseRoute, 'POST', payload, admin),
    request(releaseRoute, 'POST', payload, admin),
  ]);
  assert.deepEqual(
    releases.map((r) => r.status),
    [200, 200],
  );
  assert.equal(releases[0].data.url, releases[1].data.url);
  assert.equal(
    (await db.get('SELECT COUNT(*) AS n FROM released_weeks WHERE barber_id=?', ['schedule-test']))
      .n,
    1,
  );
  const link = new URL(releases[0].data.url);
  assert.equal(link.searchParams.get('semana'), next.start_date);
  assert.equal(link.searchParams.get('profissional'), 'schedule-test');
  assert.equal(
    new URL(releases[0].data.whatsapp_url).searchParams.get('text'),
    releases[0].data.text,
  );
  // Release a wholly future week to make boundary assertions independent of today's time.
  state = (await request(route, 'GET', undefined, admin)).data;
  const released = (
    await request(
      releaseRoute,
      'POST',
      { week_start: state.next_week.week_start, version: state.settings.version },
      admin,
    )
  ).data;
  const date = released.start_date;
  const slots = (await availability(date)).data.slots;
  assert.ok(slots.includes('11:40'));
  assert.ok(slots.includes('14:00'));
  assert.ok(!slots.includes('12:00'));
  assert.equal((await request('/appointments/guest', 'POST', booking(date, '12:00'))).status, 409);
  const longSlots = (await availability(date, 'combo')).data.slots;
  assert.ok(
    longSlots.every((time) =>
      fitsWorkingDay(days()[weekday(date)], minutes(time), minutes(time) + 70),
    ),
  );
  const reservations = await Promise.all([
    request('/appointments/guest', 'POST', booking(date)),
    request('/appointments', 'POST', booking(date), client),
  ]);
  assert.deepEqual(reservations.map((r) => r.status).sort(), [201, 409]);
  const booked = reservations.find((r) => r.status === 201).data;
  state = (await request(route, 'GET', undefined, admin)).data;
  const changed = {
    ...state.settings,
    days: state.days.map((d) => ({ ...d, breaks: [{ start_time: '11:50', end_time: '14:00' }] })),
  };
  assert.equal((await request(route, 'PUT', changed, admin)).status, 409);
  assert.equal(
    (await request(route, 'GET', undefined, admin)).data.settings.version,
    state.settings.version,
  );
  assert.equal(
    (
      await request(
        '/admin/blocks',
        'POST',
        { barberId: 'schedule-test', date, start: '11:40', end: '12:20', reason: 'Conflito' },
        admin,
      )
    ).status,
    409,
  );
  // Attempt a reschedule into lunch; original reservation and service snapshots survive.
  const original = (
    await request('/appointments', 'POST', { ...booking(date, '09:00'), guest: undefined }, client)
  ).data;
  assert.equal(
    (
      await request(
        `/appointments/${original.id}/reschedule`,
        'PATCH',
        booking(date, '12:00'),
        client,
      )
    ).status,
    409,
  );
  assert.equal(
    (await db.get('SELECT start_minute FROM appointments WHERE id=?', [original.id])).start_minute,
    540,
  );
  await request(
    `/admin/appointments/${original.id}/status`,
    'PATCH',
    { status: 'cancelled' },
    admin,
  );
  await request(`/admin/appointments/${booked.id}/status`, 'PATCH', { status: 'cancelled' }, admin);
  // Either the new lunch saves first or the booking does. Never both incompatible changes.
  const race = await Promise.all([
    request(route, 'PUT', changed, admin),
    request('/appointments/guest', 'POST', booking(date)),
  ]);
  assert.equal(race.filter((r) => r.status < 300).length, 1);
  assert.ok(race.some((r) => r.status === 409));
  if (race[1].status === 201)
    await request(
      `/admin/appointments/${race[1].data.id}/status`,
      'PATCH',
      { status: 'cancelled' },
      admin,
    );
  const blockRace = await Promise.all([
    request(
      '/admin/blocks',
      'POST',
      { barberId: 'schedule-test', date, start: '14:00', end: '14:40', reason: 'Concorrência' },
      admin,
    ),
    request('/appointments/guest', 'POST', booking(date, '14:00')),
  ]);
  assert.deepEqual(blockRace.map((r) => r.status).sort(), [201, 409]);
  if (blockRace[0].status === 201)
    await request(`/admin/blocks/${blockRace[0].data.id}`, 'DELETE', undefined, admin);
  if (blockRace[1].status === 201)
    await request(
      `/admin/appointments/${blockRace[1].data.id}/status`,
      'PATCH',
      { status: 'cancelled' },
      admin,
    );
  state = (await request(route, 'GET', undefined, admin)).data;
  const sundays = state.days.map((d) => ({ ...d, active: d.weekday === 0, breaks: [] }));
  assert.equal(
    (
      await request(
        route,
        'PUT',
        { ...state.settings, agenda_mode: 'auto', max_days_ahead: 2, days: sundays },
        admin,
      )
    ).status,
    200,
  );
  const publicSchedule = (await request('/barbers/schedule-test/schedule')).data;
  assert.equal(publicSchedule.dates.length, 2);
  assert.ok(publicSchedule.dates.every((date) => weekday(date) === 0));
  assert.equal((await availability(addDays(publicSchedule.dates[1], 7))).data.reason, 'window');
  assert.equal(
    (
      await request(
        '/admin/blocks',
        'POST',
        {
          barberId: 'schedule-test',
          date: publicSchedule.dates[1],
          start: '09:00',
          end: '10:00',
          reason: 'Folga parcial',
        },
        admin,
      )
    ).status,
    201,
  );
  assert.equal((await request('/barbers/igor/schedule')).data.active_days.includes(1), true);
});
