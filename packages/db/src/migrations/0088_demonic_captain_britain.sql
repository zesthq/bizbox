ALTER TABLE "workflow_invocations" DROP CONSTRAINT "workflow_invocations_source_issue_id_issues_id_fk";
--> statement-breakpoint
DROP INDEX "workflow_invocations_source_issue_idx";--> statement-breakpoint
ALTER TABLE "workflow_invocations" DROP COLUMN "source_issue_id";