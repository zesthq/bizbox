import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { builderProviderSettings } from "@paperclipai/db";
import type {
  BuilderProviderSettings,
  BuilderProviderType,
  UpdateBuilderProviderSettings,
} from "@paperclipai/shared";
import { secretService } from "../secrets.js";
import { unprocessable } from "../../errors.js";

/**
 * Per-company Builder provider settings.
 *
 * The API key is stored as a `companySecret` and referenced by id; the raw
 * value is never returned to clients. A `hasApiKey` boolean lets the UI show
 * "configured / not configured" without revealing anything.
 */

type Row = typeof builderProviderSettings.$inferSelect;

function toSettings(row: Row): BuilderProviderSettings {
  return {
    companyId: row.companyId,
    providerType: row.providerType as BuilderProviderType,
    model: row.model,
    baseUrl: row.baseUrl,
    secretId: row.secretId,
    hasApiKey: !!row.secretId,
    extras: (row.extras ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function builderProviderSettingsStore(db: Db) {
  const secrets = secretService(db);

  return {
    get: async (companyId: string): Promise<BuilderProviderSettings | null> => {
      const row = await db
        .select()
        .from(builderProviderSettings)
        .where(eq(builderProviderSettings.companyId, companyId))
        .then((rows) => rows[0] ?? null);
      return row ? toSettings(row) : null;
    },

    upsert: async (
      companyId: string,
      input: UpdateBuilderProviderSettings,
    ): Promise<BuilderProviderSettings> => {
      // Validate the secret reference belongs to this company before storing
      // it; otherwise an attacker with company A access could bind a secret
      // from company B by id.
      if (input.secretId) {
        const secret = await secrets.getById(input.secretId);
        if (!secret || secret.companyId !== companyId) {
          throw unprocessable("Secret must belong to the same company");
        }
      }

      const now = new Date();
      const values = {
        companyId,
        providerType: input.providerType,
        model: input.model,
        baseUrl: input.baseUrl ?? null,
        secretId: input.secretId ?? null,
        extras: input.extras ?? {},
        updatedAt: now,
      };

      const [row] = await db
        .insert(builderProviderSettings)
        .values({ ...values, createdAt: now })
        .onConflictDoUpdate({
          target: builderProviderSettings.companyId,
          set: values,
        })
        .returning();
      return toSettings(row);
    },

    /**
     * Resolve the API key for the configured provider. Returns null if no
     * settings exist or no secret is bound; callers should treat that as
     * "Builder not configured".
     */
    resolveApiKey: async (companyId: string): Promise<string | null> => {
      const row = await db
        .select()
        .from(builderProviderSettings)
        .where(eq(builderProviderSettings.companyId, companyId))
        .then((rows) => rows[0] ?? null);
      if (!row || !row.secretId) return null;
      try {
        return await secrets.resolveSecretValue(companyId, row.secretId, "latest");
      } catch {
        return null;
      }
    },
  };
}

export type BuilderProviderSettingsStore = ReturnType<typeof builderProviderSettingsStore>;
