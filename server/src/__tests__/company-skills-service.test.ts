import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  companies,
  companyGitHubCredentials,
  companySecrets,
  companySecretVersions,
  companySkills,
  createDb,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companySkillService } from "../services/company-skills.ts";
import { secretService } from "../services/secrets.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company skill service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companySkillService.list", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof companySkillService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const cleanupDirs = new Set<string>();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-skills-service-");
    db = createDb(tempDb.connectionString);
    svc = companySkillService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(companyGitHubCredentials);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companySkills);
    await db.delete(companies);
    await Promise.all(Array.from(cleanupDirs, (dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("lists skills without exposing markdown content", async () => {
    const companyId = randomUUID();
    const skillId = randomUUID();
    const skillDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-heavy-skill-"));
    cleanupDirs.add(skillDir);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Heavy Skill\n", "utf8");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(companySkills).values({
      id: skillId,
      companyId,
      key: `company/${companyId}/heavy-skill`,
      slug: "heavy-skill",
      name: "Heavy Skill",
      description: "Large skill used for list projection regression coverage.",
      markdown: `# Heavy Skill\n\n${"x".repeat(250_000)}`,
      sourceType: "local_path",
      sourceLocator: skillDir,
      trustLevel: "markdown_only",
      compatibility: "compatible",
      fileInventory: [{ path: "SKILL.md", kind: "skill" }],
      metadata: { sourceKind: "local_path" },
    });

    const listed = await svc.list(companyId);
    const skill = listed.find((entry) => entry.id === skillId);

    expect(skill).toBeDefined();
    expect(skill).not.toHaveProperty("markdown");
    expect(skill).toMatchObject({
      id: skillId,
      key: `company/${companyId}/heavy-skill`,
      slug: "heavy-skill",
      name: "Heavy Skill",
      sourceType: "local_path",
      sourceLocator: skillDir,
      attachedAgentCount: 0,
      sourceBadge: "local",
      editable: true,
    });
  });

  it("reuses scoped github source locators when installing updates", async () => {
    const companyId = randomUUID();
    const skillId = randomUUID();
    const scopedSource = "https://github.com/acme/private-skills/tree/main/scoped";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(companySkills).values({
      id: skillId,
      companyId,
      key: "acme/private-skills/skill-one",
      slug: "skill-one",
      name: "Skill One",
      description: null,
      markdown: "# Old Skill One\n",
      sourceType: "github",
      sourceLocator: scopedSource,
      sourceRef: "old-sha",
      trustLevel: "markdown_only",
      compatibility: "compatible",
      fileInventory: [{ path: "SKILL.md", kind: "skill" }],
      metadata: {
        sourceKind: "github",
        owner: "acme",
        repo: "private-skills",
        trackingRef: "main",
        ref: "old-sha",
        repoSkillDir: "scoped/skill-one",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/private-skills/commits/main") {
        return new Response(JSON.stringify({ sha: "new-sha" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://api.github.com/repos/acme/private-skills/git/trees/new-sha?recursive=1") {
        return new Response(JSON.stringify({
          tree: [
            { path: "skill-one/SKILL.md", type: "blob" },
            { path: "scoped/skill-one/SKILL.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://raw.githubusercontent.com/acme/private-skills/new-sha/scoped/skill-one/SKILL.md") {
        return new Response("---\nslug: skill-one\nname: Scoped Skill\n---\n# Scoped Skill\n", { status: 200 });
      }
      if (url === "https://raw.githubusercontent.com/acme/private-skills/new-sha/skill-one/SKILL.md") {
        return new Response("---\nname: Root Skill\n---\n# Root Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const updated = await svc.installUpdate(companyId, skillId);

    expect(updated).toMatchObject({
      id: skillId,
      name: "Scoped Skill",
      sourceLocator: scopedSource,
      sourceRef: "new-sha",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/acme/private-skills/new-sha/scoped/skill-one/SKILL.md",
      undefined,
    );
  });

  it("imports plain markdown https skill urls without github auth", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://docs.example.com/skills/private-skill.md";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === sourceUrl) {
        const headers = new Headers(init?.headers ?? undefined);
        expect(headers.get("authorization")).toBeNull();
        return new Response("---\nname: Plain URL Skill\n---\n# Plain URL Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await svc.importFromSource(companyId, {
      source: sourceUrl,
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      sourceType: "url",
      sourceLocator: sourceUrl,
      name: "Plain URL Skill",
    });
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl, undefined);
  });

  it("falls back to plain url imports for public path-shaped non-github https urls", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://docs.example.com/skills/private-skill";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://docs.example.com/api/v3/repos/skills/private-skill") {
        const headers = new Headers(init?.headers ?? undefined);
        expect(headers.get("authorization")).toBeNull();
        return new Response("not github", { status: 404 });
      }
      if (url === sourceUrl) {
        const headers = new Headers(init?.headers ?? undefined);
        expect(headers.get("authorization")).toBeNull();
        return new Response("---\nname: Path Skill\n---\n# Path Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await svc.importFromSource(companyId, { source: sourceUrl });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      sourceType: "url",
      sourceLocator: sourceUrl,
      name: "Path Skill",
    });
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl, undefined);
  });

  it("rejects private github auth for path-shaped non-github https urls before resolving auth", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://docs.example.com/skills/private-skill";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://docs.example.com/api/v3/repos/skills/private-skill") {
        const headers = new Headers(init?.headers ?? undefined);
        expect(headers.get("authorization")).toBeNull();
        return new Response("not github", { status: 404 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(svc.importFromSource(companyId, {
      source: sourceUrl,
      githubAuth: {
        visibility: "private",
      },
    })).rejects.toThrow("Private GitHub auth requires a GitHub or GitHub Enterprise repository URL.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://docs.example.com/api/v3/repos/skills/private-skill", undefined);
  });

  it("confirms GitHub Enterprise root repo urls before using the github import path", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://git.example.com/acme/private-skills";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers ?? undefined);
      expect(headers.get("authorization")).toBeNull();

      if (url === "https://git.example.com/api/v3/repos/acme/private-skills") {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://git.example.com/api/v3/repos/acme/private-skills/commits/main") {
        return new Response(JSON.stringify({ sha: commitSha }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://git.example.com/api/v3/repos/acme/private-skills/git/trees/${commitSha}?recursive=1`) {
        return new Response(JSON.stringify({
          tree: [
            { path: "skill-one/SKILL.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://git.example.com/raw/acme/private-skills/${commitSha}/skill-one/SKILL.md`) {
        return new Response("---\nname: Enterprise Skill\n---\n# Enterprise Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await svc.importFromSource(companyId, { source: sourceUrl });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      name: "Enterprise Skill",
      sourceType: "github",
      sourceLocator: sourceUrl,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://git.example.com/api/v3/repos/acme/private-skills", undefined);
  });

  it("uses private github auth for confirmed GitHub Enterprise root repo urls", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://git.example.com/acme/private-skills";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const secrets = secretService(db);

    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "12345678901234567890123456789012");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const secret = await secrets.create(companyId, {
      name: "ghe-acme-token",
      provider: "local_encrypted",
      value: "ghp_enterprise-token",
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers ?? undefined);

      if (url === "https://git.example.com/api/v3/repos/acme/private-skills") {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      expect(headers.get("authorization")).toBe("Bearer ghp_enterprise-token");
      if (url === "https://git.example.com/api/v3/repos/acme/private-skills/commits/main") {
        return new Response(JSON.stringify({ sha: commitSha }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://git.example.com/api/v3/repos/acme/private-skills/git/trees/${commitSha}?recursive=1`) {
        return new Response(JSON.stringify({
          tree: [
            { path: "skill-one/SKILL.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://git.example.com/raw/acme/private-skills/${commitSha}/skill-one/SKILL.md`) {
        return new Response("---\nname: Enterprise Private Skill\n---\n# Enterprise Private Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await svc.importFromSource(companyId, {
      source: sourceUrl,
      githubAuth: {
        visibility: "private",
        secretId: secret.id,
      },
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      name: "Enterprise Private Skill",
      sourceType: "github",
      sourceLocator: sourceUrl,
    });
  });

  it("ignores saved github credentials unless private github auth was requested", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://github.com/acme/public-skills";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const secrets = secretService(db);

    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "12345678901234567890123456789012");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const secret = await secrets.create(companyId, {
      name: "github-acme-token",
      provider: "local_encrypted",
      value: "ghp_saved-token",
    });
    await svc.upsertGitHubCredentialAssociation(companyId, {
      hostname: "github.com",
      owner: "acme",
      secretId: secret.id,
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers ?? undefined);
      expect(headers.get("authorization")).toBeNull();

      if (url === "https://api.github.com/repos/acme/public-skills") {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://api.github.com/repos/acme/public-skills/commits/main") {
        return new Response(JSON.stringify({ sha: commitSha }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://api.github.com/repos/acme/public-skills/git/trees/${commitSha}?recursive=1`) {
        return new Response(JSON.stringify({
          tree: [
            { path: "skill-one/SKILL.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://raw.githubusercontent.com/acme/public-skills/${commitSha}/skill-one/SKILL.md`) {
        return new Response("---\nname: Public Skill\n---\n# Public Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await svc.importFromSource(companyId, {
      source: sourceUrl,
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      name: "Public Skill",
      sourceType: "github",
      sourceLocator: sourceUrl,
    });
    expect(result.imported[0].metadata).not.toMatchObject({
      authScope: "owner",
    });
  });

  it("does not persist a github credential association when the import upsert fails", async () => {
    const companyId = randomUUID();
    const sourceUrl = "https://github.com/acme/private-skills";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const secrets = secretService(db);

    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "12345678901234567890123456789012");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const secret = await secrets.create(companyId, {
      name: "github-acme-token",
      provider: "local_encrypted",
      value: "ghp_explicit-token",
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers ?? undefined);
      expect(headers.get("authorization")).toBe("Bearer ghp_explicit-token");

      if (url === "https://api.github.com/repos/acme/private-skills") {
        return new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://api.github.com/repos/acme/private-skills/commits/main") {
        return new Response(JSON.stringify({ sha: commitSha }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://api.github.com/repos/acme/private-skills/git/trees/${commitSha}?recursive=1`) {
        return new Response(JSON.stringify({
          tree: [
            { path: "skill-one/SKILL.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === `https://raw.githubusercontent.com/acme/private-skills/${commitSha}/skill-one/SKILL.md`) {
        return new Response("---\nname: Private Skill\n---\n# Private Skill\n", { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const originalInsert = db.insert.bind(db);
    const insertSpy = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table === companySkills) {
        throw new Error("simulated company skill insert failure");
      }
      return originalInsert(table as never);
    }) as typeof db.insert);

    await expect(svc.importFromSource(companyId, {
      source: sourceUrl,
      githubAuth: {
        visibility: "private",
        secretId: secret.id,
      },
    })).rejects.toThrow("simulated company skill insert failure");

    insertSpy.mockRestore();

    const associations = await db
      .select()
      .from(companyGitHubCredentials);

    expect(associations).toEqual([]);
  });

  it("rejects saved github credential associations for localhost and IP hosts", async () => {
    const companyId = randomUUID();
    const secrets = secretService(db);

    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "12345678901234567890123456789012");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const secret = await secrets.create(companyId, {
      name: "github-acme-token",
      provider: "local_encrypted",
      value: "ghp_saved-token",
    });

    await expect(svc.upsertGitHubCredentialAssociation(companyId, {
      hostname: "localhost",
      owner: "acme",
      secretId: secret.id,
    })).rejects.toThrow("GitHub credential association requires a GitHub-style hostname and owner.");

    await expect(svc.upsertGitHubCredentialAssociation(companyId, {
      hostname: "127.0.0.1",
      owner: "acme",
      secretId: secret.id,
    })).rejects.toThrow("GitHub credential association requires a GitHub-style hostname and owner.");
  });

  it("accepts saved github credential associations for single-label enterprise hosts", async () => {
    const companyId = randomUUID();
    const secrets = secretService(db);

    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "12345678901234567890123456789012");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const secret = await secrets.create(companyId, {
      name: "github-acme-token",
      provider: "local_encrypted",
      value: "ghp_saved-token",
    });

    const association = await svc.upsertGitHubCredentialAssociation(companyId, {
      hostname: "ghe",
      owner: "acme",
      secretId: secret.id,
    });

    expect(association).toMatchObject({
      companyId,
      hostname: "ghe",
      owner: "acme",
      secretId: secret.id,
    });
  });
});
