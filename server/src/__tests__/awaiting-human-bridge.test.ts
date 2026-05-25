import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  agentWakeupRequests,
  awaitingHumanBridgeInboundEvents,
  activityLog,
  companies,
  createDb,
  goals,
  issues,
  issueThreadInteractions,
  awaitingHumanBridges,
  issueComments,
} from "@paperclipai/db";
import { and, eq, lte } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { awaitingHumanBridgeService } from "../services/awaiting-human-bridge.js";
import { issueThreadInteractionService } from "../services/issue-thread-interactions.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("awaitingHumanBridgeService", () => {
  let db!: ReturnType<typeof createDb>;
  let interactionsSvc!: ReturnType<typeof issueThreadInteractionService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-awaiting-human-bridge-");
    db = createDb(tempDb.connectionString);
    interactionsSvc = issueThreadInteractionService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(agentWakeupRequests);
    await db.delete(issueComments);
    await db.delete(awaitingHumanBridgeInboundEvents);
    await db.delete(awaitingHumanBridges);
    await db.delete(issueThreadInteractions);
    await db.delete(issues);
    await db.delete(goals);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedAwaitingHumanInteraction() {
    const companyId = randomUUID();
    const goalId = randomUUID();
    const issueId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(goals).values({
      id: goalId,
      companyId,
      title: "Bridge goal",
      level: "task",
      status: "active",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Engineer",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      goalId,
      title: "Awaiting approval",
      status: "awaiting_human",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    const interaction = await interactionsSvc.create({
      id: issueId,
      companyId,
    }, {
      kind: "request_confirmation",
      continuationPolicy: "wake_assignee_on_accept",
      payload: {
        version: 1,
        prompt: "Approve this plan?",
      },
    }, {
      agentId,
    });

    return { companyId, issueId, interactionId: interaction.id, agentId };
  }

  async function seedAskUserQuestionsInteraction() {
    const companyId = randomUUID();
    const goalId = randomUUID();
    const issueId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(goals).values({
      id: goalId,
      companyId,
      title: "Question bridge goal",
      level: "task",
      status: "active",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Engineer",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      goalId,
      identifier: "TES-7",
      title: "Roadmap unblock",
      status: "awaiting_human",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    const interaction = await interactionsSvc.create({
      id: issueId,
      companyId,
    }, {
      kind: "ask_user_questions",
      continuationPolicy: "wake_assignee",
      title: "Board input needed to unblock roadmap",
      payload: {
        version: 1,
        title: "Please provide the required inputs so roadmap drafting can begin.",
        questions: [
          {
            id: "vision",
            prompt: "What is the one-sentence product vision and primary target customer segment?",
            required: true,
            selectionMode: "single",
            options: [
              { id: "comment", label: "I will provide this in a follow-up comment", description: "Use free text in the issue thread." },
            ],
          },
          {
            id: "mvp",
            prompt: "What are the must-have MVP features for launch?",
            required: true,
            selectionMode: "multi",
            options: [
              { id: "comment", label: "I will provide this in a follow-up comment", description: "List the MVP features in a thread comment." },
              { id: "analytics", label: "Basic analytics" },
            ],
          },
        ],
      },
    }, {
      agentId,
    });

    return { companyId, issueId, interactionId: interaction.id, agentId };
  }

  async function seedAskUserQuestionsBinaryInteraction() {
    const companyId = randomUUID();
    const goalId = randomUUID();
    const issueId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(goals).values({
      id: goalId,
      companyId,
      title: "Question bridge binary goal",
      level: "task",
      status: "active",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Engineer",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      goalId,
      identifier: "TES-24",
      title: "Bridge round trip",
      status: "awaiting_human",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    const interaction = await interactionsSvc.create({
      id: issueId,
      companyId,
    }, {
      kind: "ask_user_questions",
      continuationPolicy: "wake_assignee",
      title: "E2E bridge probe: structured questions",
      payload: {
        version: 1,
        questions: [
          {
            id: "surface_check",
            prompt: "Did the full question card render in ClickUp?",
            selectionMode: "single",
            required: true,
            options: [
              { id: "full_render", label: "Yes, full card rendered" },
              { id: "partial_render", label: "Partially rendered" },
            ],
          },
          {
            id: "roundtrip_observation",
            prompt: "Did you observe a mirrored reply/comment in Bizbox?",
            selectionMode: "single",
            required: true,
            options: [
              { id: "mirrored", label: "Yes, mirrored back" },
              { id: "not_mirrored", label: "No mirror yet" },
            ],
          },
        ],
      },
    }, {
      agentId,
    });

    return { companyId, issueId, interactionId: interaction.id, agentId };
  }

  function approvalNotification() {
    return {
      handoffKind: "request_confirmation" as const,
      notification: {
        title: "Awaiting approval needs confirmation",
        summary: "Approve this plan?",
        link: "",
        cta: "Reply in ClickUp to approve or explain the changes needed.",
        labels: ["awaiting_human", "request_confirmation"],
        kind: "request_confirmation",
        body: null,
      },
    };
  }

  it("creates one active bridge for an interaction and reuses it while still open", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const send = vi.fn(async () => ({
      externalThreadId: "thread-1",
      externalMessageId: "message-1",
      nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
    }));
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send,
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close: vi.fn(async () => {}),
      }),
    });

    const first = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });
    const second = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    expect(first.id).toBe(second.id);
    expect(send).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      provider: "clickup",
      status: "waiting_for_human",
      externalThreadId: "thread-1",
      externalMessageId: "message-1",
    }));
  });

  it("does not create duplicate bridges when concurrent openOrReuse calls race", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    let resolveProviderGate!: () => void;
    let resolveProviderCalls = 0;
    const providerGate = new Promise<void>((resolve) => {
      resolveProviderGate = resolve;
    });
    const send = vi.fn(async () => ({
      externalThreadId: "thread-1",
      externalMessageId: "message-1",
      nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
    }));
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => {
        resolveProviderCalls += 1;
        if (resolveProviderCalls === 2) {
          resolveProviderGate();
        }
        await providerGate;
        return "clickup";
      },
      resolveAdapter: () => ({
        send,
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close: vi.fn(async () => {}),
      }),
    });

    const [first, second] = await Promise.all([
      service.openOrReuseForInteraction({
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        agentId: seeded.agentId,
        ...approvalNotification(),
      }),
      service.openOrReuseForInteraction({
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        agentId: seeded.agentId,
        ...approvalNotification(),
      }),
    ]);

    expect(first.id).toBe(second.id);
    expect(send).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      status: "waiting_for_human",
      externalMessageId: "message-1",
    }));
  });

  it("builds full ask-user-questions outbound content for the bridge", async () => {
    const seeded = await seedAskUserQuestionsInteraction();
    const send = vi.fn(async () => ({
      externalThreadId: "thread-1",
      externalMessageId: "message-1",
      nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
    }));
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send,
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close: vi.fn(async () => {}),
      }),
    });

    await service.openForPendingInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      handoffKind: "ask_user_questions",
      notification: expect.objectContaining({
        labels: ["awaiting_human", "ask_user_questions"],
        summary: "Board input needed to unblock roadmap",
      }),
    }));
    const sendArg = send.mock.calls[0]?.[0];
    expect(sendArg?.notification.body).toContain("Question 1: What is the one-sentence product vision and primary target customer segment?");
    expect(sendArg?.notification.body).toContain("Question 2: What are the must-have MVP features for launch?");
    expect(sendArg?.notification.body).toContain("Options:");
    expect(sendArg?.notification.body).toContain("I will provide this in a follow-up comment");
    expect(sendArg?.notification.body).toContain("Basic analytics");
  });

  it("imports a plain reply as an issue comment, wakes the agent, and keeps the bridge open", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "reply",
              externalEventId: "reply-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              authorExternalId: "user-1",
              authorDisplayName: "Board",
              body: "Please revise the summary first.",
              receivedAt: new Date("2026-05-22T00:02:00.000Z"),
              metadata: { clickupReplyId: "reply-1" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("ClickUp reply received:\n\nPlease revise the summary first.");

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(1);
    expect(wakes[0]?.payload).toMatchObject({
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      mutation: "comment",
    });

    const events = await db.select().from(awaitingHumanBridgeInboundEvents).where(
      eq(awaitingHumanBridgeInboundEvents.bridgeId, bridge.id),
    );
    expect(events).toHaveLength(1);

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge?.status).toBe("waiting_for_human");
  });

  it("skips a duplicate inbound event when overlapping polls race on the same ClickUp reply", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    let pollCalls = 0;
    let releasePollGate!: () => void;
    const pollGate = new Promise<void>((resolve) => {
      releasePollGate = resolve;
    });
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => {
          pollCalls += 1;
          if (pollCalls === 2) {
            releasePollGate();
          }
          await pollGate;
          return {
            status: "ok" as const,
            detail: "ok",
            events: [
              {
                kind: "reply" as const,
                externalEventId: "reply-1",
                externalThreadId: "thread-1",
                externalMessageId: "message-1",
                body: "Please revise the summary first.",
                metadata: { clickupReplyId: "reply-1" },
              },
            ],
          };
        }),
        close: vi.fn(async () => {}),
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await Promise.all([
      service.pollBridge(bridge.id, new Date("2026-05-22T00:03:00.000Z")),
      service.pollBridge(bridge.id, new Date("2026-05-22T00:03:00.000Z")),
    ]);

    expect(pollCalls).toBe(2);

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);

    const events = await db.select().from(awaitingHumanBridgeInboundEvents).where(
      eq(awaitingHumanBridgeInboundEvents.bridgeId, bridge.id),
    );
    expect(events).toHaveLength(1);
  });

  it("delegates plain reply wakes through requestWakeup when provided", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const requestWakeup = vi.fn(async () => {});
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "reply",
              externalEventId: "reply-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              body: "Please revise the summary first.",
              metadata: { clickupReplyId: "reply-1" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
      requestWakeup,
    });

    await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));

    expect(requestWakeup).toHaveBeenCalledTimes(1);
    expect(requestWakeup).toHaveBeenCalledWith(expect.objectContaining({
      companyId: seeded.companyId,
      agentId: seeded.agentId,
      reason: "issue_commented",
      requestedByActorType: "system",
      requestedByActorId: "clickup_approval_poller",
      payload: expect.objectContaining({
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        mutation: "comment",
      }),
    }));

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(0);
  });

  it("answers ask_user_questions from a ClickUp reply, transitions awaiting_human to todo, and stays idempotent on replay", async () => {
    const seeded = await seedAskUserQuestionsBinaryInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "reply",
              externalEventId: "reply-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              body: "question 1 is yet it got diaplyed",
              metadata: { clickupReplyId: "reply-1" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    await service.openForPendingInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));
    await service.pollActiveBridges(new Date("2026-05-22T00:04:00.000Z"));

    const [interaction] = await db.select().from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, seeded.interactionId));
    expect(interaction?.status).toBe("answered");
    expect(interaction?.result).toMatchObject({
      version: 1,
      answers: [
        { questionId: "surface_check", optionIds: ["full_render"] },
        { questionId: "roundtrip_observation", optionIds: ["mirrored"] },
      ],
      summaryMarkdown: "question 1 is yet it got diaplyed",
    });

    const [updatedIssue] = await db.select().from(issues).where(eq(issues.id, seeded.issueId));
    expect(updatedIssue?.status).toBe("todo");

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("ClickUp reply received:\n\nquestion 1 is yet it got diaplyed");

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(1);
    expect(wakes[0]?.payload).toMatchObject({
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      interactionStatus: "answered",
      mutation: "interaction",
    });

    const bridges = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "superseded",
    }));
  });

  it("accepts the interaction, wakes the agent, and closes the bridge on approval", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "approval_signal",
              externalEventId: "approval-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              body: "approved",
              receivedAt: new Date("2026-05-22T00:02:00.000Z"),
              metadata: { resolutionSource: "clickup_reply" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));

    const [interaction] = await db.select().from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, seeded.interactionId));
    expect(interaction?.status).toBe("accepted");

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(1);
    expect(wakes[0]?.payload).toMatchObject({
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      interactionStatus: "accepted",
    });

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "approved",
    }));
  });

  it("delegates approval wakes through requestWakeup when provided", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const requestWakeup = vi.fn(async () => {});
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "approval_signal",
              externalEventId: "approval-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              body: "approved",
              metadata: { resolutionSource: "clickup_reply" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
      requestWakeup,
    });

    await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));

    expect(requestWakeup).toHaveBeenCalledTimes(1);
    expect(requestWakeup).toHaveBeenCalledWith(expect.objectContaining({
      companyId: seeded.companyId,
      agentId: seeded.agentId,
      payload: expect.objectContaining({
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        interactionStatus: "accepted",
      }),
    }));

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(0);
  });

  it("rejects the interaction, wakes the agent, and closes the bridge on rejection", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "reject_signal",
              externalEventId: "reject-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-1",
              body: "No, change the plan.",
              receivedAt: new Date("2026-05-22T00:02:00.000Z"),
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.pollActiveBridges(new Date("2026-05-22T00:03:00.000Z"));

    const [interaction] = await db.select().from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, seeded.interactionId));
    expect(interaction?.status).toBe("rejected");

    const wakes = await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.agentId, seeded.agentId));
    expect(wakes).toHaveLength(1);
    expect(wakes[0]?.payload).toMatchObject({
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      interactionStatus: "rejected",
    });

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "rejected",
      closeReason: "No, change the plan.",
    }));
  });

  it("expires an overdue bridge, leaves the interaction pending, and records visible evidence", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const close = vi.fn(async () => {});
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close,
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await db.update(awaitingHumanBridges).set({
      createdAt: new Date("2026-05-21T00:00:00.000Z"),
      updatedAt: new Date("2026-05-21T00:00:00.000Z"),
    }).where(eq(awaitingHumanBridges.id, bridge.id));

    await service.expireWaitingBridges(new Date("2026-05-22T12:00:00.000Z"), 60 * 60 * 1000);

    const [interaction] = await db.select().from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, seeded.interactionId));
    expect(interaction?.status).toBe("pending");

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "expired",
    }));

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("Awaiting human bridge timed out");

    const events = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(events.some((event) => event.action === "issue.comment_added")).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("marks the bridge failed and records visible evidence when the provider poll fails", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "failed",
          detail: "clickup poll failed: 500",
          events: [],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    const result = await service.pollBridge(bridge.id, new Date("2026-05-22T00:03:00.000Z"));

    expect(result.failed).toBe(1);
    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "failed",
      lastError: "clickup poll failed: 500",
    }));

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("Awaiting human bridge failed");

    const events = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(events.some((event) => event.action === "issue.comment_added")).toBe(true);
  });

  it("closes waiting ClickUp bridges when the issue is already terminal", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const poll = vi.fn(async () => ({
      status: "ok" as const,
      detail: "ok",
      events: [],
    }));
    const close = vi.fn(async () => {});
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll,
        close,
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await db.update(issues).set({
      status: "done",
      completedAt: new Date("2026-05-22T00:02:00.000Z"),
    }).where(eq(issues.id, seeded.issueId));

    const result = await service.pollBridge(bridge.id, new Date("2026-05-22T00:03:00.000Z"));

    expect(poll).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "superseded",
      closeReason: "Issue already marked done.",
    }));
  });

  it("supports manual close through the bridge service", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const close = vi.fn(async () => {});
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close,
      }),
    });

    const bridge = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    await service.closeBridge({
      bridgeId: bridge.id,
      outcome: "cancelled",
      reason: "Operator cancelled the bridge.",
    });

    const [updatedBridge] = await db.select().from(awaitingHumanBridges).where(eq(awaitingHumanBridges.id, bridge.id));
    expect(updatedBridge).toEqual(expect.objectContaining({
      status: "closed",
      closeOutcome: "cancelled",
      closeReason: "Operator cancelled the bridge.",
    }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("limits active bridge polling batches to 200 rows", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const send = vi.fn(async () => ({
      externalThreadId: "thread-1",
      externalMessageId: "message-1",
      nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
    }));
    const poll = vi.fn(async () => ({
      status: "ok" as const,
      detail: "ok",
      events: [],
    }));
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send,
        poll,
        close: vi.fn(async () => {}),
      }),
    });

    const interactionIds = [seeded.interactionId];
    for (let index = 0; index < 200; index += 1) {
      const interaction = await interactionsSvc.create({
        id: seeded.issueId,
        companyId: seeded.companyId,
      }, {
        kind: "request_confirmation",
        continuationPolicy: "wake_assignee_on_accept",
        payload: {
          version: 1,
          prompt: `Approve bridge ${index}?`,
        },
      }, {
        agentId: seeded.agentId,
      });
      interactionIds.push(interaction.id);
    }

    for (const interactionId of interactionIds) {
      await service.openOrReuseForInteraction({
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId,
        agentId: seeded.agentId,
        ...approvalNotification(),
      });
    }

    const now = new Date("2026-05-22T00:03:00.000Z");
    await service.pollActiveBridges(now);

    expect(poll).toHaveBeenCalledTimes(200);

    const remainingReadyRows = await db.select().from(awaitingHumanBridges).where(and(
      eq(awaitingHumanBridges.status, "waiting_for_human"),
      lte(awaitingHumanBridges.nextPollAt, now),
    ));
    expect(remainingReadyRows).toHaveLength(1);
  });

  it("creates a new bridge cycle after a bridge closed or failed", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: `thread-${Math.random()}`,
          externalMessageId: `message-${Math.random()}`,
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close: vi.fn(async () => {}),
      }),
    });

    const first = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });
    await service.closeBridge({
      bridgeId: first.id,
      outcome: "expired",
      reason: "Timed out.",
    });

    const second = await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    expect(second.id).not.toBe(first.id);
    const rows = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(rows).toHaveLength(2);
  });

  it("skips delivered interactions whose notification delivery is not a sent ClickUp chat message", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-1",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({ status: "ok", detail: "ok", events: [] })),
        close: vi.fn(async () => {}),
      }),
    });

    const result = await service.reconcileDeliveredInteractions([
      {
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        assigneeAgentId: seeded.agentId,
        createdByAgentId: seeded.agentId,
        handoffDetails: {
          notificationDelivery: {
            status: "queued",
            channel: "clickup-chat",
            externalId: "message-42",
          },
        },
      },
      {
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        assigneeAgentId: seeded.agentId,
        createdByAgentId: seeded.agentId,
        handoffDetails: {
          notificationDelivery: {
            status: "sent",
            channel: "email",
            externalId: "message-42",
          },
        },
      },
    ]);

    expect(result).toEqual({
      checked: 0,
      approved: 0,
      rejected: 0,
      replies: 0,
      noSignal: 0,
      failed: 0,
      skipped: 2,
      approvedIssueIds: [],
      approvedInteractionIds: [],
    });

    const rows = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(rows).toHaveLength(0);
  });

  it("reconciles an eligible delivered interaction through the bridge and aggregates the poll result", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-42",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "reply",
              externalEventId: "reply-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-42",
              body: "Please fix the title first.",
              metadata: { clickupReplyId: "reply-1" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    const result = await service.reconcileDeliveredInteractions([
      {
        companyId: seeded.companyId,
        issueId: seeded.issueId,
        interactionId: seeded.interactionId,
        assigneeAgentId: seeded.agentId,
        createdByAgentId: seeded.agentId,
        handoffDetails: {
          notificationDelivery: {
            status: "sent",
            channel: "clickup-chat",
            externalId: "message-42",
          },
        },
      },
    ]);

    expect(result).toEqual({
      checked: 1,
      approved: 0,
      rejected: 0,
      replies: 1,
      noSignal: 0,
      failed: 0,
      skipped: 0,
      approvedIssueIds: [],
      approvedInteractionIds: [],
    });

    const rows = await db.select().from(awaitingHumanBridges)
      .where(eq(awaitingHumanBridges.interactionId, seeded.interactionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalMessageId).toBe("message-42");
  });

  it("continues reconciling later delivered interactions when one bridge candidate fails", async () => {
    const first = await seedAwaitingHumanInteraction();
    const second = await seedAwaitingHumanInteraction();
    let pollCalls = 0;
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async ({ interactionId }) => ({
          externalThreadId: `thread-${interactionId}`,
          externalMessageId: `message-${interactionId}`,
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => {
          pollCalls += 1;
          if (pollCalls === 1) {
            throw new Error("clickup poll exploded");
          }
          return {
            status: "ok" as const,
            detail: "ok",
            events: [
              {
                kind: "reply" as const,
                externalEventId: "reply-2",
                externalThreadId: "thread-2",
                externalMessageId: "message-2",
                body: "Second candidate still worked.",
              },
            ],
          };
        }),
        close: vi.fn(async () => {}),
      }),
    });

    const result = await service.reconcileDeliveredInteractions([
      {
        companyId: first.companyId,
        issueId: first.issueId,
        interactionId: first.interactionId,
        assigneeAgentId: first.agentId,
        createdByAgentId: first.agentId,
        handoffDetails: {
          notificationDelivery: {
            status: "sent",
            channel: "clickup-chat",
            externalId: "message-first",
          },
        },
      },
      {
        companyId: second.companyId,
        issueId: second.issueId,
        interactionId: second.interactionId,
        assigneeAgentId: second.agentId,
        createdByAgentId: second.agentId,
        handoffDetails: {
          notificationDelivery: {
            status: "sent",
            channel: "clickup-chat",
            externalId: "message-second",
          },
        },
      },
    ]);

    expect(result).toEqual({
      checked: 1,
      approved: 0,
      rejected: 0,
      replies: 1,
      noSignal: 0,
      failed: 1,
      skipped: 0,
      approvedIssueIds: [],
      approvedInteractionIds: [],
    });

    const secondComments = await db.select().from(issueComments).where(eq(issueComments.issueId, second.issueId));
    expect(secondComments).toHaveLength(1);
    expect(secondComments[0]?.body).toContain("Second candidate still worked.");
  });

  it("finds persisted pending awaiting-human confirmations and reconciles them end to end", async () => {
    const seeded = await seedAwaitingHumanInteraction();
    const service = awaitingHumanBridgeService(db, {
      resolveProviderForCompany: async () => "clickup",
      resolveAdapter: () => ({
        send: vi.fn(async () => ({
          externalThreadId: "thread-1",
          externalMessageId: "message-42",
          nextPollAt: new Date("2026-05-22T00:01:00.000Z"),
        })),
        poll: vi.fn(async () => ({
          status: "ok",
          detail: "ok",
          events: [
            {
              kind: "approval_signal",
              externalEventId: "approval-1",
              externalThreadId: "thread-1",
              externalMessageId: "message-42",
              body: "approved",
              metadata: { resolutionSource: "clickup_reply" },
            },
          ],
        })),
        close: vi.fn(async () => {}),
      }),
    });

    await service.openOrReuseForInteraction({
      companyId: seeded.companyId,
      issueId: seeded.issueId,
      interactionId: seeded.interactionId,
      agentId: seeded.agentId,
      ...approvalNotification(),
    });

    const result = await service.reconcilePendingConfirmations();

    expect(result.checked).toBe(1);
    expect(result.approved).toBe(1);
    expect(result.issueIds).toEqual([seeded.issueId]);
    expect(result.interactionIds).toEqual([seeded.interactionId]);
  });
});
