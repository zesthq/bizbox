import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  detectClickUpAwaitingHumanApproval,
  getClickUpChatMessageReactions,
  getClickUpChatMessageReplies,
  resolveAwaitingHumanReviewFile,
  sendAwaitingHumanNotification,
} from "../services/awaiting-human-notifications.js";

const originalFetch = globalThis.fetch;

function dbWithExecuteResults(results: unknown[][]): Db {
  const queue = [...results];
  return {
    execute: vi.fn(async () => queue.shift() ?? []),
  } as unknown as Db;
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.CLICKUP_PERSONAL_TOKEN;
  delete process.env.CLICKUP_WORKSPACE_ID;
  delete process.env.CLICKUP_ENGINEERING_CHANNEL_ID;
  delete process.env.CLICKUP_ENGINEERING_CHANNEL_NAME;
  delete process.env.CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID;
  delete process.env.CLICKUP_APPROVAL_POSITIVE_REACTIONS;
  delete process.env.CLICKUP_APPROVAL_POSITIVE_REPLY_KEYWORDS;
});

describe("sendAwaitingHumanNotification", () => {
  it("posts the handoff to the ClickUp engineering chat channel", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_ENGINEERING_CHANNEL_ID = "channel-9";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "message-42" } }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await sendAwaitingHumanNotification({
      companyId: "company-1",
      issueId: "issue-1",
      handoffKind: "request_confirmation",
      notification: {
        title: "BIZ-35 is waiting on human input",
        summary: "Approve the exact GitHub reply before posting.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Open BIZ-35 in Bizbox and respond there.",
        labels: ["awaiting_human", "request_confirmation"],
      },
    });

    expect(result).toEqual({
      status: "sent",
      channel: "clickup-chat",
      detail: "sent",
      externalId: "message-42",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-9/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token-123",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      type: "message",
      content_format: "text/md",
      content: expect.stringContaining("Source: https://bizbox.example/issues/BIZ-35"),
    });
  });

  it("includes the Bizbox deliverable and ClickUp review task when a review file is present", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_ENGINEERING_CHANNEL_ID = "channel-9";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "message-42" } }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await sendAwaitingHumanNotification({
      companyId: "company-1",
      issueId: "issue-1",
      handoffKind: "request_confirmation",
      notification: {
        title: "BIZ-35 is waiting on human input",
        summary: "Please review the attached final report.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Open BIZ-35 in Bizbox and respond there.",
        labels: ["awaiting_human", "request_confirmation"],
        reviewFile: {
          source: "artifact",
          deliverableId: "33333333-3333-4333-8333-333333333333",
          title: "Final report",
          filename: "final-report.md",
          contentType: "text/markdown",
          byteSize: 42,
          contentPath: "/api/attachments/33333333-3333-4333-8333-333333333333/content",
          deliverableUrl: "https://bizbox.example/api/attachments/33333333-3333-4333-8333-333333333333/content",
          clickupTaskUrl: "https://app.clickup.com/t/task-123",
          clickupAttachmentId: "attachment-123",
        },
      },
    });

    expect(result.status).toBe("sent");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.content).toContain("Review file: final-report.md");
    expect(body.content).toContain("Bizbox deliverable: https://bizbox.example/api/attachments/33333333-3333-4333-8333-333333333333/content");
    expect(body.content).toContain("ClickUp review task: https://app.clickup.com/t/task-123");
    expect(body.content).toContain("Review file attached on the ClickUp task.");
  });

  it("resolves the ClickUp channel id by channel name when no channel id is configured", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_ENGINEERING_CHANNEL_NAME = "engineering";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "channel-lookup-1", name: "engineering" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "message-43" } }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await sendAwaitingHumanNotification({
      companyId: "company-1",
      issueId: "issue-1",
      handoffKind: "ask_user_questions",
      notification: {
        title: "BIZ-35 is waiting on human input",
        summary: "Need answers to 2 question(s).",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Open BIZ-35 in Bizbox and respond there.",
        labels: ["awaiting_human", "ask_user_questions"],
        kind: "ask_user_questions",
        audience: "board-user",
        body: "- Question 1\n- Question 2",
      },
    });

    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels?page=1&page_size=100",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "token-123",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-lookup-1/messages",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("continues channel lookup across pages before giving up", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_ENGINEERING_CHANNEL_NAME = "engineering";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 100 }, (_, index) => ({
            id: `channel-${index + 1}`,
            name: `other-${index + 1}`,
          })),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "channel-lookup-2", name: "engineering" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "message-44" } }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await sendAwaitingHumanNotification({
      companyId: "company-1",
      issueId: "issue-1",
      handoffKind: "human_owned_blocker",
      notification: {
        title: "BIZ-35 is waiting on human input",
        summary: "Waiting on human input to unblock BIZ-36.",
        link: "https://bizbox.example/issues/BIZ-35",
        cta: "Open BIZ-35 in Bizbox and respond there.",
        labels: ["awaiting_human", "human_owned_blocker"],
        kind: "human_owned_blocker",
        audience: "board-user",
      },
    });

    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels?page=1&page_size=100",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels?page=2&page_size=100",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/channels/channel-lookup-2/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("skips delivery when ClickUp chat credentials are missing", async () => {
    const result = await sendAwaitingHumanNotification({
      companyId: "company-1",
      issueId: "issue-1",
      handoffKind: "ask_user_questions",
      notification: {
        title: "BIZ-35 is waiting on human input",
        summary: "Need answers to 2 question(s).",
        link: "/issues/BIZ-35",
        cta: "Open BIZ-35 in Bizbox and respond there.",
        labels: ["awaiting_human", "ask_user_questions"],
      },
    });

    expect(result).toEqual({
      status: "skipped",
      channel: "clickup-chat",
      detail: "missing-credential: CLICKUP_PERSONAL_TOKEN",
    });
  });

  it("retrieves ClickUp message replies for approval polling", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "reply-1", content: "Ship it" },
          { id: "reply-2", message: "Approved" },
        ],
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await getClickUpChatMessageReplies("message-42");

    expect(result).toEqual({
      status: "sent",
      detail: "ok",
      replies: [
        { id: "reply-1", content: "Ship it" },
        { id: "reply-2", content: "Approved" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/messages/message-42/replies",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "token-123",
        }),
      }),
    );
  });

  it("retrieves ClickUp message reactions for approval polling", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { reaction: "thumbsup", count: 2 },
          { emoji: { name: "eyes" }, users: [{ id: "u1" }] },
        ],
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await getClickUpChatMessageReactions("message-42");

    expect(result).toEqual({
      status: "sent",
      detail: "ok",
      reactions: [
        { name: "thumbsup", count: 2 },
        { name: "eyes", count: 1 },
      ],
    });
  });

  it("treats positive approval replies as approval before checking reactions", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "reply-1", content: "yes" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ reaction: "thumbsup", count: 1 }] }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reply-detected",
      resolutionSource: "clickup_reply",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat negative or ambiguous replies as approval", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "reply-1", content: "No, please revise this" },
            { id: "reply-2", content: "Can you clarify the rollout plan?" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "forward_reply",
      detail: "non-approval-reply-detected",
      resolutionSource: "clickup_reply",
      replies: [
        { id: "reply-1", content: "No, please revise this" },
        { id: "reply-2", content: "Can you clarify the rollout plan?" },
      ],
    });
  });

  it("does not treat negated approval phrases as approval", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "reply-1", content: "not okay" },
            { id: "reply-2", content: "don't go ahead" },
            { id: "reply-3", content: "not approved" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "forward_reply",
      detail: "non-approval-reply-detected",
      resolutionSource: "clickup_reply",
      replies: [
        { id: "reply-1", content: "not okay" },
        { id: "reply-2", content: "don't go ahead" },
        { id: "reply-3", content: "not approved" },
      ],
    });
  });

  it("accepts a later non-negated keyword even if an earlier match is negated", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: "reply-1", content: "not ok sounds ok to me" }],
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reply-detected",
      resolutionSource: "clickup_reply",
    });
  });

  it("still accepts a configured positive reaction when replies are not approving", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_APPROVAL_POSITIVE_REACTIONS = "white_check_mark";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "reply-1", content: "Please clarify the final step." }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ reaction: "white_check_mark", count: 1 }],
        }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reaction-detected",
      resolutionSource: "clickup_reaction",
      clickupReaction: "white_check_mark",
    });
  });

  it("returns forwardable replies when the reactions lookup fails after replies were collected", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "reply-1", content: "Please fix the rollout title first." }],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "temporary outage",
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "forward_reply",
      detail: "non-approval-reply-detected",
      resolutionSource: "clickup_reply",
      replies: [{ id: "reply-1", content: "Please fix the rollout title first." }],
    });
  });

  it("still accepts a configured positive reaction when the replies lookup fails", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_APPROVAL_POSITIVE_REACTIONS = "white_check_mark";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "temporary outage",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ reaction: "white_check_mark", count: 1 }],
        }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reaction-detected",
      resolutionSource: "clickup_reaction",
      clickupReaction: "white_check_mark",
    });
  });

  it("supports configurable positive reply keywords", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_APPROVAL_POSITIVE_REPLY_KEYWORDS = "merge it,green light";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: "reply-1", content: "Green light from me" }],
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reply-detected",
      resolutionSource: "clickup_reply",
    });
  });

  it("treats punctuated approval replies as approval", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: "reply-1", content: "LGTM! Approved, thanks." }],
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reply-detected",
      resolutionSource: "clickup_reply",
    });
  });

  it("treats only configured positive reactions as approval", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";
    process.env.CLICKUP_APPROVAL_POSITIVE_REACTIONS = "white_check_mark";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { reaction: "thumbsup", count: 3 },
            { reaction: "white_check_mark", count: 1 },
          ],
        }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "approved",
      detail: "positive-reaction-detected",
      resolutionSource: "clickup_reaction",
      clickupReaction: "white_check_mark",
    });
  });

  it("ignores neutral or noisy reactions when detecting approval", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { reaction: "eyes", count: 2 },
            { reaction: "thumbsdown", count: 1 },
          ],
        }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await detectClickUpAwaitingHumanApproval("message-42");

    expect(result).toEqual({
      status: "no_approval",
      detail: "no-approval-signal",
    });
  });
});

