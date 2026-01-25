ALTER TABLE "providers" ADD COLUMN "key_pool" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "key_selection_strategy" varchar(20) DEFAULT 'random' NOT NULL;