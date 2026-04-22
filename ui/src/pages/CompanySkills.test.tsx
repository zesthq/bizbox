import { describe, expect, it, vi } from "vitest";
import {
  buildGitHubUpdateBlockedMessage,
  filterLikelyGitHubSecrets,
  formatGitHubSecretOptionLabel,
  didGitHubCredentialScopeChange,
  importPrivateGitHubSkill,
  isLikelyGitHubSecret,
  parseGitHubSkillSource,
  suggestedGitHubSecretName,
} from "./CompanySkills";
import type { CompanySecret } from "@paperclipai/shared";

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

describe("buildGitHubUpdateBlockedMessage", () => {
  it("replaces the missing-credential remediation with self-contained copy", () => {
    expect(buildGitHubUpdateBlockedMessage("No GitHub credential saved for github.com/acme.")).toBe(
      "No GitHub credential saved for github.com/acme. Re-import this skill from the source field with a private GitHub credential to restore update access.",
    );
  });

  it("leaves unrelated update errors unchanged", () => {
    expect(buildGitHubUpdateBlockedMessage("Failed to check for updates.")).toBe("Failed to check for updates.");
  });
});

describe("GitHub secret helpers", () => {
  const baseSecret = {
    companyId: "company-1",
    provider: "local_encrypted",
    externalRef: null,
    latestVersion: 1,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } satisfies Omit<CompanySecret, "id" | "name" | "description">;

  it("detects likely GitHub PAT secrets from the name or description", () => {
    expect(isLikelyGitHubSecret({
      name: "github_com__acme_pat",
      description: null,
    })).toBe(true);
    expect(isLikelyGitHubSecret({
      name: "token-prod",
      description: "GitHub PAT for acme/private-skills",
    })).toBe(true);
    expect(isLikelyGitHubSecret({
      name: "stripe_live_secret",
      description: "Stripe production key",
    })).toBe(false);
  });

  it("filters the selector down to likely GitHub secrets while preserving the linked secret", () => {
    const secrets: CompanySecret[] = [
      {
        ...baseSecret,
        id: "secret-1",
        name: "github_com__acme_pat",
        description: "GitHub PAT for github.com/acme private skill imports",
      },
      {
        ...baseSecret,
        id: "secret-2",
        name: "stripe_live_secret",
        description: "Stripe production key",
      },
      {
        ...baseSecret,
        id: "secret-3",
        name: "token-prod",
        description: null,
      },
    ];

    expect(filterLikelyGitHubSecrets(secrets).map((secret) => secret.id)).toEqual(["secret-1"]);
    expect(filterLikelyGitHubSecrets(secrets, "secret-3").map((secret) => secret.id)).toEqual(["secret-1", "secret-3"]);
  });

  it("formats option labels with descriptions when present", () => {
    expect(formatGitHubSecretOptionLabel({
      name: "github_com__acme_pat",
      description: "GitHub PAT for github.com/acme private skill imports",
    })).toBe("github_com__acme_pat - GitHub PAT for github.com/acme private skill imports");
  });
});

describe("importPrivateGitHubSkill", () => {
  it("creates a secret, then imports with the resulting secret id", async () => {
    const createSecret = vi.fn().mockResolvedValue({ id: "secret-1" });
    const removeSecret = vi.fn();
    const importFromSource = vi.fn().mockResolvedValue({ imported: [], warnings: [] });
    const onSecretCreated = vi.fn();

    await importPrivateGitHubSkill({
      createSecret,
      removeSecret,
      importFromSource,
      onSecretCreated,
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
    expect(onSecretCreated).toHaveBeenCalledWith("secret-1");
    expect(createSecret.mock.invocationCallOrder[0]).toBeLessThan(importFromSource.mock.invocationCallOrder[0]);
    expect(importFromSource.mock.invocationCallOrder[0]).toBeLessThan(onSecretCreated.mock.invocationCallOrder[0]);
    expect(removeSecret).not.toHaveBeenCalled();
  });

  it("rejects blank new GitHub tokens before creating a secret", async () => {
    const createSecret = vi.fn();
    const removeSecret = vi.fn();
    const importFromSource = vi.fn();

    await expect(importPrivateGitHubSkill({
      createSecret,
      removeSecret,
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
    expect(removeSecret).not.toHaveBeenCalled();
    expect(importFromSource).not.toHaveBeenCalled();
  });

  it("removes a newly created secret if the import fails", async () => {
    const createSecret = vi.fn().mockResolvedValue({ id: "secret-1" });
    const removeSecret = vi.fn().mockResolvedValue({ ok: true });
    const importFromSource = vi.fn().mockRejectedValue(new Error("import failed"));
    const onSecretCreated = vi.fn();

    await expect(importPrivateGitHubSkill({
      createSecret,
      removeSecret,
      importFromSource,
      onSecretCreated,
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
    expect(removeSecret).toHaveBeenCalledWith("secret-1");
    expect(onSecretCreated).not.toHaveBeenCalled();
  });

  it("keeps the original import error when cleanup fails", async () => {
    const createSecret = vi.fn().mockResolvedValue({ id: "secret-1" });
    const removeSecret = vi.fn().mockRejectedValue(new Error("cleanup failed"));
    const importFromSource = vi.fn().mockRejectedValue(new Error("import failed"));

    await expect(importPrivateGitHubSkill({
      createSecret,
      removeSecret,
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

    expect(removeSecret).toHaveBeenCalledWith("secret-1");
  });
});
