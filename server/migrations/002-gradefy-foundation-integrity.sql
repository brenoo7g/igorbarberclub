-- dialect: postgres
ALTER TABLE niches ALTER COLUMN id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE templates ALTER COLUMN id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE plans ALTER COLUMN id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE companies ALTER COLUMN id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE company_settings ALTER COLUMN company_id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE subscriptions ALTER COLUMN id SET NOT NULL;
-- statement-breakpoint
-- dialect: postgres
ALTER TABLE schema_migrations ALTER COLUMN version SET NOT NULL;
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_niches (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_templates (
  id TEXT NOT NULL PRIMARY KEY,
  niche_id TEXT NOT NULL REFERENCES gradefy_002_niches(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version) = 'integer' AND version BETWEEN 1 AND 2147483647),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(id,niche_id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_plans (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  max_professionals INTEGER CHECK(max_professionals IS NULL OR (typeof(max_professionals) = 'integer' AND max_professionals BETWEEN 1 AND 2147483647)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_companies (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  niche_id TEXT NOT NULL REFERENCES gradefy_002_niches(id),
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(template_id,niche_id) REFERENCES gradefy_002_templates(id,niche_id),
  CONSTRAINT gradefy_single_company CHECK(id = 'igor-barber-club')
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_company_members (
  company_id TEXT NOT NULL REFERENCES gradefy_002_companies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','admin','professional')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id,user_id)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_company_settings (
  company_id TEXT NOT NULL PRIMARY KEY REFERENCES gradefy_002_companies(id),
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  instagram_url TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(version) = 'integer' AND version BETWEEN 0 AND 2147483647),
  updated_at TEXT NOT NULL
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_subscriptions (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES gradefy_002_companies(id),
  plan_id TEXT NOT NULL REFERENCES gradefy_002_plans(id),
  status TEXT NOT NULL CHECK(status IN ('pending','active','cancelled','expired')),
  source TEXT NOT NULL CHECK(source IN ('legacy','manual')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
-- statement-breakpoint
-- dialect: sqlite
CREATE TABLE gradefy_002_schema_migrations (
  version INT NOT NULL PRIMARY KEY CHECK(typeof(version) = 'integer' AND version BETWEEN 1 AND 2147483647),
  name TEXT NOT NULL,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at TEXT NOT NULL
);
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_niches (id,name,active,created_at) SELECT id,name,active,created_at FROM niches;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_templates (id,niche_id,name,version,active,created_at) SELECT id,niche_id,name,version,active,created_at FROM templates;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_plans (id,name,max_professionals,active,created_at) SELECT id,name,max_professionals,active,created_at FROM plans;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_companies (id,slug,name,niche_id,template_id,status,timezone,locale,currency,created_at,updated_at) SELECT id,slug,name,niche_id,template_id,status,timezone,locale,currency,created_at,updated_at FROM companies;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_company_members (company_id,user_id,role,status,created_at) SELECT company_id,user_id,role,status,created_at FROM company_members;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_company_settings (company_id,city,region,country,instagram_url,version,updated_at) SELECT company_id,city,region,country,instagram_url,version,updated_at FROM company_settings;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_subscriptions (id,company_id,plan_id,status,source,starts_at,ends_at,created_at,updated_at) SELECT id,company_id,plan_id,status,source,starts_at,ends_at,created_at,updated_at FROM subscriptions;
-- statement-breakpoint
-- dialect: sqlite
INSERT INTO gradefy_002_schema_migrations (version,name,checksum,applied_at) SELECT version,name,checksum,applied_at FROM schema_migrations;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE schema_migrations;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE subscriptions;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE company_settings;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE company_members;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE companies;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE plans;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE templates;
-- statement-breakpoint
-- dialect: sqlite
DROP TABLE niches;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_niches RENAME TO niches;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_templates RENAME TO templates;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_plans RENAME TO plans;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_companies RENAME TO companies;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_company_members RENAME TO company_members;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_company_settings RENAME TO company_settings;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_subscriptions RENAME TO subscriptions;
-- statement-breakpoint
-- dialect: sqlite
ALTER TABLE gradefy_002_schema_migrations RENAME TO schema_migrations;
-- statement-breakpoint
-- dialect: sqlite
CREATE INDEX company_members_user ON company_members(user_id,company_id);
-- statement-breakpoint
-- dialect: sqlite
CREATE UNIQUE INDEX subscriptions_one_current_per_company ON subscriptions(company_id)
  WHERE status IN ('pending','active');
