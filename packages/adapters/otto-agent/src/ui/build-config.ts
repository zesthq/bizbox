import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildOttoAgentConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  if (v.apiKey) ac.apiKey = v.apiKey;
  ac.timeoutSec = v.timeoutSec ?? 1800;
  return ac;
}
