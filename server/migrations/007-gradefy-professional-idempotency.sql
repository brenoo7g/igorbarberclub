-- dialect: postgres
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_operation_check;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_operation_check CHECK(operation IN ('booking','guest-booking','block','professional-create'));
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE idempotency_keys_next (
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  operation TEXT NOT NULL CHECK(operation IN ('booking','guest-booking','block','professional-create')),
  key_hash TEXT NOT NULL CHECK(length(key_hash)=64),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > created_at),
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
