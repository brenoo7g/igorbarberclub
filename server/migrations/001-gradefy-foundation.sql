-- Phase 1 metadata only. Existing operational tables and IDs remain unchanged.
CREATE TABLE niches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  niche_id TEXT NOT NULL REFERENCES niches(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(id,niche_id)
);
-- statement-breakpoint
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_professionals INTEGER CHECK(max_professionals IS NULL OR max_professionals >= 1),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
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
  FOREIGN KEY(template_id,niche_id) REFERENCES templates(id,niche_id),
  CONSTRAINT gradefy_single_company CHECK(id = 'igor-barber-club')
);
-- statement-breakpoint
CREATE TABLE company_members (
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','admin','professional')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id,user_id)
);
-- statement-breakpoint
CREATE INDEX company_members_user ON company_members(user_id,company_id);
-- statement-breakpoint
CREATE TABLE company_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  instagram_url TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  updated_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK(status IN ('pending','active','cancelled','expired')),
  source TEXT NOT NULL CHECK(source IN ('legacy','manual')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
-- statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_current_per_company ON subscriptions(company_id)
  WHERE status IN ('pending','active');
