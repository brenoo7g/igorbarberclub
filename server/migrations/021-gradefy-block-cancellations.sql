-- Append-only audit and public cancellation reason. Existing reservations and finance remain intact.
ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT '' CHECK(length(cancellation_reason)<=300);
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN provider_message_id TEXT;
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN submitted_at TEXT;
-- statement-breakpoint
CREATE UNIQUE INDEX notification_company_identity ON notifications(company_id,id);
-- statement-breakpoint
CREATE TABLE agenda_block_operations (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  barber_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL CHECK(to_date>=from_date),
  start_minute INTEGER NOT NULL CHECK(start_minute>=0 AND start_minute<1440),
  end_minute INTEGER NOT NULL CHECK(end_minute>start_minute AND end_minute<=1440),
  reason_code TEXT NOT NULL CHECK(reason_code IN ('personal','unavailable','emergency','operational','other')),
  public_reason TEXT NOT NULL CHECK(length(public_reason) BETWEEN 3 AND 300),
  internal_notes TEXT NOT NULL DEFAULT '' CHECK(length(internal_notes)<=1000),
  created_at TEXT NOT NULL,
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id),
  FOREIGN KEY(company_id,actor_id) REFERENCES company_members(company_id,user_id)
);
-- statement-breakpoint
CREATE INDEX agenda_block_history ON agenda_block_operations(company_id,created_at,id);
-- statement-breakpoint
CREATE TABLE agenda_block_cancellations (
  company_id TEXT NOT NULL REFERENCES companies(id),
  operation_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  PRIMARY KEY(company_id,appointment_id),
  FOREIGN KEY(company_id,operation_id) REFERENCES agenda_block_operations(company_id,id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id),
  FOREIGN KEY(company_id,notification_id) REFERENCES notifications(company_id,id)
);
