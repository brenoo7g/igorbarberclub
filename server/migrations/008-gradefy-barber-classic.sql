ALTER TABLE company_settings ADD COLUMN logo_url TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN favicon_url TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN wordmark_title TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN wordmark_subtitle TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN slogan TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN hero_image_url TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN about_image_url TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN description TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN about_detail TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN whatsapp TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN phone TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN address TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN location_url TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN primary_color TEXT CHECK(primary_color IS NULL OR length(primary_color)=7);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN secondary_color TEXT CHECK(secondary_color IS NULL OR length(secondary_color)=7);
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN featured_service_ids TEXT;
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN highlight_service_id TEXT;
-- statement-breakpoint
ALTER TABLE barbers ADD COLUMN photo_url TEXT;
-- statement-breakpoint
UPDATE company_settings SET favicon_url='/favicon.svg',wordmark_title='IGOR',wordmark_subtitle='BARBER CLUB',slogan='Mais que um corte. Sua identidade.',hero_image_url='/images/hero.webp',about_image_url='/images/shop.webp',description='Em Campo Grande, no coração do Rio, a Igor Barber Club é um espaço para cuidar do visual, trocar uma ideia e sair com a confiança renovada.',about_detail='À frente da cadeira, Igor Borges une técnica e personalidade em cada atendimento. Uma trajetória de aprendizado e dedicação à barbearia, com a referência da #batalhadosbarbeirosbrasil.',featured_service_ids='["corte","barba","combo","sobrancelha"]',highlight_service_id='combo' WHERE company_id='igor-barber-club';
