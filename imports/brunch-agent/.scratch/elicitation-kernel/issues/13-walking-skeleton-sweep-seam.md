# Walking skeleton: sweep seam on Flue

Type: prototype
Status: open

## Question

Prove the four substrate capabilities the capture-sweep machinery assumes but no prototype has exercised on Flue — the unproven seam between ticket 10's transport skeleton and ticket 11's synthetic-log logic-prototype, surfaced by the [2026-08-10 consistency pre-pass](../notes/consistency-prepass-2026-08-10.md) (items L1–L3):

1. **Settlement trigger** — a substrate lifecycle event (turn-end / agent-settled) that invokes the agent's settlement judgment. Ticket 11 recorded this as "wiring proof delegated to ticket 10", but ticket 10 contains no settlement or lifecycle-event finding; the claim was a misattribution (L1).
2. **Read a session entry range** — harness code reading the entries it sweeps. Ticket 01 found no documented path to Pi's message list from inside a Flue agent; ticket 10 proved read-back only on the ui side via `useFlueAgent`; ticket 11 ran against a synthetic log. The hinge between the two prototypes is proven nowhere (L2).
3. **Inject an on-behalf-of-user state entry** — the carrier for ticket 12's re-entry briefing. Candidate: Flue's `kind: 'signal'` message with trusted-code attributes (ticket 01 §6), which would also yield the true-user-versus-injected provenance distinction for free.
4. **Transactional durable store distinct from per-conversation state** — ticket 12 requires whole-sweep-atomic application (and refusals) across sessions; conversation-scoped `usePersistentState` cannot provide it (ticket 01).

Success = a minimal Flue walking skeleton (seeded from `prototype/10-flue-roundtrip`) that wires ticket 11's pure reducer (`prototype/11-capture-sweep`) to a real session log through these four capabilities. The resolution amends Shipping shape's six-item substrate-capability list — these are its four missing entries (pre-pass L3) — or records what Flue lacks or forbids and what the Flue binding must therefore absorb (binding-size asymmetry is expected, per ticket 06).

Blocks: [Assemble the spec](08-assemble-the-spec.md).
