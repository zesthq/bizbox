import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { routineRuns, routines, workflowInvocations, workflowRuns } from "@paperclipai/db";
import type {
  WorkflowInvocationEnvelope,
  WorkflowInvocationResult,
  WorkflowInvocationResultView,
  WorkflowRunInvocationSummary,
} from "@paperclipai/shared";
import { WORKFLOW_INVOCATION_CONTRACT_VERSION, workflowInvocationResultViewSchema } from "@paperclipai/shared";
import { internalError, notFound, unprocessable } from "../errors.js";
import { workflowService, resolveWorkflowByInvocationTarget } from "./workflows.js";

function toInvocationMarkdown(envelope: WorkflowInvocationEnvelope) {
  if (envelope.payload.kind === "markdown") {
    return envelope.payload.inputMarkdown;
  }
  const targetBits = [
    envelope.target.workflowId ? `workflowId: ${envelope.target.workflowId}` : null,
    envelope.target.workflowKey ? `workflowKey: ${envelope.target.workflowKey}` : null,
    envelope.target.capability ? `capability: ${envelope.target.capability}` : null,
  ].filter((value): value is string => Boolean(value));
  return [
    "# Routine workflow invocation",
    "",
    `Contract: ${envelope.contractVersion}`,
    targetBits.length > 0 ? `Target: ${targetBits.join(", ")}` : null,
    "",
    "Structured JSON payload:",
    "```json",
    JSON.stringify(envelope.payload.inputJson, null, 2),
    "```",
    "",
  ].filter((line): line is string => line !== null).join("\n");
}

function toInvocationSummary(
  row: {
    id: string;
    contractVersion: string;
    inputKind: string;
    sourceRoutineId: string;
    sourceRoutineRunId: string;
    sourceRoutineTitle: string | null;
    sourceRoutineRunSource: string | null;
    targetWorkflowId: string;
    targetWorkflowKey: string | null;
    targetCapability: string | null;
  },
): WorkflowRunInvocationSummary {
  return {
    id: row.id,
    contractVersion: row.contractVersion as WorkflowRunInvocationSummary["contractVersion"],
    inputKind: row.inputKind as WorkflowRunInvocationSummary["inputKind"],
    sourceRoutineId: row.sourceRoutineId,
    sourceRoutineTitle: row.sourceRoutineTitle,
    sourceRoutineRunId: row.sourceRoutineRunId,
    sourceRoutineRunSource: row.sourceRoutineRunSource,
    targetWorkflowId: row.targetWorkflowId,
    targetWorkflowKey: row.targetWorkflowKey,
    targetCapability: row.targetCapability,
  };
}

const RESULT_DIAGNOSTIC_KEYS = new Set([
  "consoleentries",
  "consoleevents",
  "context",
  "contextsnapshot",
  "copiedagentpath",
  "events",
  "input",
  "inputjson",
  "inputmarkdown",
  "runtimepath",
  "runtimepaths",
  "runtimeroot",
  "spans",
  "stderr",
  "stderrexcerpt",
  "stdout",
  "stdoutexcerpt",
  "telemetry",
  "temproot",
  "toolcall",
  "toolcalls",
  "toolresult",
  "toolresults",
  "tools",
  "trace",
]);

function sanitizeResultValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeResultValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !RESULT_DIAGNOSTIC_KEYS.has(key.replace(/[_-]/g, "").toLowerCase()))
      .map(([key, nestedValue]) => [key, sanitizeResultValue(nestedValue)]),
  );
}

function sanitizeResultJson(contextSnapshot: unknown): Record<string, unknown> | null {
  if (!contextSnapshot || typeof contextSnapshot !== "object" || Array.isArray(contextSnapshot)) {
    return null;
  }
  const resultJson = (contextSnapshot as Record<string, unknown>).resultJson;
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }
  return sanitizeResultValue(resultJson) as Record<string, unknown>;
}

function normalizeResultStatus(
  runStatus: string | null,
  invocationStatus: string,
): WorkflowInvocationResultView["status"] {
  if (runStatus === null) {
    return invocationStatus === "failed" ? "failed" : "queued";
  }
  if (runStatus === "awaiting_content_review" || runStatus === "awaiting_final_review") {
    return "awaiting_human";
  }
  if (
    runStatus === "queued" ||
    runStatus === "running" ||
    runStatus === "awaiting_human" ||
    runStatus === "succeeded" ||
    runStatus === "failed" ||
    runStatus === "cancelled" ||
    runStatus === "rejected"
  ) {
    return runStatus;
  }
  throw internalError(`Unsupported workflow run status: ${runStatus}`);
}

