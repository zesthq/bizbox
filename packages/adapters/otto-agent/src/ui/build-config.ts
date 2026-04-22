import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildOttoAgentConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  // apiKey is intentionally not set here — operators must supply it via
  // their deployment secrets, never via the UI form directly.
  ac.timeoutSec = 1800;
  return ac;
}
