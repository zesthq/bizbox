# ADR-0003: Repository-managed workflow schedules

**Date:** 2026-10-08
**Status:** Accepted

---

## Context

Bizbox already executes ADK workflows on cron schedules, but those schedules
were configured only through the board/API. Configuration repositories such as
`citro-box` keep Content Strategist, Product Placement Rewriter, landing-page,
and other definitions in `companies/citro-google-adk/workflows/**/WORKFLOW.yaml`.
Their company-import script copies these files into a portable bundle and uses
Bizbox's existing company import endpoint. Schedules need to travel through that
same path and survive export.

## Decision

Accept an optional `schedules` array in each `WORKFLOW.yaml`, carried in the
shared company portability manifest. Each entry has a unique workflow-local
`title`, a five-field `cronExpression`, a nonblank literal `templateMarkdown`,
and a `status` (default `active`). `timezone` may be omitted or explicitly `UTC`;
other values are rejected because the existing workflow scheduler is UTC-only.
Required workflow inputs belong in the Markdown body. Schedule bodies do not
interpolate prompt-template variables or select new input for each fire.
Workflow files use the `yaml` package for YAML parsing so literal multiline
Markdown, comments, quoted scalars, and standard YAML lists retain their meaning;
the historical subset parser remains in place for other package documents.

Configuration is applied by an explicit board-managed company import:

- Omitted `schedules` preserves existing schedules for backward compatibility.
- An explicit list is authoritative for **all** schedules on that workflow,
  including schedules previously created through the board.
- `schedules: []` clears them. Removing an entry deletes its schedule.
- Reconciliation matches exact titles, preserving IDs, last-fire history, and
  the next-fire cursor when cron/status do not require rescheduling. Renaming
  a schedule removes the old row and creates a new one.
- Each workflow's schedule reconciliation and audit entries are transactional.
  Unchanged re-imports produce no schedule mutations.
- Existing collision behavior is retained: `skip` leaves schedules untouched;
  `replace` and the existing workflow `rename` behavior update the matched
  workflow. Renaming the workflow title can create a different workflow.
- Invalid structures, duplicate titles, invalid/non-firing cron expressions,
  empty input, and unsupported timezones fail before import mutations.
- Agent-safe imports cannot apply schedule lists, matching board-only schedule
  management. Import preview describes schedule application without applying it.
- Export emits the current list, including `[]`, without source IDs, actor
  metadata, or fire timestamps.

Active imported schedules become eligible after import; the scheduler chooses
future ticks and does not run at import time. Paused or archived workflows do
not start scheduled runs. The configuration repository is not watched: edits
take effect on re-import. The whole company import is not one transaction;
atomicity is limited to each workflow's schedule replacement.

## Alternatives Considered

| Alternative | Why not chosen |
|---|---|
| Separate schedule files and a second sync API | Duplicates discovery, authentication, and deployment orchestration. |
| Store schedules inside runner configuration | Scheduling belongs to the control plane and already has persisted records and a board UI. |
| Merge entries without removing missing ones | Deleted configuration would leave active schedules behind. |
| Add stable keys and ownership columns now | Requires a migration and another management model; exact unique titles fit the existing schema. |
| Watch or fetch the configuration repository automatically | Adds lifecycle/deployment behavior beyond the existing explicit import path. |
| Extend the handwritten YAML subset parser | Risks silently truncating Markdown bodies or misreading common YAML syntax. |

## Consequences

- **Positive:** Scheduling is version-controlled alongside ADK definitions and
  works with the Citro bundle/import pipeline. Round trips include schedules,
  and reconciliation does not duplicate timers.
- **Negative / Trade-offs:** Explicit lists override board schedule changes on
  re-import; titles are identity, and UTC schedules do not adjust for local
  daylight-saving changes. UI-created duplicate titles must be made unique
  before exporting their workflow as a package.
- **Neutral:** No database migration, runtime change, or Citro-specific scheduler
  is needed. The server adds the `yaml` parsing dependency. Re-import repairs
  schedule drift introduced through the board.

## References

- [Workflow schedule configuration](../../doc/DEVELOPING.md#repository-managed-workflow-schedules)
- [Company portability contract](../../doc/SPEC-implementation.md#21-company-portability-package-v1-addendum)
- [Routine→Workflow invocation contract](0002-routine-workflow-invocation-contract.md)
- `server/src/services/company-portability.ts`
- `server/src/services/workflow-schedules.ts`
