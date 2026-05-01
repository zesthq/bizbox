import { describe, expect, it } from "vitest";
import { openclawGatewayBroker } from "./broker.js";

describe("openclawGatewayBroker.describeBroker", () => {
  it("returns reachable=false with all capabilities off when the host is unreachable", async () => {
    const descriptor = await openclawGatewayBroker.describeBroker({
      companyId: "c1",
      hostAgentId: "a1",
      hostAdapterType: "openclaw_gateway",
      hostAdapterConfig: {
        // Use a deliberately invalid URL so the WS open fails fast.
        url: "ws://127.0.0.1:1/invalid",
      },
    });
    expect(descriptor.hostKind).toBe("openclaw_gateway");
    expect(descriptor.reachable).toBe(false);
    expect(descriptor.catalog).toBeNull();
    expect(descriptor.capabilities.supportsBundleProvisioning).toBe(false);
    expect(descriptor.capabilities.supportsAgentProvisioning).toBe(false);
    expect(descriptor.capabilities.supportsConfigProfile).toBe(false);
    expect(descriptor.capabilities.supportsMcpServer).toBe(false);
    expect(typeof descriptor.reason).toBe("string");
    expect(descriptor.reason).not.toBe("");
  });

  it("rejects describe when adapter config has no url", async () => {
    const descriptor = await openclawGatewayBroker.describeBroker({
      companyId: "c1",
      hostAgentId: "a1",
      hostAdapterType: "openclaw_gateway",
      hostAdapterConfig: {},
    });
    expect(descriptor.reachable).toBe(false);
    expect(descriptor.reason).toMatch(/url/i);
  });
});
