// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentSkillSnapshot } from "@paperclipai/shared";
import { AgentLoadoutTab } from "./AgentLoadoutTab";
import { queryKeys } from "../lib/queryKeys";

const mockAgentsApi = vi.hoisted(() => ({
  skills: vi.fn(),
  syncSkills: vi.fn(),
  update: vi.fn(),
}));

const mockCompanySkillsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockAssetsApi = vi.hoisted(() => ({
  uploadImage: vi.fn(),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/companySkills", () => ({
  companySkillsApi: mockCompanySkillsApi,
}));

vi.mock("../api/assets", () => ({
  assetsApi: mockAssetsApi,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

function buildAgent(): Agent {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Agent Smith",
    urlKey: "agent-smith",
    role: "engineer",
    title: "Engineer",
    icon: "bot",
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "claude_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: {
      nickname: "Old Nick",
      portraitAssetPath: "/api/assets/portrait-1/content",
      loadout: {
        tools: ["github"],
        memory: ["task-memory"],
        slotLayoutVersion: "rpg-v1",
      },
    },
    createdAt: new Date("2026-05-22T00:00:00.000Z"),
    updatedAt: new Date("2026-05-22T00:00:00.000Z"),
  };
}

function buildSnapshot(): AgentSkillSnapshot {
  return {
    adapterType: "claude_local",
    supported: true,
    mode: "persistent",
    desiredSkills: [],
    entries: [],
    warnings: [],
  };
}

describe("AgentLoadoutTab", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockAgentsApi.skills.mockResolvedValue(buildSnapshot());
    mockAgentsApi.syncSkills.mockImplementation(async (_id: string, desiredSkills: string[]) => ({
      ...buildSnapshot(),
      desiredSkills,
    }));
    mockAgentsApi.update.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...buildAgent(),
      ...data,
    }));
    mockCompanySkillsApi.list.mockResolvedValue([
      {
        id: "skill-1",
        key: "company/analysis",
        name: "Analysis",
        description: "Break down problems.",
      },
    ]);
    mockAssetsApi.uploadImage.mockResolvedValue({
      assetId: "asset-2",
      contentPath: "/api/assets/portrait-2/content",
    });
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("hydrates metadata, saves loadout changes through agentsApi.update, and syncs skills separately", async () => {
    const saveActionRef: { current: (() => void) | null } = { current: null };
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.agents.skills("agent-1"), buildSnapshot());
    queryClient.setQueryData(queryKeys.companySkills.list("company-1"), [
      {
        id: "skill-1",
        key: "company/analysis",
        name: "Analysis",
        description: "Break down problems.",
      },
    ]);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AgentLoadoutTab
            agent={buildAgent()}
            companyId="company-1"
            onDirtyChange={() => {}}
            onSaveActionChange={(fn) => {
              saveActionRef.current = fn;
            }}
            onCancelActionChange={() => {}}
            onSavingChange={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    await flushReact();
    await flushReact();
    await flushReact();

    const nicknameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.getAttribute("placeholder") === "The Archivist",
    ) as HTMLInputElement | undefined;
    const browserCard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Browser"),
    ) as HTMLButtonElement | undefined;
    const skillCard = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Analysis"),
    ) as HTMLButtonElement | undefined;

    expect(nicknameInput?.value).toBe("Old Nick");
    expect(browserCard).toBeDefined();
    expect(skillCard).toBeDefined();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(nicknameInput, "New Nick");
      nicknameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      browserCard!.click();
      skillCard!.click();
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    await flushReact();

    expect(mockAgentsApi.syncSkills).toHaveBeenCalledWith("agent-1", ["company/analysis"], "company-1");
    expect(saveActionRef.current).not.toBeNull();

    await act(async () => {
      saveActionRef.current?.();
    });
    await flushReact();

    expect(mockAgentsApi.update).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        name: "Agent Smith",
        title: "Engineer",
        icon: "bot",
        metadata: expect.objectContaining({
          nickname: "New Nick",
          portraitAssetPath: "/api/assets/portrait-1/content",
          loadout: expect.objectContaining({
            tools: ["github", "browser"],
            memory: ["task-memory"],
            slotLayoutVersion: "rpg-v1",
          }),
        }),
      }),
      "company-1",
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
