import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/awaiting-human-notifications.js", () => ({
  sendAwaitingHumanNotification: vi.fn().mockResolvedValue({
    status: "sent",
    channel: "clickup-chat",
    detail: "sent",
    externalId: "msg_123",
  }),
}));

const { logActivity } = await import("../services/activity-log.js");
const { sendAwaitingHumanNotification } = await import("../services/awaiting-human-notifications.js");
const { maybeLogAwaitingHumanHandoff } = await import("../services/awaiting-human-handoff.js");

const basePreviousIssue = {
  id: "issue-1",
  companyId: "company-1",
  identifier: "BIZ-35",
  title: "Community reply approval",
  status: "in_progress",
  assigneeAgentId: "agent-1",
  assigneeUserId: null,
};

const baseUpdatedIssue = {
  ...basePreviousIssue,
  status: "awaiting_human",
  assigneeAgentId: null,
  assigneeUserId: "board-user",
};

const baseActor = {
  actorType: "agent" as const,
  actorId: "agent-1",
  agentId: "agent-1",
  userId: null,
  runId: "run-1",
};

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.BIZBOX_PUBLIC_URL;
});

describe("maybeLogAwaitingHumanHandoff", () => {
  it("sends a ClickUp notification for request_confirmation handoffs", async () => {
    process.env.BIZBOX_PUBLIC_URL = "https://bizbox.example";

    const created = await maybeLogAwaitingHumanHandoff({} as Db, {
      previousIssue: basePreviousIssue,
      updatedIssue: baseUpdatedIssue,
      source: "issue_thread_interactions.create",
      handoffKind: "request_confirmation",
      actor: baseActor,
      interaction: {
        id: "interaction-1",
        kind: "request_confirmation",
        title: null,
        summary: null,
        payload: {
          version: 1,
          prompt: "Approve the exact GitHub reply before posting.",
        },
      },
    });

    expect(created).toBe(true);
    expect(sendAwaitingHumanNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        issueId: "issue-1",
        handoffKind: "request_confirmation",
        notification: expect.objectContaining({
          link: "https://bizbox.example/issues/BIZ-35",
          summary: "Approve the exact GitHub reply before posting.",
        }),
      }),
    );
    expect(logActivity).toHaveBeenCalledTimes(1);
  });

  it("sends a ClickUp notification for ask_user_questions handoffs", async () => {
    const created = await maybeLogAwaitingHumanHandoff({} as Db, {
      previousIssue: basePreviousIssue,
      updatedIssue: baseUpdatedIssue,
      source: "issue_thread_interactions.create",
      handoffKind: "ask_user_questions",
      actor: baseActor,
      interaction: {
        id: "interaction-2",
        kind: "ask_user_questions",
        title: null,
        summary: null,
        payload: {
          version: 1,
          questions: [
            { id: "scope", prompt: "Which scope?", selectionMode: "single", options: [{ id: "a", label: "A" }] },
            { id: "risk", prompt: "What risk?", selectionMode: "single", options: [{ id: "b", label: "B" }] },
          ],
        },
      },
    });

    expect(created).toBe(true);
    expect(sendAwaitingHumanNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        handoffKind: "ask_user_questions",
        notification: expect.objectContaining({
          summary: "Need answers to 2 question(s).",
          link: "/issues/BIZ-35",
        }),
      }),
    );
  });

  it("sends a ClickUp notification for human_owned_blocker handoffs", async () => {
    const created = await maybeLogAwaitingHumanHandoff({} as Db, {
      previousIssue: basePreviousIssue,
      updatedIssue: baseUpdatedIssue,
      source: "heartbeat.reconcile_stranded_assigned_issues",
      handoffKind: "human_owned_blocker",
      actor: baseActor,
      blockers: [
        {
          id: "blocker-1",
          identifier: "BIZ-36",
          title: "Board decision needed",
          assigneeUserId: "board-user",
        },
      ],
    });

    expect(created).toBe(true);
    expect(sendAwaitingHumanNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        handoffKind: "human_owned_blocker",
        notification: expect.objectContaining({
          summary: "Waiting on human input to unblock BIZ-36.",
        }),
      }),
    );
  });

  it("does not resend when the issue is already awaiting_human", async () => {
    const created = await maybeLogAwaitingHumanHandoff({} as Db, {
      previousIssue: {
        ...basePreviousIssue,
        status: "awaiting_human",
      },
      updatedIssue: baseUpdatedIssue,
      source: "heartbeat.reconcile_stranded_assigned_issues",
      handoffKind: "human_owned_blocker",
      actor: baseActor,
      blockers: [
        {
          id: "blocker-1",
          identifier: "BIZ-36",
          title: "Board decision needed",
          assigneeUserId: "board-user",
        },
      ],
    });

    expect(created).toBe(false);
    expect(sendAwaitingHumanNotification).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});
