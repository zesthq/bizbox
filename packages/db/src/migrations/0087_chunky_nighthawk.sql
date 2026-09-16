ALTER TABLE "workflow_invocations" ADD COLUMN "source_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_invocations" ADD COLUMN "requested_by_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_invocations" ADD CONSTRAINT "workflow_invocations_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_invocations" ADD CONSTRAINT "workflow_invocations_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_invocations_source_issue_idx" ON "workflow_invocations" USING btree ("source_issue_id");--> statement-breakpoint
CREATE INDEX "workflow_invocations_requested_by_agent_idx" ON "workflow_invocations" USING btree ("requested_by_agent_id");