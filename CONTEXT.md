# Bizbox

Bizbox is a control plane for autonomous AI companies. Its core work model is company-scoped, board-visible work tracked through issues, comments, approvals, and agent threads.

## Language

**Issue**:
The core unit of work in Bizbox, scoped to a company and used to track execution, status, ownership, and progress.
_Avoid_: Ticket, task item, work card

**Awaiting Human Bridge**:
A company-scoped bridge record that links an issue interaction in `awaiting_human` flow to an external messaging thread and normalizes outbound delivery plus inbound human replies.
_Avoid_: Generic chat bridge, chat sync, transport glue

**Awaiting Human Bridge Transport Adapter**:
The provider-specific layer that sends notifications, polls the external channel, and handles provider-side transport reactions or markers.
_Avoid_: Bizbox workflow service, settings store, bridge lifecycle owner

**ClickUp Message Acknowledgement**:
The provider-side `thumbsup` reaction that the ClickUp adapter adds to a reply message after a poll returns new inbound events, indicating Bizbox has consumed that reply.
_Avoid_: Main-thread state marker, Bizbox comment, workflow state, approval signal

**ClickUp Message State Reaction**:
The provider-side reaction that marks the original ClickUp message as active while the bridge is open and completed when the bridge closes.
_Avoid_: Reply acknowledgement, Bizbox comment, workflow state

**Inbox Item**:
A first-order object that independently belongs in an inbox view and can carry its own inbox state and actions.
_Avoid_: Any visible row, nested row

**Contextual Row**:
A supporting row rendered inside another object's presentation to give visibility into related context without becoming an independent inbox item.
_Avoid_: Child inbox item, second-class issue

**Related Work**:
Issue-to-issue reference context shown as `References` or `Referenced by`, derived from explicit issue mentions in titles, descriptions, comments, or documents.
_Avoid_: Dependency graph, linked ticket

**Inbox Filter Contract**:
The rule that every visible issue row in an inbox view must satisfy the active inbox filters for that view.
_Avoid_: Best-effort filtering, parent-only filtering

**Relationship Precedence**:
The rule that when one issue qualifies for multiple nested placements, the stronger work-structure relationship decides where it appears.
_Avoid_: Duplicate placement, equal-priority relationships

## Relationships

- An **Awaiting Human Bridge** belongs to one Bizbox work object that is waiting on human input
- An **Awaiting Human Bridge** can deliver outbound messages to an external channel and import inbound human replies back into Bizbox
- A **ClickUp Message Acknowledgement** is a transport acknowledgement applied by the ClickUp adapter after a poll returns new events
- A **ClickUp Message State Reaction** marks the original ClickUp message as `brain_is_thinking` while open and `white_check_mark` when closed
- An **Issue** may appear as an **Inbox Item** when it independently matches the inbox query
- A **Contextual Row** appears under an **Inbox Item** and does not become its own **Inbox Item** by presentation alone
- **Related Work** is rendered as **Contextual Rows** under an expanded **Issue**
- The **Inbox Filter Contract** applies to nested **Related Work** rows as well as top-level **Inbox Items**
- **Relationship Precedence** favors child placement over related-work placement when both apply

## Example dialogue

> **Dev:** "If an issue is shown under `Referenced by`, is that another inbox item?"
> **Domain expert:** "No. It is a contextual row under the parent issue. It can be opened and inspected, but it does not inherit inbox actions just because it is visible there."

> **Dev:** "Can a referenced issue show up under a filtered parent even if it doesn't match the active inbox filters?"
> **Domain expert:** "No. If it's visible as an issue row in the inbox, it must satisfy the active inbox filters too."

> **Dev:** "If the same issue is both a child and a reference, do we show it twice?"
> **Domain expert:** "No. Show it once as a child. Parent-child is the stronger relationship."

> **Dev:** "When a human replies in ClickUp, is that reply itself the work object?"
> **Domain expert:** "No. The external thread is only transport. The **Awaiting Human Bridge** imports the reply back onto the Bizbox work object."

## Flagged ambiguities

- "bridge" was ambiguous between generic chat transport and approval/handoff transport — resolved: **Awaiting Human Bridge** is the core concept; provider adapters implement channel-specific delivery and ingestion
- "acknowledgement" was ambiguous between internal workflow completion and provider-side message handling — resolved: **ClickUp Message Acknowledgement** is the provider-side `thumbsup` reaction added after the adapter observes new events on poll
- "state reaction" was ambiguous between reply acknowledgement and bridge lifecycle state — resolved: **ClickUp Message State Reaction** marks the original message as open/closed status via `brain_is_thinking` and `white_check_mark`
- "nested row" was ambiguous between an independent inbox object and supporting presentation context — resolved: `References` and `Referenced by` rows are **Contextual Rows**, not independent **Inbox Items**
- "related context in a filtered inbox" was ambiguous between strict and best-effort filtering — resolved: the **Inbox Filter Contract** still applies to nested **Related Work** rows
- "multiple nested relationships" was ambiguous between duplication and precedence — resolved: child placement wins over related-work placement
