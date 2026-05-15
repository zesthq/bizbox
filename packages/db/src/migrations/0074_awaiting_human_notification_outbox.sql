CREATE TABLE "awaiting_human_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "dedupe_key" text NOT NULL,
  "handoff_kind" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "notification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "review_file" jsonb,
  "clickup_task_id" text,
  "clickup_task_url" text,
  "clickup_attachment_id" text,
  "clickup_attachment_url" text,
  "clickup_message_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "awaiting_human_notification_outbox" ADD CONSTRAINT "awaiting_human_notification_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "awaiting_human_notification_outbox" ADD CONSTRAINT "awaiting_human_notification_outbox_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "awaiting_human_notification_outbox_company_status_idx" ON "awaiting_human_notification_outbox" USING btree ("company_id","status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "awaiting_human_notification_outbox_issue_idx" ON "awaiting_human_notification_outbox" USING btree ("issue_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "awaiting_human_notification_outbox_dedupe_uq" ON "awaiting_human_notification_outbox" USING btree ("company_id","issue_id","dedupe_key");
