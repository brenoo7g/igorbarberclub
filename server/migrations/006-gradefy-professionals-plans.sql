ALTER TABLE plans ADD COLUMN price_cents INTEGER CHECK(price_cents IS NULL OR (price_cents >= 0 AND price_cents = CAST(price_cents AS INTEGER)));
-- statement-breakpoint
ALTER TABLE plans ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL' CHECK(currency = 'BRL');
-- statement-breakpoint
ALTER TABLE plans ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK(billing_interval = 'month');
-- statement-breakpoint
ALTER TABLE plans ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 7 CHECK(trial_days >= 0 AND trial_days = CAST(trial_days AS INTEGER));
-- statement-breakpoint
UPDATE plans SET name='Individual',price_cents=2299,currency='BRL',billing_interval='month',trial_days=7,max_professionals=1 WHERE id='individual';
-- statement-breakpoint
UPDATE plans SET name='Equipe',price_cents=3299,currency='BRL',billing_interval='month',trial_days=7,max_professionals=NULL WHERE id='team';
-- statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN trial_started_at TEXT;
-- statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN trial_ends_at TEXT;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK(status IN ('pending','trialing','active','cancelled','expired'));
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_trial_period CHECK((trial_started_at IS NULL AND trial_ends_at IS NULL AND status <> 'trialing') OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at));
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_006_subscriptions (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK(status IN ('pending','trialing','active','cancelled','expired')),
  source TEXT NOT NULL CHECK(source IN ('legacy','manual')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trial_started_at TEXT,
  trial_ends_at TEXT,
  CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT subscriptions_trial_period CHECK((trial_started_at IS NULL AND trial_ends_at IS NULL AND status <> 'trialing') OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at))
);
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_006_subscriptions SELECT id,company_id,plan_id,status,source,starts_at,ends_at,created_at,updated_at,trial_started_at,trial_ends_at FROM subscriptions;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE subscriptions;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_006_subscriptions RENAME TO subscriptions;
-- statement-breakpoint
-- dialect: postgres
DROP INDEX subscriptions_one_current_per_company;
-- statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_current_per_company ON subscriptions(company_id) WHERE status IN ('pending','active','trialing');
-- statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_trial_per_company ON subscriptions(company_id) WHERE trial_started_at IS NOT NULL;
-- statement-breakpoint
CREATE TABLE barber_services (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id,barber_id,service_id),
  FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id),
  FOREIGN KEY(company_id,service_id) REFERENCES services(company_id,id)
);
-- statement-breakpoint
CREATE INDEX barber_services_selection ON barber_services(company_id,service_id,barber_id);
-- statement-breakpoint
CREATE TABLE professional_users (
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id,barber_id),
  UNIQUE(company_id,user_id),
  FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id),
  FOREIGN KEY(company_id,user_id) REFERENCES company_members(company_id,user_id)
);
-- statement-breakpoint
INSERT INTO barber_services(company_id,barber_id,service_id,created_at)
SELECT b.company_id,b.id,s.id,'2026-10-01T00:00:00.000Z' FROM barbers b JOIN services s ON s.company_id=b.company_id WHERE b.active=1 AND s.active=1;
