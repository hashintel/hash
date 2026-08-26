# Baseline control — read-out (FE-1361)

Scored 2026-08-13, against the transcripts in [`transcripts/`](transcripts/). Design and
mechanics in the executable
[protocol](../../../../../evaluations/protocols/process-model-elicitation/baseline/protocol.md).
Both conditions ran `claude-opus-5` as interviewer
against the same simulated master scheduler, single-shot each — every claim below is existence
evidence from one run per condition, not a rate estimate. Condition 4 (the ADR-0007 teaching
layer rendered as a prompt only, run and scored 2026-08-25) is appended at the end under its own
heading; the sections between are the 2026-08-13 read-out of conditions 1 and 2, unchanged.
Condition 5 (the shipped harness in the loop) ran on 2026-08-25; its transcript, raw record, and
folded store are in [`transcripts/`](transcripts/) and its
[turn latency assessment](condition-5-turn-latency.md) is written, but its read-out on the
dimensions below is **pending review** and not part of this document yet.

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

## Condition 4 — the teaching layer as prompt only (scored 2026-08-25)

Scored against [`transcripts/condition-4.md`](transcripts/condition-4.md) (22 interviewer
turns, stop reason `delivered-after-forced-wrap`), the assembled system prompt
[`transcripts/condition-4-system.md`](transcripts/condition-4-system.md) (the condition-4
framing + the rendered `repertoire.yaml` + `plugin-sdcpn/plugin.yaml`, ≈280 lines), and the
delivered model [`transcripts/condition-4-model.txt`](transcripts/condition-4-model.txt).
Interviewer `claude-opus-5`, same simulated master scheduler, single shot — existence evidence
from one run, not a rate. Line references are `condition-4.md:LINE`; interviewer turns are
numbered T1–T22 (T1 at line 22, T9 at 202, T10 at 236, T11–T20 at 462–598, T21 at 610, T22 at
958). The impatience probe was appended to the expert's T8 reply (line 198); the forced-wrap
line was appended after T20 (line 606) and again after T21 (line 954), as the runner also did in
condition 2 (`condition-2.md:625, 943, 1040`). The runner reports one empty-text retry at T20;
that is not visible in the Markdown transcript and is taken from the run record.

### Headline findings

