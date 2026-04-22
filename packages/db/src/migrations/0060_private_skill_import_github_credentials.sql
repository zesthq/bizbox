CREATE TABLE IF NOT EXISTS "company_github_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "hostname" text NOT NULL,
  "owner" text NOT NULL,
  "secret_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_github_credentials"
  ADD CONSTRAINT "company_github_credentials_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_github_credentials"
  ADD CONSTRAINT "company_github_credentials_secret_id_company_secrets_id_fk"
  FOREIGN KEY ("secret_id") REFERENCES "public"."company_secrets"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_github_credentials_company_idx"
  ON "company_github_credentials" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_github_credentials_secret_idx"
  ON "company_github_credentials" USING btree ("secret_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_github_credentials_company_owner_uq"
  ON "company_github_credentials" USING btree ("company_id", "hostname", "owner");
