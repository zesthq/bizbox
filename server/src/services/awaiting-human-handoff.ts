import type { Db } from "@paperclipai/db";
import type {
  AskUserQuestionsInteraction,
  RequestConfirmationInteraction,
} from "@paperclipai/shared";
import { logActivity } from "./activity-log.js";

type AwaitingHumanIssueSnapshot = {
  id: string;
  companyId: string;
  identifier: string | null;
  title: string;
  status: string;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
};

type AwaitingHumanActor = {
  actorType: "agent" | "user" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
  userId?: string | null;
  runId?: string | null;
};

type AwaitingHumanBlocker = {
  id: string;
  identifier: string | null;
  title: string;
  assigneeUserId?: string | null;
};

type AwaitingHumanInteraction =
  | Pick<RequestConfirmationInteraction, "id" | "kind" | "title" | "summary" | "payload">
  | Pick<AskUserQuestionsInteraction, "id" | "kind" | "title" | "summary" | "payload">;

type AwaitingHumanHandoffInput = {
  previousIssue: AwaitingHumanIssueSnapshot;
  updatedIssue: AwaitingHumanIssueSnapshot;
  source: string;
  handoffKind: "request_confirmation" | "ask_user_questions" | "human_owned_blocker";
  actor: AwaitingHumanActor;
  interaction?: AwaitingHumanInteraction | null;
  blockers?: AwaitingHumanBlocker[] | null;
  emitIssueUpdatedActivity?: boolean;
};

type NotificationPayload = {
  title: string;
  summary: string;
  link: string;
  cta: string;
  labels: string[];
};

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function summarizeQuestions(interaction: AwaitingHumanInteraction | null | undefined) {
  if (!interaction || interaction.kind !== "ask_user_questions") return null;
  return `Need answers to ${interaction.payload.questions.length} question(s).`;
}

function summarizeBlockers(blockers: AwaitingHumanBlocker[] | null | undefined) {
  if (!blockers || blockers.length === 0) return "Waiting on a human-owned blocking issue.";
  const [first] = blockers;
  if (!first) return "Waiting on a human-owned blocking issue.";
  const label = first.identifier ?? first.title;
  if (blockers.length === 1) {
    return `Waiting on human input to unblock ${label}.`;
  }
  return `Waiting on human input to unblock ${label} and ${blockers.length - 1} other blocker(s).`;
}

function resolveNeedsHumanInput(input: AwaitingHumanHandoffInput) {
  switch (input.handoffKind) {
    case "request_confirmation":
      return truncateText(
        firstNonEmpty(
          input.interaction?.summary,
          input.interaction?.title,
          input.interaction?.kind === "request_confirmation"
            ? input.interaction.payload.prompt
            : null,
        ) ?? "Need a human confirmation before work can continue.",
        220,
      );
    case "ask_user_questions":
      return truncateText(
        firstNonEmpty(
          input.interaction?.summary,
          input.interaction?.title,
          summarizeQuestions(input.interaction),
        ) ?? "Need a human answer before work can continue.",
        220,
      );
    case "human_owned_blocker":
      return truncateText(summarizeBlockers(input.blockers), 220);
  }
}

function resolveIssuePathId(issue: AwaitingHumanIssueSnapshot) {
  return issue.identifier ?? issue.id;
}

