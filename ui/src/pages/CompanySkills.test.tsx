import { describe, expect, it, vi } from "vitest";
import {
  didGitHubCredentialScopeChange,
  importPrivateGitHubSkill,
  parseGitHubSkillSource,
  suggestedGitHubSecretName,
} from "./CompanySkills";

describe("parseGitHubSkillSource", () => {
  it("parses repo urls with .git suffix", () => {
    expect(parseGitHubSkillSource("https://github.com/zesthq/citro-box.git")).toEqual({
      hostname: "github.com",
      owner: "zesthq",
      repo: "citro-box",
    });
  });

  it("parses tree urls", () => {
    expect(parseGitHubSkillSource("https://github.com/zesthq/citro-box/tree/main/skills/private-skill")).toEqual({
      hostname: "github.com",
      owner: "zesthq",
      repo: "citro-box",
    });
  });

  it("parses blob urls", () => {
    expect(parseGitHubSkillSource("https://github.com/zesthq/citro-box/blob/main/skills/private-skill/SKILL.md"))
      .toEqual({
        hostname: "github.com",
        owner: "zesthq",
        repo: "citro-box",
      });
  });

  it("parses explicit GitHub Enterprise repo urls", () => {
    expect(parseGitHubSkillSource("https://git.example.com/zesthq/citro-box/tree/main/skills/private-skill"))
      .toEqual({
        hostname: "git.example.com",
        owner: "zesthq",
        repo: "citro-box",
      });
  });

  it("parses GitHub Enterprise root repo urls", () => {
    expect(parseGitHubSkillSource("https://git.example.com/zesthq/citro-box")).toEqual({
      hostname: "git.example.com",
      owner: "zesthq",
      repo: "citro-box",
    });
  });

  it("parses single-label enterprise root repo urls", () => {
    expect(parseGitHubSkillSource("https://ghe/zesthq/citro-box")).toEqual({
      hostname: "ghe",
      owner: "zesthq",
      repo: "citro-box",
    });
  });

  it("rejects non-githubusercontent markdown urls", () => {
    expect(parseGitHubSkillSource("https://raw.githubusercontent.com/zesthq/citro-box/main/SKILL.md")).toBeNull();
  });

  it("rejects plain markdown urls on non-github hosts", () => {
    expect(parseGitHubSkillSource("https://docs.example.com/skills/private-skill.md")).toBeNull();
  });

  it("rejects ambiguous two-segment https urls that do not look like github enterprise", () => {
    expect(parseGitHubSkillSource("https://docs.example.com/skills/private-skill")).toBeNull();
  });

  it("rejects non-tree subpaths", () => {
    expect(parseGitHubSkillSource("https://example.com/a/b/c")).toBeNull();
  });

  it("rejects localhost and ip hosts", () => {
    expect(parseGitHubSkillSource("https://localhost/acme/private-skill")).toBeNull();
    expect(parseGitHubSkillSource("https://127.0.0.1/acme/private-skill")).toBeNull();
  });
});

describe("suggestedGitHubSecretName", () => {
  it("builds a deterministic secret name", () => {
    expect(suggestedGitHubSecretName({ hostname: "github.com", owner: "ZestHQ" })).toBe("github_com__zesthq_pat");
  });
});

describe("didGitHubCredentialScopeChange", () => {
  it("returns false when only repo changes", () => {
    expect(didGitHubCredentialScopeChange(
      { hostname: "github.com", owner: "zesthq", repo: "repo-a" },
      { hostname: "github.com", owner: "zesthq", repo: "repo-b" },
    )).toBe(false);
  });

  it("returns true when owner changes", () => {
    expect(didGitHubCredentialScopeChange(
      { hostname: "github.com", owner: "zesthq", repo: "repo-a" },
      { hostname: "github.com", owner: "other-org", repo: "repo-a" },
    )).toBe(true);
  });
});

describe("importPrivateGitHubSkill", () => {
  it("creates a secret, then imports with the resulting secret id", async () => {
    const createSecret = vi.fn().mockResolvedValue({ id: "secret-1" });
    const importFromSource = vi.fn().mockResolvedValue({ imported: [], warnings: [] });

    await importPrivateGitHubSkill({
      createSecret,
      importFromSource,
    }, {
      companyId: "company-1",
      parsedGitHubSource: { hostname: "github.com", owner: "zesthq", repo: "citro-box" },
      payload: {
        source: "https://github.com/zesthq/citro-box",
        githubAuth: {
          visibility: "private",
        },
      },
      githubSecretMode: "new",
      newGitHubToken: "ghp_test",
    });

    expect(createSecret).toHaveBeenCalledWith("company-1", {
      name: "github_com__zesthq_pat",
      value: "ghp_test",
      description: "GitHub PAT for github.com/zesthq private skill imports",
    });
    expect(importFromSource).toHaveBeenCalledWith("company-1", {
      source: "https://github.com/zesthq/citro-box",
      githubAuth: {
        visibility: "private",
        secretId: "secret-1",
      },
    });
    expect(createSecret.mock.invocationCallOrder[0]).toBeLessThan(importFromSource.mock.invocationCallOrder[0]);
  });

  it("rejects blank new GitHub tokens before creating a secret", async () => {
    const createSecret = vi.fn();
    const importFromSource = vi.fn();

    await expect(importPrivateGitHubSkill({
      createSecret,
      importFromSource,
    }, {
      companyId: "company-1",
      parsedGitHubSource: { hostname: "github.com", owner: "zesthq", repo: "citro-box" },
      payload: {
        source: "https://github.com/zesthq/citro-box",
        githubAuth: {
          visibility: "private",
        },
      },
      githubSecretMode: "new",
      newGitHubToken: "   ",
    })).rejects.toThrow("Enter a GitHub personal access token to create a credential for github.com/zesthq.");

    expect(createSecret).not.toHaveBeenCalled();
    expect(importFromSource).not.toHaveBeenCalled();
  });

  it("stops after import failure without any follow-up credential association step", async () => {
    const createSecret = vi.fn().mockResolvedValue({ id: "secret-1" });
    const importFromSource = vi.fn().mockRejectedValue(new Error("import failed"));

    await expect(importPrivateGitHubSkill({
      createSecret,
      importFromSource,
    }, {
      companyId: "company-1",
      parsedGitHubSource: { hostname: "github.com", owner: "zesthq", repo: "citro-box" },
      payload: {
        source: "https://github.com/zesthq/citro-box",
        githubAuth: {
          visibility: "private",
        },
      },
      githubSecretMode: "new",
      newGitHubToken: "ghp_test",
    })).rejects.toThrow("import failed");

    expect(createSecret).toHaveBeenCalledTimes(1);
    expect(importFromSource).toHaveBeenCalledTimes(1);
  });
});
