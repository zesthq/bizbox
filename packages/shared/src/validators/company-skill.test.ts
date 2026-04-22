import { describe, expect, it } from "vitest";
import { companySkillImportSchema } from "./company-skill.js";

describe("companySkillImportSchema", () => {
  it("accepts legacy source-only payloads", () => {
    expect(companySkillImportSchema.parse({
      source: "https://github.com/vercel-labs/skills",
    })).toEqual({
      source: "https://github.com/vercel-labs/skills",
    });
  });

  it("accepts private github auth payloads", () => {
    expect(companySkillImportSchema.parse({
      source: "https://github.com/acme/private-skill",
      githubAuth: {
        visibility: "private",
        secretId: "11111111-1111-4111-8111-111111111111",
      },
    })).toEqual({
      source: "https://github.com/acme/private-skill",
      githubAuth: {
        visibility: "private",
        secretId: "11111111-1111-4111-8111-111111111111",
      },
    });
  });

  it("rejects public github auth payloads with a secret id", () => {
    expect(() => companySkillImportSchema.parse({
      source: "https://github.com/acme/private-skill",
      githubAuth: {
        visibility: "public",
        secretId: "11111111-1111-4111-8111-111111111111",
      },
    })).toThrow();
  });
});
