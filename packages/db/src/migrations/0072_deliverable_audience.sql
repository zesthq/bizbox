ALTER TABLE "issue_work_products"
ADD COLUMN "audience" text NOT NULL DEFAULT 'human';--> statement-breakpoint

ALTER TABLE "issue_documents"
ADD COLUMN "audience" text NOT NULL DEFAULT 'human';--> statement-breakpoint

UPDATE "issue_documents"
SET "audience" = 'internal'
WHERE "key" IN ('plan', 'continuation-summary');--> statement-breakpoint
