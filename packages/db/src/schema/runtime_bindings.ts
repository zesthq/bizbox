import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { runtimeInstances } from "./runtime_instances.js";

/**
 * Linkage from a Bizbox entity (company, agent, issue) to a remote runtime
 * instance, with a credentials reference returned by the broker. Per the
 * OSBAPI binding pattern, one provisioned instance can have N bindings, each
 * with its own scoped credential. We never store raw credentials here —
 * `credentialsRef` points at runtime_secret_refs / company_secrets.
 */
export const runtimeBindings = pgTable(
  "runtime_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => runtimeInstances.id, { onDelete: "cascade" }),
    /** "company" | "agent" | "issue". */
    boundEntityKind: text("bound_entity_kind").notNull(),
    boundEntityId: uuid("bound_entity_id").notNull(),
    credentialsRef: text("credentials_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("runtime_bindings_company_idx").on(table.companyId),
    instanceIdx: index("runtime_bindings_instance_idx").on(table.instanceId),
    entityIdx: index("runtime_bindings_entity_idx").on(
      table.boundEntityKind,
      table.boundEntityId,
    ),
  }),
);