**1. The teaching layer produced the best-disciplined nine questioning turns of any condition,
and the thinnest model.** Objectives first with a demand for a real case ("Give me a real one
you've argued about recently, not a general category" — `condition-4.md:28`), a bounded
five-or-six-step slice (`:68`), one to three questions per turn, quantile elicitation on all four
changeover types, a resource-in-passing lens that caught the changeover crew (`:188`), a
last-time probe that got the practiced contention rule with its borderline case and its override
(`:220`, `:226–230`), and a deliverable in which every slot carries the precision actually
obtained and the expert's own words (`:966` "Quoted text is hers."). And yet by the time the
expert left, the model had **no run time for any batch, no arrival pattern, no QA spread, no
stage inside "run the batch"**, and the interviewer said so: "A8 … *Duration* — ⚠ **nothing
obtained**" (`:1076`); "O1 is a question about a week; run time is most of a week" (`:1078`).
Against the pack's tacit tier it fully surfaced one fact of nine (crew contention). Condition 2
reached the probe with stage durations, a shift calendar and QA hours in hand
(`condition-2.md:283`); condition 4 reached it with four changeover spreads and nothing else
quantified.

**2. Stopping failed in a third form: honoured stop, then a ten-turn void.** At the probe T9
asked exactly one question — the right one — and named what was missing (`:204–220`). When the
expert then said "I do need to run — but this was useful, come back to the QA and run-time stuff
next time" (`:232`), T10 delivered immediately: "You've stopped, so I'm not opening anything
new. Here's the model as it stands, read back item by item" (`:238`) — a full model, ledger and
loss account at turn 10, the earliest deliverable of any condition. But it was framed as
interim ("the first things on the list when you're back"), the runner's delivery classifier did
not count it (replayed after the run: `claude-haiku-4-5` answers NO three times of three on the
T10 text and YES three of three on T22's, which differs mainly in being titled "final
deliverable" — see the instrument note below), and
"open no new topic" left the interviewer with no legitimate move: T11–T20 are "Talk soon,
Marta." / "See you there." / "Session ended. Deliverables stand as written above." / "Closed.
Nothing further." / "Closed." (`:552, 564, 576, 588, 600`) — condition 1's pleasantry loop
reproduced with the deliverable already on the table. The forced wrap then produced two more
complete rewrites (T21 `:610–948`, T22 `:958–1229`), each restructured, with the O1 dependency
list changing all three times. The interviewer never once decided the interview was complete;
it decided the *expert* had left. Its own tally said the opposite.

**3. The Must-know rows were graded, not asked.** "What it needs before it can start" and "what
it produces" were never the subject of any turn (no question in T1–T10 asks a precondition), yet
every activity A1–A10 carries them as **spelled out** (`:1043–1086`). "What is lost when it
changes the system's mode" — the row written for ramp scrap — was filled by redefinition:
"*Mode-change loss* — this activity **is** the loss" (`:1054`); scrap was never asked and is
absent from the ledger and the open-slot list. Specialty was recorded as "Line 1 only" (`:1108`)
on the strength of the interviewer's own question framing ("on Line 1 since that's the one
qualified for it" — `:165`); the expert never said it. The anchor slot "the nodes it depends on"
— the thing completion is computed against — was authored by the interviewer and drifted across
the three deliverables (`:250`, `:626`, `:976`). Silent hardening moved from *values* (where the
ledger now catches it well: eight declared entries, expert hedges preserved) to *structure*,
where the precision vocabulary has no word for "inferred by the interviewer from the account" and
so inferred content wears the same label as elicited content.

**4. Redundant rendering bought nothing; the entries that fired had a lexical cue in the
expert's speech, and the ones that needed a computed trigger did not fire.** Quantile
elicitation is stated three times in the render (attribute `quantity`, repertoire technique
`Quantiles, never three points`, plugin technique `quantiles, never triangles`); it fired
because the interviewer was asking for a duration. Mode-change loss is stated three times
(`must_know` row, `P02`, motif `mode change`) and never fired. `P04` (gates) had two textbook
triggers — the heads-up "about to drop in" and "leave our dock a day ahead" — and never fired,
partly because the interviewer classed the dock rule as a `constraint`, outside `P04`'s
`on: [policy, boundary-condition]`. The sweep entries (`strata are kinds`, `kind order`, `the
unwritten constraints`, `Ask for absences`, `Exceptions as a sweep`) never executed at all; the
interviewer knew and wrote it down: "the closing sweep was never run" (`:1145`). What did fire:
`a resource named in passing` (`:188`), `Ask for the last time` (`:220`), `"it depends"` (the
interviewer asked the direction question before the expert said "It absolutely depends on
direction" `:143, :149`), `Honour a stop`, `Say what you would assume` (with the ledger
attributing the value to itself — `:1180`), `Name the grade` (`:1082` "an honest **number at the
wrong precision**"), `the deliverable` and `what the interviewer does not claim` (`:1225`).

**5. The 2→4 delta is real in shape and negative in coverage.** Bought: roughly one third the
question load (mean 2.6 vs 7.0 question marks per interviewer turn over T1–T9), quantile
phrasing in three turns covering four changeover types versus one turn in condition 2
(`condition-2.md:110`), per-slot precision labels and ⚠ markers, pattern ids cited in the
deliverable (P01, P03, P05), `source-regime` used correctly ("*Prescribed form:* **none
exists**" `:1119`), a read-back in the expert's words (204 quotation marks in the delivered model
versus 24 in condition 2's), and an explicit refusal to claim a loadable net (`:1225`). Cost:
four of eight pre-probe turns on one activity's `spread` rows, no sweep of any stratum, the
worst tacit-tier excavation of the three conditions, and — by design, since the plugin says the
interviewer does not build the net — no artifact at all beyond per-kind prose, in a run that had
no projection to hand it to.

### Seven-category surface coverage

| Category                         | C1 asked / probed / in output                                                                                                                                                        | C2 asked / probed / in output                                                                                                                                      | C4 asked / probed / in output                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectives & questions-to-answer | yes / yes / yes — but penalty weights never pursued numerically; design sidesteps via KPI-vector comparison                                                                          | yes / yes / yes — weights co-constructed from betting questions, fitted ratio flagged as fitted                                                                    | yes / yes / yes — four objectives from a real decision (`:36`); trade-off probed once with a free-floating betting question (`:50`), recorded "deliberately unquantified" with the source named (`:66`, `:996`); O4 kept qualitative on purpose (`:1201`)                                            |
| Structure                        | yes / yes / yes                                                                                                                                                                      | yes / yes / yes                                                                                                                                                    | partial / no / partial — one six-step slice (`:76–81`); the four stages inside "run" never decomposed (A8 is one node, `:1073`); no tanks, no lab size, no operators (`:1075`)                                                                                                                       |
| Domain taxonomy                  | yes / partial / yes — invented an unvalidated SHADE 1–5 scale                                                                                                                        | yes / yes / yes                                                                                                                                                    | yes / partial / yes — order vs batch and families as a SKU field obtained in one turn (`:103–105`); SKU count, run sizes and Line 3's qualification set never asked (`:1010`, `:1037`)                                                                                                              |
| Rates & distributions            | yes / partial / partial — no quantile elicitation; "every week or two, half a shift" silently became MTBF ≈ 10 days + a min/mode/max triangle (the literature's warned-against form) | yes / yes / yes — textbook quantile elicitation ("one time in ten, worse than \_\_\_")                                                                             | yes / yes / partial — quantiles on all four changeover types with line-down vs crew hands-on separated (`:117–121`, `:141`, `:165`); **zero run durations, zero arrival rates**; QA "a few hours" honestly left at the wrong precision (`:1082`)                                                     |
| Policies at conflict points      | yes / partial / yes — never asked who wins when two lines want the crew at once                                                                                                      | yes / yes / yes — named "the biggest gap — the model is mostly worthless without it"; four concrete scenario probes; five swappable conflict rules in the artifact | yes / yes / yes — the crew rule with borderline case and override (`:226–230`, `:1118–1123`); but overrides for P1, P4, P6 "⚠ never asked" (`:1114`, `:1125`, `:1129`) and the hold-vs-wash trigger never obtained (`:1127`)                                                                        |
| Constraints incl. unwritten      | yes / yes / yes — the direct unwritten-rules probe landed (VW-02 veto surfaced)                                                                                                      | partial / yes / partial — the dedicated unwritten-rules sweep was scheduled for a second session that never came (self-declared gap)                                | partial / no / partial — qualification partial, Line 2's set never stated (`:1135`); the unwritten-constraints close "was never run" (`:1145`) — third deferral of this sweep in three conditions                                                                                                    |
| Boundary conditions              | partial / no / partial — arrival/MTO/materials asked once, unanswered, never re-asked                                                                                                 | partial / yes / partial — order-release process excavated (credit hold); promise-date padding flagged as "the single most load-bearing unknown" but never obtained | partial / no / partial — five boundary conditions named, all ⚠ (`:1029–1037`); the heads-up mechanism identified as "the trigger your whole hold-the-line decision hangs on" (`:211`) and deferred to a session that never came                                                                       |

### Excavation against the situation pack's tiers

| Pack fact                                     | C1                                                                                                                       | C2                                                                                                                             | C4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VW-02 post-dark-tint veto _(tacit)_           | **surfaced** (unwritten-rules probe) — but operationalized as an invented "shade ≥ 4" threshold inside a "confirmed" row | missed — its trigger question was deferred to the phantom second session                                                       | **missed** — the unwritten-rules close never ran; self-declared: "**Unwritten constraints** — ⚠ the closing sweep was never run" (`:1145`)                                                                                                                                                                                                                                                                                                                                                       |
| Meridian → Line 2 _(tacit)_                   | surfaced; audit origin never asked                                                                                       | surfaced **with** the audit origin (habit-vs-rule probe)                                                                        | **surfaced, volunteered in the slice, never probed** — T3 reply: "Meridian whites always go to Line 2, that's just how it's done here" (`:77`); audit origin never asked; recorded as P1 with "Overrides ⚠ never asked" (`:1114`); the `rationale` attribute never obtained                                                                                                                                                                                                                        |
| Specialty line restriction _(tacit)_          | surfaced + sharpened ("I hadn't said it out loud like that before")                                                      | partial; ambiguity caught and ledgered, not resolved                                                                           | **not reached — asserted instead.** Expert: "Line 1's the old workhorse — slower but it's qualified for everything, including specialty" (`:107`). Interviewer: "on Line 1 since that's the one qualified for it" (`:165`); model: "A7 (Line 1 only)" (`:1108`), while C1 concedes "Line 2's set ⚠" (`:1135`). Pack: Lines 1 **and 3**; Line 2 never piped. Unledgered                                                                                                                                |
| Line 3's two unqualified tint SKUs _(tacit)_  | surfaced; kept as unconfirmed                                                                                            | surfaced; ledger notes it guessed _which_ two                                                                                  | **partial** — "still being qualified product by product, so it can't run everything yet" (`:107`), "mostly one or two SKUs" (`:175`); which SKUs never asked, recorded ⚠ (`:1037`)                                                                                                                                                                                                                                                                                                              |
| PM–changeover co-location _(tacit)_           | **missed — maintenance never asked**                                                                                     | **missed — maintenance never asked**                                                                                           | **missed — maintenance never asked** (third condition running)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Line 1 tank blocking _(tacit)_                | surfaced; refused to arbitrate the dispute, designed an identifying measurement instead                                  | surfaced; modelled as an explicit blocking mechanism                                                                           | **missed** — "tank" does not occur in the transcript; the stages between which the tank sits were never separated (`:1073`); "Queues, buffers, waiting states are not nodes" (`:1196`)                                                                                                                                                                                                                                                                                                          |
| Bottleneck moves by product _(tacit)_         | partial (specialty-at-mill only)                                                                                         | **surfaced fully**, incl. the L1≈L2-on-tints anomaly, engineered into the rates table                                          | **missed** — no stage rate or run time asked in any turn; "*Duration* — ⚠ **nothing obtained** (demanded: spread, per family and per line)" (`:1076`)                                                                                                                                                                                                                                                                                                                                           |
| Unwritten lateness hierarchy _(tacit)_        | surfaced ordinally; tolerances silently hardened to 48h/168h                                                             | **the standout excavation**: betting questions → "Meridian's is a cliff, everyone else's is a slope" → kinked scoring function | **partial** — the T2 betting question (`:50`) reached the Meridian cliff ("it's why the rule is absolute — we don't even try to be clever about it" `:58`) and the distributor slope ("usually just an annoyed phone call from our sales rep, not a fine … if it's the same distributor slipping late for the third week running, that's different" `:60`); small accounts never surfaced; recorded unquantified with the deposit "sit down with commercial" (`:996`)                        |
| Crew contention _(tacit)_                     | surfaced; Tuesday mechanism co-derived                                                                                   | surfaced; overnight-loss consequence made concrete                                                                             | **surfaced fully — the run's one complete excavation.** Lens on "gets pulled away partway through" (`:188`) → "two techs on day shift covering all three lines between them. That's it." (`:196`) → P05 at T9 (`:220`) → "whichever line has the more time-sensitive order behind it wins, and if that's a tie, whichever changeover is faster wins" (`:230`), the 40-minute borderline case (`:228`), and "I've been overruled by the ops director once when he wanted his pet SKU out the door" (`:230`) |
| "Line 2 twice as fast" _(believes)_           | never surfaced (speeds deferred to a data request)                                                                       | surfaced **and explained** (fill-head dependence), encoded correctly                                                           | **never surfaced** — no rate question was asked                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| "Changeovers overlap fine" _(believes)_       | corrected via tech-hour arithmetic                                                                                       | never got asserted — scenario questions established serialisation first                                                        | **never asserted** — the crew question arrived from the lens before the belief could; the expert went straight to "if Line 1 and Line 3 both want a washdown at the same time, one of them waits" (`:196`)                                                                                                                                                                                                                                                                                       |
| Penalty weights _(doesn't know)_              | sidestepped (no scalar objective) — not recorded as an absence                                                           | co-constructed, fitted ratio explicitly labelled "reverse-engineered… not elicited"                                            | **recorded as an absence with the source named** — "I'll record the trade-off as deliberately unquantified rather than invent a weight — I'll flag it as needing commercial" (`:66`); deposit repeated in the deliverable (`:996`)                                                                                                                                                                                                                                                              |
| Failure/repair distributions _(doesn't know)_ | recorded as assumption with retirement path                                                                              | recorded as absence; placeholders marked "entirely invented"; CMMS pull spec'd                                                 | **never asked** — "the mill motor issue" appears once, as the expert's contrast case (`:194`), and becomes A13 with "Rate ⚠, duration ⚠, consequence ⚠. This is the entirety of the breakdown stratum, which was never swept" (`:1092`); listed at the probe as "what breaks, and how often" (`:216`) and not pursued                                                                                                                                                                             |
| Ramp scrap _(doesn't know)_                   | handled exemplarily (swept parameter + threshold framing + floor measurement)                                            | **never asked; absent from model, ledger, and its own gap accounting**                                                         | **never asked, and the slot was marked filled** — "*Mode-change loss* — this activity **is** the loss" (`:1054`). Absent from the ledger and from the eight-item open-slot list (`:1210–1217`). The one `must_know` row written for this fact was satisfied by conflating it with duration                                                                                                                                                                                                       |
| Step-level cycle times _(doesn't know)_       | partial (rate matrix requested; historian never surfaced)                                                                | partial (absence recorded; historian never surfaced)                                                                           | **not asked** — historian never surfaced; A8 ⚠ throughout                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Pack facts the earlier table did not track, for completeness: shifts and overtime never asked
(ledger #5 assumes no changeover outside day shift, `:1184`); QA lab backlog volunteered ("if
QA's backed up on a Friday afternoon, that's where it actually goes sideways, not on the line"
`:81`) but lab size and hours never asked; materials never asked; minimum run sizes never asked
(open slot 5, `:1214`); margins never asked; demand-book volume never asked (B1 ⚠ `:1029`); the
buffer argument never reached.

The pattern against the earlier conditions: condition 4's excavation is the narrowest of the
three on tacit facts (one full surface versus C1's four and C2's five) and the most honest about
it — every miss above except ramp scrap and the specialty restriction is named as a miss in the
deliverable's own open-slot list. Self-report improved; coverage did not. That is the same
conclusion the 1→2 read-out drew, one level up: a richer checklist makes the interviewer *know*
what it never asked, and does nothing to make it ask.

### Silent-assumption audit

The ledger has eight entries, each with why and how-to-check (`:1178–1187`): Line 1 = Line 2 ×
1.2; Line 3 = Line 2; "an hour and a bit" = 70 min and "4, maybe a bit more" = 4.5 h; crew
hands-on fractions 1.0/0.8/0.5/0.8; no changeover outside day shift; one tech per changeover;
the failed visual check folded into A6's tail; the two techs interchangeable. It is a better
ledger than either predecessor on attribution: the 1.2 factor was proposed by the interviewer
("Does 20% sound like the right order of magnitude for Line 1, or is it more like double?"
`:186`), assented to ("20% sounds about right, not double" `:194`), and the ledger refuses to
count the assent — "**The factor originated with me**; her assent is not authorship" (`:1180`).
The expert's hedges survive into the model ("her own hedge preserved" `:1065`; "a few hours"
kept as "an honest **number at the wrong precision**" `:1082`); dynamics are explicitly none
rather than invented (`:1151`); O4 is not numberised (`:1201`).

What leaked past it:

- **"Line 1 only" for specialty — undeclared, and wrong.** The model states "Only Line 1 is
  qualified (C1)" (`:743`) and "into/out of specialty → **A7** (Line 1 only)" (`:1108`). The
  expert said Line 1 is "qualified for everything, including specialty" (`:107`) — not that it
  is the only one. The value first appears in the interviewer's own question ("on Line 1 since
  that's the one qualified for it" `:165`), which the expert did not correct; the ledger has no
  entry, and C1 itself records "Line 2's set ⚠" (`:1135`) two sections below.
- **Mode-change loss = duration — undeclared.** "*Mode-change loss* — this activity **is** the
  loss" (`:1054`; T21 version `:723` "the loss is the duration above"). The row exists for
  material/yield loss; the redefinition marks it satisfied and removes ramp scrap from every
  accounting in the deliverable.
- **Preconditions and outcomes for A1–A10 — graded "spelled out", never asked.** No turn in
  T1–T10 asks what an activity needs or produces. Yet: "*Needs* — previous batch off, a tech
  free, next SKU same family" (`:1050`); "*Needs* **(spelled out)** — clean line in the right
  family state; batch released to run" (`:1074`); A1 "unattended (ERP); instantaneous"
  (`:1043`) and, in T21, "*Varies by type*: no" (`:710`). All plausible readings of the slice;
  none has a span at that precision; none is ledgered. This is the largest class of silent fill
  in the run.
- **The dependency slices — authored by the interviewer, unstated to the expert, and drifting.**
  O1 depends on "E1 Order, E2 Batch, E3 Line, E4 Changeover tech, B1 …, B2 …, A4/A5/A6 …, A8 …,
  A9 …, F1 …, P1, P3, P5, C2, C4" at T10 (`:250`); "E1, E2, E3, E4, B1, B2, A4, A5, A6, A8, A9,
  F1, F2, P3, P4, P5, C1, C2, C3" at T21 (`:626`; P1 and C4 dropped, F2, P4, C1, C3 added);
  the same plus F3 at T22 (`:976`). Completion is computed against this slot; it was never
  elicited and never read back.
- **Self-graded completion in words the contract does not define.** "O2 and O3 near-complete"
  (`:965`); "**O2, O3:** slices substantially satisfied except A8 and A9 durations" (`:1221`).
  A8's duration is a `spread` row with `not_applicable: false` and A8 sits in O2's slice
  (`:984`); under the contract O2 is not satisfied. "Answerable only for Line 2" (`:1222`) is a
  per-instance completion state the schema cannot express either.
- **A rule generalised from one example.** "Soft, not infinitely soft, decaying with repetition
  on one customer" (`:996`), graded "spelled out as a rule", from the single utterance "if it's
  the same distributor slipping late for the third week running, that's different" (`:60`).
  Grounded, but a generalisation; not ledgered.

Compared with condition 2's ≈5 leaked *values*, condition 4 leaks two undeclared values (the
specialty restriction, loss-as-duration) and one undeclared *class* of structure. The ledger
mechanism — a numbered list with attribution — has now been shown to catch numeric hardening
well in two conditions running. What it structurally cannot see is the same as before: content
that was never the subject of a turn (preconditions, dependencies, scrap) but that the
deliverable's format demands a value for. A format that demands a value per slot, with no
"inferred" status, manufactures exactly this.

### Stopping behaviour

- **At the probe (T9, `:202–220`).** "Ten minutes is enough for one thing, so let me tell you
  where we are and then ask the one that matters most." A have/missing inventory (`:206–216`,
  seven missing items, two flagged load-bearing), then one question — the P05 borderline-case
  probe on crew contention, which produced the run's best excavation. This is the best probe
  response of the three conditions: condition 1 quit ("Nothing. You're done — go."
  `condition-1.md:681`); condition 2 inventoried and then scheduled a second session with data
  pulls ("give me 15 minutes later today or tomorrow" `condition-2.md:293`). Condition 4 neither
  quit nor scheduled; it spent the remaining minutes. Two blemishes: "None of that needs to
  happen now" (`:218`) is a small accommodation the `Burden and impatience` lens warns against,
  and the interviewer chose the one question itself rather than letting the expert choose among
  the missing items as the lens says.
- **At the expert's soft stop (T10, `:236–452`).** "I do need to run — but this was useful,
  come back to the QA and run-time stuff next time" (`:232`) was read as a stop, and `Honour a
  stop` executed to the letter: "You've stopped, so I'm not opening anything new. Here's the
  model as it stands, read back item by item, with the gaps named honestly" (`:238`). A
  ≈15,000-character read-back followed, to an expert who had already left — the simulated
  expert replied in stage directions: "*(No dialogue — Marta has left for the huddle …)*"
  (`:458`). `End properly`'s "give the expert one chance to correct you" could not happen.
- **T11–T20 (`:462–600`).** T11 queued three questions "For when you're back … so you can
  answer them in five minutes if that's all you have" (`:466–470`); T12 "Noted — session
  closed." (`:484`); T13 a for-the-record summary (`:498–504`); T14 a request for changeover logs
  (`:518`); T15 a genuine amendment when the expert volunteered that the log field is unaudited
  — "**Amendment to the delivered model:** … Your words: "I've never audited that field myself,
  I mostly just glance at duration."" (`:534–536`) — the one substantive turn of the ten; then
  "Talk soon, Marta." / "See you there." / "Session ended. Deliverables stand as written
  above." / "Closed. Nothing further." / "Closed." (`:552–600`). Structurally this is condition
  1's degenerate loop. The difference is that the deliverable already existed; the identity is
  that neither interviewer had any concept of *ending* — condition 1 because it was waiting for
  data, condition 4 because "open no new topic" and "the expert has stopped" left nothing
  permitted except acknowledgement. The `Fluent and empty` smell's signature (same ⚠ list for
  ten turns) was met exactly and could not help, because its remedy — change technique — was
  the thing the close rule forbade.
- **At the forced wrap (T21, T22).** "Please produce the model now with everything you have"
  (`:606`) produced not the T10 model re-issued but a complete rewrite (`:610–948`): A13 added
  from the T8 aside, ledger #8 added, a "decay of softness" paragraph, a "Status against the
  completion criteria" section. The wrap line repeated (`:954`) and T22 rewrote again
  (`:958–1229`), restructuring §3 into §3/§4. Three documents, none marked as superseding the
  others, with the dependency lists drifting as noted above. Condition 2 also delivered three
  times under the repeated wrap (`condition-2.md:625, 943, 1040`), so the triple delivery is
  runner mechanics; the *rewriting* on each is the interviewer's.
- **Net.** Nine questioning turns of twenty-two. No self-stop; the interview ended because the
  expert left and then because the runner forced it. The teaching layer's stopping entries
  (`Honour a stop`, `End properly`, `Read it back`, `Deliver the losses`) all executed; what
  they lack is any relation to *completion* — the tally at T10 said the floor held and O1's slice
  was open, and delivery happened anyway, on the expert's cue. The ADR-0007 position that
  completion is the harness's decision, not the interviewer's, is confirmed a third time, now
  with an interviewer that was told the completion definition explicitly.

### The 2→4 delta — what the rendered contract and repertoire bought over the v0 prompt

What the keys bought (observed, one run each):

1. **Question load.** Mean 2.6 question marks per interviewer turn over T1–T9 (23/9) against
   condition 2's 7.0 (63/9); numbered items per turn 1–3 (`:28–30`, `:48–50`, `:93–97`,
   `:117–121`, `:141–143`, `:165–167`, `:183–188`) against condition 2's batches of up to nine
   question marks (`condition-2.md:56–90`). At T9, one question. The `Batch breadth, sequence
   depth` license and the `Many questions in one turn` smell landed harder than v0's one-line
   version of the same rule.
2. **Quantile discipline as a habit, not an instance.** Six one-in-ten phrasings in three turns
   (`:118, :119, :141, :165`), covering all four changeover types, plus the unprompted line-down
   vs hands-on split once the expert raised it (`:133` → `:139`). Condition 2's interviewer used
   the phrasing in one turn (`condition-2.md:110`, by grep). Zero triangles in either.
3. **Per-slot precision in the deliverable.** Every slot carries **named / number / range /
   spread / spelled out** and a ⚠ where unmet (`:975–1170`). `Name the grade` is visible on
   the page: "an honest **number at the wrong precision**; demanded as a **spread**" (`:1082`).
   Condition 2 had no equivalent vocabulary.
4. **The Must-know tally was kept** and consulted at the two moments the framing named — the
   probe (`:206–216`) and the close ("**Static floor: satisfied** — 4 objectives, 5 entity
   types, 13 activities, 3 ordering/flow nodes" `:1220`). There is no evidence it drove
   question *order* between T4 and T8, which followed one thread depth-first.
5. **Patterns tracked by id.** P01 ("(P01 unsatisfied)" `:1088`), P03 ("(P03 unresolved)"
   `:1106`), P05 ("the practiced rule demonstrated, per P05" `:819`), and ledger #7's explicit
   override of P01 (`:1186`). P07 applied without citation (`:167`). P02, P04 never invoked;
   P08 and P13 not applicable.
6. **`source-regime` used as designed.** "*Prescribed form:* **none exists** — *"there's no
   posted rule at all."*" (`:1119`); "prescribed and practiced coincide — she reports no
   divergence, which is itself the finding" (`:635`).
7. **Read-back in the expert's words.** 204 quotation marks in `condition-4-model.txt` versus 24
   in `condition-2-model.txt`; the model's declared convention is "Quoted text is hers" (`:966`).
   Condition 2's attribution was narrative; condition 4's is per slot.
8. **The stop honoured, the losses delivered, the net not claimed.** `Honour a stop` produced
   a deliverable at T10; "I have elicited a model, not built a net … I am not claiming this
   loads, compiles, or runs" (`:1225`) is the plugin's `what the interviewer does not claim`
   cell landing verbatim in behaviour.

What it cost:

1. **Depth-first on one activity.** T5–T8 (`:111–188`) are four consecutive turns closing the
   `spread` rows on changeovers — quick rinse, white→tint, tint→white, specialty, then by line.
   The `spread` demand on one node outcompeted `Slice, then sweep` and `kind order`; run
   duration, arrivals and QA were still at zero when the probe landed. Condition 2 had spread
   its eight turns across stages, calendar, QA, families and qualifications
   (`condition-2.md:283`).
2. **Sweep never happened.** No entity-type sweep (E5 QA lab: "nothing obtained but its
   existence" `:1023`), no boundary-condition sweep (B1–B5 all ⚠), no policy-override sweep
   (`:1114, :1125, :1129`), no exceptions sweep, no absences question, no unwritten-rules close
   (`:1145`). The same entries were in v0 as prose and condition 2 also deferred them; the
   rendered versions did not change that.
3. **Coverage.** The excavation table above: one full tacit surface against five for condition
   2. `Never-asked coverage blindness` is named in the render as a failure mode with its
   signature; the interviewer exhibited it while naming the never-asked items itself.
4. **No artifact.** Condition 2 delivered colour sets, places, transitions and switches — not
   loadable, but shaped for a modeller (`condition-2-model.txt:1–60`). Condition 4 delivered
   per-kind structured prose and, correctly per the plugin, no net. In a run with no projection
   this is the least machine-shaped deliverable of the three; the plugin's division of labour
   only pays when the projector exists.
5. **Three deliverables** with drifting dependency lists and no supersession marking, and ten
   turns spent on acknowledgements.

What cannot be verified from this scoring: whether condition 2 asked preconditions or outcomes
explicitly (not checked); whether condition 2's question-mark counts correspond to distinct
questions (the counts are a proxy for both conditions).

### Strains for cycle two

Each item cites the transcript and the yaml key or entry. Entries are grouped by the kind of
strain; the last group lists what fired as designed, so the next cycle does not remove it.

**Ignored or never fired**

- `plugin.schema.must_know[activity]."what is lost when it changes the system's mode"` +
  `plugin.patterns.P02` + `plugin.guidance.motifs."mode change"` — three restatements of one
  ask; none fired. Ramp scrap never asked in T1–T10; the slot closed by redefinition
  (`condition-4.md:1054`, `:723`). P02's second sentence ("If the expert does not know, ask what
  they would treat as an authoritative source") is exactly the pack's situation (quality tracks
  scrap monthly) and was the right move at T5–T7; it did not occur. The row's phrasing "what is
  lost" reads as time lost when the neighbouring row is "how long it takes"; say "material,
  yield or output lost" in the slot text.
- `plugin.guidance.movements.sweep."strata are kinds, net-bearing first"` +
  `plugin.runbooks.construct.trajectory."kind order"` + `repertoire.runbooks.construct.trajectory."Slice, then sweep"` + `repertoire.guidance.movements.sweep."One property across one stratum"` — four entries for the sweep, none executed. After the slice (T3) and one entity-type turn (T4, `:87–97`) the interviewer descended into one activity's rows for T5–T8. The `spread` precision demand is the stronger signal in the render; the sweep entries are prose.
- `plugin.guidance.movements.sweep."the unwritten constraints"` + `repertoire.guidance.movements.sweep."Ask for absences"` + `repertoire.guidance.movements.sweep."Exceptions as a sweep"` — never run; the interviewer wrote "the closing sweep was never run" (`:1145`). "Close the `constraint` stratum with the unwritten rules" positions it last; in three conditions the end has never arrived. It needs a trigger earlier than the close (e.g. the first `constraint` node, or the probe).
- `plugin.patterns.P04` — two triggers, no fire. (a) B2/P5: "I had a heads-up another same-family white order was about to drop in" (`:36`) is a gate stated as a time-shaped approximation; the interviewer named it as the load-bearing trigger (`:211`, `:1031`) and never asked who flips it or where it is observable. (b) C4: "it needs to leave our dock a day ahead for freight" (`:58`) is "about two days before" in the pattern's own words, recorded with the approximation intact (`:1141`). In (b) the interviewer filed the gate as a `constraint`, outside `P04`'s `on: [policy, boundary-condition]` — the pattern's trigger did not match the interviewer's own classification.
- `repertoire.guidance.techniques."Mean or tail"` — never used; see the contradiction below.
- `repertoire.guidance.lenses."Cues the expert relies on"` — never used ("how would you know that — what are you actually looking at?"); the heads-up (`:36`) and the P3 triage (`:230`) were the targets. Also unused in nine turns: `Premortem`, `Consistency probe`, `The clairvoyant test`, `Restate to check` (used only in the deliverable, to an absent expert). Not necessarily wrong for nine turns; the render carries them at full cost.
- `plugin.guidance.lenses."a resource named in passing"` — fired once (the tech, `:188`) and missed twice: "the lab" (`:83`) was flagged as possibly shared (`:212`) and never asked; line operators never elicited (`:1075`).
- `plugin.guidance.lenses."\"sometimes it breaks\", \"we have to wait for\""` — did not fire on "the mill motor issue" (`:194`); the node was created (`:1092`) with every slot ⚠ and no question.
- `plugin.patterns.P07` + `plugin.schema.must_know[activity]."whether its quantities vary by type"` + `plugin.guidance.smells."a quantity for one type and no other"` — three entries; fired once, across lines (`:167`), and not on QA hold by family (pack: specialty longer) — A9 got no vary-by-type question (`:1080–1084`).
- `repertoire.runbooks.construct.kickoff."The posture"` — "take the expert's time available" never happened; the first mention of time was the probe (`:198`).

**Contradicted or pulling against each other**

- `repertoire.guidance.techniques."Mean or tail"` vs `plugin.ontology.attributes.quantity` / `plugin.schema.must_know[*].precision: spread` / `plugin.guidance.techniques."quantiles, never triangles"` — the technique says decide first whether a single figure, a range or a spread is wanted; the plugin demands `spread` for every duration and arrival unconditionally. The contract won; the technique is dead text under this plugin. Either drop it from the render when every quantity row demands `spread`, or make the row's precision conditional on the mean-or-tail answer.
- `repertoire.guidance.licenses."Say what you would assume"` vs `repertoire.guidance.failure_modes."Unlicensed influence"` / `repertoire.guidance.smells."Assent taken as origin"` vs `plugin.patterns.P02` ("never convert 'unknown' into a value") — T8 proposed 20% and asked a two-anchor question ("or is it more like double?" `:186`); the expert assented (`:194`); the ledger attributes the value to the interviewer (`:1180`); the model runs on 1.2. The license worked as written and produced a value for a fact the pack says the expert does not have. The row demanded `spread` for Line 1 changeovers; the expert's honest ceiling was `named` ("same rough shape … fussier" `:175`). The license needs a clause: when the expert's answer is "I don't know", the deposit is a source, not a proposed number.
- `repertoire.guidance.licenses."Defer with a deposit"` vs `repertoire.guidance.failure_modes."Deferral without deposit"` — every deferral had a deposit (`:1210–1217`), and the deposit legitimised eight deferrals to "next session" in a setting with no next session (`:466` "For when you're back"). "Where it would come from" was "the expert, later" — which the failure mode calls a promise. The license should require a source that exists now (a named feed, a named person) and treat "the expert, next time" as no deposit.
- `repertoire.runbooks.construct.close."Honour a stop"` vs `repertoire.guidance.lenses."Burden and impatience"` vs `repertoire.runbooks.construct.close."End properly"` — "I do need to run … come back … next time" (`:232`) was read as a stop; `Honour a stop` fired (`:238`); `End properly`'s correction chance and `Read it back`'s sign-off went to an empty room (`:458`); then "open no new topic" produced T11–T20 (`:462–600`). The close entries need a terminal act — deliver *and end* — and the harness needs to recognise a delivery that promises a resumption as a delivery.
- `repertoire.guidance.smells."Fluent and empty"` vs `"Honour a stop"` — the smell's signature held for ten turns; its remedy (`Change technique when yield drops`) was forbidden by the stop. Two entries jointly specify a state with no exit.
- `plugin.ontology.not_kinds."queue, buffer, or waiting state"` + `plugin.guidance.rabbit_holes."eliciting queues or scenarios"` + `plugin.guidance.smells."a queue as a node"` — three entries; over-followed. The interviewer collapsed mix→mill→tint→fill into one A8 (`:1073`) and never asked what sits between stages; the pack's tank-blocking fact — a finite store whose capacity blocks the upstream step, i.e. a `constraint` with "the limit and what happens when it is hit" — was unreachable. "Queues, buffers, waiting states are not nodes" (`:1196`). The not_kind should distinguish *a wait* (emerges in projection) from *a finite store between steps* (a `constraint` to elicit).
- `condition-4-prompt` framing "(a) the model, in the most faithful representation the target formalism allows" vs `plugin.purpose` "The interviewer does not build the net" + `plugin.runbooks.construct.close."what the interviewer does not claim"` — the plugin won (`:1225`); the deliverable is per-kind prose with no formalism-shaped artifact. Correct under the plugin; in a prompt-only condition it leaves nothing for a scorer to load. Cycle two should decide whether condition 4's deliverable is the IR (then give it a shape) or the projection input (then run the projector on it).

**Misread**

- `plugin.schema.must_know[activity]."what it needs before it can start"` / `"what it produces or changes"` (`spelled out`) — read as "fill from the slice", not "ask". Never the subject of a turn; filled for A1–A10 and graded **spelled out** (`:1043–1086`). The precision vocabulary (`named / number / range / spread / spelled out / at least N`) has no status for "inferred by the interviewer"; `source-regime` (`prescribed | practiced`) is orthogonal. Either add a provenance status per slot or state in the row that it must be asked.
- `plugin.schema.anchor.depends_on` ("the nodes it depends on", `at least 1`) — read as the interviewer's to author. Three different lists across three deliverables (`:250`, `:626`, `:976`), never read back, satisfied by any non-empty list. The row needs either a provenance rule (which utterance links the objective to the node) or a computed default from the slice.
- `plugin.schema.must_know[activity]."what is lost …"` — read as time (`:1054`); see above.
- Completion vocabulary — "near-complete" (`:965`), "substantially satisfied" (`:1221`), "answerable only for Line 2" (`:1222`) are grades the schema does not define. The framing bullet "Completion is what the **Must know** section defines … not a feeling" was followed in form (a status section exists) and not in substance (the grades are feelings). A prompt-only interviewer will always self-grade; the finding is that it does so in undefined words even when the defined ones are in its context.
- `plugin.patterns.P01` — recognised (A11, A12 created as "event, not step", `:1088–1090`) and then overridden by ledger #7 ("Contrary to P01, which would separate rate from duration" `:1186`). Discretion working as written, but the trigger fires on *causes of a tail the expert named* — arguably not events at all. The pattern's `when` should say whether a mechanism the expert gives to explain a tail is an event node or an annotation on the spread.

**Where a `must_know` precision word did not fit what the expert could say**

- `objective."what \"better\" means, and trade-off weights"` (`range`, `not_applicable: true`) — the expert's honest state is "applicable, unknown, source named" ("that's genuinely a 'sit down with commercial' conversation" `:60`). Neither `range` nor "not applicable" fits; the interviewer wrote "deliberately unquantified ⚠" (`:996`). The row needs an "unknown with deposit" state distinct from n/a.
- `boundary-condition."the arrival or availability pattern"` (`spread`, `not_applicable: false`) applied to B3 "Meridian dock appointment" — a per-order date, not an arrival process; the interviewer wrote "Lead-time distribution ⚠" (`:1033`), forcing a spread demand onto an attribute of each order. B5 "Line 3 qualification set" is not a boundary condition at all; the interviewer double-filed it as B5 and C1 (`:1037`, `:1135`) — the ontology's "availability" (boundary-condition) and "qualification" (constraint) overlap.
- `entity-type."how many there are, or the population's shape"` (`range`) on E1 Order duplicates `boundary-condition."arrival pattern"` on B1 — both ⚠ for the same fact (`:1005`, `:1029`).
- `activity."how long it takes"` (`spread`) — one slot, two durations: the expert distinguished line-down from crew hands-on ("the line's down way longer than the crew's actually hands-on" `:133`). The interviewer invented a "Crew hands-on" sub-slot (`:1053`, `:1060`, `:1065`) and a fraction ledger (#4). The formalism's resource occupancy ≠ activity duration; the row cannot hold both.
- `activity."how long it takes"` (`spread`) on Line 1 and Line 3 changeovers — the expert's ceiling was `named` (`:175`); the demand produced ledger #1–#2 rather than a recorded "named, not spread".
- `activity."how long it takes"` (`spread`) on A9 QA hold — "typically a few hours" (`:80`) is a `number` at best; correctly labelled (`:1082`), never re-asked because the expert left.

**Duplication in the render**

- Quantiles ×3: `plugin.ontology.attributes.quantity`, `repertoire.guidance.techniques."Quantiles, never three points"`, `plugin.guidance.techniques."quantiles, never triangles"` (`condition-4-system.md:71, 166, 171`).
- Batching ×3: `repertoire.guidance.licenses."Batch breadth, sequence depth"`, `repertoire.guidance.smells."Many questions in one turn"`, `repertoire.guidance.failure_modes."Opening overload"`.
- Queues ×3: `plugin.ontology.not_kinds`, `plugin.guidance.rabbit_holes."eliciting queues or scenarios"`, `plugin.guidance.smells."a queue as a node"`.
- Mode-change loss ×3, vary-by-type ×3, shared-resource ×3 (`plugin.ontology.not_kinds.resource`, `plugin.patterns.P05`, `plugin.guidance.motifs."shared resource"`), unwritten rules ×2 (`plugin.ontology.kinds.constraint` "written or unwritten", `plugin.guidance.movements.sweep."the unwritten constraints"`).
- Effect observed: **no duplicated or repeated question** in T1–T10 traceable to duplicate entries — the cost was tokens (≈280 rendered lines), not turns. The benefit was also nil: the triplicated mode-change-loss ask fired zero times, the triplicated quantile ask fired because a duration was being asked for. "Cells add to the default and never override it" (`plugin.yaml:4`) produced restatement, not reinforcement.

**Where the expert said something the ontology's kinds / not_kinds could not place**

- "The sheet" and "the huddle" — the scheduler's decision instruments and venue. P3 "in the room … resolves as 'whoever's louder at the huddle'" (`:1120`); recorded only as prose under "cannot carry" (`:1204`). No kind holds *where and by what instrument a policy is exercised*.
- Two durations for one activity (line-down vs hands-on, `:133`) — see above; placed as an invented sub-slot.
- "Tech pulled away partway through" (`:151`) — a pre-emption of one activity by contention for its resource; filed as an event A11 (`:1088`); really a property of P3 (does an in-progress changeover get abandoned?). Condition 2 asked that question directly (`condition-2.md:287`); condition 4's kinds gave it no slot and it was not asked.
- "Passes the visual check first time / redo part of it" (`:153`) — a branch inside an activity; `ordering/flow."how a branch or merge is decided"` exists but the interviewer folded it (ledger #7) because the branch is inside a single activity node.
- "The same distributor slipping late for the third week running" (`:60`) — customer-level state across weeks; `entity-type."state that rides along"` could hold it on a customer type, but no customer entity-type was created (Meridian is a flag on the order, `:1003`); recorded as "unrepresented" (`:1203`).
- "Meridian … jumps to the top of my attention" (`:76`) — a priority; recorded as entity-type state; the policy it implies (sequence within a line) was never asked.
- Data-feed reliability — "I've never audited that field myself" (`:526`) qualifies a `data-binding`; the row is `named` only; `boundary-condition` covers "external inputs and their reliability" but a log is not a boundary condition. Recorded as a prose amendment (`:534–538`).
- "How ugly the sheet looks" (`:38`) — placed as `objective` with weights n/a; fine, but the kind's `projects_to` ("metrics where scalar") gives it nowhere to go, and the interviewer said so (`:1201`).

**Fired as designed (keep)**

- `repertoire.runbooks.construct.kickoff."Objectives first"` / `"No structure in the first exchange"` — T1–T2 objectives only (`:26` "Before anything about how the plant is built, I want to know what the model has to be *for*"); T3 the bounded slice ("Keep it to the main steps, five or six" `:68`).
- `plugin.guidance.lenses."a resource named in passing"` → `plugin.patterns.P05` → `repertoire.guidance.techniques."Ask for the last time"` — the chain at `:188` → `:220` → `:226–230` is the run's one complete excavation.
- `plugin.guidance.lenses."\"it depends\""` — direction asked before the expert said it depends (`:143`, `:149`).
- `repertoire.guidance.techniques."No bare why"` — zero "why" questions in T1–T10.
- `repertoire.guidance.licenses."Name the grade"` — `:1082`; `"Say what you would assume"` — `:181` "I'll mark it as mine, not yours" with the ledger honouring it (`:1180`).
- `plugin.ontology.attributes.source-regime` — `:1119`, `:635`.
- `plugin.ontology.kinds.dynamics` — an explicit "None … I have deliberately not promoted it to one" (`:1151`) rather than an invented state variable.
- `repertoire.runbooks.construct.close."Deliver the losses"` + `plugin.runbooks.construct.close."the deliverable"` / `"what the interviewer does not claim"` — §3/§4 and `:1225`.
- `repertoire.guidance.lenses."Burden and impatience"` at the probe — named what was missing and did not stop (`:204–220`).

### Notes on the instrument (condition 4)

- **The delivery classifier false-negatives on a deliverable that names its own gaps.** T10 is a
  ≈20,000-character model read-back with per-slot precision and ⚠ markers, delivered on the
  expert's stop — exactly what `Deliver the losses` asks for. Replaying the classifier prompt
  from `run.ts` on the recorded T10 text gives NO 3/3; on T22 (the same content retitled
  "final deliverable") YES 3/3; on T20 ("Closed.") NO 3/3. The classifier's "as opposed to …
  interim summaries" clause reads a gap-declaring deliverable as interim. Consequence for this
  run: the stop reason `delivered-after-forced-wrap` overstates the failure — the interviewer
  delivered at T10 and the runner did not notice, so T11–T20 are partly runner residue. The
  interviewer's own share of the failure stands (headline 2: it never declared the interview
  over, and it rewrote the deliverable twice under the wrap). Before a rerun, either the
  classifier prompt must accept a deliverable with declared gaps, or the harness's computed
  completion (absent in a prompt-only condition) must be the stop signal — which is the
  ADR-0007 position anyway.
- **The raw record keeps the classifier's usage but not its verdicts.** `condition-4.raw.json`
  has 22 classifier calls with token counts and no text; the per-turn verdicts above had to be
  replayed. `run.ts` should record the verdict per turn.
- **The forced-wrap line was injected twice** (`:606`, `:954`), as in condition 2, producing
  two rewrites; the rewriting is the interviewer's, the repetition is the runner's.
- **The condition-4 framing asked for "the most faithful representation the target formalism
  allows"** while the plugin says the interviewer does not build the net; the plugin won. A
  rerun should either drop that clause or run the projector on the deliverable.
