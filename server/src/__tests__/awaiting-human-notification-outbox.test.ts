import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  awaitingHumanNotificationOutbox,
  companies,
  createDb,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { processAwaitingHumanNotificationOutbox } from "../services/awaiting-human-notifications.js";

vi.mock(import("../services/awaiting-human-review-files.js"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/awaiting-human-review-files.js")>();
  return {
    ...actual,
    readAwaitingHumanReviewFileBody: vi.fn(async () => ({
      body: Buffer.from("review-body"),
      sha256: "review-body",
    })),
  };
});

const originalFetch = globalThis.fetch;

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("awaitingHumanNotificationOutbox", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-awaiting-human-notification-outbox-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env.CLICKUP_PERSONAL_TOKEN;
    delete process.env.CLICKUP_WORKSPACE_ID;
    delete process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_ID;
    delete process.env.CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID;
    await db.delete(awaitingHumanNotificationOutbox);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("delivers an outbox row with legacy env config when no company awaiting-human settings row exists", async () => {
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
      title: "Awaiting human",
      status: "todo",
      priority: "medium",
    });
    await db.insert(awaitingHumanNotificationOutbox).values({
      companyId,
      issueId,
      dedupeKey: "approval-1",
      handoffKind: "request_confirmation",
      status: "pending",
      attempts: 0,
      notification: {
        title: "Awaiting human",
        summary: "Please review.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Reply in Bizbox.",
        labels: ["awaiting_human", "request_confirmation"],
      },
    });

    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_ID = "channel-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "message-42" } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await processAwaitingHumanNotificationOutbox(db, { limit: 10 });

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token-123",
        }),
      }),
    );

    const [row] = await db.select().from(awaitingHumanNotificationOutbox).where(eq(awaitingHumanNotificationOutbox.issueId, issueId));
    expect(row).toEqual(expect.objectContaining({
      status: "sent",
      clickupMessageId: "message-42",
      lastError: null,
    }));
  });

  it("does not resend when ClickUp omits the message id and attachment upload fails on the final attempt", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const deliverableId = randomUUID();
    const taskId = "task-123";

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Awaiting human",
      status: "todo",
      priority: "medium",
    });
    await db.insert(awaitingHumanNotificationOutbox).values({
      companyId,
      issueId,
      dedupeKey: "approval-final",
      handoffKind: "request_confirmation",
      status: "pending",
      attempts: 7,
      clickupTaskId: taskId,
      clickupTaskUrl: `https://app.clickup.com/t/${taskId}`,
      notification: {
        title: "Awaiting human",
        summary: "Please review.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Reply in Bizbox.",
        labels: ["awaiting_human", "request_confirmation"],
      },
      reviewFile: {
        source: "artifact",
        deliverableId,
        title: "Final report",
        filename: "final-report.md",
        contentType: "text/markdown",
        byteSize: 42,
        contentPath: "/api/attachments/final-report/content",
        deliverableUrl: "https://bizbox.example/api/attachments/final-report/content",
      },
    });

    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_ID = "channel-1";
    process.env.CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID = "review-list-1";

    const fetchMock = vi.fn(async (requestUrl: string | URL | Request) => {
      const url = String(requestUrl);
      if (url === "https://api.clickup.com/api/v3/workspaces/workspace-1/attachments/task-123/attachments") {
        return {
          ok: false,
          status: 500,
          text: async () => "upload failed",
        };
      }
      if (url === "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-1/messages") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        };
      }
      throw new Error(`unexpected fetch:${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await processAwaitingHumanNotificationOutbox(db, { limit: 10 });

    expect(result).toEqual({
      processed: 1,
      sent: 0,
      failed: 1,
    });
    expect(fetchMock.mock.calls.filter(([requestUrl]) => String(requestUrl) === "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-1/messages")).toHaveLength(1);

    const [row] = await db.select().from(awaitingHumanNotificationOutbox).where(eq(awaitingHumanNotificationOutbox.issueId, issueId));
    expect(row).toEqual(expect.objectContaining({
      status: "failed",
      attempts: 8,
    }));
    expect(row.clickupMessageId).not.toBeNull();
  });

  it("keeps failed rows in failed until their retry window opens", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const nextAttemptAt = new Date(Date.now() + 60_000);

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Awaiting human",
      status: "todo",
      priority: "medium",
    });
    await db.insert(awaitingHumanNotificationOutbox).values({
      companyId,
      issueId,
      dedupeKey: "approval-future",
      handoffKind: "request_confirmation",
      status: "failed",
      attempts: 1,
      nextAttemptAt,
      notification: {
        title: "Awaiting human",
        summary: "Please review.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Reply in Bizbox.",
        labels: ["awaiting_human", "request_confirmation"],
      },
    });

    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_ID = "channel-1";

    const result = await processAwaitingHumanNotificationOutbox(db, { limit: 10 });

    expect(result).toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
    });

    const [row] = await db.select().from(awaitingHumanNotificationOutbox).where(eq(awaitingHumanNotificationOutbox.issueId, issueId));
    expect(row.status).toBe("failed");
  });
});
