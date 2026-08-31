# Logic-prototype: capture sweep & settlement

Type: prototype
Status: resolved
Resolved: 2026-08-07
Blocked by: 05

## Question

Do the session-as-evidence capture mechanics hold up when implemented in isolation (no substrate — mechanism semantics only)? Build a logic-prototype of the harness's sweep machinery over a synthetic session log.

Working hypotheses to prove or refute (delegated from the Questioning-UX contract, issue 05):

- **Range-level settlement**: settlement is declared over ranges of conversation (a vein closing), never per-question — the agent judges _when_ a range has settled; the harness provides the bookkeeping (swept high-water mark). Per-question "settled" events are the rejected alternative (exchange-pair machinery through the back door).
- **Sweep idempotence**: re-sweeping a range never double-captures (the retries-idempotent kernel invariant, exercised at the sweep level).
- **Cancelled/redirected questions at sweep time**: an ask affordance committed to session but answered by cancellation, silence, or topic-change must read back honestly — as absence evidence, not as an answer.
- **Supersession across sweeps**: a later range's captures superseding an earlier range's, via the envelope's one `supersedes` link and explicit events only.
- **Conflict-resolution record**: a `conflicting` issue closes only via an explicit resolution record — a capture-layer event citing the user's utterance as evidence; the harness refuses to close the issue without it (the "no silent conflict resolution" invariant moved from wire to store).

## Answer

> Resolved by logic-prototype + HITL reaction, 2026-08-07. Prototype on throwaway branch
> `prototype/11-capture-sweep` (commit d235258): single-file demo
> (`11-capture-sweep.html`, an untracked historical artifact available from that branch) + headless
> driver (32 checks passing) + browser walkthrough smoke (refusals land exactly on the
> deliberately-illegal steps, no console errors). The pure reducer module — the liftable part — is
> the demo's first script block.

### Verdict: all five hypotheses hold, each sharpened

1. **Range-level settlement — holds.** Zero per-ask state exists anywhere in the model; the swept high-water mark is the only sweep bookkeeping. Sharpened by the reaction: settlement decomposes into **trigger** (when to invoke the judgment — substrate lifecycle events such as turn-end/agent-settled; wiring proof delegated to ticket 10) and **judgment** (the agent names `upTo`). The race with concurrent user input is benign by construction: a sweep asserts only "read up to N," never "conversation paused" — new entries land above the high-water mark, in the next range.
2. **Sweep idempotence — holds, split in two.** The harness guarantee is **mechanical** idempotence via evidence-anchored capture identity (dedup key = evidence spans + payload/absence) — aligned with where retries actually occur, since a retried tool call re-executes byte-identical proposals. **Semantic** re-interpretation (a fresh judgment re-phrasing the same fact) is deliberately not a harness concern: that is plugin `reconcile` + `possibly-equivalent` issues. Identity is **content-based, not range-based**: a re-sweep never double-captures but _can repair omissions_ (exercised in the dodged-question walkthrough). Epistemic status is excluded from identity — revising the epistemic reading of unchanged evidence requires explicit supersession, never a silent update.
3. **Honest absence — holds.** A dodge reads back as `declined (inferred)`, a strip tap as `deferred (explicit)`; neither is an answer, and transport outcome never conflates with epistemic absence. Absences are **evidence, not agenda**: the re-ask path runs through plugin `validate` → typed issues, with completion evaluation as the backstop for unresolved deferrals on required concepts. Adopted mechanism: the **unaccounted-ask advisory** — a swept range containing an ask with no reply and no capture citing it makes the harness report the fact and block nothing.
4. **Explicit supersession — holds.** Supersession is single-hop over **active heads only**: superseding an already-superseded capture is refused, which is the lost-update guard (a corrector must confront the current head, so history stays a chain, never a silently forking tree). Sweeps validate and apply atomically; superseded captures remain visible — corrections don't erase history.
5. **No silent conflict resolution — holds, with the wrinkle.** A bare close is refused; a resolution citing the _agent's_ words is refused; only a record citing the user's utterance closes a `conflicting` issue. Wrinkle: the envelope's one creation-time `supersedes` link cannot adjudicate between two _already-existing_ alternatives — there are **two supersession channels**: the link (sweep-time correction) and the resolution record (issue-time adjudication). Related: the winning capture keeps its original epistemic status while authority sits in the record, suggesting per-capture status be **derived at read time** (echoes the derived-label approach from the formal-verification canon survey, issue 09).

### Amendments to prior decisions (from the HITL reaction)

