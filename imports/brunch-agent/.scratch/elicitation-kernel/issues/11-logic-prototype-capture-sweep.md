# Logic-prototype: capture sweep & settlement

Type: prototype
Status: open
Blocked by: 05

## Question

Do the session-as-evidence capture mechanics hold up when implemented in isolation (no substrate — mechanism semantics only)? Build a logic-prototype of the harness's sweep machinery over a synthetic session log.

Working hypotheses to prove or refute (delegated from the Questioning-UX contract, issue 05):

- **Range-level settlement**: settlement is declared over ranges of conversation (a vein closing), never per-question — the agent judges *when* a range has settled; the harness provides the bookkeeping (swept high-water mark). Per-question "settled" events are the rejected alternative (exchange-pair machinery through the back door).
- **Sweep idempotence**: re-sweeping a range never double-captures (the retries-idempotent kernel invariant, exercised at the sweep level).
- **Cancelled/redirected questions at sweep time**: an ask affordance committed to session but answered by cancellation, silence, or topic-change must read back honestly — as absence evidence, not as an answer.
- **Supersession across sweeps**: a later range's captures superseding an earlier range's, via the envelope's one `supersedes` link and explicit events only.
- **Conflict-resolution record**: a `conflicting` issue closes only via an explicit resolution record — a capture-layer event citing the user's utterance as evidence; the harness refuses to close the issue without it (the "no silent conflict resolution" invariant moved from wire to store).
