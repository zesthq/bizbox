# Workflow invocation credentials and issue-document writes

Date: 2026-09-29
Status: Implemented on `feat/pass-api-key-to-invoked-workflow`

## Goal and history

Agent-invoked Google ADK workflows need a fresh `BIZBOX_API_KEY` authenticating as the requesting agent, without forwarding or storing the caller's original API key. The workflow runtime's separate `BIZBOX_WORKFLOW_RUN_TOKEN` continues to serve runtime endpoints. Manual, scheduled, and agent-less routine runs receive no agent API key, even when one is configured or inherited by the server. The adapter's ordinary-agent execution path is unaffected.

The initial agent credential change exposed a run-attribution bug: a workflow JWT's `run_id` identifies a **workflow run**, while `req.actor.runId` and `document_revisions.created_by_run_id` refer to **heartbeat runs**. Assigning the workflow run ID to `req.actor.runId` made document writes fail the heartbeat-run foreign key. The attribution fix leaves `req.actor.runId` empty for workflow tokens, including when a caller supplies `x-paperclip-run-id`. Document and activity attribution still use the requesting agent, with a null heartbeat-run ID.

That fix also meant a delegated workflow could not write an issue document on its requesting agent's actively checked-out issue. This plan adds a narrow, generic origin-heartbeat authorization for **issue-document PUTs only**. It does not make the workflow a heartbeat, transfer checkout ownership, or grant general issue mutation rights.

## Credential and attribution implementation

1. The invocation service passes `requestedByAgentId` through `runInvocation()` and persists the requester, workflow ID, and company ID in the workflow run's context snapshot before starting ADK. Authentication checks the signed JWT against those persisted values; it does not depend on the invocation-to-run link, which is written after launch.
2. At launch, an agent requester must exist in the workflow's company and not be terminated or pending approval; idle and running agents are eligible. Bizbox mints a fresh JWT bound to the requesting agent, company, workflow, and run. Missing signing configuration fails the run closed. Completed and cancelled runs do not revoke the token before its expiry. `BIZBOX_WORKFLOW_AGENT_JWT_TTL_SECONDS` controls its lifetime (default eight hours, independently of ordinary agent JWTs).
3. The ADK child receives the delegated key through `invokeGoogleAdk({ authToken })`. Workflow runner and Resource-provided `BIZBOX_API_KEY` values, and an inherited server key, cannot override it or supply an agent-less run with a key. Other inherited environment values are preserved.
4. Authenticated workflow tokens retain the requesting agent identity but never put their workflow run ID, or a caller-supplied run header, in `req.actor.runId`. Heartbeat-only document revision and activity run IDs remain null for workflow writes. Ordinary agent JWTs retain their existing run-ID behavior.

## Limited origin-heartbeat document authorization

1. Direct agent invocation reads the candidate `req.actor.runId`. A candidate is persisted as `originHeartbeatRunId` on the new workflow run only if the database confirms a **running** heartbeat with that ID, requesting agent, and company. An agent API key can supply a run header, so an unchecked header is never provenance. An invalid or absent candidate still permits the normal invocation but carries no document-write authority. Routine-backed, manual, scheduled, and agent-less runs acquire no origin through this path.
2. Workflow-token authentication exposes persisted provenance separately as `actor.originHeartbeatRunId` after validating the run/requester/company/workflow JWT binding. It still leaves `actor.runId` empty and ignores later run headers. The origin remains available after its heartbeat finishes while the workflow token is valid.
3. Only `PUT /issues/:id/documents/:key` may use this origin instead of the ordinary checkout-run requirement. The issue must still be `in_progress`, in the actor's company, assigned to the requesting agent, and locked by the exact originating heartbeat (`checkoutRunId`). A reassignment, status change, cleared lock, or adoption by another run removes this permission. An unchanged checkout can be used after the heartbeat becomes terminal; `executionRunId` need not still be live.
4. This exception does **not** apply to other document operations, comments, status changes, attachments, work products, checkout adoption, routine-dispatch shortcuts, or any other agent API. No company-specific issue, document key, or workflow is hardcoded. For now only issue-document PUTs are supported to reduce blast radius: this is the only workflow write use case validated so far. Extending it requires a separate authorization decision and tests.

## Verification

- Cover direct/routine credential minting and agent-less environment isolation; reject wrong-company, absent, terminated, pending-approval, invalid-binding, and expired requesters as appropriate.
- Cover persisted origin before launch, a forged run header, a finished heartbeat with unchanged provenance, and absence of provenance for an already-terminal origin at invocation time.
- Exercise document PUT with delegated actor provenance: matching agent/company/checkout succeeds with `createdByRunId = null`; changed lock, different assignee/company, or missing origin fails. Other issue mutations continue to require normal checkout ownership.
- Run focused tests and the server typecheck/build. `pnpm verify:full` is intentionally skipped for this change at the user's request.

## Deployment limitation

This approach requires the direct invocation to carry the invoking agent's actual running heartbeat ID and the target issue to remain checked out to that same agent and heartbeat until the document PUT. A workflow invoked by one agent cannot write through another agent's checkout. No Bizbox or client-supplied issue ID or document key can manufacture that relationship; a broader cross-agent or cross-operation delegation would need a separate design.
