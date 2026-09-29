# Ledger rework: exploration account

The provisional account for a coordinated rework of (A) Brunch's prompt, skill and tool guidance and (B) the Ledger's sectioning and address architecture. Kept under the `ds-exploring` discipline: the description below is a hypothesis, and each round ends at a decision. Started 2026-09-29; revise in place and mark what has stabilised.

Background: [construction guidance review](construction-guidance-review.md) and the [live-run findings](../../scripts/ledger-prototype/evidence/live-product-runs/FINDINGS.md).

## Goal

Brunch keeps a recoverable, cheap account of what it learns while building the net progressively, without presenting invented facts as elicited. (A) and (B) are two levers on that goal and are coupled: where gaps live shapes what steers the interview, and what construction Notes must say shapes what addresses they need.

## Premise sort

**Firm, on the user's word:**

- The Ledger is append-only and rebuilt from conversation history, not stored separately.
- The model supplies nothing the host can derive mechanically.
- No invented content presented as the person's.
- Ledger cost must not grow with conversation length.
- New paid runs happen only on the restacked branch; captured scripts from earlier runs are invalid as replay input (see fork log).

**Provisional, inferred, with basis:**

- The construction stall is guidance-caused, not persona-caused. Basis: the scripted replay of 2026-09-28 and independent runs on `ln/pn-tooling-remediation`. Fairly stable.
- Typed epistemic fields add little for the model. Basis: one free run and one replay per arm. Weak.
- Rolling status needs a home other than superseded Notes. Basis: churn counts only; whether the churn costs anything is untested.
- The address tree matters to the model mainly as a place to put gaps. Basis: typed runs filed gaps in place with `standing: open`, open runs in `open-matters`; the model never compiled the Ledger.

**Open choices:**

- (A) How far build-first goes; whether stand-ins need an offered escape hatch; how much repeated guidance to consolidate; whether to touch Petrinaut's stock prompt.
- (B) Flat versus nested categories; whether current status is a host-derived view or stays in Notes; whether construction Notes should address net elements; whether `open-matters` survives.

## Fog-line

Not yet identified. The candidate that most changes direction is whether build-first with labelled stand-ins produces progressive construction without fidelity loss; two coupled uncertainties are whether Note shape still matters once guidance is fixed, and whether the address architecture affects model behaviour at all. Choosing among these, and choosing the instrument, waits on the first runs of the restacked branch, because both the guidance and the persona harness changed since the last evidence.

## Case set

Moments that discriminated in the recorded runs, to be re-tagged against new runs:

- The supplier minimum answer (Sol open turn 12): the fact that unblocked ordering. Good: build the ordering fragment; bad: ask another question.
- "No fixed deadline, maybe four days on average" for quality release (turn 7): a hedged quantity. Good: placeholder parameter, labelled; bad: block on a distribution.
- Lot-level expiry (turn 22): a rule the aggregate representation cannot carry. Good: revise the representation; bad: record that the net cannot carry it.
- "I don't have current figures in front of me" (Sol typed turn 37): a declined value. Good: labelled provisional snapshot with an offer to replace it; bad: nothing built.

## Rounds

0. **Restack.** Done 2026-09-29: `gh stack rebase` onto `main`, two conflicts resolved (the in-band browser call's `run` now goes through `prepare()` so the stale check runs before execution; the persona briefs take upstream's naive-domain-expert text with the Ledger rename applied). Not yet pushed.
1. **Baseline on the restacked branch.** Free-persona runs with the new guidance and the new persona brief, one per Note shape, to see what the new conditions produce. Decision: name the fog-line and the instrument.
2. **The fog-line's encounter.** Whatever round 1 selects, with an open-arm control if the instrument is a replay, a blind fidelity audit, and replicates before attributing any difference.
3. **What part is responsible.** Ablations of the guidance mechanisms on the chosen instrument.
4. **Address architecture.** Re-file recorded commit streams under alternative profiles in the throwaway prototype (`scripts/ledger-prototype/simulate.mjs`), candidates varying along one axis: where current status lives.
5. **Transfer, then spec.** Free-persona replicates off-script; the account settles into the spec with this fork log.

## Fork log

Decisions the brief did not dictate, with the alternative rejected.

- 2026-09-28: compared arms by verbatim replay of one run's user messages, with an open-arm control, rather than by free-persona replicates. Rejected: replicates first (cost, and no way to hold input fixed).
- 2026-09-29: rewrote the guidance before evaluating it, keeping the diff to the rules that cause the stall. Rejected: consolidating all repeated rules in the same pass (would confound the measurement).
- 2026-09-29: judged the captured scripts invalid as replay input, because both the guidance (breadth-first questioning) and the persona brief changed; a replay is valid only while Brunch's questions track the source run's. Rejected: replaying anyway and reading the divergence as signal.
- 2026-09-29: restacked before any new run, so evidence is recorded against the code that will ship. Rejected: running on the pre-restack branch.

## Gaps observed in `ds-exploring`

To propose as refinements once they have held for more than one round.

- The comparison environment needs a control that validates the instrument itself, not only a credible alternative candidate; the open-arm replay was that control.
- With a nondeterministic candidate, one run per arm cannot attribute a difference; the skill needs a line on replicates before attribution.
- Spend is a constraint on the "smallest informative encounter" and needs authorisation; the skill is silent on budget.
- The skill asks for a provisional account and fork log from the start but not where they live; this file is the answer for this repository.
- An instrument's validity can expire when the system under test changes; the skill should say to re-establish the instrument after such changes rather than reuse captured inputs.
