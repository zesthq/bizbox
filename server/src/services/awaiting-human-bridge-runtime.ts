import type { Db } from "@paperclipai/db";
import { awaitingHumanBridgeService } from "./awaiting-human-bridge.js";
import { clickupAwaitingHumanBridgeAdapter } from "./clickup-awaiting-human-bridge-adapter.js";
import { awaitingHumanSettingsService } from "./awaiting-human-settings.js";

export function awaitingHumanBridgeRuntime(db: Db) {
  const awaitingHumanSettings = awaitingHumanSettingsService(db);
  return awaitingHumanBridgeService(db, {
    resolveProviderForCompany: async (companyId) => awaitingHumanSettings.resolveProvider(companyId),
    resolveAdapter: (provider) => {
      if (provider !== "clickup") {
        throw new Error(`Unknown awaiting human bridge provider: ${provider}`);
      }
      return clickupAwaitingHumanBridgeAdapter(db);
    },
  });
}
