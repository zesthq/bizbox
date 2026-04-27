import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildOpenClawGatewayConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  if (typeof v.accessToken === "string" && v.accessToken.trim().length > 0) {
    ac.authToken = v.accessToken.trim();
  }
  ac.disableDeviceAuth = v.openClawSetupMode !== "token_and_device_pairing";
  ac.timeoutSec = 120;
  ac.waitTimeoutMs = 120000;
  ac.sessionKeyStrategy = "issue";
  ac.role = "operator";
  ac.scopes = ["operator.admin", "operator.write"];
  return ac;
}
