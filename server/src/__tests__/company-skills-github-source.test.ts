import { describe, expect, it } from "vitest";
import {
  isLikelyGitHubEnterpriseHostname,
  looksLikeGitHubRepoImportUrl,
} from "../services/company-skills-github-source.js";

describe("looksLikeGitHubRepoImportUrl", () => {
  it("accepts repo urls with .git suffix", () => {
    expect(looksLikeGitHubRepoImportUrl("https://github.com/zesthq/citro-box.git")).toBe(true);
  });

  it("accepts tree urls", () => {
    expect(looksLikeGitHubRepoImportUrl("https://github.com/zesthq/citro-box/tree/main/skills/private-skill")).toBe(
      true,
    );
  });

  it("accepts blob urls", () => {
    expect(
      looksLikeGitHubRepoImportUrl("https://github.com/zesthq/citro-box/blob/main/skills/private-skill/SKILL.md"),
    ).toBe(true);
  });

  it("rejects plain markdown urls on non-github hosts", () => {
    expect(looksLikeGitHubRepoImportUrl("https://docs.example.com/skills/private-skill.md")).toBe(false);
  });

  it("rejects two-segment non-github urls without an explicit repo marker", () => {
    expect(looksLikeGitHubRepoImportUrl("https://docs.example.com/skills/private-skill")).toBe(false);
  });

  it("rejects non-tree subpaths", () => {
    expect(looksLikeGitHubRepoImportUrl("https://example.com/a/b/c")).toBe(false);
  });
});

describe("isLikelyGitHubEnterpriseHostname", () => {
  it("rejects localhost hosts", () => {
    expect(isLikelyGitHubEnterpriseHostname("localhost")).toBe(false);
    expect(isLikelyGitHubEnterpriseHostname("api.localhost")).toBe(false);
  });
});
