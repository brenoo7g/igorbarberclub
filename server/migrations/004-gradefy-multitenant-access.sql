-- dialect: postgres
ALTER TABLE companies DROP CONSTRAINT gradefy_single_company;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE company_members DROP CONSTRAINT company_members_role_check;
-- statement-breakpoint
-- dialect: postgres
UPDATE company_members SET role='manager' WHERE role='admin';
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE company_members ADD CONSTRAINT company_members_role_check CHECK(role IN ('owner','manager','professional'));
-- statement-breakpoint
-- dialect: sqlite
PRAGMA defer_foreign_keys=ON;
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_004_companies (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  niche_id TEXT NOT NULL REFERENCES niches(id),
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(template_id,niche_id) REFERENCES templates(id,niche_id)
);
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_004_companies SELECT id,slug,name,niche_id,template_id,status,timezone,locale,currency,created_at,updated_at FROM companies;
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_004_company_members (
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','manager','professional')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id,user_id)
);
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_004_company_members SELECT company_id,user_id,CASE WHEN role='admin' THEN 'manager' ELSE role END,status,created_at FROM company_members;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE company_members;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE companies;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_004_companies RENAME TO companies;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_004_company_members RENAME TO company_members;
-- statement-breakpoint
-- dialect: sqlite
CREATE INDEX company_members_user ON company_members(user_id,company_id);
-- statement-breakpoint
CREATE INDEX company_members_active_user ON company_members(user_id,status,company_id);