export function workflowInvocationService(db: Db) {
  const workflowSvc = workflowService(db);

  return {
    invokeFromRoutine: async (input: {
      routineId: string;
      sourceRoutineRunId: string;
      requestedByAgentId?: string | null;
      envelope: WorkflowInvocationEnvelope;
    }): Promise<WorkflowInvocationResult> => {
      if (input.envelope.contractVersion !== WORKFLOW_INVOCATION_CONTRACT_VERSION) {
        throw unprocessable(`Unsupported workflow invocation contract: ${input.envelope.contractVersion}`);
      }

      const routineRow = await db
        .select()
        .from(routines)
        .where(eq(routines.id, input.routineId))
        .then((rows) => rows[0] ?? null);
      if (!routineRow) throw notFound("Routine not found");

      const sourceRunRow = await db
        .select()
        .from(routineRuns)
        .where(and(
          eq(routineRuns.id, input.sourceRoutineRunId),
          eq(routineRuns.routineId, routineRow.id),
          eq(routineRuns.companyId, routineRow.companyId),
        ))
        .then((rows) => rows[0] ?? null);
      if (!sourceRunRow) {
        throw unprocessable("Source routine run does not belong to this routine");
      }
      const requestedByAgentId = input.requestedByAgentId ?? null;

      const workflowRow = await resolveWorkflowByInvocationTarget(db, routineRow.companyId, input.envelope.target);
      const inputMarkdown = toInvocationMarkdown(input.envelope);
      const inputJson = input.envelope.payload.kind === "json" ? input.envelope.payload.inputJson : null;

      const invocationRow = await db.insert(workflowInvocations).values({
        companyId: routineRow.companyId,
        sourceRoutineId: routineRow.id,
        sourceRoutineRunId: sourceRunRow.id,
        requestedByAgentId,
        targetWorkflowId: workflowRow.id,
        targetWorkflowKey: workflowRow.workflowKey ?? null,
        targetCapability: input.envelope.target.capability ?? null,
        contractVersion: input.envelope.contractVersion,
        inputKind: input.envelope.payload.kind,
        inputMarkdown,
        inputJson,
        status: "queued",
      }).returning().then((rows) => rows[0] ?? null);
      if (!invocationRow) {
        throw unprocessable("Failed to create workflow invocation");
      }

      try {
        const run = await workflowSvc.runInvocation(workflowRow.id, {
          inputMarkdown,
          invocation: toInvocationSummary({
            id: invocationRow.id,
            contractVersion: input.envelope.contractVersion,
            inputKind: input.envelope.payload.kind,
            sourceRoutineId: routineRow.id,
            sourceRoutineRunId: sourceRunRow.id,
            sourceRoutineTitle: routineRow.title,
            sourceRoutineRunSource: sourceRunRow.source,
            targetWorkflowId: workflowRow.id,
            targetWorkflowKey: workflowRow.workflowKey ?? null,
            targetCapability: input.envelope.target.capability ?? null,
          }),
          invocationInputJson: inputJson,
        });
        await db.update(workflowInvocations).set({
          workflowRunId: run.id,
          status: "linked",
          updatedAt: new Date(),
        }).where(eq(workflowInvocations.id, invocationRow.id));
        return {
          id: invocationRow.id,
          companyId: routineRow.companyId,
          sourceRoutineId: routineRow.id,
          sourceRoutineRunId: sourceRunRow.id,
          requestedByAgentId,
          targetWorkflowId: workflowRow.id,
          targetWorkflowKey: workflowRow.workflowKey ?? null,
          targetCapability: input.envelope.target.capability ?? null,
          contractVersion: input.envelope.contractVersion,
          inputKind: input.envelope.payload.kind,
          inputMarkdown,
          inputJson,
          workflowRunId: run.id,
          status: "linked",
          failureReason: null,
          createdAt: invocationRow.createdAt,
          updatedAt: new Date(),
        };
      } catch (error) {
        await db.update(workflowInvocations).set({
          status: "failed",
          failureReason: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        }).where(eq(workflowInvocations.id, invocationRow.id));
        throw error;
      }
    },
    getResultForActor: async (input: {
      invocationId: string;
      agentId: string | null;
      companyId: string | null;
    }): Promise<WorkflowInvocationResultView | null> => {
      const conditions = [eq(workflowInvocations.id, input.invocationId)];
      if (input.companyId) {
        conditions.push(eq(workflowInvocations.companyId, input.companyId));
      }
      if (input.agentId) {
        conditions.push(eq(workflowInvocations.requestedByAgentId, input.agentId));
      }

      const row = await db
        .select({
          invocationId: workflowInvocations.id,
          workflowRunId: workflowInvocations.workflowRunId,
          workflowKey: workflowInvocations.targetWorkflowKey,
          invocationStatus: workflowInvocations.status,
          invocationError: workflowInvocations.failureReason,
          runStatus: workflowRuns.status,
          summary: workflowRuns.summary,
          runError: workflowRuns.error,
          contextSnapshot: workflowRuns.contextSnapshot,
          startedAt: workflowRuns.startedAt,
          finishedAt: workflowRuns.finishedAt,
        })
        .from(workflowInvocations)
        .leftJoin(workflowRuns, and(
          eq(workflowRuns.id, workflowInvocations.workflowRunId),
          eq(workflowRuns.companyId, workflowInvocations.companyId),
        ))
        .where(and(...conditions))
        .then((rows) => rows[0] ?? null);
      if (!row) return null;

      return workflowInvocationResultViewSchema.parse({
        invocationId: row.invocationId,
        workflowRunId: row.workflowRunId,
        workflowKey: row.workflowKey,
        status: normalizeResultStatus(row.runStatus, row.invocationStatus),
        summary: row.summary,
        result: sanitizeResultJson(row.contextSnapshot),
        error: row.runError ?? row.invocationError,
        startedAt: row.startedAt?.toISOString() ?? null,
        finishedAt: row.finishedAt?.toISOString() ?? null,
      });
    },
  };
}
