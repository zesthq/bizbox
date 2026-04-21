import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { companies, companySkills, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companySkillService } from "../services/company-skills.ts";

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
    await db.delete(companySkills);
    await db.delete(companies);
    await Promise.all(Array.from(cleanupDirs, (dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
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

  it("does not resolve or forward github auth for plain https skill urls", async () => {
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
      githubAuth: {
        visibility: "private",
      },
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      sourceType: "url",
      sourceLocator: sourceUrl,
      name: "Plain URL Skill",
    });
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl, undefined);
  });
});
