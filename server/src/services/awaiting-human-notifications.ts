import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { awaitingHumanNotificationOutbox } from "@paperclipai/db";
import { buildDocumentFilename } from "../lib/document-filenames.js";
import { resolveDocumentTitle } from "../lib/document-titles.js";
import type { StorageService } from "../storage/types.js";
import { getStorageService } from "../storage/index.js";

const CLICKUP_CHAT_MESSAGE_MAX_CHARS = 1_800;
const DEFAULT_CLICKUP_AWAITING_HUMAN_CHANNEL_NAME = "bizbox-feed";
const MAX_TITLE_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 280;
const MAX_DETAIL_BULLETS = 5;
const MAX_BULLET_LENGTH = 220;
const CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE = 100;
const MAX_OUTBOX_ATTEMPTS = 8;
const STALE_OUTBOX_PROCESSING_MS = 5 * 60 * 1000;
const DEFAULT_CLICKUP_TIMEOUT_SEC = 30;
const CLICKUP_ATTACHMENT_FILE_FIELD = "attachment[0]";
const DEFAULT_CLICKUP_APPROVAL_POSITIVE_REACTIONS = ["thumbsup", "white_check_mark", "heavy_check_mark"] as const;
const DEFAULT_CLICKUP_APPROVAL_NEGATIVE_REACTIONS = ["thumbsdown"] as const;
const DEFAULT_CLICKUP_APPROVAL_POSITIVE_REPLY_KEYWORDS = [
  "approve",
  "approved",
  "approving",
  "yes",
  "ok",
  "okay",
  "ship it",
  "lgtm",
  "looks good",
  "go ahead",
  "+1",
] as const;
const NEGATED_APPROVAL_PREFIXES = [
  "not",
  "no",
  "never",
  "nope",
  "don t",
  "dont",
  "can t",
  "cant",
  "won t",
  "wont",
] as const;

export interface AwaitingHumanNotificationPayload {
  title: string;
  summary: string;
  link: string;
  cta: string;
  labels: string[];
  kind?: string | null;
  audience?: string | null;
  body?: string | null;
  reviewFile?: AwaitingHumanNotificationReviewFile | null;
}

export interface SendAwaitingHumanNotificationInput {
  companyId: string;
  issueId: string;
  handoffKind: "request_confirmation" | "ask_user_questions" | "human_owned_blocker";
  notification: AwaitingHumanNotificationPayload;
}

export interface AwaitingHumanNotificationResult {
  status: "sent" | "skipped" | "failed" | "enqueued";
  channel: "clickup-chat";
  detail: string;
  externalId?: string | null;
}

export interface EnqueueAwaitingHumanNotificationInput extends SendAwaitingHumanNotificationInput {
  dedupeKey: string;
}

export interface AwaitingHumanNotificationReviewFile {
  source: "artifact" | "document";
  deliverableId: string;
  title: string;
  filename: string;
  contentType: string;
  byteSize: number;
  contentPath: string;
  deliverableUrl: string;
  clickupTaskUrl?: string | null;
  clickupAttachmentId?: string | null;
  attachmentId?: string | null;
  objectKey?: string | null;
  sha256?: string | null;
}

type ClickUpChatConfig = {
  personalToken: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  reviewListId: string;
  approvalPositiveReactions: string[];
  approvalNegativeReactions: string[];
  approvalPositiveReplyKeywords: string[];
};

type ClickUpApiStatus = "sent" | "skipped" | "failed" | "no_approval";

export interface ClickUpChatMessageReply {
  id: string | null;
  content: string | null;
}

export interface ClickUpChatMessageReaction {
  name: string;
  count: number;
}

export interface ClickUpAwaitingHumanApprovalResult {
  status: ClickUpApiStatus | "approved" | "rejected";
  detail: string;
  resolutionSource?: "clickup_reply" | "clickup_reaction";
  clickupReaction?: string | null;
  replies?: ClickUpChatMessageReply[];
  rejectionReason?: string | null;
}

