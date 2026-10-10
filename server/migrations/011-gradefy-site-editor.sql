ALTER TABLE company_settings ADD COLUMN site_version INTEGER NOT NULL DEFAULT 0 CHECK(site_version>=0);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN sections_json TEXT;
-- statement-breakpoint
ALTER TABLE portfolio ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order>=0);
-- statement-breakpoint
CREATE UNIQUE INDEX portfolio_company_identity ON portfolio(company_id,id);
-- statement-breakpoint
CREATE TABLE company_site_assets (
  id TEXT NOT NULL PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('logo','banner','gallery')),
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','deleting')),
  mime TEXT NOT NULL CHECK(mime='image/webp'),
  bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=3145728),
  width INTEGER NOT NULL CHECK(width>0 AND width<=2000),
  height INTEGER NOT NULL CHECK(height>0 AND height<=2000),
  created_at TEXT NOT NULL,
  UNIQUE(company_id,id)
);
-- statement-breakpoint
CREATE INDEX company_site_assets_cleanup ON company_site_assets(company_id,status,created_at);
-- statement-breakpoint
CREATE TABLE portfolio_assets (
  company_id TEXT NOT NULL REFERENCES companies(id),
  portfolio_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  PRIMARY KEY(company_id,portfolio_id),
  UNIQUE(company_id,asset_id),
  FOREIGN KEY(company_id,portfolio_id) REFERENCES portfolio(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,asset_id) REFERENCES company_site_assets(company_id,id)
);
