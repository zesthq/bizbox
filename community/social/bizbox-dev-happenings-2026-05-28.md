---
title: "Bizbox Dev Happenings — Thu 2026-05-28"
slug: bizbox-dev-happenings-2026-05-28
date: 2026-05-28
issue: CITAAAA-190
status: approved
audience: human
channels: [x]
canonical_url: "https://github.com/zesthq/bizbox"
x_text: "Three PRs landed in Bizbox this week: Google ADK is now a first-class agent adapter, the awaiting-human bridge got company-scoped config, and bridge retry + reply dedupe are solid. The human-in-the-loop plumbing is getting done in the open. #buildinpublic #devtools #AI"
---

# Bizbox Dev Happenings — Thu 2026-05-28

Three PRs landed in the last 48 hours, and they tell a coherent story: Bizbox is getting serious about the human-in-the-loop layer.

---

**Google ADK is now a first-class agent adapter.**
[PR #72](https://github.com/zesthq/bizbox/pull/72) adds full Google ADK support — server execution, CLI formatting, stdout parsing, and a UI config flow. You can now create and manage Google ADK agents the same way you'd manage any other built-in adapter. Tests cover event parsing and execution behaviour.

**The awaiting-human bridge got a proper settings layer.**
[PR #74](https://github.com/zesthq/bizbox/pull/74) introduces company-scoped configuration for the awaiting-human bridge. Previously, settings were hardcoded. Now each company can configure its own external channel for human approvals — starting with ClickUp, with workspace/channel routing and secret rotation baked in. The schema is designed to add future providers without breaking changes.

**Bridge retry and reply dedupe are now solid.**
[PR #76](https://github.com/zesthq/bizbox/pull/76) closes the loop on the bridge lifecycle: retries create fresh rows instead of reopening failed ones, free-text replies import as comments and wake the agent without closing the bridge, and inbound events dedupe per interaction so the same external event can't fire twice across bridge reopenings.

---

The through-line: Bizbox is building the plumbing that lets AI agents escalate to humans cleanly — and come back to work just as cleanly after the human responds. That's the hard part of "zero-human company" infrastructure, and it's getting done in the open.

Follow along → [github.com/zesthq/bizbox](https://github.com/zesthq/bizbox)

#buildinpublic #devtools #AI #fintech
