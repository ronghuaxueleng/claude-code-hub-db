ALTER TABLE "providers" ADD COLUMN "disabled_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;
