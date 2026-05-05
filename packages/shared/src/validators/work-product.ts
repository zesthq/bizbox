import { z } from "zod";

export const issueWorkProductTypeSchema = z.enum([
  "preview_url",
  "runtime_service",
  "pull_request",
  "branch",
  "commit",
  "artifact",
  "document",
]);

export const issueWorkProductStatusSchema = z.enum([
  "active",
  "ready_for_review",
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "failed",
  "archived",
  "draft",
]);

export const issueWorkProductReviewStateSchema = z.enum([
  "none",
  "needs_board_review",
  "approved",
  "changes_requested",
]);

const issueWorkProductUrlSchema = z.string().trim().min(1).refine((value) => {
  if (value.startsWith("/")) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid url");

export const issueArtifactWorkProductMetadataSchema = z.object({
  attachmentId: z.string().uuid(),
  contentPath: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  byteSize: z.number().int().positive(),
  originalFilename: z.string().trim().min(1).nullable().optional(),
}).strict();

const issueArtifactWorkProductPersistenceSchema = z.object({
  type: z.literal("artifact"),
  metadata: issueArtifactWorkProductMetadataSchema,
  createdByRunId: z.string().uuid(),
});

export function getIssueArtifactWorkProductValidationIssues(value: {
  type: unknown;
  metadata: unknown;
  createdByRunId: unknown;
}) {
  if (value.type !== "artifact") return [];
  const parsed = issueArtifactWorkProductPersistenceSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues;
}

function validateArtifactWorkProductRequirements(
  value: {
    type?: unknown;
    metadata?: unknown;
    createdByRunId?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  if (value.type !== "artifact") return;
  for (const issue of getIssueArtifactWorkProductValidationIssues({
    type: value.type,
    metadata: value.metadata,
    createdByRunId: value.createdByRunId,
  })) {
    ctx.addIssue(issue);
  }
}

const issueWorkProductBaseSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  executionWorkspaceId: z.string().uuid().optional().nullable(),
  runtimeServiceId: z.string().uuid().optional().nullable(),
  type: issueWorkProductTypeSchema,
  provider: z.string().min(1),
  externalId: z.string().optional().nullable(),
  title: z.string().min(1),
  url: issueWorkProductUrlSchema.optional().nullable(),
  status: issueWorkProductStatusSchema.default("active"),
  reviewState: issueWorkProductReviewStateSchema.optional().default("none"),
  isPrimary: z.boolean().optional().default(false),
  healthStatus: z.enum(["unknown", "healthy", "unhealthy"]).optional().default("unknown"),
  summary: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  createdByRunId: z.string().uuid().optional().nullable(),
});

export const createIssueWorkProductSchema = issueWorkProductBaseSchema.superRefine(
  validateArtifactWorkProductRequirements,
);

export type CreateIssueWorkProduct = z.infer<typeof createIssueWorkProductSchema>;

export const updateIssueWorkProductSchema = issueWorkProductBaseSchema.partial().superRefine(
  validateArtifactWorkProductRequirements,
);

export type UpdateIssueWorkProduct = z.infer<typeof updateIssueWorkProductSchema>;
