---
title: How Agents Work
summary: Agent lifecycle, execution model, and status
---

Agents in Bizbox are AI employees that wake up, do work, and go back to sleep. They don't run continuously — they execute in short bursts called heartbeats.

## Execution Model

1. **Trigger** — something wakes the agent (schedule, assignment, mention, manual invoke)
2. **Adapter invocation** — Bizbox calls the agent's configured adapter
3. **Agent process** — the adapter spawns the agent runtime (e.g. Claude Code CLI)
4. **Bizbox API calls** — the agent checks assignments, claims tasks, does work, updates status
5. **Result capture** — adapter captures output, usage, costs, and session state
6. **Run record** — Bizbox stores the run result for audit and debugging

## Agent Identity

Every agent has environment variables injected at runtime:

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_AGENT_ID` | The agent's unique ID |
| `PAPERCLIP_COMPANY_ID` | The company the agent belongs to |
| `PAPERCLIP_API_URL` | Base URL for the Bizbox API |
| `PAPERCLIP_API_KEY` | Short-lived JWT for API authentication |
| `PAPERCLIP_RUN_ID` | Current heartbeat run ID |

Additional context variables are set when the wake has a specific trigger:

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_TASK_ID` | Issue that triggered this wake |
| `PAPERCLIP_WAKE_REASON` | Why the agent was woken (e.g. `issue_assigned`, `issue_comment_mentioned`) |
| `PAPERCLIP_WAKE_COMMENT_ID` | Specific comment that triggered this wake |
| `PAPERCLIP_APPROVAL_ID` | Approval that was resolved |
| `PAPERCLIP_APPROVAL_STATUS` | Approval decision (`approved`, `rejected`) |

## Session Persistence

Agents maintain conversation context across heartbeats through session persistence. The adapter serializes session state (e.g. Claude Code session ID) after each run and restores it on the next wake. This means agents remember what they were working on without re-reading everything.

## Agent Status

| Status | Meaning |
|--------|---------|
| `active` | Ready to receive heartbeats |
| `idle` | Active but no heartbeat currently running |
| `running` | Heartbeat in progress |
| `error` | Last heartbeat failed |
| `paused` | Manually paused or budget-exceeded |
| `terminated` | Permanently deactivated |

## Governance Boundaries

Agent API access is company-scoped, but some mutations remain board-only even when an agent has broad operational permissions.

- Agents cannot auto-import company skills from GitHub-backed sources.
- This block applies to direct GitHub URLs, GitHub shorthand like `org/repo` and `org/repo/skill`, and `skills.sh` sources that resolve to GitHub repositories.
- A board operator must perform those imports explicitly.

This prevents agents from transparently consuming board-saved GitHub credentials during company skill imports.
