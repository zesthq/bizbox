import { z } from "zod";
import {
  AGENT_RUNTIME_KINDS,
  AGENT_BUNDLE_CONTENT_KINDS,
} from "../types/agent-runtime.js";

export const agentRuntimeKindSchema = z.enum(AGENT_RUNTIME_KINDS);
export const agentBundleContentKindSchema = z.enum(AGENT_BUNDLE_CONTENT_KINDS);

const secretRefSchema = z.object({
  key: z.string().min(1).max(128),
  ref: z.string().min(1).max(512),
});

export const putRuntimeInstanceSchema = z
  .object({
    kind: agentRuntimeKindSchema,
    plan: z.string().min(1).max(128).nullable().optional(),
    desiredConfig: z.record(z.unknown()).optional(),
    secretRefs: z.array(secretRefSchema).max(64).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .strict();

export type PutRuntimeInstance = z.infer<typeof putRuntimeInstanceSchema>;

export const listRuntimeInstancesQuerySchema = z
  .object({
    kind: agentRuntimeKindSchema.optional(),
  })
  .strict();

export type ListRuntimeInstancesQuery = z.infer<
  typeof listRuntimeInstancesQuerySchema
>;
