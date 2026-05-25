import type { AgentMetadata, AgentRole } from "@paperclipai/shared";

export interface LoadoutCatalogEntry {
  key: string;
  name: string;
  description: string;
  icon: string;
  accentClassName: string;
}

export interface AgentLoadoutDraft {
  nickname: string;
  portraitAssetPath: string | null;
  tools: string[];
  memory: string[];
}

export const SKILL_SLOT_COUNT = 4;
export const TOOL_SLOT_COUNT = 3;
export const MEMORY_SLOT_COUNT = 3;
export const LOADOUT_SLOT_LAYOUT_VERSION = "rpg-v1";

export const TOOL_LOADOUT_CATALOG: LoadoutCatalogEntry[] = [
  {
    key: "github",
    name: "GitHub",
    description: "Repo history, issues, PRs, and code-review surfaces.",
    icon: "git-branch",
    accentClassName: "from-emerald-500/30 via-emerald-400/10 to-transparent",
  },
  {
    key: "browser",
    name: "Browser",
    description: "Open tabs, inspect UIs, and verify local or remote pages.",
    icon: "globe",
    accentClassName: "from-sky-500/30 via-sky-400/10 to-transparent",
  },
  {
    key: "documents",
    name: "Documents",
    description: "Draft and revise rich docs, reports, and decision artifacts.",
    icon: "file-code",
    accentClassName: "from-amber-500/30 via-amber-400/10 to-transparent",
  },
  {
    key: "research",
    name: "Research",
    description: "Source gathering, synthesis, and external knowledge work.",
    icon: "search",
    accentClassName: "from-violet-500/30 via-violet-400/10 to-transparent",
  },
  {
    key: "terminal",
    name: "Terminal",
    description: "Shell commands, local build loops, and repository surgery.",
    icon: "terminal",
    accentClassName: "from-rose-500/30 via-rose-400/10 to-transparent",
  },
  {
    key: "spreadsheets",
    name: "Spreadsheets",
    description: "Workbook generation, analysis, and lightweight modeling.",
    icon: "database",
    accentClassName: "from-cyan-500/30 via-cyan-400/10 to-transparent",
  },
];

export const MEMORY_LOADOUT_CATALOG: LoadoutCatalogEntry[] = [
  {
    key: "task-memory",
    name: "Task Memory",
    description: "Short-lived context optimized for current issue execution.",
    icon: "zap",
    accentClassName: "from-orange-500/30 via-orange-400/10 to-transparent",
  },
  {
    key: "company-memory",
    name: "Company Memory",
    description: "Durable org knowledge, operating norms, and past decisions.",
    icon: "crown",
    accentClassName: "from-yellow-500/30 via-yellow-400/10 to-transparent",
  },
  {
    key: "project-memory",
    name: "Project Memory",
    description: "Focused recall for the active initiative and its artifacts.",
    icon: "package",
    accentClassName: "from-fuchsia-500/30 via-fuchsia-400/10 to-transparent",
  },
  {
    key: "external-refs",
    name: "External Refs",
    description: "Pinned references, URLs, and external knowledge pointers.",
    icon: "telescope",
    accentClassName: "from-indigo-500/30 via-indigo-400/10 to-transparent",
  },
];

export function readAgentLoadoutDraft(metadata: AgentMetadata | Record<string, unknown> | null | undefined): AgentLoadoutDraft {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const loadout = record.loadout && typeof record.loadout === "object" && !Array.isArray(record.loadout)
    ? record.loadout as Record<string, unknown>
    : {};

  return {
    nickname: typeof record.nickname === "string" ? record.nickname : "",
    portraitAssetPath: typeof record.portraitAssetPath === "string" ? record.portraitAssetPath : null,
    tools: sanitizeSelection(loadout.tools, TOOL_SLOT_COUNT),
    memory: sanitizeSelection(loadout.memory, MEMORY_SLOT_COUNT),
  };
}

export function buildAgentMetadata(existing: AgentMetadata | Record<string, unknown> | null | undefined, draft: AgentLoadoutDraft): AgentMetadata {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  const next: AgentMetadata = {
    ...base,
    loadout: {
      ...(base.loadout && typeof base.loadout === "object" && !Array.isArray(base.loadout)
        ? base.loadout as Record<string, unknown>
        : {}),
      tools: sanitizeSelection(draft.tools, TOOL_SLOT_COUNT),
      memory: sanitizeSelection(draft.memory, MEMORY_SLOT_COUNT),
      slotLayoutVersion: LOADOUT_SLOT_LAYOUT_VERSION,
    },
  };

  if (draft.nickname.trim()) {
    next.nickname = draft.nickname.trim();
  } else {
    delete next.nickname;
  }

  if (draft.portraitAssetPath?.trim()) {
    next.portraitAssetPath = draft.portraitAssetPath.trim();
  } else {
    delete next.portraitAssetPath;
  }

  return next;
}

export function sanitizeSelection(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    next.push(trimmed);
    seen.add(trimmed);
    if (next.length >= limit) break;
  }
  return next;
}

export function assignIntoSlots(slots: string[], key: string, slotIndex: number, slotCount: number): string[] {
  const next = Array.from({ length: slotCount }, (_, index) => slots[index] ?? "");
  const existingIndex = next.indexOf(key);
  if (existingIndex >= 0) {
    next[existingIndex] = "";
  }
  next[slotIndex] = key;
  return next.filter(Boolean);
}

export function removeFromSlots(slots: string[], key: string): string[] {
  return slots.filter((entry) => entry !== key);
}

export function addToFirstOpenSlot(slots: string[], key: string, slotCount: number): string[] {
  if (slots.includes(key)) return slots;
  if (slots.length >= slotCount) {
    return [...slots.slice(1), key];
  }
  return [...slots, key];
}

export function roleAccentClassName(role: AgentRole | string): string {
  switch (role) {
    case "ceo":
      return "from-amber-400/45 via-yellow-300/10 to-transparent";
    case "cto":
    case "engineer":
    case "devops":
      return "from-cyan-400/45 via-sky-300/10 to-transparent";
    case "designer":
      return "from-pink-400/45 via-rose-300/10 to-transparent";
    case "researcher":
      return "from-violet-400/45 via-indigo-300/10 to-transparent";
    case "pm":
    case "cmo":
      return "from-emerald-400/45 via-lime-300/10 to-transparent";
    default:
      return "from-primary/35 via-primary/10 to-transparent";
  }
}
