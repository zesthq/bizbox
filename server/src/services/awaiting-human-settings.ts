import { randomUUID } from "node:crypto";
import { companyAwaitingHumanSettings, type Db } from "@paperclipai/db";
import type {
  AwaitingHumanProvider,
  CompanyAwaitingHumanSettings,
  UpdateCompanyAwaitingHumanSettingsRequest,
} from "@paperclipai/shared";
import { and, eq } from "drizzle-orm";
import { secretService } from "./secrets.js";
import {
  normalizeClickUpAwaitingHumanProviderConfig,
  validateClickUpAwaitingHumanProviderConfig,
} from "./clickup-awaiting-human-settings-adapter.js";
import {
  sendClickUpTransportTestMessage,
  type ClickUpTransportTestNotification,
} from "./clickup-awaiting-human-transport.js";

interface StoredClickUpProviderConfig {
  authTokenRef: { type: "secret_ref"; secretId: string; version?: number | "latest" } | null;
  workspaceId: string | null;
  channelId: string | null;
}

type StoredAwaitingHumanSettingsRow = {
  companyId: string;
  enabled: boolean;
  provider: AwaitingHumanProvider | null;
  providerConfigJson: StoredClickUpProviderConfig | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function defaultStoredSettings(companyId: string) {
  return {
    companyId,
    enabled: false,
    provider: null,
    providerConfigJson: null,
    createdAt: null,
    updatedAt: null,
  };
}

function toPublicSettings(row: StoredAwaitingHumanSettingsRow): CompanyAwaitingHumanSettings {
  return {
    companyId: row.companyId,
    enabled: row.enabled,
    provider: row.provider,
    providerConfig: row.provider === "clickup"
      ? {
        workspaceId: row.providerConfigJson?.workspaceId ?? null,
        channelId: row.providerConfigJson?.channelId ?? null,
      }
      : null,
    hasStoredAuthToken: row.provider === "clickup" && !!row.providerConfigJson?.authTokenRef?.secretId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function trimToken(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveBaseUrl() {
  const configured = process.env.BIZBOX_PUBLIC_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  const apiUrl = process.env.BIZBOX_API_URL?.trim();
  if (!apiUrl) return null;

  try {
    const parsed = new URL(apiUrl);
    if (parsed.pathname === "/api") {
      parsed.pathname = "";
    } else {
      parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "");
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

type ClickUpRuntimeConfigPreview = {
  enabled: boolean;
  provider: AwaitingHumanProvider | null;
  personalToken: string | null;
  workspaceId: string | null;
  channelId: string | null;
};

export function awaitingHumanSettingsService(db: Db) {
  const secrets = secretService(db);

  async function getStored(companyId: string) {
    const [row] = await db
      .select()
      .from(companyAwaitingHumanSettings)
      .where(eq(companyAwaitingHumanSettings.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  async function get(companyId: string): Promise<CompanyAwaitingHumanSettings> {
    const row = await getStored(companyId);
    return toPublicSettings(row ?? defaultStoredSettings(companyId));
  }

  async function previewClickUpRuntimeConfig(
    companyId: string,
    patch?: UpdateCompanyAwaitingHumanSettingsRequest,
  ): Promise<ClickUpRuntimeConfigPreview> {
    const row = await getStored(companyId);
    const effective = row ?? defaultStoredSettings(companyId);

    const nextProvider = patch?.provider !== undefined ? patch.provider : effective.provider;
    const nextEnabled = patch?.enabled !== undefined ? patch.enabled : effective.enabled;

    let nextProviderConfig: StoredClickUpProviderConfig | null =
      effective.provider === "clickup"
        ? (effective.providerConfigJson ?? defaultStoredSettings(companyId).providerConfigJson)
        : null;

    if (patch?.provider !== undefined && patch.provider !== effective.provider && patch.providerConfig === undefined) {
      nextProviderConfig = null;
    }

    if (patch?.providerConfig !== undefined) {
      const normalizedConfig = normalizeClickUpAwaitingHumanProviderConfig(patch.providerConfig);
      nextProviderConfig = nextProvider === "clickup"
        ? {
          authTokenRef: nextProviderConfig?.authTokenRef ?? null,
          workspaceId: normalizedConfig?.workspaceId ?? null,
          channelId: normalizedConfig?.channelId ?? null,
        }
        : null;
    }

    const nextToken = trimToken(patch?.clickupPersonalToken);
    const personalToken = nextToken
      || (nextProviderConfig?.authTokenRef
        ? await secrets.resolveSecretValue(
          companyId,
          nextProviderConfig.authTokenRef.secretId,
          nextProviderConfig.authTokenRef.version ?? "latest",
        )
        : null);
    const config = normalizeClickUpAwaitingHumanProviderConfig(nextProviderConfig ?? null);

    return {
      enabled: nextEnabled,
      provider: nextProvider,
      personalToken,
      workspaceId: config?.workspaceId ?? null,
      channelId: config?.channelId ?? null,
    };
  }

  async function resolveClickUpRuntimeConfig(companyId: string) {
    const config = await previewClickUpRuntimeConfig(companyId);
    if (!config.enabled || config.provider !== "clickup") {
      throw new Error("awaiting-human-bridge-disabled");
    }
    return config;
  }

  async function resolveProvider(companyId: string): Promise<AwaitingHumanProvider> {
    const row = await getStored(companyId);
    const effective = row ?? defaultStoredSettings(companyId);
    if (!effective.enabled || !effective.provider) {
      throw new Error("awaiting-human-bridge-disabled");
    }
    return effective.provider;
  }

  async function update(
    companyId: string,
    patch: UpdateCompanyAwaitingHumanSettingsRequest,
    actor?: { userId?: string | null; agentId?: string | null },
  ): Promise<CompanyAwaitingHumanSettings> {
    const existing = await getStored(companyId);
    const baseline = existing ?? defaultStoredSettings(companyId);

    const nextProvider = patch.provider !== undefined ? patch.provider : baseline.provider;
    const nextEnabled = patch.enabled !== undefined ? patch.enabled : baseline.enabled;

    let nextProviderConfig: StoredClickUpProviderConfig | null =
      baseline.provider === "clickup" ? (baseline.providerConfigJson ?? defaultStoredSettings(companyId).providerConfigJson) : null;

    if (patch.provider !== undefined && patch.provider !== baseline.provider && patch.providerConfig === undefined) {
      nextProviderConfig = null;
    }

    if (patch.providerConfig !== undefined) {
      const normalizedConfig = normalizeClickUpAwaitingHumanProviderConfig(patch.providerConfig);
      nextProviderConfig = nextProvider === "clickup"
        ? {
          authTokenRef: nextProviderConfig?.authTokenRef ?? null,
          workspaceId: normalizedConfig?.workspaceId ?? null,
          channelId: normalizedConfig?.channelId ?? null,
        }
        : null;
    }

    if (nextProvider === "clickup") {
      validateClickUpAwaitingHumanProviderConfig({
        enabled: nextEnabled,
        providerConfig: nextProviderConfig
          ? { workspaceId: nextProviderConfig.workspaceId, channelId: nextProviderConfig.channelId }
          : null,
      });
    }

    const nextToken = trimToken(patch.clickupPersonalToken);
    if (nextProvider === "clickup" && nextToken) {
      if (nextProviderConfig?.authTokenRef?.secretId) {
        await secrets.rotate(nextProviderConfig.authTokenRef.secretId, { value: nextToken }, actor);
      } else {
        const created = await secrets.create(
          companyId,
          {
            name: `awaiting-human-clickup-token-${randomUUID().slice(0, 8)}`,
            provider: "local_encrypted",
            value: nextToken,
            description: "ClickUp personal token for Awaiting Human bridge",
          },
          actor,
        );
        nextProviderConfig = {
          authTokenRef: { type: "secret_ref", secretId: created.id, version: "latest" },
          workspaceId: nextProviderConfig?.workspaceId ?? null,
          channelId: nextProviderConfig?.channelId ?? null,
        };
      }
    }

    const values = {
      enabled: nextEnabled,
      provider: nextProvider,
      providerConfigJson: nextProvider === "clickup" ? nextProviderConfig : null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(companyAwaitingHumanSettings)
        .set(values)
        .where(and(
          eq(companyAwaitingHumanSettings.id, existing.id),
          eq(companyAwaitingHumanSettings.companyId, companyId),
        ));
    } else {
      await db.insert(companyAwaitingHumanSettings).values({
        companyId,
        ...values,
      }).onConflictDoUpdate({
        target: companyAwaitingHumanSettings.companyId,
        set: values,
      });
    }

    return get(companyId);
  }

  async function testClickUpTransport(
    companyId: string,
    patch?: UpdateCompanyAwaitingHumanSettingsRequest,
  ) {
    const config = await previewClickUpRuntimeConfig(companyId, patch);
    const baseUrl = resolveBaseUrl();
    const link = baseUrl
      ? new URL("/company/settings/awaiting-human", `${baseUrl}/`).toString()
      : "/company/settings/awaiting-human";
    const notification: ClickUpTransportTestNotification = {
      title: "Awaiting Human transport test",
      summary: "Bizbox sent this confirmation through the ClickUp awaiting-human transport.",
      body: [
        `Provider: ${config.provider ?? "none"}`,
        `Workspace ID: ${config.workspaceId ?? "instance default"}`,
        `Channel ID: ${config.channelId ?? "instance default"}`,
      ].map((line) => `- ${line}`).join("\n"),
      cta: "No action needed. This is a transport test.",
      link,
    };
    return sendClickUpTransportTestMessage(notification, {
      personalToken: config.personalToken,
      workspaceId: config.workspaceId,
      channelId: config.channelId,
    });
  }
  return {
    get,
    update,
    resolveProvider,
    resolveClickUpRuntimeConfig,
    testClickUpTransport,
    getStored,
  };
}