function truncateText(value: string, maxLength: number) {
  const compact = compactWhitespace(value);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactWhitespace(value: string) {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

function trimTotal(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function extractBullets(body: string | null | undefined) {
  if (!body) return [] as string[];
  const bullets: string[] = [];
  for (const rawLine of body.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      line = line.slice(2).trim();
    }
    bullets.push(truncateText(line, MAX_BULLET_LENGTH));
    if (bullets.length >= MAX_DETAIL_BULLETS) break;
  }
  return bullets;
}

function toRowArray<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sha256Hex(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

function nextRetryAt(attempt: number, now = Date.now()): Date {
  const seq = [5, 10, 20, 40, 80, 160, 320, 640];
  const sec = seq[Math.min(Math.max(attempt - 1, 0), seq.length - 1)] ?? 640;
  return new Date(now + sec * 1000);
}

function resolveAbsoluteUrl(pathOrUrl: string, sourceLink: string) {
  try {
    return new URL(pathOrUrl).toString();
  } catch {
    // Continue below.
  }

  try {
    return new URL(pathOrUrl, sourceLink).toString();
  } catch {
    return pathOrUrl;
  }
}

function normalizeReviewFile(value: unknown): AwaitingHumanNotificationReviewFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const source = row.source === "artifact" || row.source === "document" ? row.source : null;
  const deliverableId = readString(row.deliverableId);
  const title = readString(row.title);
  const filename = readString(row.filename);
  const contentType = readString(row.contentType);
  const contentPath = readString(row.contentPath);
  const deliverableUrl = readString(row.deliverableUrl);
  const byteSize = typeof row.byteSize === "number" && Number.isFinite(row.byteSize) ? row.byteSize : null;
  if (!source || !deliverableId || !title || !filename || !contentType || !contentPath || !deliverableUrl || byteSize === null) {
    return null;
  }
  return {
    source,
    deliverableId,
    title,
    filename,
    contentType,
    byteSize,
    contentPath,
    deliverableUrl,
    clickupTaskUrl: readString(row.clickupTaskUrl),
    clickupAttachmentId: readString(row.clickupAttachmentId),
    attachmentId: readString(row.attachmentId),
    objectKey: readString(row.objectKey),
    sha256: readString(row.sha256),
  };
}

function readClickUpChatConfig(): ClickUpChatConfig {
  const positiveReactions = (process.env.CLICKUP_APPROVAL_POSITIVE_REACTIONS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const negativeReactions = (process.env.CLICKUP_APPROVAL_NEGATIVE_REACTIONS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const positiveReplyKeywords = (process.env.CLICKUP_APPROVAL_POSITIVE_REPLY_KEYWORDS ?? "")
    .split(",")
    .map((value) => compactWhitespace(value.trim().toLowerCase()))
    .filter(Boolean);
  const channelId = process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_ID?.trim()
    || process.env.CLICKUP_ENGINEERING_CHANNEL_ID?.trim()
    || "";
  const channelName = process.env.CLICKUP_AWAITING_HUMAN_CHANNEL_NAME?.trim()
    || process.env.CLICKUP_ENGINEERING_CHANNEL_NAME?.trim()
    || DEFAULT_CLICKUP_AWAITING_HUMAN_CHANNEL_NAME;
  return {
    personalToken: process.env.CLICKUP_PERSONAL_TOKEN?.trim() ?? "",
    workspaceId: process.env.CLICKUP_WORKSPACE_ID?.trim() ?? "",
    channelId,
    channelName,
    reviewListId: process.env.CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID?.trim() ?? "",
    approvalPositiveReactions: positiveReactions.length > 0
      ? [...new Set(positiveReactions)]
      : [...DEFAULT_CLICKUP_APPROVAL_POSITIVE_REACTIONS],
    approvalNegativeReactions: negativeReactions.length > 0
      ? [...new Set(negativeReactions)]
      : [...DEFAULT_CLICKUP_APPROVAL_NEGATIVE_REACTIONS],
    approvalPositiveReplyKeywords: positiveReplyKeywords.length > 0
      ? [...new Set(positiveReplyKeywords)]
      : [...DEFAULT_CLICKUP_APPROVAL_POSITIVE_REPLY_KEYWORDS],
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeReactionName(value: unknown) {
  const raw = readString(value);
  if (!raw) return null;
  return raw.toLowerCase().replaceAll(" ", "_");
}

function normalizeReplyContent(value: string | null | undefined) {
  if (!value) return "";
  return compactWhitespace(value.toLowerCase().replace(/[^\p{L}\p{N}\s+]+/gu, " "));
}

function hasNegatedApprovalPrefix(content: string, keywordStart: number) {
  const prefix = content.slice(0, keywordStart).trimEnd();
  if (!prefix) return false;
  return NEGATED_APPROVAL_PREFIXES.some((negation) => prefix.endsWith(negation));
}

function replySignalsApproval(reply: ClickUpChatMessageReply, config: ClickUpChatConfig) {
  const content = normalizeReplyContent(reply.content);
  if (!content) return false;
  return config.approvalPositiveReplyKeywords.some((keyword) => {
    if (content === keyword) return true;
    const searchToken = ` ${keyword} `;
    const includePositions: number[] = [];
    let searchFrom = 0;
    while (true) {
      const index = content.indexOf(searchToken, searchFrom);
      if (index === -1) break;
      includePositions.push(index + 1);
      searchFrom = index + 1;
    }

    const matchPositions = [
      content.startsWith(`${keyword} `) ? 0 : -1,
      ...includePositions,
      content.endsWith(` ${keyword}`) ? content.length - keyword.length : -1,
    ].filter((position) => position >= 0);

    return matchPositions.some((position) => !hasNegatedApprovalPrefix(content, position));
  });
}

async function fetchClickUpJson(
  config: ClickUpChatConfig,
  path: string,
): Promise<{ status: "ok"; payload: unknown } | { status: "failed"; detail: string }> {
  try {
    const response = await fetch(
      `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}${path}`,
      {
        headers: {
          Authorization: config.personalToken,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: "failed",
        detail: `http-error:${response.status}:${truncateText(body, 240)}`,
      };
    }

    return {
      status: "ok",
      payload: await response.json(),
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractReplyRows(payload: unknown): ClickUpChatMessageReply[] {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const rows = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.replies)
      ? record.replies
      : Array.isArray(payload)
        ? payload
        : [];

  return rows.map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: readString(row.id),
      content: readString(row.content) ?? readString(row.message) ?? readString(row.text),
    };
  });
}

function extractReactionRows(payload: unknown): ClickUpChatMessageReaction[] {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const rows = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.reactions)
      ? record.reactions
      : Array.isArray(payload)
        ? payload
        : [];

  const flattened: ClickUpChatMessageReaction[] = [];
  for (const entry of rows) {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const directName = normalizeReactionName(row.name ?? row.reaction ?? row.emoji ?? row.emoji_name);
    if (directName) {
      const count = typeof row.count === "number"
        ? row.count
        : typeof row.total === "number"
          ? row.total
          : Array.isArray(row.users)
            ? row.users.length
            : 1;
      flattened.push({ name: directName, count: Math.max(0, count) });
      continue;
    }

    const emoji = row.emoji && typeof row.emoji === "object" ? row.emoji as Record<string, unknown> : null;
    const nestedName = normalizeReactionName(emoji?.name ?? emoji?.shortcode ?? emoji?.alias);
    if (nestedName) {
      flattened.push({
        name: nestedName,
        count: Array.isArray(row.users) ? row.users.length : 1,
      });
    }
  }

  return flattened;
}

function renderClickUpMessage(notification: AwaitingHumanNotificationPayload) {
  const title = truncateText(notification.title, MAX_TITLE_LENGTH);
  const summary = truncateText(notification.summary, MAX_SUMMARY_LENGTH);
  const bullets = extractBullets(notification.body);
  const lines = [
    `**${title}**`,
    "",
    summary,
    "",
    "Could you take a quick look and respond here in ClickUp?",
    "- To approve: react with 👍, ✅, or ✔️, or reply with words like \"approve\", \"approved\", \"approving\", \"yes\", \"ok\", \"okay\", \"ship it\", \"lgtm\", \"looks good\", \"go ahead\", or \"+1\".",
    "- If you want changes or have questions: reply here with what you'd like changed, added, or clarified and Bizbox will carry your full feedback back.",
  ];

  if (bullets.length > 0) {
    lines.push("");
    lines.push("A few details:");
    lines.push(...bullets.map((bullet) => `- ${bullet}`));
  }

  if (notification.reviewFile) {
    lines.push("");
    lines.push(`Review file: ${notification.reviewFile.filename}`);
    lines.push(`Bizbox deliverable: ${notification.reviewFile.deliverableUrl}`);
    if (notification.reviewFile.clickupTaskUrl) {
      lines.push(`ClickUp review task: ${notification.reviewFile.clickupTaskUrl}`);
      if (notification.reviewFile.clickupAttachmentId) {
        lines.push("Review file attached on the ClickUp task.");
      }
    }
  }

  lines.push("");
  if (notification.cta.trim().length > 0) {
    lines.push(truncateText(notification.cta, 180));
  }
  lines.push(`Open in Bizbox: ${notification.link.trim()}`);

  return trimTotal(lines.join("\n"), CLICKUP_CHAT_MESSAGE_MAX_CHARS);
}

async function resolveClickUpChannelId(config: ClickUpChatConfig): Promise<string | null> {
  if (config.channelId) return config.channelId;
  if (!config.personalToken || !config.workspaceId || !config.channelName) return null;

  const normalizedTarget = config.channelName.trim().toLowerCase();
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(
      `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}/chat/channels`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: config.personalToken,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`channel-lookup-failed:${response.status}:${truncateText(body, 240)}`);
    }

    const payload = await response.json() as { data?: Array<{ id?: unknown; name?: unknown }> };
    const channels = payload.data ?? [];
    for (const channel of channels) {
      const name = typeof channel.name === "string" ? channel.name.trim().toLowerCase() : "";
      if (name === normalizedTarget) {
        const id = typeof channel.id === "string" ? channel.id.trim() : String(channel.id ?? "").trim();
        if (id) return id;
      }
    }

    if (channels.length < CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE) {
      return null;
    }
  }

  return null;
}

export async function resolveAwaitingHumanReviewFile(
  db: Db,
  input: { companyId: string; issueId: string; sourceLink: string },
): Promise<AwaitingHumanNotificationReviewFile | null> {
  const artifactRows = await db.execute<{
    deliverable_id: string;
    title: string;
    content_path: string;
    content_type: string;
    byte_size: number;
    original_filename: string | null;
    attachment_id: string | null;
    object_key: string | null;
    sha256: string | null;
  }>(sql`
    SELECT
      wp.id AS deliverable_id,
      wp.title,
      wp.metadata ->> 'contentPath' AS content_path,
      wp.metadata ->> 'contentType' AS content_type,
      COALESCE(NULLIF(wp.metadata ->> 'byteSize', '')::integer, a.byte_size, 0) AS byte_size,
      COALESCE(wp.metadata ->> 'originalFilename', a.original_filename, 'deliverable') AS original_filename,
      wp.metadata ->> 'attachmentId' AS attachment_id,
      a.object_key,
      a.sha256
    FROM issue_work_products wp
    LEFT JOIN issue_attachments ia ON ia.id::text = wp.metadata ->> 'attachmentId'
    LEFT JOIN assets a ON a.id = ia.asset_id
    WHERE wp.company_id = ${input.companyId}
      AND wp.issue_id = ${input.issueId}
      AND wp.type = 'artifact'
      AND COALESCE(wp.audience, 'human') = 'human'
      AND wp.metadata ->> 'contentPath' IS NOT NULL
    ORDER BY
      CASE
        WHEN wp.review_state = 'needs_board_review' THEN 0
        WHEN wp.status = 'ready_for_review' THEN 1
        WHEN wp.status = 'active' THEN 2
        ELSE 3
      END,
      wp.is_primary DESC,
      wp.updated_at DESC
    LIMIT 1
  `);
  const artifact = toRowArray<{
    deliverable_id: string;
    title: string;
    content_path: string;
    content_type: string;
    byte_size: number;
    original_filename: string | null;
    attachment_id: string | null;
    object_key: string | null;
    sha256: string | null;
  }>(artifactRows)[0];
  if (artifact?.content_path && artifact.content_type) {
    return {
      source: "artifact",
      deliverableId: artifact.deliverable_id,
      title: artifact.title,
      filename: artifact.original_filename?.trim() || "deliverable",
      contentType: artifact.content_type,
      byteSize: Number(artifact.byte_size) || 0,
      contentPath: artifact.content_path,
      deliverableUrl: resolveAbsoluteUrl(artifact.content_path, input.sourceLink),
      attachmentId: artifact.attachment_id,
      objectKey: artifact.object_key,
      sha256: artifact.sha256,
    };
  }

  const documentRows = await db.execute<{
    deliverable_id: string;
    key: string;
    title: string | null;
    format: string;
    byte_size: number;
  }>(sql`
    SELECT
      idoc.id AS deliverable_id,
      idoc.key,
      d.title,
      d.format,
      d.latest_body AS body,
      COALESCE(octet_length(d.latest_body), 0)::integer AS byte_size
    FROM issue_documents idoc
    JOIN documents d ON d.id = idoc.document_id
    WHERE idoc.company_id = ${input.companyId}
      AND idoc.issue_id = ${input.issueId}
      AND COALESCE(idoc.audience, 'human') = 'human'
      AND idoc.key <> 'continuation-summary'
    ORDER BY d.updated_at DESC, idoc.updated_at DESC
    LIMIT 1
  `);
  const document = toRowArray<{
    deliverable_id: string;
    key: string;
    title: string | null;
    format: string;
    body: string | null;
    byte_size: number;
  }>(documentRows)[0];
  if (!document) return null;
  const key = document.key?.trim() || "document";
  const contentPath = `/api/deliverables/${document.deliverable_id}/content`;
  return {
    source: "document",
    deliverableId: document.deliverable_id,
    title: resolveDocumentTitle(document.title, document.format, document.body) ?? key,
    filename: buildDocumentFilename(document.key, document.title, document.format, document.body),
    contentType: document.format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
    byteSize: Number(document.byte_size) || 0,
    contentPath,
    deliverableUrl: resolveAbsoluteUrl(contentPath, input.sourceLink),
  };
}

export async function enqueueAwaitingHumanNotification(
  db: Db,
  input: EnqueueAwaitingHumanNotificationInput,
): Promise<AwaitingHumanNotificationResult> {
  const reviewFile = await resolveAwaitingHumanReviewFile(db, {
    companyId: input.companyId,
    issueId: input.issueId,
    sourceLink: input.notification.link,
  });
  const notification = {
    ...input.notification,
    ...(reviewFile ? { reviewFile } : {}),
  };
  const storedReviewFile = reviewFile ? { ...reviewFile } : null;
  const [row] = await db
    .insert(awaitingHumanNotificationOutbox)
    .values({
      companyId: input.companyId,
      issueId: input.issueId,
      dedupeKey: input.dedupeKey,
      handoffKind: input.handoffKind,
      status: "pending",
      notification,
      reviewFile: storedReviewFile,
    })
    .onConflictDoUpdate({
      target: [
        awaitingHumanNotificationOutbox.companyId,
        awaitingHumanNotificationOutbox.issueId,
        awaitingHumanNotificationOutbox.dedupeKey,
      ],
      set: {
        handoffKind: input.handoffKind,
        notification,
        reviewFile: storedReviewFile,
        status: sql`
          case
            when ${awaitingHumanNotificationOutbox.status} in ('sent', 'processing', 'retrying', 'partial_failed')
              then ${awaitingHumanNotificationOutbox.status}
            when ${awaitingHumanNotificationOutbox.status} = 'failed'
              and ${awaitingHumanNotificationOutbox.attempts} < ${MAX_OUTBOX_ATTEMPTS}
              and ${awaitingHumanNotificationOutbox.nextAttemptAt} is not null
              then 'retrying'
            when ${awaitingHumanNotificationOutbox.status} = 'failed'
              then ${awaitingHumanNotificationOutbox.status}
            else 'pending'
          end
        `,
        attempts: sql`
          case
            when ${awaitingHumanNotificationOutbox.status} in ('sent', 'processing', 'retrying', 'partial_failed', 'failed')
              then ${awaitingHumanNotificationOutbox.attempts}
            else 0
          end
        `,
        nextAttemptAt: sql`
          case
            when ${awaitingHumanNotificationOutbox.status} in ('retrying', 'partial_failed', 'failed')
              then ${awaitingHumanNotificationOutbox.nextAttemptAt}
            else null
          end
        `,
        lastError: sql`
          case
            when ${awaitingHumanNotificationOutbox.status} in ('sent', 'processing', 'retrying', 'partial_failed', 'failed')
              then ${awaitingHumanNotificationOutbox.lastError}
            else null
          end
        `,
        updatedAt: new Date(),
      },
    })
    .returning({
      status: awaitingHumanNotificationOutbox.status,
      clickupMessageId: awaitingHumanNotificationOutbox.clickupMessageId,
    });

  return {
    status: row?.status === "sent" ? "sent" : "enqueued",
    channel: "clickup-chat",
    detail: row?.status === "sent" ? "already-sent" : "enqueued",
    externalId: row?.clickupMessageId ?? null,
  };
}

export async function sendAwaitingHumanNotification(
  input: SendAwaitingHumanNotificationInput,
): Promise<AwaitingHumanNotificationResult> {
  const config = readClickUpChatConfig();
  if (!config.personalToken) {
    return { status: "skipped", channel: "clickup-chat", detail: "missing-credential: CLICKUP_PERSONAL_TOKEN" };
  }
  if (!config.workspaceId) {
    return { status: "skipped", channel: "clickup-chat", detail: "missing-target: CLICKUP_WORKSPACE_ID" };
  }

  try {
    const channelId = await resolveClickUpChannelId(config);
    if (!channelId) {
      return {
        status: "skipped",
        channel: "clickup-chat",
        detail: `missing-target: CLICKUP_AWAITING_HUMAN_CHANNEL_ID (or CLICKUP_ENGINEERING_CHANNEL_ID) or channel name '${config.channelName}'`,
      };
    }

    const response = await fetch(
      `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}/chat/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: config.personalToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          content: renderClickUpMessage(input.notification),
          content_format: "text/md",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: "failed",
        channel: "clickup-chat",
        detail: `http-error:${response.status}:${truncateText(body, 240)}`,
      };
    }

    const payload = await response.json() as { id?: unknown; data?: { id?: unknown } };
    const externalId = typeof payload.data?.id === "string"
      ? payload.data.id
      : typeof payload.id === "string"
        ? payload.id
        : null;

    return {
      status: "sent",
      channel: "clickup-chat",
      detail: "sent",
      externalId,
    };
  } catch (error) {
    return {
      status: "failed",
      channel: "clickup-chat",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseClickUpTaskResponse(rawText: string): { taskId: string; taskUrl: string | null } {
  const payload = JSON.parse(rawText) as Record<string, unknown>;
  const taskId = readString(payload.id);
  if (!taskId) throw new Error("clickup review task response missing id");
  return {
    taskId,
    taskUrl: readString(payload.url),
  };
}

function findFirstAttachmentLike(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstAttachmentLike(item);
      if (found) return found;
    }
    return null;
  }
  const row = value as Record<string, unknown>;
  if (readString(row.id) || readString(row.url)) return row;
  for (const child of Object.values(row)) {
    const found = findFirstAttachmentLike(child);
    if (found) return found;
  }
  return null;
}

async function fetchText(url: string, init: RequestInit, timeoutSec = DEFAULT_CLICKUP_TIMEOUT_SEC) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function createClickUpReviewTask(config: ClickUpChatConfig, notification: AwaitingHumanNotificationPayload) {
  if (!config.reviewListId) {
    throw new Error("missing-target: CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID");
  }
  const body = renderClickUpMessage(notification);
  const response = await fetchText(
    `https://api.clickup.com/api/v2/list/${encodeURIComponent(config.reviewListId)}/task`,
    {
      method: "POST",
      headers: {
        Authorization: config.personalToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: truncateText(notification.title, 120),
        description: body,
        notify_all: false,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`clickup review task create failed:${response.status}:${truncateText(response.text, 240)}`);
  }
  return parseClickUpTaskResponse(response.text);
}

async function readReviewFileBody(
  db: Db,
  storage: StorageService,
  companyId: string,
  reviewFile: AwaitingHumanNotificationReviewFile,
) {
  if (reviewFile.source === "artifact") {
    if (!reviewFile.objectKey) throw new Error("review artifact is missing object key");
    const object = await storage.getObject(companyId, reviewFile.objectKey);
    const body = await readStreamToBuffer(object.stream);
    return {
      body,
      sha256: reviewFile.sha256 ?? sha256Hex(body),
    };
  }

  const rows = await db.execute<{ body: string }>(sql`
    SELECT d.latest_body AS body
    FROM issue_documents idoc
    JOIN documents d ON d.id = idoc.document_id
    WHERE idoc.id = ${reviewFile.deliverableId}
      AND idoc.company_id = ${companyId}
    LIMIT 1
  `);
  const body = Buffer.from(toRowArray<{ body: string }>(rows)[0]?.body ?? "", "utf8");
  return {
    body,
    sha256: sha256Hex(body),
  };
}

async function uploadClickUpReviewFile(
  config: ClickUpChatConfig,
  taskId: string,
  reviewFile: AwaitingHumanNotificationReviewFile,
  body: Buffer,
) {
  const form = new FormData();
  form.append(
    CLICKUP_ATTACHMENT_FILE_FIELD,
    new Blob([new Uint8Array(body)], { type: reviewFile.contentType }),
    reviewFile.filename,
  );
  form.append("filename", reviewFile.filename);
  const response = await fetchText(
    `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}/attachments/${encodeURIComponent(taskId)}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: config.personalToken,
      },
      body: form,
    },
  );
  if (!response.ok) {
    throw new Error(`clickup review file upload failed:${response.status}:${truncateText(response.text, 240)}`);
  }
  const payload = response.text.trim().length > 0 ? JSON.parse(response.text) : {};
  const attachment = findFirstAttachmentLike(payload);
  const attachmentId = readString(attachment?.id);
  if (!attachmentId) {
    throw new Error(`clickup review file upload response missing attachment id:${truncateText(response.text, 240)}`);
  }
  return {
    attachmentId,
    attachmentUrl: readString(attachment?.url) ?? readString(attachment?.url_w_query),
  };
}

function withClickUpTaskUrl(
  notification: AwaitingHumanNotificationPayload,
  reviewFile: AwaitingHumanNotificationReviewFile | null,
  clickupTaskUrl: string | null,
  clickupAttachmentId: string | null,
) {
  if (!reviewFile) return notification;
  return {
    ...notification,
    reviewFile: {
      ...reviewFile,
      clickupTaskUrl,
      clickupAttachmentId,
    },
  };
}

export async function processAwaitingHumanNotificationOutbox(
  db: Db,
  opts: { limit?: number; storage?: StorageService } = {},
) {
  const limit = opts.limit ?? 20;
  const config = readClickUpChatConfig();
  if (!config.personalToken || !config.workspaceId) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const storage = opts.storage ?? getStorageService();
  const now = new Date();

  await db
    .update(awaitingHumanNotificationOutbox)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(awaitingHumanNotificationOutbox.status, "processing"),
        lt(awaitingHumanNotificationOutbox.updatedAt, new Date(now.getTime() - STALE_OUTBOX_PROCESSING_MS)),
      ),
    );

  await db
    .update(awaitingHumanNotificationOutbox)
    .set({ status: "retrying", updatedAt: now })
    .where(
      and(
        eq(awaitingHumanNotificationOutbox.status, "failed"),
        lt(awaitingHumanNotificationOutbox.attempts, MAX_OUTBOX_ATTEMPTS),
        sql`${awaitingHumanNotificationOutbox.nextAttemptAt} is not null`,
      ),
    );

  const rows = await db
    .select()
    .from(awaitingHumanNotificationOutbox)
    .where(
      and(
        inArray(awaitingHumanNotificationOutbox.status, ["pending", "retrying", "partial_failed"]),
        lt(awaitingHumanNotificationOutbox.attempts, MAX_OUTBOX_ATTEMPTS),
        or(
          sql`${awaitingHumanNotificationOutbox.nextAttemptAt} is null`,
          lte(awaitingHumanNotificationOutbox.nextAttemptAt, now),
        ),
      ),
    )
    .orderBy(sql`${awaitingHumanNotificationOutbox.nextAttemptAt} ASC NULLS FIRST`, awaitingHumanNotificationOutbox.createdAt)
    .limit(limit);

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const [claimed] = await db
      .update(awaitingHumanNotificationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(awaitingHumanNotificationOutbox.id, row.id),
          inArray(awaitingHumanNotificationOutbox.status, ["pending", "retrying", "partial_failed"]),
        ),
      )
      .returning({ id: awaitingHumanNotificationOutbox.id });
    if (!claimed) continue;
    processed += 1;

    let clickupTaskId = row.clickupTaskId;
    let clickupTaskUrl = row.clickupTaskUrl;
    let clickupAttachmentId = row.clickupAttachmentId;
    let clickupAttachmentUrl = row.clickupAttachmentUrl;
    let clickupMessageId = row.clickupMessageId;

    try {
      const reviewFile = normalizeReviewFile(row.reviewFile);
      let deliveryNote: string | null = null;
      let uploadError: Error | null = null;

      if (reviewFile && config.reviewListId) {
        if (!clickupTaskId) {
          const task = await createClickUpReviewTask(config, row.notification as unknown as AwaitingHumanNotificationPayload);
          clickupTaskId = task.taskId;
          clickupTaskUrl = task.taskUrl;
          await db
            .update(awaitingHumanNotificationOutbox)
            .set({ clickupTaskId, clickupTaskUrl, updatedAt: new Date() })
            .where(eq(awaitingHumanNotificationOutbox.id, row.id));
        }

        if (!clickupAttachmentId && clickupTaskId) {
          try {
            const file = await readReviewFileBody(db, storage, row.companyId, reviewFile);
            const upload = await uploadClickUpReviewFile(config, clickupTaskId, reviewFile, file.body);
            clickupAttachmentId = upload.attachmentId;
            clickupAttachmentUrl = upload.attachmentUrl;
            await db
              .update(awaitingHumanNotificationOutbox)
              .set({ clickupAttachmentId, clickupAttachmentUrl, updatedAt: new Date() })
              .where(eq(awaitingHumanNotificationOutbox.id, row.id));
          } catch (error) {
            uploadError = error instanceof Error ? error : new Error(String(error));
          }
        }
      } else if (reviewFile && !config.reviewListId) {
        deliveryNote = "skipped_upload: missing CLICKUP_AWAITING_HUMAN_REVIEW_LIST_ID";
      }

      if (!clickupMessageId) {
        const message = await sendAwaitingHumanNotification({
          companyId: row.companyId,
          issueId: row.issueId,
          handoffKind: row.handoffKind,
          notification: withClickUpTaskUrl(
            row.notification as unknown as AwaitingHumanNotificationPayload,
            reviewFile,
            clickupTaskUrl,
            clickupAttachmentId,
          ),
        });
        if (message.status !== "sent") {
          throw new Error(message.detail);
        }
        clickupMessageId = message.externalId ?? null;
        await db
          .update(awaitingHumanNotificationOutbox)
          .set({ clickupMessageId, updatedAt: new Date() })
          .where(eq(awaitingHumanNotificationOutbox.id, row.id));
      }

      if (uploadError) {
        const attempts = row.attempts + 1;
        const isPermanentFailure = attempts >= MAX_OUTBOX_ATTEMPTS;

        // On the final attempt, if the chat message was never sent, deliver it
        // without the attachment so the human is still notified about the review task.
        if (isPermanentFailure && !clickupMessageId) {
          try {
            const message = await sendAwaitingHumanNotification({
              companyId: row.companyId,
              issueId: row.issueId,
              handoffKind: row.handoffKind,
              notification: withClickUpTaskUrl(
                row.notification as unknown as AwaitingHumanNotificationPayload,
                null, // omit file link — attachment upload failed
                clickupTaskUrl,
                null,
              ),
            });
            if (message.status === "sent") {
              clickupMessageId = message.externalId ?? null;
              await db
                .update(awaitingHumanNotificationOutbox)
                .set({ clickupMessageId, updatedAt: new Date() })
                .where(eq(awaitingHumanNotificationOutbox.id, row.id));
            }
          } catch {
            // Best-effort fallback; original uploadError still drives the final status.
          }
        }

        await db
          .update(awaitingHumanNotificationOutbox)
          .set({
            status: isPermanentFailure ? "failed" : "partial_failed",
            attempts,
            clickupTaskId,
            clickupTaskUrl,
            clickupAttachmentId,
            clickupAttachmentUrl,
            clickupMessageId,
            lastError: uploadError.message,
            nextAttemptAt: isPermanentFailure ? null : nextRetryAt(attempts),
            updatedAt: new Date(),
          })
          .where(eq(awaitingHumanNotificationOutbox.id, row.id));
        failed += 1;
        continue;
      }

      await db
        .update(awaitingHumanNotificationOutbox)
        .set({
          status: "sent",
          attempts: row.attempts + 1,
          clickupTaskId,
          clickupTaskUrl,
          clickupAttachmentId,
          clickupAttachmentUrl,
          clickupMessageId,
          lastError: deliveryNote,
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(awaitingHumanNotificationOutbox.id, row.id));
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= MAX_OUTBOX_ATTEMPTS;
      await db
        .update(awaitingHumanNotificationOutbox)
        .set({
          status: terminal ? "failed" : clickupMessageId ? "partial_failed" : "retrying",
          attempts,
          clickupTaskId,
          clickupTaskUrl,
          clickupAttachmentId,
          clickupAttachmentUrl,
          clickupMessageId,
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: terminal ? null : nextRetryAt(attempts),
          updatedAt: new Date(),
        })
        .where(eq(awaitingHumanNotificationOutbox.id, row.id));
      failed += 1;
    }
  }

  return { processed, sent, failed };
}

export async function getClickUpChatMessageReplies(messageId: string): Promise<{
  status: ClickUpApiStatus;
  detail: string;
  replies: ClickUpChatMessageReply[];
}> {
  const config = readClickUpChatConfig();
  if (!config.personalToken) {
    return {
      status: "skipped",
      detail: "missing-credential: CLICKUP_PERSONAL_TOKEN",
      replies: [],
    };
  }
  if (!config.workspaceId) {
    return {
      status: "skipped",
      detail: "missing-target: CLICKUP_WORKSPACE_ID",
      replies: [],
    };
  }

  const response = await fetchClickUpJson(
    config,
    `/chat/messages/${encodeURIComponent(messageId)}/replies`,
  );
  if (response.status === "failed") {
    return { status: "failed", detail: response.detail, replies: [] };
  }

  return {
    status: "sent",
    detail: "ok",
    replies: extractReplyRows(response.payload),
  };
}

export async function getClickUpChatMessageReactions(messageId: string): Promise<{
  status: ClickUpApiStatus;
  detail: string;
  reactions: ClickUpChatMessageReaction[];
}> {
  const config = readClickUpChatConfig();
  if (!config.personalToken) {
    return {
      status: "skipped",
      detail: "missing-credential: CLICKUP_PERSONAL_TOKEN",
      reactions: [],
    };
  }
  if (!config.workspaceId) {
    return {
      status: "skipped",
      detail: "missing-target: CLICKUP_WORKSPACE_ID",
      reactions: [],
    };
  }

  const response = await fetchClickUpJson(
    config,
    `/chat/messages/${encodeURIComponent(messageId)}/reactions`,
  );
  if (response.status === "failed") {
    return { status: "failed", detail: response.detail, reactions: [] };
  }

  return {
    status: "sent",
    detail: "ok",
    reactions: extractReactionRows(response.payload),
  };
}

export async function detectClickUpAwaitingHumanApproval(
  messageId: string,
): Promise<ClickUpAwaitingHumanApprovalResult> {
  const config = readClickUpChatConfig();
  if (!config.personalToken) {
    return { status: "skipped", detail: "missing-credential: CLICKUP_PERSONAL_TOKEN" };
  }
  if (!config.workspaceId) {
    return { status: "skipped", detail: "missing-target: CLICKUP_WORKSPACE_ID" };
  }

  const repliesResult = await getClickUpChatMessageReplies(messageId);
  if (repliesResult.status === "skipped") {
    return {
      status: repliesResult.status,
      detail: repliesResult.detail,
    };
  }
  const availableReplies = repliesResult.status === "sent" ? repliesResult.replies : [];
  const approvingReply = availableReplies.find((reply) => replySignalsApproval(reply, config));
  if (approvingReply) {
    return {
      status: "approved",
      detail: "positive-reply-detected",
      resolutionSource: "clickup_reply",
    };
  }
  const forwardableReplies = availableReplies.filter((reply) => normalizeReplyContent(reply.content).length > 0);
  const rejectionReason = forwardableReplies[0]?.content?.trim() ?? null;

  const reactionsResult = await getClickUpChatMessageReactions(messageId);
  if (reactionsResult.status === "failed" || reactionsResult.status === "skipped") {
    if (forwardableReplies.length > 0) {
      return {
        status: "rejected",
        detail: "non-approval-reply-detected",
        resolutionSource: "clickup_reply",
        replies: forwardableReplies,
        rejectionReason,
      };
    }
    if (repliesResult.status === "failed") {
      return {
        status: repliesResult.status,
        detail: repliesResult.detail,
      };
    }
    return {
      status: reactionsResult.status,
      detail: reactionsResult.detail,
    };
  }

  const positiveSet = new Set(config.approvalPositiveReactions);
  const matchingReaction = reactionsResult.reactions.find((reaction) =>
    reaction.count > 0 && positiveSet.has(reaction.name)
  );
  if (matchingReaction) {
    return {
      status: "approved",
      detail: "positive-reaction-detected",
      resolutionSource: "clickup_reaction",
      clickupReaction: matchingReaction.name,
    };
  }

  const negativeSet = new Set(config.approvalNegativeReactions);
  const rejectingReaction = reactionsResult.reactions.find((reaction) =>
    reaction.count > 0 && negativeSet.has(reaction.name)
  );
  if (rejectingReaction) {
    return {
      status: "rejected",
      detail: "negative-reaction-detected",
      resolutionSource: "clickup_reaction",
      clickupReaction: rejectingReaction.name,
      replies: forwardableReplies.length > 0 ? forwardableReplies : undefined,
      rejectionReason: rejectionReason ?? `Rejected in ClickUp with :${rejectingReaction.name}: reaction.`,
    };
  }

  if (forwardableReplies.length > 0) {
    return {
      status: "rejected",
      detail: "non-approval-reply-detected",
      resolutionSource: "clickup_reply",
      replies: forwardableReplies,
      rejectionReason,
    };
  }
  if (repliesResult.status === "failed") {
    return {
      status: repliesResult.status,
      detail: repliesResult.detail,
    };
  }

  return {
    status: "no_approval",
    detail: "no-approval-signal",
  };
}
