-- Additive access metadata only. No global account, professional or subscription changes.
CREATE TABLE company_invitations (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 200 AND email=lower(trim(email))),
  role TEXT NOT NULL CHECK(role IN ('manager','professional')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
  token_hash TEXT UNIQUE CHECK(token_hash IS NULL OR length(token_hash)=64),
  created_by TEXT NOT NULL REFERENCES users(id),
  accepted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > created_at),
  accepted_at TEXT,
  delivery TEXT NOT NULL DEFAULT 'manual' CHECK(delivery IN ('manual','sent','failed')),
  CHECK((status='pending' AND token_hash IS NOT NULL) OR (status<>'pending' AND token_hash IS NULL)),
  CHECK((status='accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL) OR
        (status<>'accepted' AND accepted_by IS NULL AND accepted_at IS NULL)),
  UNIQUE(company_id,id)
);
-- statement-breakpoint
CREATE UNIQUE INDEX company_invitations_one_pending ON company_invitations(company_id,email) WHERE status='pending';
-- statement-breakpoint
CREATE INDEX company_invitations_list ON company_invitations(company_id,created_at,id);
-- statement-breakpoint
CREATE TABLE company_access_events (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  affected_user_id TEXT REFERENCES users(id),
  invitation_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('invite-created','invite-renewed','invite-cancelled','invite-accepted','role-changed','access-revoked')),
  previous_role TEXT CHECK(previous_role IS NULL OR previous_role IN ('owner','manager','professional')),
  next_role TEXT CHECK(next_role IS NULL OR next_role IN ('owner','manager','professional')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(company_id,invitation_id) REFERENCES company_invitations(company_id,id)
);
-- statement-breakpoint
CREATE INDEX company_access_events_list ON company_access_events(company_id,created_at,id);
-- statement-breakpoint
CREATE TABLE company_invitation_limits (
  bucket_key TEXT NOT NULL PRIMARY KEY CHECK(length(bucket_key)=64),
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 2147483647 AND attempts=CAST(attempts AS INTEGER))
);
