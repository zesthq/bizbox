import { describe, expect, it } from "vitest";
import { normalizeOpenClawConnectionState } from "./openclaw-connection.js";

describe("normalizeOpenClawConnectionState", () => {
  it("prioritizes unreachable checks ahead of not_configured checks", () => {
    const result = normalizeOpenClawConnectionState({
      status: "fail",
      testedAt: "2026-04-29T00:00:00.000Z",
      checks: [
        {
          code: "openclaw_gateway_url_missing",
          level: "error",
          message: "URL missing",
        },
        {
          code: "openclaw_gateway_unreachable",
          level: "error",
          message: "Gateway unreachable",
        },
      ],
    });

    expect(result).toEqual({
      status: "unreachable",
      checkedAt: "2026-04-29T00:00:00.000Z",
      message: "Gateway unreachable",
    });
  });

  it("treats unclassified warn results as connected", () => {
    const result = normalizeOpenClawConnectionState({
      status: "warn",
      testedAt: "2026-04-29T01:00:00.000Z",
      checks: [
        {
          code: "openclaw_gateway_deprecated_config",
          level: "warn",
          message: "Deprecated config field in use",
        },
      ],
    });

    expect(result).toEqual({
      status: "connected",
      checkedAt: "2026-04-29T01:00:00.000Z",
      message: null,
    });
  });
});