function resolveBaseUrl() {
  const configured = process.env.BIZBOX_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const apiUrl = process.env.BIZBOX_API_URL?.trim();
  if (!apiUrl) return null;
  try {
    const parsed = new URL(apiUrl);
    if (parsed.pathname === "/api") {
      parsed.pathname = "";
    } else {
      parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "");
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveAudienceUserId(input: AwaitingHumanHandoffInput) {
  if (input.handoffKind !== "human_owned_blocker") return null;
  const userIds = [...new Set(
    (input.blockers ?? [])
      .map((blocker) => blocker.assigneeUserId ?? null)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  )];
  return userIds.length === 1 ? userIds[0] : null;
}

function buildNotification(input: AwaitingHumanHandoffInput, link: string, needsHumanInput: string): NotificationPayload {
  const label = input.updatedIssue.identifier ?? truncateText(input.updatedIssue.title, 48);
  return {
    title: truncateText(`${label} is waiting on human input`, 120),
    summary: truncateText(needsHumanInput, 280),
    link,
    cta: `Open ${label} in Bizbox and respond there.`,
    labels: ["awaiting_human", input.handoffKind],
  };
}

function buildDedupeKey(input: AwaitingHumanHandoffInput) {
  if (input.handoffKind === "human_owned_blocker") {
    const blockerIds = [...new Set((input.blockers ?? []).map((blocker) => blocker.id))].sort();
    return `human-blocker:${input.updatedIssue.id}:${blockerIds.join(",")}`;
  }
  return `interaction:${input.interaction?.id ?? input.updatedIssue.id}`;
}

export async function maybeLogAwaitingHumanHandoff(
  db: Db,
  input: AwaitingHumanHandoffInput,
) {
  if (input.previousIssue.status === "awaiting_human") return false;
  if (input.updatedIssue.status !== "awaiting_human") return false;

  const issuePathId = resolveIssuePathId(input.updatedIssue);
  const issuePath = `/issues/${issuePathId}`;
  const baseUrl = resolveBaseUrl();
  const issueUrl = baseUrl ? new URL(issuePath, `${baseUrl}/`).toString() : null;
  const needsHumanInput = resolveNeedsHumanInput(input);
  const dedupeKey = buildDedupeKey(input);
  const audienceUserId = resolveAudienceUserId(input);
  const notificationLink = issueUrl ?? issuePath;
  const notification = buildNotification(input, notificationLink, needsHumanInput);
  const firstBlocker = input.blockers?.[0] ?? null;

  if (input.emitIssueUpdatedActivity) {
    await logActivity(db, {
      companyId: input.updatedIssue.companyId,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      agentId: input.actor.agentId ?? null,
      runId: input.actor.runId ?? null,
      action: "issue.updated",
      entityType: "issue",
      entityId: input.updatedIssue.id,
      details: {
        identifier: input.updatedIssue.identifier,
        status: "awaiting_human",
        previousStatus: input.previousIssue.status,
        assigneeAgentId: input.updatedIssue.assigneeAgentId ?? null,
        assigneeUserId: input.updatedIssue.assigneeUserId ?? null,
        source: input.source,
        interactionId: input.interaction?.id ?? null,
        interactionKind: input.interaction?.kind ?? null,
        blockerIssueId: firstBlocker?.id ?? null,
        blockerIdentifier: firstBlocker?.identifier ?? null,
        _previous: {
          status: input.previousIssue.status,
          assigneeAgentId: input.previousIssue.assigneeAgentId ?? null,
          assigneeUserId: input.previousIssue.assigneeUserId ?? null,
        },
      },
    });
  }

  await logActivity(db, {
    companyId: input.updatedIssue.companyId,
    actorType: input.actor.actorType,
    actorId: input.actor.actorId,
    agentId: input.actor.agentId ?? null,
    runId: input.actor.runId ?? null,
    action: "issue.awaiting_human.entered",
    entityType: "issue",
    entityId: input.updatedIssue.id,
    details: {
      issueId: input.updatedIssue.id,
      issueIdentifier: input.updatedIssue.identifier,
      issueTitle: input.updatedIssue.title,
      issuePathId,
      issuePath,
      issueUrl,
      previousStatus: input.previousIssue.status,
      status: "awaiting_human",
      source: input.source,
      handoffKind: input.handoffKind,
      needsHumanInput,
      audienceUserId,
      interactionId: input.interaction?.id ?? null,
      interactionKind: input.interaction?.kind ?? null,
      blockerIssueId: firstBlocker?.id ?? null,
      blockerIdentifier: firstBlocker?.identifier ?? null,
      dedupeKey,
      notification,
    },
  });

  return true;
}
