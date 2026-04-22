import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse a stdout line emitted by the otto_agent server adapter.
 * Lines prefixed with [otto-agent:event] carry structured JSON.
 * Lines prefixed with [otto-agent] are system messages.
 * Everything else passes through as raw stdout.
 */
export function parseOttoAgentStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[otto-agent:event]")) {
    const match = trimmed.match(/^\[otto-agent:event\]\s+stream=(\S+)\s+data=(.*)$/s);
    if (!match) return [{ kind: "stdout", ts, text: line }];

    const stream = String(match[1]).toLowerCase();
    const data = asRecord(safeJsonParse(String(match[2]).trim()));

    if (stream === "assistant") {
      const delta = typeof data?.delta === "string" ? data.delta : "";
      if (delta.length > 0) return [{ kind: "assistant", ts, text: delta, delta: true }];
      const text = typeof data?.text === "string" ? data.text : "";
      if (text.length > 0) return [{ kind: "assistant", ts, text }];
      return [];
    }

    if (stream === "error") {
      const message =
        (typeof data?.error === "string" ? data.error : "") ||
        (typeof data?.message === "string" ? data.message : "");
      return message ? [{ kind: "stderr", ts, text: message }] : [];
    }

    return [];
  }

  if (trimmed.startsWith("[otto-agent]")) {
    return [{ kind: "system", ts, text: trimmed.replace(/^\[otto-agent\]\s*/, "") }];
  }

  return [{ kind: "stdout", ts, text: line }];
}
