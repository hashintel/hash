# Multi-session elicitation & durable target state

Type: grilling
Status: resolved
Resolved: 2026-08-10

## Question

What is the multi-session model for elicitation: the target state that endures independently of sessions, the per-session evidence logs, and the semantics of leaving, resuming, and interleaving sessions against one target?

Graduated from the map's "Spec permanence / sessions-roam-across-specs" fog by the capture-sweep logic-prototype (issue 11), whose model already decomposes cleanly for this: the capture store (captures, issues, events) as durable, session-independent truth; session logs as per-session evidence streams, each with its own swept high-water mark; the sweep as the only bridge between them. Evidence spans become session-qualified; idempotence keys already anchor on evidence and extend without redesign; the single-hop supersession refusal doubles as the stale-session lost-update guard; "the world changed since my last entry" is a computable re-entry fact (captures created/superseded since this session's last sweep).

Prior art (brunch history, from the HITL reaction on issue 11): brunch v1 assumed one-session elicitation and it proved brittle and constraining; v2's direction made the elicited artifact durable beyond and independent of the sessions contributing to it — start a session, leave it unresolved, open another that picks up from the current state of truth, later return to the first, which must then understand that the world moved between its last entries and whatever it writes next.

Sub-questions:

- What exactly is durable — captures + issues + events only, or projections/artifacts too? What is stored vs derived?
- Session identity and lifecycle: what *is* a session in this model (one conversation? one substrate dispatch chain?), and what state is strictly per-session?
- Interleaved or concurrent sessions against one target: are the single-hop supersession refusal plus a re-entry advisory sufficient coordination, or is more needed (locking, merge, explicit sync events)?
- Re-entry briefing: what is a resuming agent told — unswept tail, world-moved delta, open issues — and in what form (advisory facts? the interpretation render)?
- What does this do to the persistence-plugin-owned hypothesis and the storage port (feeds Shipping shape, issue 06) and to the spec's session vocabulary (feeds Assemble the spec, issue 08)?

## Answer

> Resolved by HITL grilling, 2026-08-10 (two rounds; frontier exhausted, every branch confirmed).

### The model: durable target-document, transient sessions, sweep as the only bridge

**Terms** (pinned in `CONTEXT.md`): the family/instance collision on "target" resolves by compound disambiguation, not a fresh noun — **target-domain** = the artifact family a plugin defines (gherkin, proof obligations); **target-document** = the durable unit sessions attach to: one target-domain + its capture store + its session history. Bare "target" stays legal where context disambiguates. The instance-noun names the unit by its *purpose*; the spec states plainly that its authoritative state is the capture store, never the render.

1. **What is durable.** Durable truth = the capture store (captures, issues, events) **plus all session logs** — provenance must resolve forever; discarding swept logs would dead-end every capture's evidence spans. This is "corrections don't erase history" applied at the store level. Projections/renders/artifacts are strictly **derived**: cacheable, never authoritative.
2. **Session identity & lifecycle.** A session is **one substrate conversation** — Pi's own model (the log of all messages: user, agent, tool calls, custom/state messages), which Flue inherits. Strictly per-session state is exactly three things: the evidence log, the swept high-water mark, the pending-affordance slot. **No formal close**: sessions go quiet and stay resumable indefinitely; "ended" would be a fiction the harness cannot verify. The ragged edge (ending between settlement and sweep) is already handled by ticket 11's resume-time unswept-tail advisory.
3. **Concurrency: interleaved-only** (milestone one). The store is **serialized** — sweeps validate and apply atomically, a plain transactional guarantee, not a session lock. Staleness is optimistic: the **single-hop supersession refusal doubles as the stale-session lost-update guard** (a stale session superseding a moved head is refused, and the refusal carries the world-moved facts). Refusal granularity is **whole-sweep atomic** — matches the prototype; re-proposing is cheap once the advisory is digested (per-item partial application → fog). No locking, no merge, no sync events; true simultaneous-sweep coordination → fog, graduating only if a real concurrent consumer appears.
4. **Re-entry briefing.** Injected **state messages**, following Pi's custom-entry convention: authored *on behalf of the user* (compaction and session-branch summaries are the precedent — the transcript the model reads contains messages from or on behalf of the user summarizing important changes). Advisory-only, agent-facing, with a minimal user-visible insertion notice (as for other state changes). Content = the computed facts: unswept tail, world-moved delta (captures created/superseded and issues opened/closed since this session's last sweep; anchor = session start when it never swept), open issues, pending unanswered affordance. Harness computes, agent weighs — nothing forced; surfacing the world-moved summary conversationally is judgment guidance (kernel-card level), with the interpretation render available on request.
5. **Provenance principle, sharpened: only the *true* user's side is evidence.** The data model distinguishes true user entries from entries injected on the user's behalf. Capture evidence spans anchor only on true user (and user-affordance-payload) entries; injected advisories live in the log honestly — the session reads back complete — but are **never citable as capture evidence**. This generalizes ticket 11's resolution-record rule ("must cite the user's utterance") into one clean principle.
6. **Completion is derived, never a gate.** A target-document has no lock/terminal state: completion-contract satisfaction is a read-time **derived status** (same family as derived capture status and issue 09's derived labels). A user returning with a correction after "done" is the motivating story of this ticket.

### The storage flip (amends the standing hypothesis; feeds Shipping shape 06 and the spec 08)

**Persistence is not plugin-owned — the hypothesis is flipped.** Mapping persistence to the plugin was a conflation; the capture-sweep model already made the store harness mechanism (envelope invariants enforced as store-level refusals). The **storage port is harness-defined and binding-implemented**: the deploy target decides *how*, the plugin never touches persistence, and if storage is addressable from plugin code at all, it is only through **harness-defined methods passed via the injected PluginContext**. This aligns with (and sharpens) ticket 06's capability-list entry "persist state" and its remote-parity constraint "host-owned storage port".

**Evidence spans carry pointer + quoted excerpt**: session-id + range as the pointer, the load-bearing quote embedded in the capture. Provenance stays self-contained across local/remote differences in substrate log access; the substrate log remains the full record, the excerpt the citable quote.
