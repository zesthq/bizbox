import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { awaitingHumanNotificationOutbox } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { getStorageService } from "../storage/index.js";
import { awaitingHumanSettingsService } from "./awaiting-human-settings.js";
import {
  createClickUpReviewTask,
  detectClickUpAwaitingHumanBridgeEvents,
  getClickUpChatMessageReactions,
  getClickUpChatMessageReplies,
  readClickUpChatConfig,
  sendAwaitingHumanNotification,
  uploadClickUpReviewFile,
  type AwaitingHumanNotificationPayload,
  type AwaitingHumanNotificationResult,
  type AwaitingHumanNotificationReviewFile,
  type ClickUpAwaitingHumanConfigOverrides,
} from "./clickup-awaiting-human-transport.js";
import {
  normalizeReviewFile,
  readAwaitingHumanReviewFileBody,
  resolveAwaitingHumanReviewFile,
  withClickUpTaskUrl,
} from "./awaiting-human-review-files.js";

const MAX_OUTBOX_ATTEMPTS = 8;
const STALE_OUTBOX_PROCESSING_MS = 5 * 60 * 1000;
export type {
  AwaitingHumanNotificationPayload,
  AwaitingHumanNotificationResult,
  AwaitingHumanNotificationReviewFile,
  ClickUpAwaitingHumanConfigOverrides,
};

export interface SendAwaitingHumanNotificationInput {
  companyId: string;
  issueId: string;
  handoffKind: "request_confirmation" | "ask_user_questions" | "human_owned_blocker";
  notification: AwaitingHumanNotificationPayload;
}

export interface EnqueueAwaitingHumanNotificationInput extends SendAwaitingHumanNotificationInput {
  dedupeKey: string;
}

function nextRetryAt(attempt: number, now = Date.now()): Date {
  const seq = [5, 10, 20, 40, 80, 160, 320, 640];
  const sec = seq[Math.min(Math.max(attempt - 1, 0), seq.length - 1)] ?? 640;
  return new Date(now + sec * 1000);
}

// Preserve the fact that ClickUp accepted the message even when it omits the id.
const CLICKUP_MESSAGE_ID_SENTINEL = "__clickup_message_sent_without_external_id__";

function encodeClickUpMessageId(externalId: string | null | undefined) {
  const trimmed = externalId?.trim();
  return trimmed ? trimmed : CLICKUP_MESSAGE_ID_SENTINEL;
}

function decodeClickUpMessageId(value: string | null | undefined) {
  if (!value || value === CLICKUP_MESSAGE_ID_SENTINEL) return null;
  return value;
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
    externalId: decodeClickUpMessageId(row?.clickupMessageId ?? null),
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
  const settings = awaitingHumanSettingsService(db);

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
        lte(awaitingHumanNotificationOutbox.nextAttemptAt, now),
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
    const storedSettings = await settings.getStored(row.companyId);
    let companyOverrides: ClickUpAwaitingHumanConfigOverrides | undefined;
    if (storedSettings) {
      if (!storedSettings.enabled || storedSettings.provider !== "clickup") {
        await db
          .update(awaitingHumanNotificationOutbox)
          .set({
            status: "failed",
            attempts: row.attempts + 1,
            lastError: "awaiting-human-bridge-disabled",
            nextAttemptAt: null,
            updatedAt: new Date(),
          })
          .where(eq(awaitingHumanNotificationOutbox.id, row.id));
        failed += 1;
        continue;
      }

      const runtime = await settings.resolveClickUpRuntimeConfig(row.companyId);
      companyOverrides = {
        personalToken: runtime.personalToken,
        workspaceId: runtime.workspaceId,
        channelId: runtime.channelId,
      };
    }

    try {
      const reviewFile = normalizeReviewFile(row.reviewFile);
      let deliveryNote: string | null = null;
      let uploadError: Error | null = null;

      if (reviewFile && config.reviewListId) {
        if (!clickupTaskId) {
          const task = await createClickUpReviewTask(companyOverrides ?? {}, row.notification as unknown as AwaitingHumanNotificationPayload);
          clickupTaskId = task.taskId;
          clickupTaskUrl = task.taskUrl;
          await db
            .update(awaitingHumanNotificationOutbox)
            .set({ clickupTaskId, clickupTaskUrl, updatedAt: new Date() })
            .where(eq(awaitingHumanNotificationOutbox.id, row.id));
        }

        if (!clickupAttachmentId && clickupTaskId) {
          try {
            const file = await readAwaitingHumanReviewFileBody(db, storage, row.companyId, reviewFile);
            const upload = await uploadClickUpReviewFile(companyOverrides ?? {}, clickupTaskId, reviewFile, file.body);
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
        }, companyOverrides);
        if (message.status !== "sent") {
          throw new Error(message.detail);
        }
        clickupMessageId = encodeClickUpMessageId(message.externalId);
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
            }, companyOverrides);
            if (message.status === "sent") {
              clickupMessageId = encodeClickUpMessageId(message.externalId);
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

export {
  detectClickUpAwaitingHumanBridgeEvents,
  getClickUpChatMessageReactions,
  getClickUpChatMessageReplies,
  resolveAwaitingHumanReviewFile,
  sendAwaitingHumanNotification,
};
