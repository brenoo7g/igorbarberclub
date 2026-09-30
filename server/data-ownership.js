import { IGOR_COMPANY_ID } from './company-bootstrap.js';

export const ownedTables = [
  'barbers',
  'services',
  'portfolio',
  'barber_settings',
  'barber_working_hours',
  'barber_working_breaks',
  'released_weeks',
  'appointments',
  'appointment_services',
  'guest_sessions',
  'guest_appointments',
  'blocks',
  'notifications',
];
const definitions = {
  barbers: { columns: ['id', 'name', 'specialty', 'active'] },
  services: { columns: ['id', 'name', 'description', 'duration', 'price', 'category', 'active'] },
  portfolio: { columns: ['id', 'title', 'category', 'image', 'version', 'created_at'] },
  barber_settings: { columns: ['barber_id', 'agenda_mode', 'max_days_ahead', 'version'] },
  barber_working_hours: {
    columns: [
      'barber_id',
      'weekday',
      'active',
      'start_time',
      'end_time',
      'break_start',
      'break_end',
    ],
  },
  barber_working_breaks: {
    columns: ['barber_id', 'weekday', 'position', 'start_time', 'end_time'],
  },
  released_weeks: { columns: ['barber_id', 'week_start', 'start_date', 'end_date', 'created_at'] },
  appointments: {
    columns: [
      'id',
      'user_id',
      'guest_name',
      'guest_email',
      'guest_phone',
      'barber_id',
      'date',
      'start_minute',
      'end_minute',
      'total',
      'status',
      'created_at',
    ],
  },
  appointment_services: { columns: ['appointment_id', 'service_id', 'name', 'price', 'duration'] },
  guest_sessions: {
    columns: ['id', 'token_hash', 'name', 'email', 'phone', 'created_at', 'expires_at'],
  },
  guest_appointments: { columns: ['appointment_id', 'visitor_id'] },
  blocks: { columns: ['id', 'barber_id', 'date', 'start_minute', 'end_minute', 'reason'] },
  notifications: {
    columns: [
      'id',
      'appointment_id',
      'channel',
      'event',
      'payload',
      'status',
      'attempts',
      'error',
      'created_at',
      'next_attempt_at',
    ],
  },
};
const relations = [
  ['barber_settings', ['barber_id'], 'barbers', ['id']],
  ['barber_working_hours', ['barber_id'], 'barbers', ['id']],
  [
    'barber_working_breaks',
    ['barber_id', 'weekday'],
    'barber_working_hours',
    ['barber_id', 'weekday'],
  ],
  ['released_weeks', ['barber_id'], 'barbers', ['id']],
  ['appointments', ['barber_id'], 'barbers', ['id']],
  ['appointment_services', ['appointment_id'], 'appointments', ['id']],
  ['appointment_services', ['service_id'], 'services', ['id']],
  ['guest_appointments', ['appointment_id'], 'appointments', ['id']],
  ['guest_appointments', ['visitor_id'], 'guest_sessions', ['id']],
  ['blocks', ['barber_id'], 'barbers', ['id']],
  ['notifications', ['appointment_id'], 'appointments', ['id']],
];

export async function prepareDataOwnership(tx) {
  const companies = await tx.all('SELECT id,slug FROM companies WHERE id=? OR slug=?', [
    IGOR_COMPANY_ID,
    IGOR_COMPANY_ID,
  ]);
  if (
    companies.length !== 1 ||
    companies[0].id !== IGOR_COMPANY_ID ||
    companies[0].slug !== IGOR_COMPANY_ID
  )
    throw new Error(
      'Gradefy 003: empresa Igor canônica ausente ou ambígua; migração cancelada sem criar empresa.',
    );
  const counts = {};
  const objects = [];
  for (const table of ownedTables) {
    counts[table] = Number((await tx.all(`SELECT COUNT(*) AS count FROM ${table}`))[0].count);
    if (tx.dialect === 'sqlite') {
      const columns = await tx.all(`PRAGMA table_info(${table})`);
      if (
        JSON.stringify(columns.map((c) => c.name).sort()) !==
        JSON.stringify([...definitions[table].columns].sort())
      )
        throw new Error(
          `Gradefy 003: schema inesperado em ${table}; nenhuma coluna será descartada.`,
        );
      if ((await tx.all(`PRAGMA foreign_key_check(${table})`)).length)
        throw new Error(`Gradefy 003: referências legadas inconsistentes em ${table}.`);
      for (const key of columns.filter((c) => c.pk))
        if (
          Number(
            (await tx.all(`SELECT COUNT(*) AS count FROM ${table} WHERE ${key.name} IS NULL`))[0]
              .count,
          )
        )
          throw new Error(`Gradefy 003: identificador nulo em ${table}.${key.name}.`);
      objects.push(
        ...(await tx.all(
          "SELECT sql FROM sqlite_schema WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
          [table],
        )),
      );
    }
  }
  for (const [table, columns, parent, keys] of relations) {
    const join = columns
      .map((column, index) => `child.${column}=parent.${keys[index]}`)
      .join(' AND ');
    const invalid = await tx.all(
      `SELECT COUNT(*) AS count FROM ${table} child LEFT JOIN ${parent} parent ON ${join} WHERE parent.${keys[0]} IS NULL`,
    );
    if (Number(invalid[0].count))
      throw new Error(`Gradefy 003: relação inconsistente ${table} → ${parent}.`);
  }
  return { counts, objects };
}

export async function finishDataOwnership(tx, state) {
  for (const { sql } of state.objects) await tx.run(sql);
  for (const table of ownedTables) {
    const row = (await tx.all(`SELECT COUNT(*) AS count FROM ${table}`))[0];
    const invalid = (
      await tx.all(
        `SELECT COUNT(*) AS count FROM ${table} WHERE company_id IS NULL OR company_id<>?`,
        [IGOR_COMPANY_ID],
      )
    )[0];
    if (Number(row.count) !== state.counts[table] || Number(invalid.count))
      throw new Error(`Gradefy 003: backfill inválido em ${table}; transação revertida.`);
    if (tx.dialect === 'sqlite' && (await tx.all(`PRAGMA foreign_key_check(${table})`)).length)
      throw new Error(`Gradefy 003: integridade relacional inválida em ${table}.`);
  }
}
