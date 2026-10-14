-- Additive policies. NULL working days/window retain the existing professional schedule.
ALTER TABLE company_settings ADD COLUMN operational_version INTEGER NOT NULL DEFAULT 0 CHECK(operational_version >= 0 AND operational_version = CAST(operational_version AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN minimum_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK(minimum_notice_minutes BETWEEN 0 AND 10080 AND minimum_notice_minutes = CAST(minimum_notice_minutes AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN maximum_booking_days INTEGER CHECK(maximum_booking_days BETWEEN 1 AND 90 AND maximum_booking_days = CAST(maximum_booking_days AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 180 AND buffer_minutes = CAST(buffer_minutes AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN cancel_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK(cancel_notice_minutes BETWEEN 0 AND 10080 AND cancel_notice_minutes = CAST(cancel_notice_minutes AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN reschedule_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK(reschedule_notice_minutes BETWEEN 0 AND 10080 AND reschedule_notice_minutes = CAST(reschedule_notice_minutes AS INTEGER));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN online_booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK(online_booking_enabled IN (0,1));
-- statement-breakpoint
ALTER TABLE company_settings ADD COLUMN working_days_json TEXT;
