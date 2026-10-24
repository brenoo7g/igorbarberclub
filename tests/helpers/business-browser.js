// Disposable fixtures only; the application never loads this module.
import { addDays, dateInBrazil } from '../../server/domain.js';
export async function installBusinessBrowserFixture(db, passwordHash) {
  const stamp = new Date().toISOString(),
    today = dateInBrazil();
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('business-browser-owner','Gestão de Cadastros','business-browser-owner@example.com','21999998888',?,'client',?)",
    [passwordHash, stamp],
  );
  for (const [cid, plan] of [
    ['business-browser-team', 'team'],
    ['business-browser-one', 'individual'],
  ]) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,? ,?,'barbershop','barber-classic',1,?,?)",
      [cid, plan === 'team' ? 'Clube Horizonte' : 'Studio Individual', cid, stamp, stamp],
    );
    await db.run(
      "INSERT INTO company_settings(company_id,description,city,region,phone,updated_at) VALUES(?,'Cuidado e estilo em cada detalhe.','Rio de Janeiro','RJ','21999998888',?)",
      [cid, stamp],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,?,'active','manual',?,?)",
      [cid + '-sub', cid, plan, stamp, stamp],
    );
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'business-browser-owner','owner',?)",
      [cid, stamp],
    );
    await db.run(
      "INSERT INTO services(id,company_id,name,description,category,duration,price) VALUES(?,?,'Corte clássico','Acabamento preciso e um visual renovado.','Cabelo',40,4500)",
      [cid + '-service', cid],
    );
    await db.run(
      "INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,'Rafael Silva','Cortes e acabamento')",
      [cid + '-pro', cid],
    );
    await db.run(
      'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
      [cid, cid + '-pro', cid + '-service', stamp],
    );
    for (let day = 0; day < 7; day++) {
      await db.run(
        "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','18:00')",
        [cid, cid + '-pro', day],
      );
      await db.run(
        "INSERT INTO barber_working_breaks(company_id,barber_id,weekday,position,start_time,end_time) VALUES(?,?,?,0,'12:20','14:00')",
        [cid, cid + '-pro', day],
      );
    }
  }
  for (const [id, offset, status, name, phone, email] of [
    [
      'business-browser-completed',
      -2,
      'completed',
      'Ana Martins',
      '21988887777',
      'ana-browser@example.com',
    ],
    [
      'business-browser-cancelled',
      -1,
      'cancelled',
      'Bruna Martins',
      '21988886666',
      'bruna-browser@example.com',
    ],
  ]) {
    const cid = 'business-browser-team';
    await db.run(
      'INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_phone,guest_email,created_at) VALUES(?,?,?, ?,540,580,4500,?,?,?, ?,?)',
      [id, cid, cid + '-pro', addDays(today, offset), status, name, phone, email, stamp],
    );
    await db.run(
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Corte clássico',4500,40)",
      [cid, id, cid + '-service'],
    );
  }
}
