-- Historical events deliberately remain outside every delivery activation.
ALTER TABLE notifications ADD COLUMN email_delivery_scope TEXT NOT NULL DEFAULT '';
-- statement-breakpoint
ALTER TABLE password_recovery ADD COLUMN email_delivery_scope TEXT NOT NULL DEFAULT '';
-- statement-breakpoint
CREATE TABLE email_deliveries (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('appointment','invitation','password')),
  status TEXT NOT NULL CHECK(status IN ('pending','processing','accepted','delivered','delayed','rejected','suppressed','complained','failed','review')),
  provider_message_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE INDEX email_delivery_company_status ON email_deliveries(company_id,status,created_at);
-- statement-breakpoint
CREATE TABLE email_delivery_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES email_deliveries(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('processing','accepted','failed','review')),
  error_code TEXT
);
-- statement-breakpoint
CREATE INDEX email_attempt_history ON email_delivery_attempts(delivery_id,started_at);
-- statement-breakpoint
CREATE TABLE email_webhook_events (
  id TEXT NOT NULL PRIMARY KEY,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE INDEX email_webhook_provider ON email_webhook_events(provider_message_id,occurred_at);
