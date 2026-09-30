INSERT INTO users (id,name,email,phone,password_hash,avatar,profile_version,session_version,role,created_at)
  VALUES ('legacy-admin','Nome editado','admin@example.test','21988887777','unchanged-hash','unchanged-avatar',4,7,'admin','2025-01-01T00:00:00.000Z');
INSERT INTO users (id,name,email,phone,password_hash,role,created_at)
  VALUES ('legacy-client','Cliente Antigo','client@example.test','21999998888','client-hash','client','2025-01-01T00:00:00.000Z');
INSERT INTO barbers VALUES ('igor','Igor editado','Especialidade editada',1);
INSERT INTO barbers VALUES ('other-professional','Outro Profissional','Teste',1);
INSERT INTO services VALUES ('corte','Corte editado','Descrição',40,4321,'Categoria',1);
INSERT INTO services VALUES ('combo','Combo antigo','Descrição',80,8000,'Categoria',0);
INSERT INTO portfolio VALUES ('igor-corte-1','Foto editada','Categoria','unchanged-image',3,'2025-01-01');
INSERT INTO content_migrations VALUES ('igor-real-portfolio-2026-09-10');
INSERT INTO barber_settings VALUES ('igor','manual',15,6);
INSERT INTO barber_working_hours VALUES ('igor',2,1,'09:00','19:00','12:20','14:00');
INSERT INTO barber_working_breaks VALUES ('igor',2,1,'16:00','16:20');
INSERT INTO released_weeks VALUES ('igor','2030-01-07','2030-01-08','2030-01-08','2025-01-01');
INSERT INTO appointments (id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at)
  VALUES ('legacy-booking','legacy-client','igor','2030-01-08',540,620,8000,'confirmed','2025-01-01');
INSERT INTO appointment_services VALUES ('legacy-booking','combo','Snapshot antigo',8000,80);
INSERT INTO appointments (id,guest_name,guest_email,guest_phone,barber_id,date,start_minute,end_minute,total,status,created_at)
  VALUES ('legacy-guest','Cliente Visitante','guest@example.test','21977776666','igor','2030-01-08',620,660,4321,'confirmed','2025-01-01');
INSERT INTO appointment_services VALUES ('legacy-guest','corte','Snapshot visitante',4321,40);
INSERT INTO guest_sessions VALUES ('visitor','unchanged-token-hash','Cliente Visitante','guest@example.test','21977776666','2025-01-01','2035-01-01');
INSERT INTO guest_appointments VALUES ('legacy-guest','visitor');
INSERT INTO blocks VALUES ('block','igor','2030-01-08',900,940,'Compromisso');
INSERT INTO notifications (id,appointment_id,channel,event,payload,status,attempts,created_at,next_attempt_at)
  VALUES ('queued','legacy-booking','email','confirmed','{"historical":true}','pending',2,'2025-01-01','2030-01-01');
INSERT INTO password_recovery (id,user_id,email,session_version,token_hash,event,created_at,expires_at,next_attempt_at)
  VALUES ('reset','legacy-admin','admin@example.test',7,'unchanged-reset-hash','reset','2025-01-01','2030-01-01','2030-01-01');
INSERT INTO password_recovery_limits VALUES ('unchanged-bucket','2025-01-01','2025-01-01',2);
CREATE INDEX legacy_extra_index ON appointments(status);
