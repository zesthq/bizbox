# Codex Workflow

This document defines the repo-native Codex contribution loop for Bizbox.

It does not replace [AGENTS.md](../AGENTS.md). `AGENTS.md` remains the top-level contributor contract. This document makes the expected workflow explicit so human contributors and coding agents follow the same path.

## Source Of Truth

Read these first, in order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

Use `doc/` as engineering truth.

Use `docs/` for published or user-facing documentation. If behavior changes, update `doc/` first, then update `docs/` where public docs need to reflect that behavior.

## Working Model

Bizbox already has the right Codex-compatible seams:

- `AGENTS.md` defines repo rules and branch-specific invariants
- `packages/adapters/codex-local/` contains Codex runtime integration
- `skills/` contains reusable Bizbox operational skills
- worktree support and adapter behavior already handle Codex runtime isolation

The maintainable path is to use those seams consistently, not introduce a second Codex-only project structure.

## Change Loop

For most work, follow this order:

1. Read the spec and inspect the relevant boundary before editing.
2. Keep the touch set small and company-scoped.
3. If a contract changes, update affected layers in this order:
   1. `packages/db`
   2. `packages/shared`
   3. `server`
   4. `ui`
4. Prefer shared constants, validators, and types over inline strings or duplicated local types.
5. Add or update tests near the changed behavior.
6. Run verification before hand-off.

## Where Changes Belong

- `packages/db/`: schema, migrations, DB runtime helpers
- `packages/shared/`: shared types, validators, constants, API path constants
- `server/`: routes, services, orchestration, auth, runtime logic
- `ui/`: board UI, API clients, route pages, shared components
- `packages/adapters/*`: adapter-specific server/UI/CLI behavior
- `packages/adapter-utils/`: shared adapter utilities
- `skills/`: reusable Bizbox operating skills
- `.agents/skills/`: maintainer/internal AI workflows
- `.claude/skills/`: Claude-specific local helper skills only, not general Codex or product workflow docs

Rules:

- Do not add adapter-specific business logic to `server/` or `ui/` when it belongs in an adapter package.
- Do not add new API path strings when `packages/shared/src/api.ts` already defines the route.
- Do not add Codex workflow material under `.claude/` unless it is explicitly Claude-only.
- Do not update `docs/` first when the implementation contract in `doc/` changed.

## Verification

Cheap default:

```sh
pnpm test
```

Standard agent hand-off check:

```sh
pnpm verify:agent
```

Full pre-handoff check:

```sh
pnpm verify:full
```

Run browser suites only when your change touches those flows or when you are explicitly verifying CI or release behavior:

```sh
pnpm test:e2e
pnpm test:release-smoke
```

If you cannot run part of expected verification, say exactly what was not run and why.

## PR Discipline

Every PR must use [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

The minimum Codex PR standard is:

- explain the thinking path from Bizbox's purpose to the concrete change
- summarize the exact behavior changed
- list verification commands and manual checks
- call out risks and remaining uncertainty
- fill in `Model Used` precisely

## Good Codex Contributions

Good fits:

- small, scoped bug fixes
- contract-sync changes across `db`, `shared`, `server`, and `ui`
- adapter fixes that stay inside `packages/adapters/*`
- docs-drift cleanup where implementation and contributor guidance disagree
- maintainability changes that reduce duplication without changing product direction

Higher-risk changes that need tighter coordination:

- new core product surfaces
- broad service or route reshuffles
- plugin/runtime architecture changes
- branch-policy changes like built-in versus external adapter decisions

## Current Maintainability Priorities

These are the best near-term Codex-style improvements for this repo shape:

1. Prefer package-owned adapter metadata over duplicated server/UI declarations.
2. Use shared API constants instead of handwritten route strings.
3. Keep `doc/` and `docs/` aligned when behavior changes.
4. Add narrow, explicit scripts and checks instead of relying on distributed tribal knowledge.
5. Refactor by domain seam, not by broad file churn.
