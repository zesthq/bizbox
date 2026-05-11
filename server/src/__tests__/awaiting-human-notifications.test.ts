import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAwaitingHumanNotification } from "../services/awaiting-human-notifications.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.CLICKUP_PERSONAL_TOKEN;
  delete process.env.CLICKUP_WORKSPACE_ID;
  delete process.env.CLICKUP_ENGINEERING_CHANNEL_ID;
  delete process.env.CLICKUP_ENGINEERING_CHANNEL_NAME;
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
});
