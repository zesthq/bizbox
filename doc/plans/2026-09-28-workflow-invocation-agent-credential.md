# Workflow invocation agent credential

Date: 2026-09-28
Status: Implemented

## Goal

Every Google ADK workflow invoked directly or through a routine by an authenticated Bizbox agent receives a fresh `BIZBOX_API_KEY` authenticating as that **requesting agent**. Manual, scheduled, and agent-less routine runs receive no agent key. `BIZBOX_WORKFLOW_RUN_TOKEN` remains a separate credential for workflow runtime endpoints.

Do not forward or persist the caller's original API key. No service agent, synthetic agent record, database migration, or public workflow-invocation request change is needed.

## Current path

- `server/src/routes/workflows.ts` and `server/src/routes/routines.ts` obtain the authenticated caller's agent ID.
- `server/src/services/workflow-invocations.ts` records `requestedByAgentId` on the invocation but does not pass it into the run's launch context.
- `server/src/services/workflows.ts` calls `invokeGoogleAdk()` with a workflow runtime token but no agent `authToken`.
- `packages/adapters/google-adk/src/server/invoke.ts` can put an `authToken` into `BIZBOX_API_KEY`, but configured keys currently take precedence and the process utility also merges the server's `process.env` when spawning.

## Implementation

1. **Persist requester provenance before launching ADK.** Pass `requestedByAgentId: string | null` from the invocation service through `runInvocation()` to `launchWorkflowRun()`. Persist requester, workflow ID, and company ID in the new run's context snapshot before starting its process; preserve them on subsequent snapshot updates. Do not depend on the invocation-to-run link, which is written only after launch. Runs without an authenticated requesting agent use a null requester.
2. **Mint one delegated token per agent-invoked run.** At the common launch point, look up the requester in the workflow's company and reject absent, wrong-company, `terminated`, or `pending_approval` agents. “Eligible” does not mean literal `status === "active"`: `idle` and `running` agents remain eligible. If a requester exists, mint a fresh signed agent JWT containing a workflow-delegation marker and the requesting agent, company, workflow, and run IDs; pass it to `invokeGoogleAdk({ authToken: delegatedToken })`. If signing is unavailable, fail the run rather than silently launch without agent API access. Leave heartbeat JWT issuance and the workflow runtime token unchanged.
3. **Make the child API key authoritative at the final environment boundary.** `invokeGoogleAdk()` is used for workflow launches only; its separate ordinary-agent `execute()` path stays unchanged. Ignore `BIZBOX_API_KEY` in the workflow runner config and Resource-provided environment, and remove it from the inherited server environment used for command resolution. When calling the child-process utility, explicitly override the server's inherited `BIZBOX_API_KEY` with the minted `authToken`, or `undefined` for an agent-less run (Node's spawn omits undefined environment entries). Preserve the utility's normal environment merge for all other variables. A run without a requester receives no `BIZBOX_API_KEY`; an agent-invoked run receives exactly its delegated token. No extra adapter policy or merge-disable flag is needed.
4. **Verify the persisted binding on API use.** For JWTs marked as workflow delegations, check signature, expiry, the current agent and company, and the persisted run/workflow/company/requester binding. Completed or cancelled runs do not themselves revoke the token; expiry still applies. Use a separate configurable TTL (default eight hours) rather than the ordinary agent JWT's 48 hours. Runs can last up to 24 hours, so operators who need API access beyond eight hours must configure a longer TTL. Preserve ordinary agent JWT authentication.
5. **Document the contract.** Update `doc/SPEC-implementation.md` and operator guidance: `BIZBOX_WORKFLOW_RUN_TOKEN` always serves workflow runtime endpoints; conditional `BIZBOX_API_KEY` is a newly minted requesting-agent credential for general agent-authorized API calls.

## Verification

- Direct and routine invocations by eligible agents give the ADK child a fresh agent key authenticating as the same agent in the same company; the incoming curl Bearer key is never copied.
- Agent-less routine, manual, and scheduled runs have no agent key even with a configured, Resource-provided, or server-inherited `BIZBOX_API_KEY`. The runtime token still works and other inherited environment variables remain available.
- Wrong-company, absent, terminated, or pending-approval requesters and missing signing configuration fail closed; eligible idle/running agents can invoke.
- Delegated tokens reject altered agent/company/workflow/run bindings and expiry. They remain valid after completion until expiry. Ordinary agent JWT behavior is unchanged.
- Add focused tests for invocation provenance, workflow launch, actual ADK child environment (including `run.sh`-style entrypoints), and agent authentication. Run affected checks and `pnpm verify:full` before hand-off; report anything that cannot run.
