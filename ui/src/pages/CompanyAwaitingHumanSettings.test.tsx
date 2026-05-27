// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { CompanyProvider } from "@/context/CompanyContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyAwaitingHumanSettings } from "./CompanyAwaitingHumanSettings";

const mockCompaniesApi = vi.hoisted(() => ({
  list: vi.fn(async () => [
    {
      id: "company-1",
      name: "Citro X",
      status: "active" as const,
    },
  ]),
  create: vi.fn(),
}));

const mockSettingsApi = vi.hoisted(() => ({
  get: vi.fn(async () => ({
    enabled: true,
    provider: "clickup" as const,
    providerConfig: {
      workspaceId: "workspace-1",
      channelId: "channel-1",
    },
    hasStoredAuthToken: true,
  })),
  update: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock("../api/companies", () => ({
  companiesApi: mockCompaniesApi,
}));

vi.mock("../api/companyAwaitingHumanSettings", () => ({
  companyAwaitingHumanSettingsApi: mockSettingsApi,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function renderSettingsPage(container: HTMLDivElement) {
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BreadcrumbProvider>
            <CompanyProvider>
              <CompanyAwaitingHumanSettings />
            </CompanyProvider>
          </BreadcrumbProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  });

  await flushReact();
  await flushReact();
  await flushReact();
  await flushReact();

  return { root, queryClient };
}

describe("CompanyAwaitingHumanSettings", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders after the company selection changes and the settings load", async () => {
    const { root } = await renderSettingsPage(container);

    expect(mockCompaniesApi.list).toHaveBeenCalledTimes(1);
    expect(mockSettingsApi.get).toHaveBeenCalledWith("company-1");
    expect(container.textContent).toContain("Awaiting Human");
    expect(container.textContent).toContain("Send test confirmation");

    await act(async () => {
      root.unmount();
    });
  });
});
