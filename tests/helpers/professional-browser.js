import { dateInBrazil, addDays } from '../../server/domain.js';
// Isolated companies: never change the earlier browser fixtures' counts or relationships.
export async function installProfessionalBrowserFixture(db, hash) {
  const stamp = new Date().toISOString(),
    today = dateInBrazil();
  for (const [id, name] of [
    ['owner', 'Gestão da Equipe'],
    ['primary', 'Profissional Um'],
    ['second', 'Profissional Dois'],
    ['pending', 'Conta Sem Vínculo'],
    ['outsider', 'Outra Conta'],
  ])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999998888',?,'client',?)",
      ['staff-browser-' + id, name, 'staff-browser-' + id + '@example.com', hash, stamp],
    );
  for (const suffix of ['a', 'b', 'individual']) {
    const cid = 'staff-browser-' + suffix;
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',?,?)",
      [
        cid,
        cid,
        suffix === 'a'
          ? 'Equipe de Atendimento'
          : suffix === 'b'
            ? 'Outra Empresa'
            : 'Estúdio Individual',
        stamp,
        stamp,
      ],
    );
    await db.run('INSERT INTO company_settings(company_id,updated_at) VALUES(?,?)', [cid, stamp]);
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'staff-browser-owner','owner',?)",
      [cid, stamp],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,?,'active','manual',?,?)",
      [cid, cid, suffix === 'individual' ? 'individual' : 'team', stamp, stamp],
    );
    await db.run(
      "INSERT INTO services(id,company_id,name,duration,price,category,description) VALUES(?,?,'Corte Habilitado',40,4500,'Corte','')",
      [cid + '-service', cid],
    );
    for (const p of suffix === 'a' ? ['p1', 'p2'] : ['p1']) {
      const pid = cid + '-' + p;
      await db.run(
        "INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,?,'Atendimento')",
        [pid, cid, p === 'p1' ? 'João Profissional' : 'Maria Profissional'],
      );
      await db.run(
        'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
        [cid, pid, cid + '-service', stamp],
      );
      for (let day = 0; day < 7; day++)
        await db.run(
          "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time,break_start,break_end) VALUES(?,?,?,1,'09:00','18:00','12:20','14:00')",
          [cid, pid, day],
        );
    }
  }
  for (const [cid, user, role] of [
    ['a', 'primary', 'professional'],
    ['a', 'second', 'professional'],
    ['a', 'pending', 'professional'],
    ['b', 'primary', 'manager'],
    ['individual', 'primary', 'owner'],
  ])
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      ['staff-browser-' + cid, 'staff-browser-' + user, role, stamp],
    );
  for (const [user, professional] of [
    ['primary', 'p1'],
    ['second', 'p2'],
  ])
    await db.run(
      "INSERT INTO professional_users(company_id,user_id,barber_id,created_at) VALUES('staff-browser-a',?,?,?)",
      ['staff-browser-' + user, 'staff-browser-a-' + professional, stamp],
    );
  for (const [id, cid, p, date, time, status, name] of [
    ['staff-browser-today', 'a', 'p2', today, 540, 'confirmed', 'Cliente da Minha Agenda'],
    [
      'staff-browser-complete',
      'a',
      'p2',
      addDays(today, -1),
      660,
      'confirmed',
      'Cliente Meu Atendimento',
    ],
    [
      'staff-browser-next',
      'a',
      'p2',
      addDays(today, 1),
      660,
      'confirmed',
      'Cliente Próximo Próprio',
    ],
    ['staff-browser-other', 'a', 'p1', today, 900, 'confirmed', 'Cliente Exclusivo de Outro'],
    ['staff-browser-secret', 'b', 'p1', today, 900, 'confirmed', 'Cliente da Outra Empresa'],
  ]) {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_email,guest_phone,notes,created_at) VALUES(?,?,?,?,?,?,4500,?,?,'PRIVATE-EMAIL@example.com','21999998888','PRIVATE-ADMIN-NOTE',?)",
      [
        id,
        'staff-browser-' + cid,
        'staff-browser-' + cid + '-' + p,
        date,
        time,
        time + 40,
        status,
        name,
        stamp,
      ],
    );
    await db.run(
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Corte Snapshot Próprio',4500,40)",
      ['staff-browser-' + cid, id, 'staff-browser-' + cid + '-service'],
    );
  }
}
