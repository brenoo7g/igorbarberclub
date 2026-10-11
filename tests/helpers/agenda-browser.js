// Disposable browser fixtures only; never loaded by the application server.
import { addDays, dateInBrazil } from '../../server/domain.js';
export async function installAgendaBrowserFixture(db, passwordHash) {
  const stamp = new Date().toISOString(),
    today = dateInBrazil();
  for (const role of ['owner', 'professional']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999998888',?,'client',?)",
      [
        'agenda-browser-' + role,
        'Gestão Agenda',
        'agenda-browser-' + role + '@example.com',
        passwordHash,
        stamp,
      ],
    );
  }
  for (const suffix of ['a', 'b']) {
    const cid = 'agenda-browser-' + suffix;
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',0,?,?)",
      [cid, suffix === 'a' ? 'Clube Agenda' : 'Agenda Reservada', cid, stamp, stamp],
    );
    await db.run('INSERT INTO company_settings(company_id,updated_at) VALUES(?,?)', [cid, stamp]);
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'agenda-browser-owner','owner',?)",
      [cid, stamp],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,'team','active','manual',?,?)",
      [cid + '-sub', cid, stamp, stamp],
    );
    await db.run(
      "INSERT INTO services(id,company_id,name,description,category,duration,price) VALUES(?,?,'Corte Agenda','','Corte',40,4500)",
      [cid + '-service', cid],
    );
    for (const p of ['p1', 'p2']) {
      const id = cid + '-' + p;
      await db.run("INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,?,'')", [
        id,
        cid,
        p === 'p1' ? 'Rafael Agenda' : 'Bruno Agenda',
      ]);
      await db.run(
        'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
        [cid, id, cid + '-service', stamp],
      );
      for (let day = 0; day < 7; day++) {
        await db.run(
          "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','18:00')",
          [cid, id, day],
        );
        await db.run(
          "INSERT INTO barber_working_breaks(company_id,barber_id,weekday,position,start_time,end_time) VALUES(?,?,?,0,'12:20','14:00')",
          [cid, id, day],
        );
      }
    }
  }
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('agenda-browser-a','agenda-browser-professional','professional',?)",
    [stamp],
  );
  for (const [id, cid, date, time, status, name] of [
    [
      'agenda-browser-past',
      'agenda-browser-a',
      addDays(today, -1),
      540,
      'confirmed',
      'Cliente Conclusão',
    ],
    [
      'agenda-browser-next',
      'agenda-browser-a',
      addDays(today, 1),
      540,
      'confirmed',
      'Cliente Retorno',
    ],
    ['agenda-browser-secret', 'agenda-browser-b', today, 540, 'confirmed', 'Cliente Privado B'],
    ['agenda-browser-cancel', 'agenda-browser-a', today, 540, 'cancelled', 'Cliente Cancelado'],
    ['agenda-browser-noshow', 'agenda-browser-a', today, 600, 'no-show', 'Cliente Ausente'],
  ]) {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_email,guest_phone,notes,created_at) VALUES(?,?,?,?,?,?,4500,?,?,?,'21999998888','Observação da reserva',?)",
      [id, cid, cid + '-p1', date, time, time + 40, status, name, 'fixture@example.com', stamp],
    );
    await db.run(
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Corte Agenda',4500,40)",
      [cid, id, cid + '-service'],
    );
  }
}
