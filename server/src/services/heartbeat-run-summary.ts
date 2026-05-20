import { normalizeDocumentTitle } from "../lib/document-titles.js";

export const HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS = 500;
export const HEARTBEAT_RUN_RESULT_OUTPUT_MAX_CHARS = 4_096;
export const HEARTBEAT_RUN_SAFE_RESULT_JSON_MAX_BYTES = 64 * 1024;

export interface HeartbeatRunIssueDocumentPromotion {
  key: string;
  title: string | null;
  body: string;
}

function truncateSummaryText(value: unknown, maxLength = HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS) {
  if (typeof value !== "string") return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function readNumericField(record: Record<string, unknown>, key: string) {
  return key in record ? record[key] ?? null : undefined;
}

function readCommentText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPendingExternalPollingResult(resultJson: Record<string, unknown>) {
  return resultJson.status === "pending_external" && resultJson.pollingActive === true;
}

function slugifyDocumentKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "deliverable";
}

function looksLikeDocumentTitleLine(line: string) {
  return !/^(?:[#>*-]|\d+\.\s|\|)/.test(line);
}

function extractDocumentBodyTitle(body: string) {
  const headingMatch = body.match(/^\s*#\s+(.+?)\s*$/m);
  if (headingMatch?.[1]) {
    return normalizeDocumentTitle(headingMatch[1]);
  }

  const firstContentLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && looksLikeDocumentTitleLine(line));
  return normalizeDocumentTitle(firstContentLine ?? null);
}

function dedupePromotions(
  promotions: HeartbeatRunIssueDocumentPromotion[],
): HeartbeatRunIssueDocumentPromotion[] {
  const byKey = new Map<string, HeartbeatRunIssueDocumentPromotion>();
  for (const promotion of promotions) {
    if (!byKey.has(promotion.key)) {
      byKey.set(promotion.key, promotion);
    }
  }
  return [...byKey.values()];
}

function extractTaggedIssueDocuments(summary: string): HeartbeatRunIssueDocumentPromotion[] {
  const matches = [...summary.matchAll(/<issue-document\b([^>]*)>([\s\S]*?)<\/issue-document>/gi)];
  if (matches.length === 0) return [];

  const promotions: HeartbeatRunIssueDocumentPromotion[] = [];
  for (const match of matches) {
    const attrs = match[1] ?? "";
    const body = readCommentText(match[2]);
    if (!body) continue;
    const keyAttr = /(?:^|\s)key="([^"]+)"/i.exec(attrs)?.[1] ?? null;
    const titleAttr = /(?:^|\s)title="([^"]+)"/i.exec(attrs)?.[1] ?? null;
    const title = normalizeDocumentTitle(titleAttr) ?? extractDocumentBodyTitle(body);
    const key = slugifyDocumentKey(keyAttr ?? title ?? "deliverable");
    promotions.push({ key, title, body });
  }
  return promotions;
}

function extractLegacyDeliverableSection(summary: string): HeartbeatRunIssueDocumentPromotion[] {
  const headingMatch = /^##\s+Deliverable(?:s)?(?:\s*[:\-]\s*(.+))?\s*$/im.exec(summary);
  if (!headingMatch || headingMatch.index == null) return [];

  const start = headingMatch.index + headingMatch[0].length;
  const after = summary.slice(start);
  const nextHeadingIndex = after.search(/\n##\s+/);
  const body = readCommentText(nextHeadingIndex >= 0 ? after.slice(0, nextHeadingIndex) : after);
  if (!body) return [];

  const title = normalizeDocumentTitle(headingMatch[1] ?? null);
  return [{
    key: slugifyDocumentKey(title ?? "deliverable"),
    title,
    body,
  }];
}

function stripTaggedIssueDocuments(summary: string) {
  return summary.replace(/<issue-document\b[^>]*>[\s\S]*?<\/issue-document>/gi, "").trim();
}

export function mergeHeartbeatRunResultJson(
  resultJson: Record<string, unknown> | null | undefined,
  summary: string | null | undefined,
): Record<string, unknown> | null {
  const normalizedSummary = readCommentText(summary);
  const baseResult =
    resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)
      ? resultJson
      : null;

  if (!baseResult) {
    return normalizedSummary ? { summary: normalizedSummary } : null;
  }

  if (!normalizedSummary) {
    return baseResult;
  }

  if (readCommentText(baseResult.summary)) {
    return baseResult;
  }

  return {
    ...baseResult,
    summary: normalizedSummary,
  };
}

export function summarizeHeartbeatRunResultJson(
  resultJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }

  const summary: Record<string, unknown> = {};
  const textFields = ["summary", "result", "message", "error"] as const;
  for (const key of textFields) {
    const value = truncateSummaryText(resultJson[key]);
    if (value !== null) {
      summary[key] = value;
    }
  }

  const numericFieldAliases = ["total_cost_usd", "cost_usd", "costUsd"] as const;
  for (const key of numericFieldAliases) {
    const value = readNumericField(resultJson, key);
    if (value !== undefined && value !== null) {
      summary[key] = value;
    }
  }

  for (const key of ["stopReason", "timeoutSource"] as const) {
    const value = readCommentText(resultJson[key]);
    if (value !== null) {
      summary[key] = value;
    }
  }

  for (const key of ["effectiveTimeoutSec", "effectiveTimeoutMs"] as const) {
    const value = readNumericField(resultJson, key);
    if (value !== undefined && value !== null) {
      summary[key] = value;
    }
  }

  for (const key of ["timeoutConfigured", "timeoutFired"] as const) {
    if (typeof resultJson[key] === "boolean") {
      summary[key] = resultJson[key];
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

export function buildHeartbeatRunIssueComment(
  resultJson: Record<string, unknown> | null | undefined,
): string | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }
  if (isPendingExternalPollingResult(resultJson)) {
    return null;
  }

  const primaryComment = readCommentText(
    stripTaggedIssueDocuments(
      readCommentText(resultJson.summary)
      ?? readCommentText(resultJson.result)
      ?? readCommentText(resultJson.message)
      ?? "",
    ),
  );
  const importedComments = extractHeartbeatRunImportedIssueComments(resultJson);

  if (primaryComment && importedComments.length === 0) {
    return primaryComment;
  }
  if (!primaryComment && importedComments.length === 0) {
    return null;
  }
  if (!primaryComment) {
    return importedComments.join("\n\n");
  }

  return `${primaryComment}\n\n---\n\n${importedComments.join("\n\n")}`;
}

export function extractHeartbeatRunImportedIssueComments(
  resultJson: Record<string, unknown> | null | undefined,
): string[] {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return [];
  }

  const rawComments = resultJson.importedIssueComments;
  if (!Array.isArray(rawComments)) return [];

  return rawComments
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      return readCommentText((entry as Record<string, unknown>).body);
    })
    .filter((body): body is string => body !== null);
}

export function extractHeartbeatRunIssueDocumentPromotions(
  resultJson: Record<string, unknown> | null | undefined,
): HeartbeatRunIssueDocumentPromotion[] {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return [];
  }

  const summary = readCommentText(resultJson.summary);
  if (!summary) return [];

  return dedupePromotions([
    ...extractTaggedIssueDocuments(summary),
    ...extractLegacyDeliverableSection(summary),
  ]);
}
