import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const awaitingHumanNotificationOutbox = pgTable(
  "awaiting_human_notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    handoffKind: text("handoff_kind").notNull().$type<"request_confirmation" | "ask_user_questions" | "human_owned_blocker">(),
    status: text("status")
      .notNull()
      .$type<"pending" | "processing" | "retrying" | "sent" | "failed" | "partial_failed" | "skipped">()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    notification: jsonb("notification").$type<Record<string, unknown>>().notNull().default({}),
    reviewFile: jsonb("review_file").$type<Record<string, unknown>>(),
    clickupTaskId: text("clickup_task_id"),
    clickupTaskUrl: text("clickup_task_url"),
    clickupAttachmentId: text("clickup_attachment_id"),
    clickupAttachmentUrl: text("clickup_attachment_url"),
    clickupMessageId: text("clickup_message_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("awaiting_human_notification_outbox_company_status_idx").on(
      table.companyId,
      table.status,
      table.nextAttemptAt,
    ),
    issueIdx: index("awaiting_human_notification_outbox_issue_idx").on(table.issueId, table.createdAt),
    dedupeUq: uniqueIndex("awaiting_human_notification_outbox_dedupe_uq").on(
      table.companyId,
      table.issueId,
      table.dedupeKey,
    ),
  }),
);
