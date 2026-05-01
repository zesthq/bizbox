import { describe, expect, it } from "vitest";
import {
  validateAgainstJsonSchema,
  validateInstanceConfig,
} from "../services/plugin-config-validator.js";

describe("plugin-config-validator export surface", () => {
  it("exposes the runtime broker friendly alias", () => {
    expect(validateAgainstJsonSchema).toBe(validateInstanceConfig);
  });

  it("validates a desiredConfig against an Agent Runtime catalog plan schema", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["skills"],
      properties: {
        skills: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
      },
    };
    const ok = validateAgainstJsonSchema({ skills: ["pdf"] }, schema);
    expect(ok.valid).toBe(true);

    const missing = validateAgainstJsonSchema({}, schema);
    expect(missing.valid).toBe(false);
    expect(missing.errors?.[0]?.message).toMatch(/required/i);

    const wrongType = validateAgainstJsonSchema({ skills: "pdf" }, schema);
    expect(wrongType.valid).toBe(false);

    const extra = validateAgainstJsonSchema(
      { skills: ["pdf"], unknown: 1 },
      schema,
    );
    expect(extra.valid).toBe(false);
  });
});
