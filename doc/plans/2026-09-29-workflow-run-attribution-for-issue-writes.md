# Stop workflow run IDs from being treated as heartbeat run IDs

Date: 2026-09-29
Status: Minimal fix implemented

## What broke

The workflow `BIZBOX_API_KEY` change (`6a6e2eac`) lets a workflow call the normal agent API. Its token contains a **workflow run ID**, but authentication put that ID in `req.actor.runId`. Existing code treats `req.actor.runId` as a **heartbeat run ID**. On document PUT, the server wrote it to `document_revisions.created_by_run_id`, whose foreign key points to `heartbeat_runs`. The insert failed. The client did not send the invalid `created_by_run_id`.

## Minimal fix to the last commit

1. In `server/src/middleware/auth.ts`, keep validating the workflow-delegated JWT against the stored workflow run and requesting agent. For `claims.delegation === "workflow"`, set `req.actor.runId` to `undefined` instead of `claims.run_id`. Ordinary agent JWTs still use `runIdHeader || claims.run_id || undefined`. The `x-paperclip-run-id` header cannot override a workflow-delegated token.
2. Keep the new `BIZBOX_API_KEY`, workflow-invocation API, actor type, and database schema. The document PUT in `server/src/routes/issues.ts` already passes `actor.runId ?? null` to the document service: it now records the authenticated agent as author and `created_by_run_id = null`. The activity logger also records `run_id = null` without relying on its missing-FK fallback.
3. Other heartbeat-only consumers of `req.actor.runId` receive no run ID from workflow tokens: comments, execution decisions, heartbeat activity reporting, issue/plugin checkout checks, and routine-dispatch shortcuts. A workflow run does not become an owner of a heartbeat checkout.

## Verification

- Workflow-delegated authentication with no matching heartbeat run returns the requesting agent without `actor.runId`, even if a run header is supplied. An ordinary agent JWT still returns its heartbeat run ID.
- The auth test covers the cause of the document PUT foreign-key error. A real end-to-end document PUT with a delegated token has not yet been exercised; if added, assert the agent ID and `created_by_run_id = null` on a writable issue, and confirm a workflow cannot use a heartbeat checkout lock or run-ID-based routine shortcut.
- Focused workflow-invocation tests passed and `pnpm build` passed. `pnpm verify:full` reached the full test suite but did not complete because unrelated suites failed (including Git-signing and worktree/environment failures); see the session result for details.

## Boundary

This fixes the failed PUT **when the issue already permits the agent to write**. It does not grant a workflow permission to edit a heartbeat-locked `in_progress` issue, or directly link its document revision to the workflow run. If either is required later, design scoped heartbeat-lock delegation or add a separate `created_by_workflow_run_id` reference, respectively. Do not put a workflow run ID in a heartbeat foreign key.
