# Questioning-UX contract

Type: grilling
Status: open
Blocked by: 03

## Question

What is the kernel's generic questioning-UX contract — the successor to brunch's `ask` / `present_*` / `request_*` exchange family — critiqued rather than copied?

Sub-questions:

- Which of brunch's exchange forms earn a place in the generic contract, which generalize with changes, which are brunch-specific and stay behind?
- What does the "one high-value question over several low-value questions" dialogue policy need from the UX contract (question budgets, visible current interpretation, distinguish not-mentioned/no/unknown/N-A)?
- How do typed issues (missing/ambiguous/conflicting/invalid/unsupported/unmapped/low-confidence) render as user-facing exchanges?
- What must the contract leave to the host surface (TUI vs. web vs. chat channel) vs. fix in the kernel?

Input from Contract decomposition (issue 04): the exchange contract must carry the envelope's conversation-level semantics — **absence states** (`unknown-to-user | declined | deferred | not-applicable`… as answer outcomes, not null), **alternatives** (letting more than one interpretation stay live through an exchange), and conflict-resolution exchanges (an explicit resolution event for a `conflicting` issue). Dialogue policy is behavioral guidance + factual issue queue — the UX contract renders issues to the agent, never scores them.

Note from the Flue deep-read (issue 01): Flue has **no first-class ask-the-user primitive** — the kernel must own a turn-suspension protocol (`terminate: true` tool + pending question in persistent state + structured data part; the answer arrives as a fresh dispatch). The UX contract should be designed with that as the remote rendering path (`useDataWriter` / `dynamic-tool` output parts), alongside richer local surfaces.
