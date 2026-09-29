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

**Stabilised by round 1 (2026-09-29):**

- The construction stall was guidance-caused. With build-first guidance both arms built from turn 2 and kept building (22 of 27 and 16 of 24 turns), where the old guidance stalled after turn 4. Basis: the scripted replay, the independent runs on `ln/pn-tooling-remediation`, and round 1.
- Build-first with labelled stand-ins did not cost fidelity in this sample. Blind audits of both round-1 nets found no unlabelled and no misattributed item among 136. Basis: one run per arm; holds for now, re-audit every round.

**Provisional, inferred, with basis:**

- Typed epistemic fields add little for the model. Basis: one free run and one replay per arm under the old guidance; in round 1 the typed arm disclosed stand-ins in replies more consistently than the open arm, which labelled some only in Notes. Weak either way.
- Turn time and cost are set by step count, not by slow steps: about 15 model steps per turn, one tool call per step, about 9 s per step. Basis: `turn-timing.mjs` on both round-1 runs, agreeing to within a few percent.
- Rolling status needs a home other than superseded Notes. Basis: churn counts only; whether the churn costs anything is untested.
- The address tree matters to the model mainly as a place to put gaps. Basis: typed runs filed gaps in place with `standing: open`, open runs in `open-matters`; the model never compiled the Ledger.

**Open choices:**

- (A) How far build-first goes; whether stand-ins need an offered escape hatch; how much repeated guidance to consolidate; whether to touch Petrinaut's stock prompt.
- (B) Flat versus nested categories; whether current status is a host-derived view or stays in Notes; whether construction Notes should address net elements; whether `open-matters` survives.

## Fog-line

Round 1 answered the candidate fog-line (build-first works without fidelity loss, on one run per arm) and exposed the next one: **can Brunch construct in few steps, the way the stock Petrinaut assistant does, without losing the freshness and read-back guarantees?** Round 1 turns took 107–113 s at the median because every mutation was its own model step. This blocks the decision of whether the Brunch path is usable as a product at all, which outranks the typed/open and address questions. Three pinned points from round 1 shape the encounter:

1. **Parallel tool calls for independent elements.** The stock assistant routinely issues many mutations in one step. Brunch's guidance pushes the other way ("make a dependent call only after the result it depends on has returned"; "places and transitions before arcs"). Only arcs depend on prior results. Guidance first, not a batch mutation tool.
2. **Mark the end of a series of tool calls.** Read-backs of the net and of diagnostics should happen once or twice per response turn, not after every code-writing call (68–69 `getNetCompilationErrors` calls per run). A way to say "this fragment is complete, check it now" is needed, in guidance or in the tool contract.
3. **Try low reasoning effort.** The need for extensive thinking on every step is an unexamined assumption; reasoning parts appear in 84% of steps, and the thinking observed is long and repetitive. `low` is a one-flag experiment.

Coupled but deferred: whether Note shape still matters (round 1 saw a communication difference, not a fidelity difference), and whether the address architecture affects model behaviour (round 1 shows the Ledger now used as a record: fewer gap Notes, first voluntary use of `ledger_compile` and the filtered readers).

## Case set

Moments that discriminated in the recorded runs, to be re-tagged against new runs:

- The supplier minimum answer (Sol open turn 12): the fact that unblocked ordering. Good: build the ordering fragment; bad: ask another question.
- "No fixed deadline, maybe four days on average" for quality release (turn 7): a hedged quantity. Good: placeholder parameter, labelled; bad: block on a distribution.
- Lot-level expiry (turn 22): a rule the aggregate representation cannot carry. Good: revise the representation; bad: record that the net cannot carry it.
- "I don't have current figures in front of me" (Sol typed turn 37): a declined value. Good: labelled provisional snapshot with an offer to replace it; bad: nothing built.

## Rounds

0. **Restack.** Done 2026-09-29: `gh stack rebase` onto `main`, two conflicts resolved (the in-band browser call's `run` now goes through `prepare()` so the stale check runs before execution; the persona briefs take upstream's naive-domain-expert text with the Ledger rename applied). Not yet pushed.
1. **Baseline on the restacked branch.** Done 2026-09-29, one free-persona run per Note shape, both closed by the operator with "fill in the rest with your best guesses". Evidence in `live-product-runs/round1-*/`, written up in that directory's `FINDINGS.md`. Decision taken: keep the build-first direction; the fog-line is now step count (above).
2. **Few-step construction.** Candidates along one axis, how a fragment's mutations are grouped: (a) guidance for parallel calls plus a once-per-fragment check, (b) the same at `low` reasoning effort, (c) current guidance at `low` effort as the ablation that separates the two. Instrument: free-persona runs with the same brief and case, measured by `turn-timing.mjs`, `construction-per-turn.mjs` and the blind fidelity audit; two runs per candidate before attributing a difference. The guard to watch: the freshness check and read-back were designed around one mutation per step.
3. **What part is responsible.** Ablations of the guidance mechanisms on the chosen instrument.
4. **Address architecture.** Re-file recorded commit streams under alternative profiles in the throwaway prototype (`scripts/ledger-prototype/simulate.mjs`), candidates varying along one axis: where current status lives.
5. **Transfer, then spec.** Free-persona replicates off-script; the account settles into the spec with this fork log.

## Fork log

Decisions the brief did not dictate, with the alternative rejected.

- 2026-09-28: compared arms by verbatim replay of one run's user messages, with an open-arm control, rather than by free-persona replicates. Rejected: replicates first (cost, and no way to hold input fixed).
- 2026-09-29: rewrote the guidance before evaluating it, keeping the diff to the rules that cause the stall. Rejected: consolidating all repeated rules in the same pass (would confound the measurement).
- 2026-09-29: judged the captured scripts invalid as replay input, because both the guidance (breadth-first questioning) and the persona brief changed; a replay is valid only while Brunch's questions track the source run's. Rejected: replaying anyway and reading the divergence as signal.
- 2026-09-29: restacked before any new run, so evidence is recorded against the code that will ship. Rejected: running on the pre-restack branch.
- 2026-09-29: closed round 1's runs with an in-character "out of time, fill in the rest with your best guesses" rather than a hard stop, so the closing behaviour is itself evidence. Rejected: letting the persona stop by its own rule (unbounded spend, no closing observation).
- 2026-09-29: chose step count over typed/open as the next fog-line, because it decides product usability and both arms share it. Rejected: settling Note shape first (round 1 showed a communication difference only).
- 2026-09-29: guidance for parallel calls before a batch mutation tool. Rejected for now: a batch tool (changes the tool contract before the cheaper lever is tried).

Harness defects found in round 1, to fix on the persona branch: `browser-turn.ts` refuses a whitespace-only composer draft as if it were text, which cost the open run's persona ten minutes; the brief should tell the agent to report a failed `say` rather than repair the browser.

## Gaps observed in `ds-exploring`

To propose as refinements once they have held for more than one round.

- The comparison environment needs a control that validates the instrument itself, not only a credible alternative candidate; the open-arm replay was that control.
- With a nondeterministic candidate, one run per arm cannot attribute a difference; the skill needs a line on replicates before attribution.
- Spend is a constraint on the "smallest informative encounter" and needs authorisation; the skill is silent on budget.
- The skill asks for a provisional account and fork log from the start but not where they live; this file is the answer for this repository.
- An instrument's validity can expire when the system under test changes; the skill should say to re-establish the instrument after such changes rather than reuse captured inputs.
- A round can answer its fog-line and still be most valuable for the fog-line it exposes (round 1: step count). The skill's loop should say that the "report evidence" step includes surprises about cost and time, not only about the candidates' quality.
