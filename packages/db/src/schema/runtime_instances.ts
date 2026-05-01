import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { runtimeHosts } from "./runtime_hosts.js";
import { runtimeOperations } from "./runtime_operations.js";

/**
 * Desired-state record for a single resource provisioned on a runtime host.
 * `kind` is one of AgentRuntimeKind (runtime_host | agent_identity |
 * agent_bundle | mcp_server | config_profile | secret_bundle). The reconciler
 * diffs `desiredConfig` against `actualState` and asks the broker to converge.
 */
export const runtimeInstances = pgTable(
  "runtime_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    hostId: uuid("host_id").notNull().references(() => runtimeHosts.id),
    /** AgentRuntimeKind value. */
    kind: text("kind").notNull(),
    plan: text("plan"),
    desiredConfig: jsonb("desired_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Last actualState reported by the broker; mirrors RuntimeInstanceState. */
    actualState: jsonb("actual_state").$type<Record<string, unknown> | null>(),
    /** pending | reconciling | ready | failed | deprovisioning. */
    status: text("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    lastOpId: uuid("last_op_id").references(() => runtimeOperations.id, {
      onDelete: "set null",
    }),
    /** Optional approval gate id when the instance is awaiting approval. */
    approvalId: uuid("approval_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("runtime_instances_company_idx").on(table.companyId),
    hostIdx: index("runtime_instances_host_idx").on(table.hostId),
    hostKindIdx: index("runtime_instances_host_kind_idx").on(table.hostId, table.kind),
  }),
);
