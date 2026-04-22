import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySecrets } from "./company_secrets.js";

export const companyGitHubCredentials = pgTable(
  "company_github_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    owner: text("owner").notNull(),
    secretId: uuid("secret_id").notNull().references(() => companySecrets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_github_credentials_company_idx").on(table.companyId),
    companySecretIdx: index("company_github_credentials_secret_idx").on(table.secretId),
    companyOwnerUq: uniqueIndex("company_github_credentials_company_owner_uq").on(
      table.companyId,
      table.hostname,
      table.owner,
    ),
  }),
);
