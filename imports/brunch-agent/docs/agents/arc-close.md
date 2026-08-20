# Arc close: the consolidated sweep

One triggerable checklist for closing a work arc. Before this file existed, three protocols
each carried an arc-close step in prose — `legibility.md` (consolidation),
`issue-tracker.md` (registry audit), `documentation.md` (inbox sweep) — with nothing that
actually fired them together; this file is that trigger. It sequences the mechanical steps;
it does not replace the legibility protocol's own closing move (render into another register,
read the strain), which runs alongside it for any arc with significant agent-generated output.

**Trigger**: before `gt submit` ties off a branch that closes an arc, or whenever an arc is
declared closed. Each step reports its outcome explicitly — a step that finds nothing reports
*clean*, never silence (absence of signal is not health).

1. **Inbox sweep** (`documentation.md`, ingest step 4): empty `docs/inbox/` — every item
   settles (`docs/reference/` for source material, the effort's `docs/planning/<effort>/` for
   working artifacts) or is deleted with its `INDEX.md` line recording the disposition. Fix
   inbound links, repo-side and Linear-side.
2. **INDEX pass**: coverage is enforced mechanically (`test/docs-index.test.ts`); this step
   checks what the gate can't — for every row the arc touched, the status is true, the digest
   matches current content, and the *used by* column is current.
3. **CONVERGENCE re-evaluation** (`docs/planning/_shared/CONVERGENCE.md`): update the
   status-ledger rows the arc changed; if the arc landed, filed, or re-weighted any issue,
   re-run the cross-map sequencing evaluation and date it.
4. **Registry audit** (`issue-tracker.md`): run the audit command; every open issue must be
   reachable from a root. An orphan gets a parent or an explicit CONVERGENCE listing —
   silence is not an option it has.
5. **Tense repair**: grep the living documents (`docs/planning/_shared/`, `docs/agents/`,
   `CONTEXT.md`) for the issue IDs the arc filed or closed, and repair prophecy into history —
   "FE-1422 will extract" becomes "extracted (FE-1422)". A living document must stay
   intelligible to a reader who cannot resolve an issue ID (see the reference convention in
   `documentation.md`).
