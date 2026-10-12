CREATE TABLE financial_payments (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  appointment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000 AND amount_cents=CAST(amount_cents AS INTEGER)),
  received_at TEXT NOT NULL,
  received_date TEXT NOT NULL CHECK(length(received_date)=10),
  method TEXT NOT NULL CHECK(method IN ('pix','cash','debit','credit','transfer','other')),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id)
);
-- statement-breakpoint
CREATE INDEX financial_payments_period ON financial_payments(company_id,received_date,id);
-- statement-breakpoint
CREATE INDEX financial_payments_appointment ON financial_payments(company_id,appointment_id,id);
-- statement-breakpoint
CREATE TABLE financial_payment_reversals (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  payment_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  event_date TEXT NOT NULL CHECK(length(event_date)=10),
  UNIQUE(company_id,payment_id),
  FOREIGN KEY(company_id,payment_id) REFERENCES financial_payments(company_id,id)
);
-- statement-breakpoint
CREATE INDEX financial_reversals_period ON financial_payment_reversals(company_id,event_date,id);
-- statement-breakpoint
CREATE TABLE financial_expenses (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 2 AND 200),
  category TEXT NOT NULL CHECK(category IN ('rent','materials','products','equipment','utilities','marketing','other')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000 AND amount_cents=CAST(amount_cents AS INTEGER)),
  date TEXT NOT NULL CHECK(length(date)=10),
  status TEXT NOT NULL CHECK(status IN ('pending','paid','void')),
  paid_at TEXT,
  paid_date TEXT,
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id,id),
  CHECK((paid_at IS NULL AND paid_date IS NULL AND status<>'paid') OR (paid_at IS NOT NULL AND paid_date IS NOT NULL AND status<>'pending'))
);
-- statement-breakpoint
CREATE INDEX financial_expenses_period ON financial_expenses(company_id,date,paid_date,id);
-- statement-breakpoint
CREATE TABLE financial_expense_events (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  expense_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','edit','pay','void')),
  before_json TEXT,
  after_json TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=1000),
  paid_reversal_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_reversal_cents>=0 AND paid_reversal_cents<=100000000 AND paid_reversal_cents=CAST(paid_reversal_cents AS INTEGER)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  event_date TEXT NOT NULL CHECK(length(event_date)=10),
  FOREIGN KEY(company_id,expense_id) REFERENCES financial_expenses(company_id,id),
  CHECK(action='void' OR paid_reversal_cents=0)
);
-- statement-breakpoint
CREATE INDEX financial_expense_audit ON financial_expense_events(company_id,expense_id,created_at,id);
-- statement-breakpoint
CREATE INDEX financial_expense_reversals_period ON financial_expense_events(company_id,event_date,action);
-- statement-breakpoint
CREATE UNIQUE INDEX financial_expense_one_void ON financial_expense_events(company_id,expense_id) WHERE action='void';
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_operation_check;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_operation_check CHECK(operation IN ('booking','guest-booking','block','professional-create','company-create','service-create','onboarding-complete','manual-booking','managed-reschedule','managed-status','client-create','finance-write'));
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE idempotency_keys_next (
  company_id TEXT NOT NULL REFERENCES companies(id), actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  operation TEXT NOT NULL CHECK(operation IN ('booking','guest-booking','block','professional-create','company-create','service-create','onboarding-complete','manual-booking','managed-reschedule','managed-status','client-create','finance-write')),
  key_hash TEXT NOT NULL CHECK(length(key_hash)=64), request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  response TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>created_at),
  PRIMARY KEY(company_id,actor_hash,operation,key_hash)
);
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO idempotency_keys_next SELECT company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at FROM idempotency_keys;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE idempotency_keys;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE idempotency_keys_next RENAME TO idempotency_keys;
-- statement-breakpoint
-- dialect: sqlite
CREATE INDEX idempotency_expiration ON idempotency_keys(company_id,expires_at);
