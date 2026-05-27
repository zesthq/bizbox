import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addClickUpChatMessageReaction,
  deleteClickUpChatMessageReaction,
  getClickUpChatMessageReplies,
} from "../services/clickup-awaiting-human-transport.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.CLICKUP_PERSONAL_TOKEN;
  delete process.env.CLICKUP_WORKSPACE_ID;
});

describe("addClickUpChatMessageReaction", () => {
  it("posts a like reaction to the ClickUp chat message", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await addClickUpChatMessageReaction("message-42", "white_check_mark");

    expect(result).toEqual({
      status: "sent",
      detail: "sent",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/messages/message-42/reactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token-123",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reaction: "white_check_mark",
    });
  });

  it("treats an already-existing reaction as a successful acknowledgement", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "reaction already exists",
    }) as typeof fetch;

    const result = await addClickUpChatMessageReaction("message-42", "white_check_mark");

    expect(result).toEqual({
      status: "sent",
      detail: "already-exists",
    });
  });
});

describe("deleteClickUpChatMessageReaction", () => {
  it("deletes a reaction from the ClickUp chat message", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await deleteClickUpChatMessageReaction("message-42", "brain_is_thinking");

    expect(result).toEqual({
      status: "sent",
      detail: "deleted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/messages/message-42/reactions/brain_is_thinking",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "token-123",
          "Content-Type": "application/json",
        }),
      }),
    );
  });
});

describe("getClickUpChatMessageReplies", () => {
  it("extracts the reply message id from nested post data", async () => {
    process.env.CLICKUP_PERSONAL_TOKEN = "token-123";
    process.env.CLICKUP_WORKSPACE_ID = "workspace-1";

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        replies: [
          {
            id: "reply-row-1",
            content: "approve",
            links: {
              reactions: "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/messages/reply-message-1/reactions",
            },
            post_data: {
              id: "reply-message-1",
            },
          },
        ],
      }),
    }) as typeof fetch;

    const result = await getClickUpChatMessageReplies("message-42");

    expect(result).toEqual({
      status: "sent",
      detail: "ok",
      replies: [
        {
          id: "reply-row-1",
          messageId: null,
          reactionsUrl: "https://api.clickup.com/api/v3/workspaces/workspace-1/chat/messages/reply-message-1/reactions",
          content: "approve",
        },
      ],
    });
  });
});
