import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { runtimeHosts } from "./runtime_hosts.js";

/**
 * Long-running broker operation (provision/update/deprovision/sync). One row
 * per call so the activity log can link to it and the UI can poll status.
 * Mirrors AgentRuntimeBroker's BrokerOperation type at the persistence layer.
 */
export const runtimeOperations = pgTable(
  "runtime_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    hostId: uuid("host_id").notNull().references(() => runtimeHosts.id),
    /** uuid string referencing runtime_instances.id; nullable for catalog/sync ops. */
    instanceId: uuid("instance_id"),
    /** "put" | "delete" | "sync" | "catalog". */
    kind: text("kind").notNull(),
    /** "in_progress" | "succeeded" | "failed". */
    state: text("state").notNull(),
    description: text("description"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: jsonb("error").$type<Record<string, unknown> | null>(),
    pollAfterMs: integer("poll_after_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("runtime_operations_company_idx").on(table.companyId),
    hostIdx: index("runtime_operations_host_idx").on(table.hostId),
    instanceIdx: index("runtime_operations_instance_idx").on(table.instanceId),
    stateIdx: index("runtime_operations_state_idx").on(table.state),
  }),
);
