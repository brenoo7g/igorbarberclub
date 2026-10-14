-- Reuse professional_users. Only append auditable operational events; no automatic links.
CREATE TABLE professional_activity_events (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_user_id TEXT NOT NULL,
  affected_user_id TEXT,
  previous_barber_id TEXT,
  barber_id TEXT,
  appointment_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('linked','relinked','unlinked','completed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(company_id,actor_user_id) REFERENCES company_members(company_id,user_id),
  FOREIGN KEY(company_id,affected_user_id) REFERENCES company_members(company_id,user_id),
  FOREIGN KEY(company_id,previous_barber_id) REFERENCES barbers(company_id,id),
  FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id),
  FOREIGN KEY(company_id,appointment_id) REFERENCES appointments(company_id,id),
  CHECK(
    (action='completed' AND appointment_id IS NOT NULL AND barber_id IS NOT NULL AND affected_user_id IS NULL AND previous_barber_id IS NULL) OR
    (appointment_id IS NULL AND affected_user_id IS NOT NULL AND (
      (action='linked' AND previous_barber_id IS NULL AND barber_id IS NOT NULL) OR
      (action='relinked' AND previous_barber_id IS NOT NULL AND barber_id IS NOT NULL AND previous_barber_id<>barber_id) OR
      (action='unlinked' AND previous_barber_id IS NOT NULL AND barber_id IS NULL)
    ))
  )
);
-- statement-breakpoint
CREATE INDEX professional_activity_history ON professional_activity_events(company_id,actor_user_id,created_at,id);
-- statement-breakpoint
CREATE UNIQUE INDEX professional_activity_completion ON professional_activity_events(company_id,appointment_id) WHERE action='completed';
