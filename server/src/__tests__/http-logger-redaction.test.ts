import { describe, expect, it } from "vitest";
import { REDACTED_EVENT_VALUE } from "../redaction.js";
import { redactHttpLogValue } from "../middleware/logger.js";

describe("http logger redaction", () => {
  it("redacts sensitive request body fields before logging", () => {
    expect(
      redactHttpLogValue({
        adapterConfig: {
          authToken: "gateway-token",
          safe: "ok",
          nested: {
            accessToken: "access-token",
          },
        },
      }),
    ).toEqual({
      adapterConfig: {
        authToken: REDACTED_EVENT_VALUE,
        safe: "ok",
        nested: {
          accessToken: REDACTED_EVENT_VALUE,
        },
      },
    });
  });
});
