import {
  type ClickUpAwaitingHumanConfigOverrides,
  detectClickUpAwaitingHumanBridgeEvents,
  sendAwaitingHumanNotification,
} from "./clickup-awaiting-human-transport.js";
import type { AwaitingHumanBridgeAdapter, AwaitingHumanBridgePollEvent } from "./awaiting-human-bridge.js";
import { awaitingHumanBridges, type Db } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { awaitingHumanSettingsService } from "./awaiting-human-settings.js";

async function loadCompanyOverrides(db: Db, companyId: string): Promise<ClickUpAwaitingHumanConfigOverrides> {
  const resolved = await awaitingHumanSettingsService(db).resolveClickUpRuntimeConfig(companyId);
  return {
    personalToken: resolved.personalToken,
    workspaceId: resolved.workspaceId,
    channelId: resolved.channelId,
  };
}

async function loadBridgeOverrides(db: Db, bridgeId: string) {
  const [bridge] = await db
    .select({ companyId: awaitingHumanBridges.companyId })
    .from(awaitingHumanBridges)
    .where(eq(awaitingHumanBridges.id, bridgeId))
    .limit(1);
  if (!bridge) {
    throw new Error("awaiting-human-bridge-not-found");
  }
  return loadCompanyOverrides(db, bridge.companyId);
}

export function clickupAwaitingHumanBridgeAdapter(db: Db): AwaitingHumanBridgeAdapter {
  return {
    async send(input) {
      const overrides = await loadCompanyOverrides(db, input.companyId);
      const result = await sendAwaitingHumanNotification({
        companyId: input.companyId,
        issueId: input.issueId,
        handoffKind: input.handoffKind,
        notification: input.notification,
      }, overrides);
      if (result.status !== "sent") {
        throw new Error(result.detail);
      }
      return {
        externalThreadId: result.externalId ?? "",
        externalMessageId: result.externalId ?? null,
        nextPollAt: new Date(Date.now() + 60_000),
      };
    },

    async poll(input) {
      const messageId = input.externalMessageId?.trim();
      if (!messageId) {
        return { status: "skipped", detail: "missing-external-message-id", events: [] };
      }
      const overrides = await loadBridgeOverrides(db, input.bridgeId);
      const detected = await detectClickUpAwaitingHumanBridgeEvents(messageId, overrides);
      const events: AwaitingHumanBridgePollEvent[] = detected.events.map((event) => ({
        kind: event.kind,
        externalEventId: event.externalEventId,
        externalMessageId: event.externalMessageId,
        body: event.body ?? null,
        metadata: event.metadata ?? {},
      }));
      const status: "ok" | "skipped" | "failed" =
        detected.status === "sent"
          ? "ok"
          : detected.status === "skipped"
            ? "skipped"
            : "failed";
      return {
        status,
        detail: detected.detail,
        events,
      };
    },

    async close() {
      return;
    },
  };
}
