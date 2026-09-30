import { IGOR_COMPANY_ID } from './company-bootstrap.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { addDays, dateInBrazil, weekday, isFuture } from './domain.js';
import { bootstrapIgorCompany } from './company-bootstrap.js';

export const demoMode =
  !process.env.VERCEL && process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== 'false';
export async function seed(db) {
  if (!(await db.get('SELECT id FROM barbers LIMIT 1'))) {
    await db.run(
      `INSERT INTO barbers (company_id,id,name,specialty) VALUES ('${IGOR_COMPANY_ID}',?,?,?)`,
      ['igor', 'Igor Borges', 'Especialista em cortes e degradês'],
    );
  }
  if (!(await db.get('SELECT id FROM services LIMIT 1'))) {
    const services = [
      [
        'corte',
        'Corte masculino',
        'Do clássico ao disfarçado. Um corte que combina com você.',
        40,
        3500,
        'Cabelo',
      ],
      [
        'barba',
        'Barba completa',
        'Desenho, acabamento e toalha quente. Cuidado em cada detalhe.',
        30,
        2500,
        'Barba',
      ],
      [
        'combo',
        'Corte + barba',
        'A experiência completa. Visual alinhado da cabeça à barba.',
        70,
        5500,
        'Combos',
      ],
      [
        'sobrancelha',
        'Sobrancelha',
        'Acabamento na navalha para valorizar sua expressão.',
        10,
        1000,
        'Acabamento',
      ],
      [
        'jaca',
        'Corte do Jaca',
        'Degradê marcante, textura e um acabamento de respeito.',
        50,
        4500,
        'Cabelo',
      ],
      [
        'platinado',
        'Platinado',
        'Transformação completa com descoloração e tonalização.',
        180,
        15000,
        'Coloração',
      ],
    ];
    for (const service of services)
      await db.run(
        `INSERT INTO services (company_id,id,name,description,duration,price,category) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?,?)`,
        service,
      );
  }
  const email = (process.env.ADMIN_EMAIL || 'admin@igorbarberclub.com.br').toLowerCase();
  // Environment credentials bootstrap the first admin only; profile edits must survive redeploys.
  if (!(await db.get("SELECT id FROM users WHERE role='admin' LIMIT 1"))) {
    const password = process.env.ADMIN_PASSWORD || (demoMode ? 'IgorDemo2026!' : null);
    if (password) {
      if (password.length < 12) {
        const error = new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
        error.code = 'SERVER_NOT_CONFIGURED';
        error.missing = ['ADMIN_PASSWORD'];
        throw error;
      }
      await db.run(
        'INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)',
        [
          randomUUID(),
          'Igor Borges',
          email,
          '21999990000',
          await bcrypt.hash(password, 12),
          'admin',
          new Date().toISOString(),
        ],
      );
    } else if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      const error = new Error('Defina ADMIN_PASSWORD para criar o primeiro administrador.');
      error.code = 'SERVER_NOT_CONFIGURED';
      error.missing = ['ADMIN_PASSWORD'];
      throw error;
    }
  }
  // Include a newly created legacy admin; repeated bootstrap preserves existing metadata.
  await bootstrapIgorCompany(db);
  if (!demoMode || (await db.get("SELECT id FROM users WHERE email='cliente@example.com'"))) return;
  const hash = await bcrypt.hash('ClienteDemo2026!', 12);
  const names = [
    'Lucas Silva',
    'Matheus Santos',
    'Gabriel Oliveira',
    'Pedro Costa',
    'Rafael Souza',
    'Bruno Almeida',
  ];
  const users = [];
  for (let i = 0; i < names.length; i++) {
    const id = randomUUID();
    users.push(id);
    await db.run(
      'INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)',
      [
        id,
        names[i],
        i === 0 ? 'cliente@example.com' : `cliente${i}@example.com`,
        `2199999000${i}`,
        hash,
        'client',
        new Date().toISOString(),
      ],
    );
  }
  const services = await db.all(
    "SELECT * FROM services WHERE id IN ('corte','barba','combo','jaca') ORDER BY id",
  );
  const today = dateInBrazil();
  await db.transaction(async (tx) => {
    for (let offset = -35; offset <= 5; offset++) {
      const date = addDays(today, offset);
      if (weekday(date) === 0) continue;
      for (let j = 0; j < 3 + (Math.abs(offset) % 3); j++) {
        const service = services[(j + Math.abs(offset)) % services.length];
        const start = 540 + j * 100;
        const id = randomUUID();
        await tx.run(
          `INSERT INTO appointments (company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?,?,?,?,?)`,
          [
            id,
            users[j % users.length],
            'igor',
            date,
            start,
            start + service.duration,
            service.price,
            isFuture(date, start) ? 'confirmed' : 'completed',
            new Date().toISOString(),
          ],
        );
        await tx.run(
          `INSERT INTO appointment_services (company_id,appointment_id,service_id,name,price,duration) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?)`,
          [id, service.id, service.name, service.price, service.duration],
        );
      }
    }
  });
}
