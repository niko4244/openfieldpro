ALTER TABLE "recurring_jobs" ADD COLUMN IF NOT EXISTS "rrule" text;--> statement-breakpoint
ALTER TABLE "recurring_jobs" ADD COLUMN IF NOT EXISTS "scheduled_time" text;
