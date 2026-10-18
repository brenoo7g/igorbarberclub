-- Catalog addition only. Existing companies, settings and portfolios are untouched.
INSERT INTO niches(id,name,created_at) VALUES('barbershop','Barbearia','2026-10-16T00:00:00.000Z') ON CONFLICT(id) DO NOTHING;
-- statement-breakpoint
INSERT INTO templates(id,niche_id,name,created_at) VALUES('gradefy-minisite','barbershop','Gradefy Mini Site','2026-10-16T00:00:00.000Z') ON CONFLICT(id) DO NOTHING;
