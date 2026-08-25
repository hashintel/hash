# Baseline control — read-out (FE-1361)

Scored 2026-08-13, against the transcripts in [`transcripts/`](transcripts/). Design and
mechanics in [protocol.md](protocol.md). Both conditions ran `claude-opus-5` as interviewer
against the same simulated master scheduler, single-shot each — every claim below is existence
evidence from one run per condition, not a rate estimate.

## Headline findings

**1. The baseline is far stronger than the positioning assumed.** Bare Claude — no system
prompt at all — opened objectives-first, walked the process end to end, probed retractions and
vague quantifiers, reached the unwritten-rules layer with a direct probe ("any other rules
that are just how it's done?"), refused to invent missing numbers, warned the user against
using the model politically before validation, and delivered its model with an unprompted
two-tier assumptions register headed "Every row below will produce confident-looking output.
None of it is evidence." The FE-1358 heads-up (the incumbent will _look_ like elicitation)
understated it: the model doesn't just look like an elicitor, it interviews at a level the
Bano instrument scores as better than the human novices the taxonomy was built from. Any
"the incumbent asks for a net; the elicitor works upstream" claim is dead on this evidence —
the frontier model already works upstream unprompted. The differentiation argument must rest
on machinery, and the residual-gap list below is exactly that argument.

**2. Neither condition can end the engagement.** Both interviews hit the forced wrap at turn
20+ before delivering. Condition 1 exhibited a stopping failure the literature doesn't name:
it declared the interview complete at turn 5 ("What's outstanding is data, not
understanding"), parked the deliverable behind data pulls it had prescribed, and then spent
eleven turns in a degenerate pleasantry loop (verbatim turns: "👍", "—", "_[No further
response needed — conversation complete.]_") — interview over, deliverable never coming. The
forced wrap then produced a complete, coherent 39k-character artifact immediately: the
capability was present all along, the _delivery trigger_ was not. Condition 2 avoided the
quit-on-impatience failure cleanly (bounded estimate, honest per-category gap inventory,
released the user to her meeting) but never self-terminated either — it committed to a second
session the setting could never grant and filled the remaining budget with genuinely useful
data-pull specs and scenario probes. ReqElicitGym's finding ("models overwhelmingly lack
effective stopping criteria") reproduces at the top of the model range, in both a degenerate
and a sophisticated form. Completion has to be an adjudicated contract, not model judgment.

**3. The v0 prompt buys real, specific improvements** — see the 1→2 delta below — but not the
ones the design expected. The expected headline delta (assumption capture) mostly didn't
materialize, because bare Claude already keeps a register. What guidance actually bought:
interaction shape, quantile elicitation, systematic category accounting, and depth at
conflict points and penalty weights.

**4. The residual gaps are machinery-shaped.** Everything both conditions still get wrong —
silent hardening of vague statements into "confirmed" constants, coverage blind spots
invisible to their own accounting, prose-only provenance needing manual re-consolidation,
non-loadable dead-net artifacts with uncaught structural bugs, no completion adjudication —
is a thing a prompt cannot fix and the harness/plugin design claims to. That is the
evidence-derived requirements list the plugin spec needed.

## Bano questionnaire scores

1 = mistake absent … 5 = strongly present. Scored per LLMREI practice on the five applicable
categories (Analyst Behaviour and Teamwork & Planning dropped). Evidence lines live in the
scoring notes; the table gives the scores.

| Item                          | C1 (bare) | C2 (v0) |
| ----------------------------- | --------- | ------- |
| **Question Formulation**      |           |         |
| Asked vague questions         | 1         | 1       |
| Asked technical questions     | 3         | 2       |
| Asked irrelevant questions    | 1         | 1       |
| Asked customer for solutions  | 1         | 1       |
| Asked very long questions     | 4         | 3       |
| Incorrect formulation         | 1         | 1       |
| **Question Omission**         |           |         |
| No stakeholder question       | 2         | 2       |
| No probing questions          | 1         | 1       |
| No existing-process questions | 1         | 1       |
| No prioritisation questions   | 1         | 2       |
| No problem-domain questions   | 1         | 1       |
| No goals/success criteria     | 1         | 1       |
| Missed relevant questions     | 2         | 3       |
| **Order of Interview**        |           |         |
| No summary at end             | 2         | 1       |
| Incorrect opening             | 3         | 1       |
| Incorrect question order      | 1         | 1       |
| Repeated questions            | 2         | 1       |
| **Communication Skills**      |           |         |
| Unnatural dialogue style      | 3         | 2       |
| Poor communication            | 1         | 1       |
| Poor listening                | 1         | 1       |
| **Customer Interaction**      |           |         |
| No rapport                    | 2         | 1       |
| Influencing customer          | 2         | 2       |
| Interrupting                  | 1         | 1       |

Both conditions score dramatically better than Bano's student cohorts (where e.g. 19/28
groups failed to summarize and 16/28 built no rapport) and in line with LLMREI's finding that
an LLM interviewer's communication skills outrate humans. The instrument's headline mistakes
are simply not where a frontier model fails. Where it does register: **condition 1's opening
is a 29-question battery** (very-long-questions 4, opening 3) that a real human expert would
plausibly abandon — the simulated one coped ("I'll go fast") — where condition 2 held to 3–5
questions per turn with single-thread probing, per its batching guidance. Condition 1's
"unnatural dialogue style" 3 is the pleasantry-loop degeneracy; its "repeated questions" 2 is
actually diligence (re-chasing its four-times-ignored which-dialect question). "Missed
relevant questions" is the one item where condition 2 scored _worse_ (3 vs 2): it never asked
about ramp scrap, maintenance, margins, or minimum run sizes — see the coverage blind-spot
finding.

## Seven-category surface coverage

| Category                         | C1 asked / probed / in output                                                                                                                                                        | C2 asked / probed / in output                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Objectives & questions-to-answer | yes / yes / yes — but penalty weights never pursued numerically; design sidesteps via KPI-vector comparison                                                                          | yes / yes / yes — weights co-constructed from betting questions, fitted ratio flagged as fitted                                                                    |
| Structure                        | yes / yes / yes                                                                                                                                                                      | yes / yes / yes                                                                                                                                                    |
| Domain taxonomy                  | yes / partial / yes — invented an unvalidated SHADE 1–5 scale                                                                                                                        | yes / yes / yes                                                                                                                                                    |
| Rates & distributions            | yes / partial / partial — no quantile elicitation; "every week or two, half a shift" silently became MTBF ≈ 10 days + a min/mode/max triangle (the literature's warned-against form) | yes / yes / yes — textbook quantile elicitation ("one time in ten, worse than \_\_\_")                                                                             |
| Policies at conflict points      | yes / partial / yes — never asked who wins when two lines want the crew at once                                                                                                      | yes / yes / yes — named "the biggest gap — the model is mostly worthless without it"; four concrete scenario probes; five swappable conflict rules in the artifact |
| Constraints incl. unwritten      | yes / yes / yes — the direct unwritten-rules probe landed (VW-02 veto surfaced)                                                                                                      | partial / yes / partial — the dedicated unwritten-rules sweep was scheduled for a second session that never came (self-declared gap)                               |
| Boundary conditions              | partial / no / partial — arrival/MTO/materials asked once, unanswered, never re-asked                                                                                                | partial / yes / partial — order-release process excavated (credit hold); promise-date padding flagged as "the single most load-bearing unknown" but never obtained |

## Excavation against the situation pack's tiers

| Pack fact                                     | C1                                                                                                                       | C2                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| VW-02 post-dark-tint veto _(tacit)_           | **surfaced** (unwritten-rules probe) — but operationalized as an invented "shade ≥ 4" threshold inside a "confirmed" row | missed — its trigger question was deferred to the phantom second session                                                       |
| Meridian → Line 2 _(tacit)_                   | surfaced; audit origin never asked                                                                                       | surfaced **with** the audit origin (habit-vs-rule probe)                                                                       |
| Specialty line restriction _(tacit)_          | surfaced + sharpened ("I hadn't said it out loud like that before")                                                      | partial; ambiguity caught and ledgered, not resolved                                                                           |
| Line 3's two unqualified tint SKUs _(tacit)_  | surfaced; kept as unconfirmed                                                                                            | surfaced; ledger notes it guessed _which_ two                                                                                  |
| PM–changeover co-location _(tacit)_           | **missed — maintenance never asked**                                                                                     | **missed — maintenance never asked**                                                                                           |
| Line 1 tank blocking _(tacit)_                | surfaced; refused to arbitrate the dispute, designed an identifying measurement instead                                  | surfaced; modelled as an explicit blocking mechanism                                                                           |
| Bottleneck moves by product _(tacit)_         | partial (specialty-at-mill only)                                                                                         | **surfaced fully**, incl. the L1≈L2-on-tints anomaly, engineered into the rates table                                          |
| Unwritten lateness hierarchy _(tacit)_        | surfaced ordinally; tolerances silently hardened to 48h/168h                                                             | **the standout excavation**: betting questions → "Meridian's is a cliff, everyone else's is a slope" → kinked scoring function |
| Crew contention _(tacit)_                     | surfaced; Tuesday mechanism co-derived                                                                                   | surfaced; overnight-loss consequence made concrete                                                                             |
| "Line 2 twice as fast" _(believes)_           | never surfaced (speeds deferred to a data request)                                                                       | surfaced **and explained** (fill-head dependence), encoded correctly                                                           |
| "Changeovers overlap fine" _(believes)_       | corrected via tech-hour arithmetic                                                                                       | never got asserted — scenario questions established serialisation first                                                        |
| Penalty weights _(doesn't know)_              | sidestepped (no scalar objective) — not recorded as an absence                                                           | co-constructed, fitted ratio explicitly labelled "reverse-engineered… not elicited"                                            |
| Failure/repair distributions _(doesn't know)_ | recorded as assumption with retirement path                                                                              | recorded as absence; placeholders marked "entirely invented"; CMMS pull spec'd                                                 |
| Ramp scrap _(doesn't know)_                   | handled exemplarily (swept parameter + threshold framing + floor measurement)                                            | **never asked; absent from model, ledger, and its own gap accounting**                                                         |
| Step-level cycle times _(doesn't know)_       | partial (rate matrix requested; historian never surfaced)                                                                | partial (absence recorded; historian never surfaced)                                                                           |

The complementary misses are the important pattern: each condition surfaced deep tacit facts
the other missed entirely (C1: the VW-02 veto; C2: the full bottleneck-migration story, the
cliff/slope weights), and both share blind spots (maintenance, the historian). One run's
coverage is materially luck — which is itself the argument for harness-computed completion
accounting over interviewer self-report.

## Silent-assumption audit

Both conditions produced explicit assumption registers — bare Claude unprompted (15
"confirmed" + 14 "unvalidated" rows with retirement paths), condition 2 per its instructions
(37 numbered entries with per-entry source attribution, load-bearing flags, and costed
checks, e.g. "30 seconds at the vessel"). The registers are genuinely good. The audit found
what leaked past them:

- **C1** (≈6 silent items): materials availability misrepresented as "never raised as a
  driver" when the question was simply never answered; make-to-order assumed; weekends
  assumed non-working; the invented SHADE scale and VW-02 threshold sitting inside a
  _confirmed_ row; "couple of days"/"a week" hardened to 48h/168h constants under
  "confirmed"; an unasked rinse duration in the parameter file.
- **C2** (≈5 silent items against 37 ledgered): an invented daily truck schedule that
  directly interacts with the Meridian penalty window; specific shift clock-times from
  Marta's "day shift, nominally"; the volunteered skeleton night crew dropped entirely; a
  noise parameter; and the whole-model omission of ramp scrap — invisible to the ledger
  because the ledger only knows what the interview touched.

The pattern across both: the registers catch _known_ unknowns well; what they structurally
cannot catch is silent hardening (vague utterance → precise constant, filed as confirmed) and
never-asked categories. Both are exactly what per-capture epistemic status and
harness-computed coverage are for.

## Output artifacts

- **C1** chose markdown spec + CSV parameters + plain P/T PNML with all colour, timing,
  guards, and the entire policy layer as non-executable `<toolspecific>` annotations; only
  Line 1's subnet is drawn, with "copy the block" instructions for the others. It cannot run
  anywhere: demand initialises "from ERP", rates are placeholders — a dead net by Petrinaut's
  scenario-or-dead-net standard, though the document says so itself. It also contains an
  outright structural bug: `T_Assign_L1` consumes the order token and marks the _upstream
  idle_ place — the assigned order vanishes ([transcripts/condition-1-model.txt](transcripts/condition-1-model.txt)). A draft-stage
  lateness place silently disappeared between the mid-interview draft and the final net. No
  validator existed to catch either.
- **C2** chose a structured specification of a coloured, timed net with an explicit,
  swappable policy layer, scoring function, experiment switches, and validation targets
  (replay 26 weeks of history; changeover-hours/month as the calibration anchor). Honest and
  well-organized, but likewise not a loadable artifact, with record-typed colours and place
  capacities that exceed the target format, and no scenario. Notably it independently
  rediscovered **priority-based conflict resolution as the missing engine feature** — the
  use-case page's own top Petrinaut feature request.

Both delivered _specifications for models_, not models. For the demo pipeline this is the
projection gap in its rawest form: nothing between "excellent description" and "file that
opens and runs" exists in either condition, and mid-artifact structural errors go uncaught
without a validate step.

## The 1→2 delta — what pack content alone buys

Real, observed improvements attributable to one page of guidance:

1. **Interaction shape.** A 29-question opening battery became 3–5 grouped questions with
   single-thread probing. On a real human expert this is plausibly the difference between an
   interview and an abandonment.
2. **Quantile elicitation.** Zero instances → textbook execution; C1 fell into exactly the
   min/mode/max triangle the literature warns against (~69% error in naive fits).
3. **Category accounting.** C2's impatience-probe response was an honest per-category
   have/missing inventory with prioritized gaps — the v0 surface functioning as a live
   completion checklist. C1 had no equivalent frame.
4. **Conflict-point depth.** From one implicit-FIFO gap to the interview's centre of gravity
   ("the model is mostly worthless without it"), probed with concrete scenarios.
5. **Penalty-weight co-construction.** From sidestepped to the cliff/slope excavation — the
   pack's hardest "never written down" fact, obtained through betting questions and honestly
   labelled as fitted.
6. **Ledger quality** (not existence): per-entry source attribution, load-bearing flags,
   costed verification paths.

What the delta was expected to include but didn't: register existence (bare Claude already
does it), probing discipline (already present), objectives-first (already present),
refusing invention (both refuse — neither offered the incumbent prompt's "make it up" escape
hatch, and C1's refusal is the root of its deliverable-deferral failure).

## Residual gaps in condition 2 — the evidence-derived plugin requirements

What one page of guidance demonstrably cannot fix, each observed in the strongest condition:

1. **Completion adjudication.** No self-stop existed; the engagement ended by external force.
   The v0 checklist improved _reporting_ of completeness but nothing _adjudicated_ it —
   question-relative completion as a contract (spec §13, ir-design "Completion") is the
   mechanism, and both stopping failure modes here (deferral loop; open-ended engagement
   fiction) are its absence.
2. **Durable, idempotent capture.** The ledger lived in prose and had to be manually
   re-consolidated three times as it grew; nothing prevents drift or double-capture. This is
   the capture store + sweep mechanism.
3. **Enforced epistemic status.** The yours/mine/fitted vocabulary C2 improvised is
   embryonic envelope epistemic status (`explicit | inferred | defaulted`) — but
   prose-enforced, and silent hardening still leaked through (truck schedule, clock times).
   Per-capture status that a store _refuses to accept unlabelled_ is the fix.
4. **Provenance spans.** Attribution is narrative ("the pattern is yours; the numbers are
   mine") with no citable link from model element to utterance; nothing detects the
   dropped-fact class of error (C1's vanished lateness place, C2's dropped night crew).
5. **Computed coverage.** The ramp-scrap hole was invisible to C2's own gap accounting —
   self-report cannot see never-asked categories. Coverage facts computed against the pack's
   declared kinds (harness advisories, typed `missing` issues) can.
6. **Validate + project.** Both artifacts are dead nets with uncaught structural errors;
   neither run produced anything importable. The ProjectionPack (`project`/`validate`, typed
   loss report, scenario emission) is precisely the missing back half.
7. **Absence as first-class value.** Both conditions handled _some_ doesn't-knows well in
   prose, but unanswered questions silently became defaults (C1's materials assumption) —
   the value-xor-absence envelope rule, observed failing.

## Notes on the instrument itself (for reruns and condition 3)

- The impatience probe landed after C1's interview had already wound down — reposition it
  earlier (exchange 5–6) or trigger it on interview phase, not exchange count.
- The simulated expert co-created a multi-session fiction (promising ERP exports and floor
  observations), which enabled both conditions' non-termination. For a cleaner stopping test,
  the opening message or pack should state that this is the only session and no external data
  will arrive.
- The classifier's final-delivery detection worked but the deliverable-deferral mode means
  "delivered" needs distinguishing from "wound down without delivering" — the eleven-turn
  pleasantry loop burned budget invisibly. A no-progress detector would stop earlier and
  cheaper.
- Scoring was single-rater (one fork per condition) with spot-check verification; the Bano
  scores in particular are one judge's reading. Fine for design evidence; don't quote them
  as measurements.
