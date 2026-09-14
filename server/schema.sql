CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL, password_hash TEXT NOT NULL, avatar TEXT,
  profile_version INTEGER NOT NULL DEFAULT 0, session_version INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','admin')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS barbers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
  image TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_migrations (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  duration INTEGER NOT NULL CHECK(duration > 0), price INTEGER NOT NULL CHECK(price >= 0),
  category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS barber_settings (
  barber_id TEXT PRIMARY KEY REFERENCES barbers(id),
  agenda_mode TEXT NOT NULL DEFAULT 'auto' CHECK(agenda_mode IN ('auto','manual')),
  max_days_ahead INTEGER NOT NULL DEFAULT 90 CHECK(max_days_ahead BETWEEN 1 AND 90),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS barber_working_hours (
  barber_id TEXT NOT NULL REFERENCES barbers(id), weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  active INTEGER NOT NULL CHECK(active IN (0,1)), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  break_start TEXT, break_end TEXT, PRIMARY KEY(barber_id,weekday)
);
CREATE TABLE IF NOT EXISTS barber_working_breaks (
  barber_id TEXT NOT NULL, weekday INTEGER NOT NULL, position INTEGER NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  PRIMARY KEY(barber_id,weekday,position),
  FOREIGN KEY(barber_id,weekday) REFERENCES barber_working_hours(barber_id,weekday)
);
CREATE TABLE IF NOT EXISTS released_weeks (
  barber_id TEXT NOT NULL REFERENCES barbers(id), week_start TEXT NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(barber_id,week_start), CHECK(start_date <= end_date)
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id),
  guest_name TEXT, guest_email TEXT, guest_phone TEXT,
  barber_id TEXT NOT NULL REFERENCES barbers(id), date TEXT NOT NULL,
  start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
  total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(status IN ('confirmed','completed','cancelled','no-show')),
  created_at TEXT NOT NULL, CHECK(end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS appointments_schedule ON appointments(barber_id,date,start_minute,end_minute);
CREATE INDEX IF NOT EXISTS appointments_user ON appointments(user_id,date);
CREATE TABLE IF NOT EXISTS appointment_services (
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  service_id TEXT NOT NULL REFERENCES services(id), name TEXT NOT NULL,
  price INTEGER NOT NULL, duration INTEGER NOT NULL,
  PRIMARY KEY(appointment_id,service_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY, barber_id TEXT NOT NULL REFERENCES barbers(id),
  date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
  reason TEXT NOT NULL, CHECK(end_minute > start_minute)
);
CREATE TABLE IF NOT EXISTS password_recovery (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL,
  session_version INTEGER NOT NULL, token_hash TEXT UNIQUE,
  event TEXT NOT NULL CHECK(event IN ('reset','changed')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, next_attempt_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS password_recovery_queue ON password_recovery(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS password_recovery_limits (
  bucket_key TEXT PRIMARY KEY, window_start TEXT NOT NULL, last_attempt_at TEXT NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL REFERENCES appointments(id),
  channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')), event TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT, created_at TEXT NOT NULL, next_attempt_at TEXT NOT NULL
);
