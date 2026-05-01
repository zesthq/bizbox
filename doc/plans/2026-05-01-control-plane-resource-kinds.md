# Control-Plane Resource Kind Taxonomy (Revised)

Date: 2026-05-01
Status: Draft — supersedes the resource-kind list in the earlier
control-plane / skills planning notes.

The first cut of the control-plane resource model collapsed concepts that
have different lifecycles, audit needs, and source-of-truth owners. This
document records the revised taxonomy that the next implementation pass
should target. It is naming + shape only; the broader OSBAPI shape,
reconciler, approval gates, company scoping, OpenClaw `req runtime.*`
framing, and rollout order from the prior plan are unchanged unless
called out below.

## 1. `skill_pack` → `agent_bundle` (with `skill_pack` as a subtype, not an alias)

Rationale: a `.agents/` bundle on disk is already a heterogeneous
container — `SKILL.md` files, prompt fragments, MCP server declarations,
model defaults, sub-agent profiles. Treating it as one provisionable
unit matches how operators actually ship and version this stuff (one git
repo, one tag, one approval).

Do not make `skill_pack` a synonym for `agent_bundle` — that hides the
distinction. Instead:

- **`agent_bundle`** (top-level kind): a versioned, signed-or-hashed
  package. Plans correspond to bundle "shape": `bundle:full`
  (everything) or `bundle:skills_only` (legacy `.skills/` folders).
  Provisioning installs the whole bundle atomically; deprovisioning
  removes it atomically. This is the unit of governance.
- **`skill`, `prompt`, `mcp_ref`, `model_default`, `subagent_profile`**
  (subtypes / contents): introspectable contents *of* a bundle,
  surfaced in the catalog and UI but not separately PUT-able. The
  reconciler reports per-subtype status (e.g. "skill X failed
  validation") without making each one its own instance.

Migration: keep `skill_pack` accepted as an inbound alias for
`agent_bundle` with `plan=skills_only` for one release, then deprecate.
Do not carry both kinds forward — that would be two truths.

Why not "support both as peers": a per-agent attachment UI that has to
reason about overlap between a `skill_pack` and an `agent_bundle`
containing the same skill is a footgun. One container kind, with typed
contents, avoids it.

## 2. `mcp_server` — keep first-class, but reframe

Tempting to fold under `config_profile`. Keep it first-class for audit,
governance, and rotation reasons, but make the relationship explicit:

- **`mcp_server`** stays a top-level kind. Lifecycle is independent: an
  MCP endpoint can be added, rotated, or revoked without touching the
  rest of the agent's config, and each of those events deserves its own
  activity log entry and approval (an MCP server can read/write things
  on the agent's behalf — security-significant).
- **`config_profile`** *references* `mcp_server` instances by ID rather
  than embedding their URLs/tokens. So the profile says "use MCP servers
  `[id1, id2]`"; rotating `id1` does not rev the profile.
- Bindings: an `mcp_server` instance can be bound to multiple agents in
  the same company. This is the OSBAPI binding pattern doing real work
  — one provisioned MCP server, N bindings, each binding gets its own
  scoped credential.

Net effect: governance stays clean (audit per MCP), but `config_profile`
remains the single "what is this agent configured with" view in the UI
by resolving references.

## 3. `agent_runtime` → split into `runtime_host` and `agent_identity`

The original kind conflated two very different things, and that bites in
OpenClaw specifically: one OpenClaw process can host many agent
identities.

- **`runtime_host`**: the remote process/container itself. One per
  remote (e.g. one cloud OpenClaw deployment). Discovered/registered via
  the existing onboarding/pairing flow, not provisioned by Bizbox in V1.
  Owns the catalog. Capacity, version, health, `reachable_at` live here.
  Bizbox typically *binds* to a host rather than provisioning one.
- **`agent_identity`**: a logical agent inside a host. This is what gets
  PUT/DELETE'd when a board hires/retires an agent. Carries its own auth
  handle, sandbox, working dir, default model, and is what Bizbox's
  `agents` table maps to via a binding. Plans correspond to role
  templates: `identity:ceo`, `identity:engineer`, `identity:researcher`.

Prefer `agent_identity` over `agent_worker`:

- "worker" implies an ephemeral execution slot (one task → one worker),
  which is the wrong mental model — a single Bizbox agent persists
  across many runs and accumulates memory/skills.
- "identity" matches the existing language in `OPENCLAW_ONBOARDING.md`
  ("the OpenClaw agent appears in CLA agents") and in the agent API key
  model.
- If we ever do introduce per-task ephemeral execution units (e.g. one
  container per run), *that* becomes a third kind `agent_worker`
  cleanly, without overloading `agent_identity`.

Bonus: this split makes capability flags more honest.
`runtime_host.describeBroker()` reports `supportsAgentProvisioning`;
`agent_identity` does not need its own capability flag because its
existence proves the host supports it.

## 4. Revised Resource Kind Set

| Kind              | Provisionable?           | Bound to                          | Notes                                                                   |
| ----------------- | ------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `runtime_host`    | Register/bind only (V1)  | company                           | Source of catalog; one per remote process                               |
| `agent_identity`  | Yes                      | runtime_host (1:N), agent record  | Replaces old `agent_runtime`; what "hire on this host" creates          |
| `agent_bundle`    | Yes                      | agent_identity (N:M)              | Replaces `skill_pack`; contains skills/prompts/mcp_refs/model/subagents |
| `mcp_server`      | Yes                      | agent_identity (N:M) via bindings | First-class for audit/rotation; referenced from `config_profile`        |
| `config_profile`  | Yes                      | agent_identity (1:1 active)       | References `mcp_server` IDs, model defaults, system prompts             |
| `secret_bundle`   | Yes                      | agent_identity or `mcp_server`    | Refs only, never raw values in audit log                                |

Removed/folded:

- `skill_pack` — folded into `agent_bundle` (accepted as inbound alias
  for one release).
- `agent_runtime` — split into `runtime_host` + `agent_identity`.

## 5. Impact on the Earlier Plan

Mostly mechanical, but two substantive changes:

1. **DB schema.** `runtime_instances.kind` enum updates to the new set.
   Add a `runtime_hosts` table separate from `runtime_instances` because
   hosts have a different lifecycle (registered via pairing, not
   provisioned). `agent_identity` instances carry a `host_id` FK.
   `agent_bundle` instances carry a `contents` `jsonb` summarizing
   detected subtypes (skill / prompt / mcp_ref / model_default /
   subagent_profile) reported by the broker.
2. **Broker wire protocol.** Catalog now declares supported *contents*
   for `agent_bundle` (so the UI can say "this host accepts skills +
   prompts but not MCP refs in bundles"). `mcp_server` and
   `config_profile` get distinct `req runtime.instance.*` flows so audit
   logs are clean.

Everything else from the prior plan — OSBAPI shape, reconciler, approval
gates, company scoping, OpenClaw `req runtime.*` framing — stays as
written, with the renamed kinds. The rollout order shifts slightly:
ship `agent_bundle` (previously `skill_pack`) first because it unblocks
the existing skill-sync gap; `agent_identity` provisioning lands in
step 4 as before.
