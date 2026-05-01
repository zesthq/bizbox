import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * One row per remote runtime host registered with Bizbox (e.g. one cloud
 * OpenClaw deployment). Hosts are not provisioned by Bizbox in V1 — they are
 * registered/bound via the existing onboarding/pairing flow. Each host is
 * scoped to exactly one company.
 */
export const runtimeHosts = pgTable(
  "runtime_hosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** The Bizbox agent record acting as the runtime host (carrier of adapter config). */
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    adapterType: text("adapter_type").notNull(),
    /** Cached AgentRuntimeCatalog returned by the broker. */
    catalogSnapshot: jsonb("catalog_snapshot").$type<Record<string, unknown> | null>(),
    catalogFetchedAt: timestamp("catalog_fetched_at", { withTimezone: true }),
    reachable: boolean("reachable").notNull().default(false),
    lastReachableAt: timestamp("last_reachable_at", { withTimezone: true }),
    /** Last describe/probe error reason when reachable=false. */
    lastReason: text("last_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentUniqueIdx: uniqueIndex("runtime_hosts_company_agent_idx").on(
      table.companyId,
      table.agentId,
    ),
    companyIdx: index("runtime_hosts_company_idx").on(table.companyId),
  }),
);
