// Fictional demonstration, loaded ONLY by the disposable browser test server.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
export async function installMinisiteBrowser(db, hash) {
  const cid = 'minisite-browser',
    stamp = new Date().toISOString();
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('minisite-owner','Gestão Horizonte','minisite-owner@example.com','21999998888',?,'client',?)",
    [hash, stamp],
  );
  await db.run(
    "INSERT INTO companies(id,slug,name,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,'Barbearia Horizonte','barbershop','gradefy-minisite',1,?,?)",
    [cid, cid, stamp, stamp],
  );
  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: weekday !== 0,
    start_time: '09:00',
    end_time: '19:00',
    breaks: [{ start_time: '12:20', end_time: '14:00' }],
  }));
  await db.run(
    "INSERT INTO company_settings(company_id,logo_url,hero_image_url,slogan,whatsapp,instagram_url,address,city,region,working_days_json,updated_at) VALUES(?,'/images/minisite-demo-logo.svg','/images/shop.webp','Seu estilo, seu horário, sem complicação.','21987654321','https://www.instagram.com/barbeariahorizonte_demo/','Rua Exemplo, 123','Rio de Janeiro','RJ',?,?)",
    [cid, JSON.stringify(days), stamp],
  );
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'minisite-owner','owner',?)",
    [cid, stamp],
  );
  await db.run(
    "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,'individual','active','manual',?,?)",
    [cid, cid, stamp, stamp],
  );
  await db.run(
    "INSERT INTO company_onboarding(company_id,created_by,plan_id,status,current_step,completed_at,created_at,updated_at) VALUES(?,'minisite-owner','individual','completed','review',?,?,?)",
    [cid, stamp, stamp, stamp],
  );
  await db.run(
    "INSERT INTO services(id,company_id,name,description,duration,price,category) VALUES('minisite-service',?,'Corte personalizado','Acabamento e estilo',40,3500,'Corte')",
    [cid],
  );
  await db.run(
    "INSERT INTO barbers(id,company_id,name,specialty) VALUES('minisite-person',?,'Rafael Horizonte','Cortes e barba')",
    [cid],
  );
  await db.run(
    "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,'minisite-person','minisite-service',?)",
    [cid, stamp],
  );
  await db.run(
    "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,'minisite-person','auto',14,0)",
    [cid],
  );
  for (const d of days)
    await db.run(
      'INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time,break_start,break_end) VALUES(?,?,?,?,?,?,?,?)',
      [
        cid,
        'minisite-person',
        d.weekday,
        d.active ? 1 : 0,
        d.start_time,
        d.end_time,
        d.breaks[0].start_time,
        d.breaks[0].end_time,
      ],
    );
  for (const [i, file] of [
    'hero.webp',
    'classic.webp',
    'jaca.webp',
    'classic.png',
    'hero.png',
  ].entries()) {
    const image = (
      await sharp(await readFile(new URL('../../public/images/' + file, import.meta.url)))
        .resize({ width: 1100, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    ).toString('base64');
    await db.run(
      "INSERT INTO portfolio(id,company_id,title,category,image,version,created_at,sort_order) VALUES(?,?,?,'Ilustração',?,1,?,?)",
      ['mini-photo-' + i, cid, 'Fotografia ilustrativa ' + (i + 1), image, stamp, i],
    );
  }
}
