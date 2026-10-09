CREATE TABLE idempotency_keys (
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  operation TEXT NOT NULL CHECK(operation IN ('booking','guest-booking','block')),
  key_hash TEXT NOT NULL CHECK(length(key_hash)=64),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > created_at),
  PRIMARY KEY(company_id,actor_hash,operation,key_hash)
);
-- statement-breakpoint
CREATE INDEX idempotency_expiration ON idempotency_keys(company_id,expires_at);
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN claim_token TEXT;
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN claimed_at TEXT;
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN lease_expires_at TEXT;
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN first_attempt_at TEXT;
-- statement-breakpoint
ALTER TABLE notifications ADD COLUMN delivery_payload TEXT;
-- statement-breakpoint
CREATE INDEX notification_recovery ON notifications(company_id,status,lease_expires_at,next_attempt_at);
