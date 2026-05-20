import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import {
  companies,
  createDb,
  documentRevisions,
  documents,
  issueDocuments,
  issues,
} from "@paperclipai/db";
import { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { documentService } from "../services/documents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres document service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("documentService system issue documents", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof documentService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-documents-service-");
    db = createDb(tempDb.connectionString);
    await db.execute(`
      alter table issue_documents
      add column if not exists audience text not null default 'human'
    `);
    svc = documentService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(documentRevisions);
    await db.delete(issueDocuments);
    await db.delete(documents);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createIssueWithDocuments() {
    const companyId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      identifier: "PAP-1600",
      title: "System document filtering",
      description: "Validate document filtering",
      status: "in_progress",
      priority: "medium",
    });

    await svc.upsertIssueDocument({
      issueId,
      key: "plan",
      title: "Plan",
      format: "markdown",
      body: "# Plan",
    });
    await svc.upsertIssueDocument({
      issueId,
      key: ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY,
      title: "Continuation Summary",
      format: "markdown",
      body: "# Handoff",
    });

    return { issueId };
  }

  it("filters continuation summaries from default document lists and issue payload summaries", async () => {
    const { issueId } = await createIssueWithDocuments();

    const defaultDocuments = await svc.listIssueDocuments(issueId);
    expect(defaultDocuments.map((doc) => doc.key)).toEqual(["plan"]);

    const payload = await svc.getIssueDocumentPayload({ id: issueId, description: null });
    expect(payload.planDocument?.key).toBe("plan");
    expect(payload.documentSummaries.map((doc) => doc.key)).toEqual(["plan"]);
  });

  it("keeps system documents available for includeSystem and direct fetch callers", async () => {
    const { issueId } = await createIssueWithDocuments();

    const debugDocuments = await svc.listIssueDocuments(issueId, { includeSystem: true });
    expect(debugDocuments.map((doc) => doc.key)).toEqual([
      ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY,
      "plan",
    ]);

    const directHandoff = await svc.getIssueDocumentByKey(issueId, ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY);
    expect(directHandoff).toEqual(expect.objectContaining({
      key: ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY,
      body: "# Handoff",
    }));
  });

  it("preserves an existing audience when updating without an explicit audience override", async () => {
    const { issueId } = await createIssueWithDocuments();
    const existing = await svc.getIssueDocumentByKey(issueId, "plan");
    const updatedToHuman = await svc.upsertIssueDocument({
      issueId,
      key: "plan",
      title: "Plan for humans",
      format: "markdown",
      body: "# Human plan",
      baseRevisionId: existing?.latestRevisionId ?? null,
      audience: "human",
    });

    const updated = await svc.upsertIssueDocument({
      issueId,
      key: "plan",
      title: "Plan for humans v2",
      format: "markdown",
      body: "# Human plan v2",
      baseRevisionId: updatedToHuman.document.latestRevisionId,
    });

    expect(updated.created).toBe(false);
    expect(updated.document.audience).toBe("human");

    const stored = await svc.getIssueDocumentByKey(issueId, "plan");
    expect(stored?.audience).toBe("human");
  });

  it("infers the stored title from the first markdown H1 when creating with a null title", async () => {
    const { issueId } = await createIssueWithDocuments();

    const created = await svc.upsertIssueDocument({
      issueId,
      key: "deliverable",
      title: null,
      format: "markdown",
      body: "# Quarterly Closeout\n\nBody copy",
    });

    expect(created.document.title).toBe("Quarterly Closeout");

    const storedDocument = await svc.getIssueDocumentByKey(issueId, "deliverable");
    expect(storedDocument?.title).toBe("Quarterly Closeout");

    const [revision] = await db
      .select({ title: documentRevisions.title })
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, created.document.id))
      .orderBy(desc(documentRevisions.revisionNumber))
      .limit(1);
    expect(revision?.title).toBe("Quarterly Closeout");
  });

  it("infers the stored title from the first markdown H1 when updating with a null title", async () => {
    const { issueId } = await createIssueWithDocuments();
    const existing = await svc.getIssueDocumentByKey(issueId, "plan");

    const updated = await svc.upsertIssueDocument({
      issueId,
      key: "plan",
      title: null,
      format: "markdown",
      body: "# Refined Plan\n\nNext steps",
      baseRevisionId: existing?.latestRevisionId ?? null,
    });

    expect(updated.document.title).toBe("Refined Plan");

    const storedDocument = await svc.getIssueDocumentByKey(issueId, "plan");
    expect(storedDocument?.title).toBe("Refined Plan");

    const [revision] = await db
      .select({ title: documentRevisions.title })
      .from(documentRevisions)
      .where(eq(documentRevisions.id, updated.document.latestRevisionId))
      .limit(1);
    expect(revision?.title).toBe("Refined Plan");
  });

  it("does not infer a title for markdown documents without an H1", async () => {
    const { issueId } = await createIssueWithDocuments();

    const created = await svc.upsertIssueDocument({
      issueId,
      key: "notes",
      title: null,
      format: "markdown",
      body: "No heading here\n\nJust body copy",
    });

    expect(created.document.title).toBeNull();
  });

  it("does not infer a title for non-markdown documents", async () => {
    const { issueId } = await createIssueWithDocuments();

    const created = await svc.upsertIssueDocument({
      issueId,
      key: "notes",
      title: null,
      format: "text",
      body: "# Looks like a heading but is plain text",
    });

    expect(created.document.title).toBeNull();
  });
});
