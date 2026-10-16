-- Structured address is optional for existing establishments. No legacy data is rewritten.
ALTER TABLE company_settings ADD COLUMN postal_code TEXT CHECK(postal_code IS NULL OR (length(postal_code)=8 AND length(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(postal_code,'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9',''))=0));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN street TEXT CHECK(street IS NULL OR length(street)<=120);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN neighborhood TEXT CHECK(neighborhood IS NULL OR length(neighborhood)<=100);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN address_number TEXT CHECK(address_number IS NULL OR length(address_number)<=20);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN address_complement TEXT CHECK(address_complement IS NULL OR length(address_complement)<=100);
-- statement-breakpoint
CREATE TABLE company_invitation_professionals (
  company_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('new','existing')),
  barber_id TEXT,
  accepted_token_hash TEXT UNIQUE CHECK(accepted_token_hash IS NULL OR length(accepted_token_hash)=64),
  PRIMARY KEY(company_id,invitation_id),
  FOREIGN KEY(company_id,invitation_id) REFERENCES company_invitations(company_id,id),
  FOREIGN KEY(company_id,barber_id) REFERENCES barbers(company_id,id),
  CHECK(mode='new' OR barber_id IS NOT NULL),
  CHECK(accepted_token_hash IS NULL OR barber_id IS NOT NULL)
);
