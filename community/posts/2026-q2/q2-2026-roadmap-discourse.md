# Bizbox Q2 2026 Roadmap Update

**Published:** May 2026  
**Category:** Announcements  
**Tags:** roadmap, release-notes, community

---

## What's Coming in Q2 2026

We're early in Q2 and already shipping steady progress on **Artifacts & Work Products**, improved **routine execution**, and better **observability** across the control plane.

### Key Themes for Q2

**1. Artifacts & Work Products (In Progress → Shipping)**

The first in-progress milestone from the roadmap is moving forward. Recent releases include:
- **Artifact persistence for issue-backed runs** (v0.0.8) — outputs from agent work are now durable and surfaced in the UI
- **Agent thread chat with optimistic UI updates** (v0.0.7) — better real-time visibility into what agents are doing and what they produce

These changes are the foundation for making agent outputs more visible, easier to operate, and ready to hand off to the next stage of a workflow.

**2. Routine Execution & Stability**

Scheduled work should feel reliable:
- **Enhanced routine execution handling and testing** (v0.0.6) — better coverage and more predictable behavior for scheduled agent work
- **Kill switch** (v0.0.5) — safer operator control for stopping runaway work

**3. OpenTelemetry Metrics (New)**

We added **OpenTelemetry metrics** (v0.0.6) as the first step toward better observability across agents, tasks, and control-plane operations. This sets up future work on monitoring, alerting, and tracing.

**4. Multi-Agent Runtime Support**

We shipped **Otto Agent adapter** (v0.0.5) integration, continuing the "bring your own agent" story. Bizbox is designed to work with multiple agent runtimes — not just OpenClaw.

---

## Why These Priorities

These themes map directly to the most common operator feedback:

- **"I want to see what the agent produced."** → Artifacts & Work Products milestone
- **"I need routine work to run reliably."** → Routine execution polish
- **"I want observability without building my own metrics."** → OpenTelemetry
- **"I want to use agents that aren't OpenClaw."** → Multi-runtime support (Otto, future: Cursor, e2b)

The broader north star is still the same: keep the control plane thin, make outputs visible, and let operators run diverse agent ecosystems without forcing them into a single vendor's runtime.

---

## Where to Contribute

If you're interested in contributing to these areas, start here:

### Artifacts & Work Products
- Check the [Artifacts milestone](https://github.com/zesthq/bizbox/milestone) for tagged issues
- Look for `good first issue` labels in the repo for smaller entry points

### Routine Execution
- Test scheduled routines in your own Bizbox deployments and report edge cases
- Improve test coverage for scheduled work (see recent PRs for examples)

### Observability
- Experiment with the OpenTelemetry metrics integration
- Propose additional metrics or tracing spans for control-plane visibility

### Multi-Runtime Support
- Try the Otto adapter and share feedback
- Propose additional agent runtime integrations (Cursor, e2b, custom runtimes)

---

## Roadmap Timeline

The public roadmap is updated **quarterly** (Jan / Apr / Jul / Oct). This update reflects:
- Progress since the last update (Q1 2026)
- Current work-in-flight for Q2
- No changes to longer-term milestones (Memory/Knowledge, Cloud/Sandbox agents, Enterprise SSO, RBAC, Kubernetes/Helm)

We'll refresh again in **July 2026** for Q3.

---

## Get Involved

- **Repository:** [github.com/zesthq/bizbox](https://github.com/zesthq/bizbox)
- **Roadmap:** [ROADMAP.md](https://github.com/zesthq/bizbox/blob/master/ROADMAP.md)
- **Discussions:** Right here! Let us know what you think about these priorities

As always: if you want to work on roadmap-level core features, please coordinate with us first before writing code. Bugs, docs, polish, and tightly scoped improvements are still the easiest contributions to merge.

---

**Discussion Prompts:**
- Which of these Q2 themes are you most interested in?
- Are you already using Bizbox with OpenClaw or another agent runtime?
- What observability features would help you most?

*This is part of our quarterly roadmap update series. We'll refresh again in July 2026 for Q3.*
