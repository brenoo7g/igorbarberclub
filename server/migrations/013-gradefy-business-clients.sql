CREATE TABLE company_clients (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('user','visitor','reservation','manual')),
  source_id TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((source_kind='manual' AND source_id IS NULL) OR (source_kind<>'manual' AND source_id IS NOT NULL)),
  UNIQUE(company_id,id),
  UNIQUE(company_id,source_kind,source_id)
);
-- statement-breakpoint
CREATE INDEX company_clients_search ON company_clients(company_id,name,id);
-- statement-breakpoint
CREATE TABLE client_appointments (
  company_id TEXT NOT NULL REFERENCES companies(id),
  client_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  PRIMARY KEY(company_id,appointment_id),
  FOREIGN KEY(company_id,client_id) REFERENCES company_clients(company_id,id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id)
);
-- statement-breakpoint
CREATE INDEX client_appointments_history ON client_appointments(company_id,client_id,appointment_id);
-- statement-breakpoint
-- Existing account identities are stable; no grouping by name or telephone.
INSERT INTO company_clients(id,company_id,name,phone,email,source_kind,source_id,created_at,updated_at)
SELECT DISTINCT 'client-user:'||a.company_id||':'||a.user_id,a.company_id,u.name,u.phone,u.email,'user',a.user_id,u.created_at,u.created_at
FROM appointments a JOIN users u ON u.id=a.user_id WHERE a.user_id IS NOT NULL;
-- statement-breakpoint
INSERT INTO company_clients(id,company_id,name,phone,email,source_kind,source_id,created_at,updated_at)
SELECT DISTINCT 'client-visitor:'||a.company_id||':'||g.visitor_id,a.company_id,s.name,s.phone,s.email,'visitor',g.visitor_id,s.created_at,s.created_at
FROM appointments a JOIN guest_appointments g ON g.company_id=a.company_id AND g.appointment_id=a.id JOIN guest_sessions s ON s.company_id=g.company_id AND s.id=g.visitor_id WHERE a.user_id IS NULL;
-- statement-breakpoint
INSERT INTO company_clients(id,company_id,name,phone,email,source_kind,source_id,created_at,updated_at)
SELECT 'client-reservation:'||a.company_id||':'||a.id,a.company_id,COALESCE(a.guest_name,'Cliente sem nome'),COALESCE(NULLIF(a.guest_phone,''),'não informado'),a.guest_email,'reservation',a.id,a.created_at,a.created_at
FROM appointments a WHERE a.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM guest_appointments g WHERE g.company_id=a.company_id AND g.appointment_id=a.id);
-- statement-breakpoint
INSERT INTO client_appointments(company_id,client_id,appointment_id)
SELECT a.company_id,c.id,a.id FROM appointments a LEFT JOIN guest_appointments g ON g.company_id=a.company_id AND g.appointment_id=a.id
JOIN company_clients c ON c.company_id=a.company_id AND c.source_kind=CASE WHEN a.user_id IS NOT NULL THEN 'user' WHEN g.visitor_id IS NOT NULL THEN 'visitor' ELSE 'reservation' END AND c.source_id=COALESCE(a.user_id,g.visitor_id,a.id);
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_operation_check;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_operation_check CHECK(operation IN ('booking','guest-booking','block','professional-create','company-create','service-create','onboarding-complete','manual-booking','managed-reschedule','managed-status','client-create'));
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE idempotency_keys_next (
  company_id TEXT NOT NULL REFERENCES companies(id), actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  operation TEXT NOT NULL CHECK(operation IN ('booking','guest-booking','block','professional-create','company-create','service-create','onboarding-complete','manual-booking','managed-reschedule','managed-status','client-create')),
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
