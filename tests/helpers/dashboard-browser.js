// Test server fixtures only. The application never imports or selects these data.
import { companyClock } from '../../server/dashboard.js';
import { addDays } from '../../server/domain.js';
export async function installDashboardBrowserFixture(db, passwordHash) {
  const now = new Date(),
    stamp = now.toISOString(),
    today = companyClock(now, 'America/Sao_Paulo').today;
  for (const [id, name] of [
    ['dashboard-owner', 'Marina Costa'],
    ['dashboard-manager', 'Gestora Marina'],
  ])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999998888',?,'client',?)",
      [id, name, id + '@example.com', passwordHash, stamp],
    );
  for (const [id, name, published] of [
    ['dashboard-horizonte', 'Barbearia Horizonte', 0],
    ['dashboard-boreal', 'Studio Boreal', 1],
    ['dashboard-vazio', 'Ateliê Vazio', 0],
  ]) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',?,?,?)",
      [id, name, id, published, stamp, stamp],
    );
    await db.run(
      "INSERT INTO company_settings(company_id,logo_url,updated_at) VALUES(?,'/images/barber-classic-icon.svg',?)",
      [id, stamp],
    );
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'dashboard-owner',?,?)",
      [id, id === 'dashboard-boreal' ? 'manager' : 'owner', stamp],
    );
  }
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('dashboard-horizonte','dashboard-manager','manager',?)",
    [stamp],
  );
  for (const cid of ['dashboard-horizonte', 'dashboard-boreal']) {
    await db.run(
      "INSERT INTO services(id,company_id,name,description,category,duration,price) VALUES(?,?,?,'','Corte',40,3000)",
      [cid + '-service', cid, 'Corte ' + (cid === 'dashboard-horizonte' ? 'Horizonte' : 'Boreal')],
    );
    await db.run("INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,?,'')", [
      cid + '-pro',
      cid,
      cid === 'dashboard-horizonte' ? 'Rafael Lima' : 'Profissional Boreal',
    ]);
  }
  for (const [id, cid, date, time, status, total, name] of [
    ['dash-browser-confirm', 'dashboard-horizonte', today, 540, 'confirmed', 3000, 'Ana Martins'],
    ['dash-browser-complete', 'dashboard-horizonte', today, 660, 'completed', 4500, 'Pedro Rocha'],
    [
      'dash-browser-cancel',
      'dashboard-horizonte',
      today,
      780,
      'cancelled',
      8000,
      'Reserva Cancelada',
    ],
    [
      'dash-browser-noshow',
      'dashboard-horizonte',
      today,
      900,
      'no-show',
      8000,
      'Ausência Registrada',
    ],
    [
      'dash-browser-future',
      'dashboard-horizonte',
      addDays(today, 1),
      600,
      'confirmed',
      3000,
      'Camila Santos',
    ],
    [
      'dash-browser-secret',
      'dashboard-boreal',
      today,
      600,
      'confirmed',
      90999,
      'Cliente Confidencial Boreal',
    ],
  ]) {
    await db.run(
      'INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id, cid, cid + '-pro', date, time, time + 40, total, status, name, stamp],
    );
    await db.run(
      'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,?,?,40)',
      [
        cid,
        id,
        cid + '-service',
        'Corte ' + (cid === 'dashboard-horizonte' ? 'Horizonte' : 'Boreal'),
        total,
      ],
    );
  }
  for (const [id, cid, plan, start, end] of [
    [
      'dashboard-trial',
      'dashboard-horizonte',
      'individual',
      new Date(now.getTime() - 86400000).toISOString(),
      new Date(now.getTime() + 36 * 3600000).toISOString(),
    ],
    ['dashboard-expired', 'dashboard-boreal', 'team', '2000-01-01', '2000-01-08'],
  ])
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,trial_started_at,trial_ends_at,created_at,updated_at) VALUES(?,?,?,'trialing','manual',?,?,?,?)",
      [id, cid, plan, start, end, stamp, stamp],
    );
}