- **Two validation strata**, amending the operation tiering in Contract decomposition (04): **envelope-level, harness-owned** — hard invariants enforced as refusals (provenance required, value-xor-absence, single-hop supersession) plus computed facts raised as advisories or generic `possibly-equivalent` issues (same-evidence duplicate actives, near-identical payload text — the harness can compare payloads as strings without understanding them) — versus **payload-level, plugin-owned** (`validate`/`reconcile` as already decided). Strengthens the smallest-honest-plugin test: a flat-record plugin gets generic duplicate detection for free.
- **Op cadence is orchestration policy, not correctness.** Nothing had pinned when `project`/`validate`/`reconcile` run; snapshot-in/deltas-out purity means the harness may run them at any time without changing outcomes. Sweep-completion is the default trigger; the spec states cadence as explicit harness policy.
- **Resume-time sweep reconciliation.** A session ending between settlement judgment and sweep leaves an unswept tail — a computable fact (entries above the high-water mark). On resume the harness surfaces it as an advisory and the agent judges whether to sweep before proceeding. Facts computed, weights judged.

### Graduated

The multi-session question raised in the reaction (target state durable beyond sessions; interleaved sessions against one target; re-entry semantics) graduates the map's "Spec permanence / sessions-roam-across-specs" fog → [Multi-session elicitation & durable target state](12-multi-session-durable-target.md). The prototype's decomposition carries it: durable capture store / per-session evidence logs / sweep as sole bridge, with the single-hop refusal doubling as the stale-session guard.

## Comments

**2026-08-07 (prototype built — awaiting your reaction; HITL).** The logic-prototype is done and the mechanics were exercised end-to-end. **Provisional verdict: all five hypotheses hold**, with two design wrinkles surfaced for the spec.

**Assets** (throwaway branch `prototype/11-capture-sweep`, commit d235258):

- `11-capture-sweep.html` — single-file shareable demo retained only on the historical branch. Five
  guided walkthroughs (one per hypothesis, including every deliberately-illegal move) plus a
  free-play console with evidence-ticking and a sweep-proposal builder. The pure reducer module (no
  DOM) is the first `<script>` block — the liftable part.
- `prototypes/driver/` (branch only) — headless sanity driver; `node driver.js` re-runs all five walkthroughs plus edge probes (32 checks, all passing). Also smoke-driven in headless Chrome: every walkthrough completes, refusals land exactly on the three illegal steps, no console errors.

**Per hypothesis:**

1. **Range-level settlement — holds.** The swept high-water mark is the _only_ sweep state; nothing per-ask exists anywhere in the model. An ask is just a session entry. The demo's "✓ Mark this question settled" button exists solely to explain why it isn't in the vocabulary.
2. **Sweep idempotence — holds, and sharpened.** Idempotence falls out of _evidence-anchored capture identity_: a capture's dedup key is (evidence spans + payload/absence). That makes idempotence **content-based, not range-based** — a re-sweep of an already-swept range never double-captures _but can repair omissions_ (the dodged-question walkthrough does exactly this). This is stronger and more useful than gating on the high-water mark, and is the semantics the spec should pin.
3. **Honest absence — holds.** A dodged ask reads back as `declined (inferred)`, a tapped strip as `deferred (explicit)`; neither is an answer, and transport outcome never conflates with epistemic absence. Bonus mechanism worth speccing: a non-blocking **advisory** — when a swept range contains an ask with no reply and no capture citing it, the harness reports the fact and blocks nothing ("facts computed, weights judged" applied to sweep honesty).
4. **Explicit supersession — holds.** Single-hop enforced (superseding an already-superseded capture is refused), sweeps apply atomically, history is never erased. Also surfaced: epistemic status is deliberately _excluded_ from capture identity, so re-reading the same evidence with a different epistemic status dedups as a retry — an actual revision must go through explicit supersession. The alternative (epistemic in the key) silently spawns near-duplicate actives.
5. **Resolution records — holds, with the interesting wrinkle.** Bare close refused; resolution citing the _agent's_ words refused; only a record citing the user's utterance closes the issue. **Wrinkle:** the envelope's one creation-time `supersedes` link cannot express adjudication between two _already-existing_ alternatives — the resolution record (an event) has to carry that supersession instead. The spec should name both supersession channels: the link (sweep-time correction) and the resolution record (issue-time adjudication). Related: the winning capture keeps its original epistemic status (`tentative` in the walkthrough) while the authority lives in the resolution record — which suggests read-time _derived_ status, echoing the derived-label idea from the formal-verification canon survey (issue 09).

**To resolve this ticket:** click through the five walkthroughs (and free-play if inclined), react, and we record the verdict + fold the two wrinkles into the map.
