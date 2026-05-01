# ADR 0001 — OSBAPI-shaped Agent Runtime Broker

- **Date:** 2026-05-01
- **Status:** Accepted (Steps 1+2 landed; Steps 3–6 in progress on PR #18)
- **Deciders:** Bizbox control-plane maintainers
- **PR:** [#18 — feat(runtime-broker)](https://github.com/zesthq/bizbox/pull/18)
- **Related:**
  - `doc/SPEC-implementation.md` (control-plane invariants, approval gates, activity log)
  - `doc/OPENCLAW_ONBOARDING.md` (first concrete broker host)
  - `doc/plans/2026-03-14-adapter-skill-sync-rollout.md` (legacy `listSkills` / `syncSkills` path this generalizes)

---

## 1. Context

Bizbox needs to provision and govern resources that live **inside an agent
runtime host** (skills, prompts, MCP refs, model defaults, sub-agent profiles,
config profiles, secret bundles, and the agent identities themselves) without
the control plane having to know about every adapter's bespoke RPC surface.

Today each cloud/remote adapter wires its own pair of one-shot calls — most
visibly `listSkills` / `syncSkills` on OpenClaw — and the control plane treats
"skills" as the only first-class artefact. That model has three problems as we
add more remote runtimes (OpenClaw, Otto, Hermes, future hosts):

1. **Vocabulary drift.** Each adapter invents its own names for "a thing
   inside the host." Skills, prompts, MCPs, model defaults and sub-agents are
   independently shipped today, even though they are governed together.
2. **No desired-state model.** `syncSkills` is fire-and-forget; the control
   plane has no durable record of "what we asked for" vs. "what the host
   reports", so reconciliation, drift detection, retries and approvals are
   ad-hoc per adapter.
3. **No async story.** Long-running provisioning (creating an agent identity,
   installing a bundle, rotating secrets) cannot return a poll handle, so
   adapters block their WS request loops or hide work behind opaque retries.

We want one taxonomy and one wire shape that the control plane, the UI, and
every transport (in-process, WS, HTTP) can share, without having to redesign
the abstraction for every new host.

## 2. Decision

Introduce an **Agent Runtime Broker** abstraction modeled on the
[Open Service Broker API](https://www.openservicebrokerapi.org/) shape —
*catalog → instances → operations* — and adopt it as the single contract
between Bizbox and any agent runtime host.

### 2.1 Resource taxonomy (`AgentRuntimeKind`)

Six kinds, intentionally finite:

| Kind             | Meaning                                                        | Provisionable? |
|------------------|----------------------------------------------------------------|----------------|
| `runtime_host`   | The remote process itself; registered/bound only.              | No (bind only) |
| `agent_identity` | A logical agent inside a host (replaces "agent runtime").      | Yes            |
| `agent_bundle`   | Unit of governance for skills + prompts + MCP refs + model defaults + sub-agent profiles, shipped together. | Yes |
| `mcp_server`     | An MCP endpoint the host should expose to its agents.          | Yes            |
| `config_profile` | Free-form key/value or schema-bound config for the host/agent. | Yes            |
| `secret_bundle`  | A grouping of `secret_ref` pointers; raw values never cross the wire. | Yes      |

`agent_bundle` reports per-content state in `actualState.contents[]` using a
fixed `AgentBundleContentKind` enum (`skill`, `prompt`, `mcp_ref`,
`model_default`, `subagent_profile`). Contents are **not** independently
PUT-able — bundles are the governance unit. Notably we **do not** introduce a
`skill_pack` alias; everything that used to be a "skill set" is now a bundle.

### 2.2 Catalog & capabilities

Each broker advertises a `AgentRuntimeCatalog` describing, per kind:

- whether it is `provisionable`
- the named `plans` it accepts (with optional JSON-Schema `configSchema`,
  reusing the same shape adapters already publish for `config-schema`)
- for `agent_bundle`, which `supportedContents` it can introspect

Plus a flat `capabilities` block (`supportsAsync`, `supportsBindings`,
`supportsAgentProvisioning`, `supportsBundleProvisioning`,
`supportsConfigProfile`, `supportsMcpServer`, `supportsSecretBundle`,
`requiresApproval`) so the UI can render an honest experience even before a
full catalog is fetched.

A broker that is unreachable, or a host that does not implement broker
methods, returns `reachable: false` from `describe()` with a `reason` string,
and the UI/server treat the adapter as broker-less. This is the formal
**method-not-found fallback** that lets us roll out the broker gradually.

### 2.3 Wire surface (OSBAPI-shaped)

The broker exposes a small, fixed set of logical operations, mirrored on
every transport:

- `getCatalog()` → `AgentRuntimeCatalog`
- `describe()` → `AgentRuntimeBrokerDescriptor`
- `listInstances({ kind? })` → `RuntimeInstance[]`
- `getInstance(id)` → `RuntimeInstance`
- `putInstance(input)` → `{ instance, operation? }` (upsert; idempotent on `idempotencyKey`)
- `deleteInstance(id)` → `{ operation? }`
- `getOperation(id)` → `BrokerOperation` (poll handle)

PUT/DELETE may return an in-progress `BrokerOperation` for hosts that report
`supportsAsync: true`; otherwise they complete synchronously and the operation
is recorded in `succeeded`/`failed` terminal state.

REST routes mounted under `/api/companies/:companyId/runtimes/:agentId/…`
(`catalog`, `describe`, `instances`, `instances/:id`, `operations/:id`)
expose the same shape to the UI and to agent tokens.

### 2.4 Server-side persistence & reconciler

Five new tables (migration `0061_runtime_broker`), all **company-scoped**:

- `runtime_hosts` — one row per (company, host agent), caches catalog snapshot,
  reachability, last reason.
- `runtime_instances` — desired vs. actual state per resource: `kind`, `plan`,
  `desired_config`, `actual_state` (incl. per-content state for bundles),
  `status` ∈ {`pending`, `reconciling`, `ready`, `failed`, `deprovisioning`},
  `status_reason`, `last_op_id`, `approval_id`.
- `runtime_operations` — durable poll handles (kind ∈ `put`/`delete`/`sync`/`catalog`,
  state ∈ `in_progress`/`succeeded`/`failed`, `result`, `error`, `poll_after_ms`).
- `runtime_bindings` — link a `runtime_instance` to a Bizbox entity
  (`agents`, `mcp_servers`, …) with optional `credentials_ref`.
- `runtime_secret_refs` — per-instance map of logical key → `secret_ref`
  pointer; raw secret values are never written to control-plane DB.

A `BrokerRegistry` resolves the broker for `(company, hostAgent)` by adapter
type; a `DesiredStateStore` persists PUTs; a `Reconciler` pushes desired
state through the broker, polls operations, and updates instance status. All
mutating actions write `activity_log` rows so governance/audit invariants hold.

Authorization: board users have full access; agent tokens may only manage
runtimes for their own agent record (matches the existing OpenClaw invite
endpoint pattern). PUT/DELETE on hosts where `requiresApproval=true` are
gated by an `approval_id` before being pushed.

### 2.5 Transports

Two transports ship with the broker abstraction:

1. **In-process / WebSocket** (Steps 1+2) — `openclaw_gateway` implements the
   broker over its existing WS `req` channel using `runtime.*` methods, with
   the method-not-found fallback so older OpenClaw builds keep working.
2. **HTTP / OSBAPI** (Step 5) — `adapter-utils` ships
   `createHttpAgentRuntimeBroker({ baseUrl, headers })`, a generic broker
   that calls `GET /v2/runtime/catalog`, `GET|PUT|DELETE /v2/runtime/instances/:id`,
   `GET /v2/runtime/operations/:id`. `otto_agent` adopts it (Step 6) using
   its existing API key. Method-not-found ⇒ `reachable=false`.

Both transports use the same `AgentRuntimeBroker` interface; the server,
reconciler, routes and UI are transport-agnostic.

### 2.6 UI

A single **Runtime tab** on `AgentDetail` reads the catalog, lists instances,
and renders kind-specific create flows driven by `configSchema`. A "Hire on
this host" button (Step 4) appears when the catalog has provisionable
`agent_identity` plans and creates a Bizbox `agents` row + `runtime_binding`
in one action.

### 2.7 Rollout (Steps 1–6)

Sequenced so each step is independently deployable behind the
`reachable=false` fallback:

1. **Adapter contract & types** (`adapter-utils`, `shared`) — landed.
2. **DB + server reconciler + routes + OpenClaw WS broker + UI tab** — landed.
3. **Active reconcile for `config_profile` / `mcp_server`** — validate
   `desiredConfig` against the plan's `configSchema` via a shared
   `validateAgainstSchema` ajv helper (extracted from plugin config); UI
   structured editors per kind.
4. **`agent_identity` "Hire on this host"** — when PUT succeeds and
   `desiredConfig.hireAgent === true`, create a Bizbox `agents` row pointing
   back at the host and link it via `runtime_bindings`; idempotent.
5. **HTTP/OSBAPI transport** in `adapter-utils`.
6. **Second adapter wired** — `otto_agent` adopts the HTTP broker.

## 3. Alternatives considered

1. **Extend `listSkills` / `syncSkills`.** Add prompts/MCPs/model-defaults as
   new one-shot calls per artefact. Rejected: does not address vocabulary
   drift, has no desired-state record, and balloons the adapter interface
   linearly with every new artefact type.
2. **Per-adapter bespoke broker.** Let each adapter design its own runtime
   API and have the UI branch on `adapterType`. Rejected: every new host
   would need a new server route family and a new UI page; governance
   invariants (approval, activity log, budget pause) would be re-implemented
   per adapter.
3. **Adopt OSBAPI verbatim** as a multi-tenant service-broker enrolment.
   Rejected: Bizbox is the only consumer; full enrolment, dashboards and
   service-class metadata add complexity we do not need. We keep the
   *shape* (catalog/instances/operations, async via operations) but drop
   the multi-tenant enrolment layer.
4. **Push model (host → control plane events).** Have hosts stream actual
   state changes instead of polling operations. Rejected for V1: requires
   bidirectional auth/stream lifecycle on every transport; polling with
   `poll_after_ms` is good enough and degrades cleanly. Listed as
   out-of-scope; can be layered on later without changing the taxonomy.

## 4. Consequences

### Positive

- One taxonomy and one wire shape across in-process, WS and HTTP transports.
- Durable desired-state model unlocks reconciliation, drift detection,
  retries, approval gating and activity-log audit uniformly across hosts.
- Adding a new host is "implement the broker methods + advertise capabilities";
  no new server routes or UI pages.
- Capabilities + method-not-found fallback let the UI render an honest
  experience and allow gradual rollout to existing hosts.
- Idempotency keys on PUT and durable `runtime_operations` give safe retries
  without double-provisioning.

### Negative / costs

- Five new tables and a reconciler loop to operate, migrate and back up.
- Adapter authors must learn the broker interface (handful of methods + a
  capabilities block) instead of one-off RPCs.
- Two parallel paths during rollout: brokered hosts vs. legacy
  `listSkills`/`syncSkills`. We accept this until all hosts return
  `reachable=true` from `describe()`, then retire the legacy path.
- JSON-Schema validation in the server adds an ajv dependency surface that
  must be kept consistent with the plugin-config validator (mitigated by
  Step 3's shared `validateAgainstSchema` helper).

### Invariants preserved

- All new tables and routes are **company-scoped**; agent tokens cannot
  cross company or agent boundaries.
- Mutating broker actions write `activity_log` entries.
- `requiresApproval` capability + `approval_id` on `runtime_instances`
  preserve approval-gate semantics.
- `runtime_secret_refs` stores **only** `secret_ref` pointers; raw secret
  values never enter the control-plane DB or the broker wire.
- Budget hard-stop and single-assignee task semantics are unaffected — the
  broker operates on hosts/instances, not on issues or runs.

## 5. Out of scope (deferred)

- Real-time push from broker to control plane (still poll-based).
- Hermes / Droid as a second brokered adapter (fork-only territory; see
  fork notes in `AGENTS.md`).
- Multi-tenant OSBAPI service-broker enrolment (Bizbox is the only
  consumer).

## 6. Follow-ups

- Retire `listSkills` / `syncSkills` once all in-tree adapters report
  `reachable=true` from `describe()` and `supportsBundleProvisioning=true`.
- Replace polling with a host→control-plane event channel once a
  transport-agnostic event story exists.
- Promote `validateAgainstSchema` (Step 3) into a shared util and reuse it
  for plugin config to remove the duplicate ajv setup.
