import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { runtimeInstances } from "./runtime_instances.js";

/**
 * Reference linking a runtime instance to a Bizbox-managed secret. We never
 * store raw secret values on broker payloads — only references. The remote
 * either fetches the actual secret at use-time via a binding credential or
 * stores it by id only. Rotation is a PATCH of the same instance, not a
 * re-provision.
 */
export const runtimeSecretRefs = pgTable(
  "runtime_secret_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => runtimeInstances.id, { onDelete: "cascade" }),
    /** Logical key used by the remote, e.g. "anthropicApiKey". */
    refKey: text("ref_key").notNull(),
    /** Bizbox secret reference (e.g. company_secret id). */
    secretRef: text("secret_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    instanceKeyUniqueIdx: uniqueIndex("runtime_secret_refs_instance_key_idx").on(
      table.instanceId,
      table.refKey,
    ),
    companyIdx: index("runtime_secret_refs_company_idx").on(table.companyId),
  }),
);
