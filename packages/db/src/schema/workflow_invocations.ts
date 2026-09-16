import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { routineRuns, routines } from "./routines.js";
import { workflows, workflowRuns } from "./workflows.js";

export const workflowInvocations = pgTable(
  "workflow_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceRoutineId: uuid("source_routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    sourceRoutineRunId: uuid("source_routine_run_id").notNull().references(() => routineRuns.id, { onDelete: "cascade" }),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    targetWorkflowId: uuid("target_workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    targetWorkflowKey: text("target_workflow_key"),
    targetCapability: text("target_capability"),
    contractVersion: text("contract_version").notNull(),
    inputKind: text("input_kind").notNull(),
    inputMarkdown: text("input_markdown").notNull(),
    inputJson: jsonb("input_json"),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("workflow_invocations_company_created_idx").on(table.companyId, table.createdAt),
    sourceRoutineRunIdx: index("workflow_invocations_source_routine_run_idx").on(table.sourceRoutineRunId, table.createdAt),
    sourceIssueIdx: index("workflow_invocations_source_issue_idx").on(table.sourceIssueId),
    requestedByAgentIdx: index("workflow_invocations_requested_by_agent_idx").on(table.requestedByAgentId),
    targetWorkflowIdx: index("workflow_invocations_target_workflow_idx").on(table.targetWorkflowId, table.createdAt),
    workflowRunUq: uniqueIndex("workflow_invocations_workflow_run_uq").on(table.workflowRunId),
  }),
);
