-- dialect: postgres
ALTER TABLE barbers ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE services ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE portfolio ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_settings ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_hours ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_breaks ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE released_weeks ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointments ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointment_services ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_sessions ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_appointments ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE blocks ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE notifications ADD COLUMN company_id TEXT;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE barbers SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE services SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE portfolio SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE barber_settings SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE barber_working_hours SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE barber_working_breaks SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE released_weeks SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE appointments SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE appointment_services SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE guest_sessions SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE guest_appointments SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE blocks SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
-- igor-backfill
UPDATE notifications SET company_id=?;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barbers ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barbers ADD CONSTRAINT barbers_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE services ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE services ADD CONSTRAINT services_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE portfolio ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE portfolio ADD CONSTRAINT portfolio_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_settings ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_settings ADD CONSTRAINT barber_settings_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_hours ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_hours ADD CONSTRAINT barber_working_hours_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_breaks ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_breaks ADD CONSTRAINT barber_working_breaks_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE released_weeks ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE released_weeks ADD CONSTRAINT released_weeks_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointments ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointments ADD CONSTRAINT appointments_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointment_services ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointment_services ADD CONSTRAINT appointment_services_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_sessions ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_sessions ADD CONSTRAINT guest_sessions_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_appointments ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_appointments ADD CONSTRAINT guest_appointments_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE blocks ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE blocks ADD CONSTRAINT blocks_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE notifications ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE notifications ADD CONSTRAINT notifications_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
-- statement-breakpoint
-- dialect: postgres
CREATE UNIQUE INDEX barbers_company_key ON barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
CREATE UNIQUE INDEX services_company_key ON services(company_id,id);
-- statement-breakpoint
-- dialect: postgres
CREATE UNIQUE INDEX appointments_company_key ON appointments(company_id,id);
-- statement-breakpoint
-- dialect: postgres
CREATE UNIQUE INDEX guest_sessions_company_key ON guest_sessions(company_id,id);
-- statement-breakpoint
-- dialect: postgres
CREATE UNIQUE INDEX barber_working_hours_company_key ON barber_working_hours(company_id,barber_id,weekday);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_settings ADD CONSTRAINT barber_settings_barbers_company_fk FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_hours ADD CONSTRAINT barber_working_hours_barbers_company_fk FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE barber_working_breaks ADD CONSTRAINT barber_working_breaks_barber_working_hours_company_fk FOREIGN KEY(company_id,barber_id,weekday) REFERENCES barber_working_hours(company_id,barber_id,weekday);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE released_weeks ADD CONSTRAINT released_weeks_barbers_company_fk FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointments ADD CONSTRAINT appointments_barbers_company_fk FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointment_services ADD CONSTRAINT appointment_services_appointments_company_fk FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE appointment_services ADD CONSTRAINT appointment_services_services_company_fk FOREIGN KEY(company_id,service_id) REFERENCES services(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_appointments ADD CONSTRAINT guest_appointments_appointments_company_fk FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE guest_appointments ADD CONSTRAINT guest_appointments_guest_sessions_company_fk FOREIGN KEY(company_id,visitor_id) REFERENCES guest_sessions(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE blocks ADD CONSTRAINT blocks_barbers_company_fk FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE notifications ADD CONSTRAINT notifications_appointments_company_fk FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_barbers (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_services (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  duration INTEGER NOT NULL CHECK(duration > 0), price INTEGER NOT NULL CHECK(price >= 0),
  category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_portfolio (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
  image TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_barber_settings (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL PRIMARY KEY REFERENCES gradefy_003_barbers(id),
  agenda_mode TEXT NOT NULL DEFAULT 'auto' CHECK(agenda_mode IN ('auto','manual')),
  max_days_ahead INTEGER NOT NULL DEFAULT 90 CHECK(max_days_ahead BETWEEN 1 AND 90),
  version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(company_id,barber_id) REFERENCES gradefy_003_barbers(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_barber_working_hours (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL REFERENCES gradefy_003_barbers(id), weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  active INTEGER NOT NULL CHECK(active IN (0,1)), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  break_start TEXT, break_end TEXT, PRIMARY KEY(barber_id,weekday),
  UNIQUE(company_id,barber_id,weekday),
  FOREIGN KEY(company_id,barber_id) REFERENCES gradefy_003_barbers(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_barber_working_breaks (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL, weekday INTEGER NOT NULL, position INTEGER NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  PRIMARY KEY(barber_id,weekday,position),
  FOREIGN KEY(barber_id,weekday) REFERENCES gradefy_003_barber_working_hours(barber_id,weekday),
  FOREIGN KEY(company_id,barber_id,weekday) REFERENCES gradefy_003_barber_working_hours(company_id,barber_id,weekday)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_released_weeks (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL REFERENCES gradefy_003_barbers(id), week_start TEXT NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(barber_id,week_start), CHECK(start_date <= end_date),
  FOREIGN KEY(company_id,barber_id) REFERENCES gradefy_003_barbers(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_appointments (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, user_id TEXT REFERENCES users(id),
  guest_name TEXT, guest_email TEXT, guest_phone TEXT,
  barber_id TEXT NOT NULL REFERENCES gradefy_003_barbers(id), date TEXT NOT NULL,
  start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
  total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK(status IN ('confirmed','completed','cancelled','no-show')),
  created_at TEXT NOT NULL, CHECK(end_minute > start_minute),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,barber_id) REFERENCES gradefy_003_barbers(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_appointment_services (
  company_id TEXT NOT NULL REFERENCES companies(id),
  appointment_id TEXT NOT NULL REFERENCES gradefy_003_appointments(id),
  service_id TEXT NOT NULL REFERENCES gradefy_003_services(id), name TEXT NOT NULL,
  price INTEGER NOT NULL, duration INTEGER NOT NULL,
  PRIMARY KEY(appointment_id,service_id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES gradefy_003_appointments(company_id,id),
  FOREIGN KEY(company_id,service_id) REFERENCES gradefy_003_services(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_guest_sessions (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  UNIQUE(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_guest_appointments (
  company_id TEXT NOT NULL REFERENCES companies(id),
  appointment_id TEXT NOT NULL PRIMARY KEY REFERENCES gradefy_003_appointments(id),
  visitor_id TEXT NOT NULL REFERENCES gradefy_003_guest_sessions(id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES gradefy_003_appointments(company_id,id),
  FOREIGN KEY(company_id,visitor_id) REFERENCES gradefy_003_guest_sessions(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_blocks (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, barber_id TEXT NOT NULL REFERENCES gradefy_003_barbers(id),
  date TEXT NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
  reason TEXT NOT NULL, CHECK(end_minute > start_minute),
  FOREIGN KEY(company_id,barber_id) REFERENCES gradefy_003_barbers(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_003_notifications (
  company_id TEXT NOT NULL REFERENCES companies(id),
  id TEXT NOT NULL PRIMARY KEY, appointment_id TEXT NOT NULL REFERENCES gradefy_003_appointments(id),
  channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')), event TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT, created_at TEXT NOT NULL, next_attempt_at TEXT NOT NULL,
  FOREIGN KEY(company_id,appointment_id) REFERENCES gradefy_003_appointments(company_id,id)
);
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_barbers (id,name,specialty,active,company_id) SELECT id,name,specialty,active,? FROM barbers;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_services (id,name,description,duration,price,category,active,company_id) SELECT id,name,description,duration,price,category,active,? FROM services;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_portfolio (id,title,category,image,version,created_at,company_id) SELECT id,title,category,image,version,created_at,? FROM portfolio;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_barber_settings (barber_id,agenda_mode,max_days_ahead,version,company_id) SELECT barber_id,agenda_mode,max_days_ahead,version,? FROM barber_settings;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_barber_working_hours (barber_id,weekday,active,start_time,end_time,break_start,break_end,company_id) SELECT barber_id,weekday,active,start_time,end_time,break_start,break_end,? FROM barber_working_hours;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_barber_working_breaks (barber_id,weekday,position,start_time,end_time,company_id) SELECT barber_id,weekday,position,start_time,end_time,? FROM barber_working_breaks;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_released_weeks (barber_id,week_start,start_date,end_date,created_at,company_id) SELECT barber_id,week_start,start_date,end_date,created_at,? FROM released_weeks;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_appointments (id,user_id,guest_name,guest_email,guest_phone,barber_id,date,start_minute,end_minute,total,status,created_at,company_id) SELECT id,user_id,guest_name,guest_email,guest_phone,barber_id,date,start_minute,end_minute,total,status,created_at,? FROM appointments;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_appointment_services (appointment_id,service_id,name,price,duration,company_id) SELECT appointment_id,service_id,name,price,duration,? FROM appointment_services;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_guest_sessions (id,token_hash,name,email,phone,created_at,expires_at,company_id) SELECT id,token_hash,name,email,phone,created_at,expires_at,? FROM guest_sessions;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_guest_appointments (appointment_id,visitor_id,company_id) SELECT appointment_id,visitor_id,? FROM guest_appointments;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_blocks (id,barber_id,date,start_minute,end_minute,reason,company_id) SELECT id,barber_id,date,start_minute,end_minute,reason,? FROM blocks;
-- statement-breakpoint
-- dialect: sqlite
-- igor-backfill
INSERT INTO gradefy_003_notifications (id,appointment_id,channel,event,payload,status,attempts,error,created_at,next_attempt_at,company_id) SELECT id,appointment_id,channel,event,payload,status,attempts,error,created_at,next_attempt_at,? FROM notifications;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE notifications;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE blocks;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE guest_appointments;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE guest_sessions;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE appointment_services;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE appointments;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE released_weeks;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE barber_working_breaks;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE barber_working_hours;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE barber_settings;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE portfolio;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE services;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE barbers;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_barbers RENAME TO barbers;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_services RENAME TO services;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_portfolio RENAME TO portfolio;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_barber_settings RENAME TO barber_settings;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_barber_working_hours RENAME TO barber_working_hours;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_barber_working_breaks RENAME TO barber_working_breaks;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_released_weeks RENAME TO released_weeks;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_appointments RENAME TO appointments;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_appointment_services RENAME TO appointment_services;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_guest_sessions RENAME TO guest_sessions;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_guest_appointments RENAME TO guest_appointments;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_blocks RENAME TO blocks;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_003_notifications RENAME TO notifications;
-- statement-breakpoint
CREATE INDEX barbers_company_active ON barbers(company_id,active);
-- statement-breakpoint
CREATE INDEX services_company_active ON services(company_id,active);
-- statement-breakpoint
CREATE INDEX portfolio_company_created ON portfolio(company_id,created_at);
-- statement-breakpoint
CREATE INDEX barber_settings_company_barber ON barber_settings(company_id,barber_id);
-- statement-breakpoint
CREATE INDEX barber_working_breaks_company_day ON barber_working_breaks(company_id,barber_id,weekday);
-- statement-breakpoint
CREATE INDEX released_weeks_company_start ON released_weeks(company_id,barber_id,week_start);
-- statement-breakpoint
CREATE INDEX appointments_company_date ON appointments(company_id,date,status);
-- statement-breakpoint
CREATE INDEX appointment_services_company_appointment ON appointment_services(company_id,appointment_id);
-- statement-breakpoint
CREATE INDEX appointment_services_company_service ON appointment_services(company_id,service_id);
-- statement-breakpoint
CREATE INDEX guest_appointments_company_appointment ON guest_appointments(company_id,appointment_id);
-- statement-breakpoint
CREATE INDEX guest_appointments_company_visitor ON guest_appointments(company_id,visitor_id);
-- statement-breakpoint
CREATE INDEX blocks_company_date ON blocks(company_id,barber_id,date);
-- statement-breakpoint
CREATE INDEX notifications_company_queue ON notifications(company_id,status,next_attempt_at);
-- statement-breakpoint
CREATE INDEX notifications_company_appointment ON notifications(company_id,appointment_id);
