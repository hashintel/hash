# Multi-session elicitation & durable target state

Type: grilling
Status: open

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
