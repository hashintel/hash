# Assemble the spec

Type: task
Status: open
Blocked by: 04, 05, 06, 07, 09, 10, 11, 12, 13

## Question

Assemble the destination spec from the resolved decisions: architecture + contract decomposition + questioning-UX contract + shipping shape + first milestone against the confirmed dev-target portfolio. Non-goals (harness-agnosticism) and the elicitor→executor seam named explicitly. This is the map's terminal deliverable; resolving it ends the effort.

## Comments

**2026-08-10 (pre-assembly prep, HITL).** Three prep items completed ahead of this ticket:

- **Second-target rename decided**: the target is the **assurance argument**, package `plugin-assurance` (recorded on the [Formal-verification canon survey](09-formal-verification-canon-survey.md); ticket 09's category-error verdict discharged). Propagate over the historical `elicit-proof-obligations` occurrences in tickets 02 and 07.
- **Cross-ticket consistency pre-pass**: [notes/consistency-prepass-2026-08-10.md](../notes/consistency-prepass-2026-08-10.md) — the assembler's working checklist. Contents: **seven contradictions** the spec must adjudicate, each with an authoritative-side recommendation (C1 storage-port implementer; C2 op purity vs PluginContext storage methods; C3 derived capture status changes 04's envelope schema; C4 `deferred (explicit)` lacks a transport mechanism; C5 provenance rule vs kernel invariant 1's declared defaults; C6 one-live-affordance slot vs multiplexed forms; C7 wake-wart remedy and reply binding must be picked together); **fourteen stale statements** (S1–S14) so nobody re-imports superseded material — notably 03's partly-overturned classification table and the requirement to restate the ten kernel invariants in current vocabulary; the **42-item "the spec must…" checklist** (§3b) collected from every ticket; and the **amendment-order reading guide** (§4) — read tickets in that order, treating 01/02/03 as lookup sources.
- **Sizing corrected**: ~54K tokens total — map + glossary + tickets (~42K) **plus the two inbox docs** (`agentic-elicitation-challenges`, `agentic-elicitation-criteria`, ~13K), which ticket 04 adopts by reference and by count, so the spec cannot be assembled without reading them. Fits one session raw; no digest subagents needed.

**New blocker added**: [Walking skeleton: sweep seam on Flue](13-walking-skeleton-sweep-seam.md) — the pre-pass found the sweep seam unproven on the committed substrate (no settlement-trigger lifecycle event exercised, no proven harness path to read a session entry range; items L1–L3). Decision (HITL, 2026-08-10): prove it before assembly. Its resolution also completes the substrate-capability list this spec must enumerate.

Also fold in when drafting: the glossary needs the envelope vocabulary added (pre-pass L11–L12) — capture envelope, evidence span, epistemic status, absence state, resolution record, supersession, pack, issue, kernel card, PluginContext, storage port — and a ruling on the "kernel card" / "kernel invariants" compounds vs the glossary's "avoid: kernel".
