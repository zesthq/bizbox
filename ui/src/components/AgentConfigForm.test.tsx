// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConfigForm } from "./AgentConfigForm";
import { defaultCreateValues } from "./agent-config-defaults";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: null,
    selectedCompany: null,
  }),
}));

vi.mock("../adapters/use-disabled-adapters", () => ({
  useDisabledAdaptersSync: () => [],
}));

vi.mock("../adapters/use-adapter-capabilities", () => ({
  useAdapterCapabilities: () => (type: string) => {
    if (type === "claude_local") {
      return {
        supportsInstructionsBundle: true,
        supportsSkills: true,
        supportsLocalAgentJwt: true,
        requiresMaterializedRuntimeSkills: false,
      };
    }
    return {
      supportsInstructionsBundle: false,
      supportsSkills: false,
      supportsLocalAgentJwt: false,
      requiresMaterializedRuntimeSkills: false,
    };
  },
}));

vi.mock("../adapters", () => ({
  getUIAdapter: (type: string) => ({
    type,
    label: type,
    ConfigFields: () => <div data-testid={`config-fields-${type}`}>{type} config fields</div>,
    buildAdapterConfig: () => ({}),
  }),
}));

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: () => <div>mock markdown editor</div>,
}));

vi.mock("./PathInstructionsModal", () => ({
  ChoosePathButton: () => <button type="button">Choose path</button>,
}));

vi.mock("./ReportsToPicker", () => ({
  ReportsToPicker: () => <div>reports to picker</div>,
}));

vi.mock("./EnvVarEditor", () => ({
  EnvVarEditor: () => <div>env var editor</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentConfigForm adapter config rendering", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function renderForAdapter(adapterType: string) {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const values = { ...defaultCreateValues, adapterType };

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AgentConfigForm
              mode="create"
              values={values}
              onChange={() => {}}
              showAdapterTypeField={false}
              showAdapterTestEnvironmentButton={false}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });

    return root;
  }

  it("renders OpenClaw config fields only in the dedicated OpenClaw section", async () => {
    const root = renderForAdapter("openclaw_gateway");

    expect(container.textContent).toContain("Connect OpenClaw");
    expect(container.textContent).toContain("openclaw_gateway config fields");
    expect(container.textContent).not.toContain("Adapter Configuration");

    await act(async () => {
      root.unmount();
    });
  });

  it("renders generic adapter configuration for remote non-OpenClaw adapters", async () => {
    const root = renderForAdapter("http");

    expect(container.textContent).toContain("Adapter Configuration");
    expect(container.textContent).toContain("http config fields");
    expect(container.textContent).not.toContain("Permissions & Configuration");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps local adapters in the local permissions and configuration section", async () => {
    const root = renderForAdapter("claude_local");

    expect(container.textContent).toContain("Permissions & Configuration");
    expect(container.textContent).toContain("claude_local config fields");
    expect(container.textContent).not.toContain("Adapter Configuration");

    await act(async () => {
      root.unmount();
    });
  });
});