describe("resolveAwaitingHumanReviewFile", () => {
  it("prefers a human artifact deliverable", async () => {
    const db = dbWithExecuteResults([[
      {
        deliverable_id: "33333333-3333-4333-8333-333333333333",
        title: "Final report",
        content_path: "/api/attachments/33333333-3333-4333-8333-333333333333/content",
        content_type: "text/markdown",
        byte_size: 42,
        original_filename: "final-report.md",
        attachment_id: "33333333-3333-4333-8333-333333333333",
        object_key: "companies/company-1/issues/issue-1/final-report.md",
        sha256: "abc123",
      },
    ]]);

    const file = await resolveAwaitingHumanReviewFile(db, {
      companyId: "company-1",
      issueId: "issue-1",
      sourceLink: "https://bizbox.example/issues/BIZ-35",
    });

    expect(file).toMatchObject({
      source: "artifact",
      filename: "final-report.md",
      deliverableUrl: "https://bizbox.example/api/attachments/33333333-3333-4333-8333-333333333333/content",
      objectKey: "companies/company-1/issues/issue-1/final-report.md",
      sha256: "abc123",
    });
  });

  it("falls back to a human deliverable document", async () => {
    const db = dbWithExecuteResults([
      [],
      [{
        deliverable_id: "44444444-4444-4444-8444-444444444444",
        key: "review-notes",
        title: "Review notes",
        format: "markdown",
        byte_size: 12,
      }],
    ]);

    const file = await resolveAwaitingHumanReviewFile(db, {
      companyId: "company-1",
      issueId: "issue-1",
      sourceLink: "https://bizbox.example/issues/BIZ-35",
    });

    expect(file).toMatchObject({
      source: "document",
      filename: "review-notes.md",
      contentType: "text/markdown; charset=utf-8",
      deliverableUrl: "https://bizbox.example/api/deliverables/44444444-4444-4444-8444-444444444444/content",
    });
  });

  it("returns null when no review deliverable exists", async () => {
    const db = dbWithExecuteResults([[], []]);

    await expect(resolveAwaitingHumanReviewFile(db, {
      companyId: "company-1",
      issueId: "issue-1",
      sourceLink: "https://bizbox.example/issues/BIZ-35",
    })).resolves.toBeNull();
  });
});
