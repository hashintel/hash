# IR obligations synthesis

Compiled 2026-08-28. Part of the
[runbook teaching synthesis](runbook-teaching-synthesis.md).
Read-only research compilation. Specs, ADRs, and typed-IR work are history. Provenance is not
warrant. Status labels: **Observed**, **Inferred**, **Proposed**. This note does not amend
`MISSION.md` or skill resources.

This document names what a Mission 3 runbook IR must conserve and make usable, independent of the
current heading catalogue. Earlier typed designs are research evidence, not an instruction to
restore kinds, slots, precision grades, fold rules, or completion algebra.

Working artefacts: `apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md`; the two real IRs
at `docs/evidence/evaluations/vestera-runbook-headless/runbook-headless-2026-08-28T10-56-59-351Z.ir.md`
(Run 1) and
`…/runbook-headless-2026-08-28T11-03-53-683Z.ir.md` (Run 2); matching transcripts; construction
from Run 2 at `…/runbook-validated-construction-2026-08-28T13-02-51-095Z.md`; proof
`docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`.

---

## The IR's job

The runbook IR is the shared workpiece of one modelling lifecycle. During elicitation it is filled
from the expert's conversation. During checking a human or later agent reads it without the
transcript. During construction it is the primary model of the plant: the constructor infers a
net from this document, not by rereading the interview.

It is **not** the typed three-register IR (assertions fold into model into projections). It is not
folded from captures, does not require kinds/slots/grades, and is not a new persistence surface.
Recovery today is a `runbook-ir` fence in conversation history (`SKILL.md`; proof item 5). It is
also not the Petri net, not a questionnaire to read aloud, and not a completeness certificate: a
filled heading tree is not a complete elicitation.

Three readers, three jobs:

- **Elicitor (same agent, interview phase):** file what was said, mark what was not, keep expert
  names, and keep agent-authored synthesis from passing as theirs.
- **Checker / cold reviewer:** reconstruct the intended process, see load-bearing assumptions, see
  conflicts and losses, and name the smallest next question relative to the stated objective.
- **Constructor:** find the spine (what flows, what happens to it, in what order), the contended
  resources, the directional change costs, the eligibility and calendar constraints, and every
  inference it is allowed to make — without inventing a silent default.

The oracle design states the primary question: not whether the IR looks complete, but whether the
conversation acquired objective-relevant evidence and the IR conserved its meaning, epistemic
status, conflicts, gaps, and losses in a form another reader can use
(`docs/specs/elicitation-to-ir-oracle-design.md`).

---

## Obligation matrix

Do not assume the current headings are the candidate structural homes.

| Obligation | Reader/consumer | Source evidence | Current representation | Candidate structural home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Recover a process description a constructor can use without the transcript | Constructor; cold reviewer | `CONTEXT.md` Runbook IR; `structurally-typed-elicitation-runbooks.md` §IR template; `SKILL.md` “Infer the net from the IR”; `pn-construction.md` “Do not treat the transcript as the primary model”; construction prompt in `runbook-validated-construction-…md` | Whole Markdown document under investigation-shaped headings | A locatable **spine** (what waits, what happens, in what order) plus overlays, not a heading dump | Give constructor only the IR; if they must invent order, eligibility, or resource return, the IR failed | **Observed** |
| Conserve expert-stated facts, relations, branches, timing, contention, qualifications, policy vs practice, corrections, and alternatives | Cold reviewer; omniscient grader | Oracle claims 2–4; elicitation teaching “every load-bearing value traceable”; Run 2 conserved VW-02, shared crew, directional washdowns | Prose under investigation headings; in-place **Not yet asked** / **Unknown** marks | Per-claim **expert material** with optional short quote; grouping secondary | Ledger fact disclosed in transcript but absent, distorted, or silently hardened in IR | **Observed** |
| Keep agent restatement, synthesis, and offered wording distinct from the expert’s settled words | Elicitor; checker | Template “A restatement you offered is not their statement”; elicitation “unlicensed influence”; Run 1 interviewer coined “~3 hours” from “six hours total” | Convention: **Assumed** bold; often missed in Purpose/Posture | Explicit **author** on each material statement (expert / agent / mixed) | A precise number or rule in the IR that the transcript never settled, with no assumption mark | **Observed** |
| Name how a statement relates to what was said: asked-unknown vs not-yet-asked vs assumed vs conflict vs deliberate omit vs projection loss | Checker; constructor; grader | Template unsettled vocabulary; oracle claim 3; `checks.md` “unknowns, assumptions, and omissions are visible” | Six bold labels, used in-place **and** dumped in a closing section | One **epistemic mark per statement**, not a second dump that reclassifies them | Closing dump lists “unknowns” that were never asked, or collapses conflict into one number | **Observed** |
| Keep two disagreeing accounts visible; do not average | Constructor; checker | Template **Conflict**; `pn-construction.md` “averaging two conflicting accounts” forbidden; Run 1 six-hours vs ~3 hours | Run 1: in-place plus Conflicts subsection. Run 2: “None identified yet” | Conflict as a first-class pair, not a parenthetical | Construction uses one side without naming the other (Run 1 later used 3 hr) | **Observed** |
| Record the modelling objective in the expert’s terms, and what the model must not claim | Elicitor; checker; constructor | Template Purpose; elicitation “objectives before structure”; `checks.md` sufficiency; Run 2 idle-hold + Line-2-down vs Run 1 generic “test scheduling decisions” | `What the model must answer` / `must not claim` | A short **objective slice** that later facts must serve | Syntactically full IR whose facts do not bear on the named question | **Observed** |
| Record appetite, time grain, horizon, and tolerance for proposed assumptions as stance, not as plant facts | Elicitor | `CONTEXT.md` Posture; elicitation “these set stance; they are not a form”; template Posture | `Appetite, time, and accuracy` + `Boundary and horizon` | Stance block separate from plant boundary | Stance mixed into Who-it-is-for or silently used to license invention | **Observed** (stance needed); **Inferred** that a separate block is the right home |
| Bound the plant: inside, outside, why, and how far in time | Constructor; checker | Elicitation “establish what is inside… before asking how the system is built”; Run 2 QA hold “noted as delay but not modeled as constraint” | Split across Posture, Process boundary, Omissions | One **boundary** record with inside / outside / why / horizon | Construction models an outside item as a constraint, or drops an inside item | **Observed** |
| Keep a concrete walked case at expert granularity, including waits and incidents | Elicitor; constructor | Elicitation “walk one real case”; `checks.md` “one concrete case”; Run 1 TC-17 stages; Run 2 VW-01 / idle-hold story | Run 1: under Activities. Run 2: collapsed; idle-hold lives in Situation notes | A **case record** distinct from the generalised process | Only generalisations; or micro-steps discarded before the objective licenses collapse | **Observed** |
| Name participants, locations, and capped resources, including properties that change what the process does | Constructor | Elicitation investigation list; Run 2 three asymmetric lines + one crew | `Participants, locations, and resources` | Resource entries with capacity, availability window, and eligibility | A named-in-passing crew that later is the bottleneck, recorded only as colour | **Observed** |
| Distinguish consumed, reserved-and-released, and read-only inputs | Constructor | Elicitation activities; `pn-construction.md` contended-resource pattern | Run 2 Resource usage: “Line reserved… crew reserved”. Run 1 weaker | Per-activity **usage** on the spine | Shared crew consumed for good, or line held through QA when filling already released it | **Observed** as construction need; **Inferred** as IR field (only weakly present) |
| Record order, branching conditions, retries, and recovery without turning incidents into rates | Constructor; checker | Elicitation flow + “a memorable incident is not a rate”; Run 2 QA ~1/quarter vs Line-2-down “hasn’t happened yet” | `Flow, branching…` plus Situation notes | Spine + **branch records** with condition and rate-status | Vivid incident stored as a probability; or missing path unmarked | **Observed** |
| Attach quantities to the thing they measure; keep typical vs tail; do not force a distribution the expert cannot observe | Constructor | Elicitation time/quantities; typology Timed work; Run 1 all durations from one TC-17 run; Run 2 4–6 hours hedge | `Time, quantities…` **and** duplicated under Activities / Flow | Quantity as an attribute of a named step/resource, with typical/tail/unknown | Min/mode/max invented; or one-example duration promoted to all families | **Observed** |
| Record directional mode-change cost and “what you cannot run next” | Constructor | Typology Mode change; Run 2 white→tint 45 min vs tint→white 3 hr; VW-02 after dark tint | Split across Activities, Flow, Policies, Situation notes | A **from→to** change table plus forbidden adjacencies | Symmetric washdown assumed; or unwritten adjacency lost | **Observed** |
| Record who wins a contended resource, or that the rule was not obtained | Constructor | Typology Contended resource; Run 2 “one waits”; open question on priority | Policies + Situation note open questions | Contention rule on the resource, or explicit missing-rule | FCFS invented in the net with no loss named (Run 2 construction did name it) | **Observed** |
| Distinguish prescribed / documented vs practiced / unwritten, without two parallel models | Checker; constructor | Historical source-regime pattern; elicitation “normative language is policy, not practice”; Run 2 VW-02 and commercial penalties | Prose “unwritten rule”; dumped under Policies | A **regime** mark on rules (practiced vs prescribed), not a second model | Handbook treated as practice; or unwritten rule dropped because it is not documented | **Observed** distinction; **Proposed** as a mark, not a typed attribute system |
| Name what observation would make the result accurate enough | Checker; expert | Template Validation criteria; elicitation same; Run 1 empty; Run 2 filled with decision-support tests | `Validation criteria` | Tied to the objective slice, not a trailing form | Empty section treated as “not needed”; or expert asked to predict the model’s answer | **Observed** |
| Name material the net cannot honestly hold, separately from not-yet-elicited gaps | Constructor; delivery | Template **Loss**; `pn-construction.md` Projection loss; `checks.md` loss review; Run 2 “Cannot represent” vs “Loss if not elicited further” | `Projection losses`; also mixed into Situation notes Record-for-construction | A **loss register** filled at construction time, seeded during elicitation only when already known | Prospective “will include” losses (Run 1); or unknown duration filed as unrepresentable | **Observed** |
| Support objective-relative “enough” and a smallest next question, without equating syntactic fullness or self-report with completion | Elicitor; checker | Oracle claims 5 and 7; `checks.md` sufficiency vs “stable-looking IR with empty demanded sections”; proof fog 5: construction named gaps instead of asking the smallest question | Gap lists unordered; no ranking | Gaps **indexed to the objective**, with one nominated next question | All headings present, no walked case; or a laundry list with no next move | **Observed** |
| Make every material statement supportable from user evidence or marked assumed; assent ≠ evidence | Checker; later shadow-join grader | Oracle claims 4 and hard-failure gates; elicitation evidence rules; oracle notes no IR-statement → evidence links yet | No quotes, no turn pointers, no capture ids | Optional **excerpt** on load-bearing claims; not a capture store | Load-bearing IR sentence with neither quote nor assumption mark | **Observed** as missing; **Proposed** that the smallest join is statement→excerpt, not a fold |
| Allow local update and full-document emit; empty demanded homes stay visible | Elicitor; scraper | Template maintenance; `SKILL.md` full current document in `runbook-ir` fence | Full emit; empty sections with Not yet asked | Stable homes that survive partial fill | Delta-only emit; or dropped empty section hiding a hole | **Observed** |
| Keep construction guidance out of the interview; keep expert vocabulary in the IR | Elicitor; expert | Runbook spec elicitation/construction split; proof item 4 | Situation notes `Record for construction` already speaks tokens/guards | Construction hints as a **sidecar or later pass**, or clearly agent-owned | Expert-facing questions in places/arcs; or IR that is already a net sketch | **Observed** strain (Run 2 notes are useful **and** PN-shaped) |

---

## Required distinctions

These are the smallest semantic/epistemic cuts the IR must preserve. Field names are irrelevant.
Closed enums are not implied.

1. **Expert-settled wording vs agent-authored language.** Markdown convention is **not**
   sufficient. Run 1 shows the failure: the interviewer restated “six hours total” as “~3 hours”,
   then the IR stored both as a plant conflict. Stronger structure: an author mark, or a short
   quote, on load-bearing claims. (**Observed**)

2. **Asked-unknown vs not-yet-asked vs unaddressed vs declined.** The template defines the first
   two. Both IRs still dump them together (Run 1’s Unknowns list is almost all never-asked).
   Convention in a closing section is **not** sufficient; in-place marks were more honest.
   (**Observed**)

3. **Assumption (agent supplied, why, how to check) vs inference from evidence vs default
   introduced at construction.** Elicitation-time assumptions and construction-time defaults were
   mixed. Run 1 said “Assumptions: None introduced yet — construction will require many,” then
   construction introduced sequential-flow and 3-hour-per-direction defaults. The IR must keep
   pre-construction assumptions visible; construction defaults belong in delivery, not
   back-written as expert fact. (**Observed**)

4. **Conflict (keep both) vs correction/supersession (replace, note the change).** Template
   maintenance says replace on later correction and note supersession in the dump. Neither real
   IR showed a true correction. Convention can hold this **until** a correction is lost. Strain to
   upgrade: a later answer silently overwrites an earlier one with no note. (**Inferred** from
   template; not yet re-earned by artefacts)

5. **Omission the objective permits vs gap that still blocks the objective vs loss the formalism
   cannot hold.** Run 2 almost gets this (`Omissions` vs `Cannot represent` vs `Loss if not
   elicited further`). Run 1’s Projection losses are a wish-list. Three-way split is required; one
   “gaps” bucket is not. (**Observed**)

6. **Objective / decision-to-test vs process description.** Run 1’s purpose is a generic
   scheduling brief; Run 2’s is two testable questions. Without this cut, coverage looks full
   while the model cannot answer the expert. Markdown headings can hold it if they stay short and
   are used as a filter, not a slogan. (**Observed**)

7. **Stance (appetite, grain, assumption-tolerance) vs plant boundary vs validation test.**
   Currently three template homes; Run 2 still stuffed plant facts into Who-it-is-for (“Weekly
   demand book, three filling lines, one changeover crew”). The cut matters; the three headings
   are not the only way to draw it. (**Observed** mixing)

8. **Walked incident vs generalised rule vs rate.** TC-17’s 20-minute tank backup is one incident.
   QA rejection ~1/quarter is a rare rate. Line-2-down “hasn’t happened yet” is a scenario with no
   rate. Collapsing these is a hard failure. Prose can hold the cut if each quantity names its
   basis. (**Observed**)

9. **Policy-as-written vs practiced / unwritten rule.** VW-02 and “small accounts slide” survived
   because they were colourful. The cut is load-bearing for SDCPN (guards vs loss). A regime mark
   is enough; a second model is not. (**Observed**)

10. **Eligibility / capability vs preference vs hard constraint.** Line 2 cannot run specialty
    (physical). Meridian whites must run on Line 2 (audit). High-volume whites *prefer* Line 2
    (speed). Run 2 listed the first two under Constraints and the third under Policies — by
    convention. Construction needs the three-way cut or it will encode preference as a guard.
    (**Observed**)

11. **Directional change cost vs occupancy vs calendar availability.** Tint→white is 3 hours
    **and** needs the crew **and** only in 6 AM–2 PM. Run 2 split this across Flow, Time,
    Policies, and a Situation note. The constructor had to reassemble it; the paid construction
    still failed to enforce the day-shift window. Stronger grouping of “change + who + when” is
    suggested, not proven. (**Observed** strain)

12. **Reserved vs consumed vs read.** Construction pattern requires it. Run 2 stated reservation
    in Resource usage. Run 1’s net released the line only after QA — an unasked inference. A usage
    mark on each activity is the smallest structure that would have blocked that. (**Inferred**
    from construction miss)

13. **Expert granularity vs licensed collapse.** Run 1 kept mix/mill/letdown/fill. Run 2 collapsed
    them because the objective is scheduling, not mill physics — and said so. Collapse is allowed
    if named and objective-relative (`pn-construction.md`). Storing net-shaped steps as if the
    expert said them is the historical granularity failure. Convention (“Modeled as a single
    run”) worked in Run 2. (**Observed**)

14. **Evidence excerpt vs pointer vs no provenance.** Neither IR quotes the expert. The oracle
    records this as partial observability. For cold review, a short excerpt on load-bearing claims
    is the smallest useful upgrade. Session-id pointers and capture envelopes have not reappeared
    as a production need. (**Observed** absence; **Proposed** excerpt-only)

---

## Artifact analysis

Template source: `apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md`. Both runs emit the
same heading tree. Run 1 is a short interview then a forced construct (two substantive expert
turns). Run 2 is a longer interview then a forced construct (expert never answered the last
sequencing/run-time battery).

### Headings that carried useful meaning

**What the model must answer.** Run 2 is the positive case:

> Can the master scheduler justify holding a line idle to avoid a later washdown? When a line
> goes down mid-week, what is the least-disruptive reshuffle to keep Meridian orders on time?

That pair later explains why idle-hold is omitted from the first net, why Line-2-down is a
scenario not a Poisson rate, and why utilization is secondary. Run 1’s equivalent is a generic
brief (“which orders run on which lines…”) that could license almost any plant detail. The
heading works when it is a testable question, not a role description.

**What it must not claim.** Both runs used this as a boundary on honesty (raw materials, shipping,
unwritten commercial $). Useful. It overlapped Omissions.

**Participants, locations, and resources.** Both runs put the three lines and the crew here. Run
2’s line cards are the best single-home content in either IR: qualification, shifts, relative
speed, physical cannot-run. A cold reader can start constructing from this section.

**Situation notes.** The template’s only repeated entry shape, and the most useful invention. Run
2’s four notes (crew bottleneck, VW-02, idle-hold, Line 3 overtime) each carry notice / known /
open / record-for-construction. That is where typology recognition actually landed. Run 1’s notes
are thinner but still the place a constructor would look for “what is load-bearing.”

**Validation criteria (Run 2 only).** Filled with the expert’s own usefulness tests (hold-vs-switch
comparison; Line 2 breakdown reshuffle; outputs: late Meridian, changeover hours, utilization).
This is the only section that tells construction *what the net is for* in operational terms. Run
1 left it as `**Not yet asked.**`

**In-place unsettled marks inside the plant sections.** Run 1 Line 2: “**Not yet asked:** Can it
run tints?” Run 2 Line 3 speed: “**Not yet asked** — assumed between Line 1 and Line 2.” These
marks, sitting next to the fact, were more usable than the closing dump.

### Headings that became dumping grounds

**Goals, constraints, measures, and thresholds (Run 2).** This section swallowed hard eligibility
(Meridian→Line 2, Line 2 cannot run specialty, CT-12/14, crew hours) alongside ranked goals and
customer-flexibility thresholds. Constraints that are really resource properties or adjacency
rules are harder to find later. Construction had to re-derive “VW-02 cannot follow dark tint”
from here **and** Flow **and** a Situation note.

**Unknowns, assumptions, conflicts, and omissions.** Designed as a ledger. In both runs it became
a second copy of in-place marks, with weaker typing. Run 1’s Unknowns list mixes never-asked
items (Line 2 speeds, crew shared-or-dedicated, run-sizing) under a heading the template reserved
for “asked, the expert does not know.” Run 2 splits Unknowns from Not yet asked in that dump —
better — but still repeats the plant sections.

**Activities, inputs, outputs, and resource usage vs Time, quantities, and stochastic behavior vs
Flow.** Durations and washdowns are written three times. Run 2 Flow already has the directional
matrix; Time repeats it; Activities abstracts the run. A constructor cannot know which copy is
canonical. Run 1 put the TC-17 stage times under Activities **and** again under Time.

**Policies, exceptions, and practiced rules.** A true mixed bag: assignment rules, unwritten
adjacency, customer flexibility, crew contention, evening-shift waiting. Some of these are
eligibility, some are objectives, some are calendar. The heading invited “anything that sounds
like a rule.”

**Who it is for (Run 2).** Audience leaked into plant inventory: “Weekly demand book, three filling
lines, one changeover crew.”

### Empty, formulaic, or premature

**Validation criteria (Run 1):** one line, `**Not yet asked.**` The interview never asked what
would make the result accurate enough.

**Projection losses (Run 1):**

> **Not yet constructed**, so losses not yet identified. Will include:
> - Qualitative goal "don't get shouted at" → needs quantitative proxy
> …

That is a prediction, not a loss register. The template asked for “something the net cannot
represent,” which construction had not yet attempted.

**Assumptions (Run 1):** “None introduced yet — construction will require many.” False as a
conservation claim: Letdown already says “**Assumed:** Similar for all tints.” The dump disagrees
with the in-place mark.

**Conflicts (Run 2):** “None identified yet.” True only if the interviewer never introduced a
tension. The last unanswered battery proposed numeric run times (“Line 1: maybe 7–8 hours?”) that
the expert never confirmed; the IR correctly did **not** file those numbers — a quiet success —
but also did not record “agent-proposed figures, unsettle.”

**Appetite (Run 2):** “Willing to accept assumptions for unknown durations.” The transcript does
not show the expert granting that license. Formulaic stance, unmarked as inferred.

**Projection losses (Run 2)** mixed three things: formalism limits (gut-feel idle-hold), missing
definitions (dark tint), and not-yet-elicited precision (run-time formulas). The subheadings
“Cannot represent” vs “Loss if not elicited further” show the agent felt the strain and invented
structure the template did not give.

### Distinctions represented only by prose convention

- **Bold labels** (`**Unknown**`, `**Not yet asked**`, `**Assumed**`) — parsed by a human, not by
  the heading tree. Run 1 used “**Conflict or clarification needed**” inline, which is not in the
  template’s six words.
- **Quoted expert fragments** appear as colour, not as evidence spans: “changeover crew came
  over”; “gut feel”; “nobody notices.” No excerpt/pointer pair.
- **Family × line eligibility** is a table in prose. Construction later needed it as guards.
- **Directional washdown matrix** is a bullet list. Nothing forces completeness of the from/to
  pairs (Run 1 still missing white-to-white, clear-to-anything).
- **Reserved vs consumed** is a sentence under Resource usage.
- **Scenario vs stochastic event** is a parenthetical: “Modeled as a future scenario input, not a
  stochastic event in the base model.”
- **Record for construction** already speaks “crew token,” “Guard,” “parameterize.” Expert
  vocabulary stops; PN vocabulary starts. Convention, and a leak.

### Material that was hard to find or reconstruct

From transcript vs IR:

- Run 1 expert: “maybe six hours total” for two washdowns. Interviewer later asked as if “~3
  hours” were already settled. The IR conserved the tension; construction then **used 3 hr**.
  Conflict was visible and still not binding.
- Run 2 expert: “I do it in Excel and then improvise at the morning huddle.” The practiced
  planning medium and improvisation loop barely survive (Purpose says “decision-support,” not
  Excel+huddle).
- Run 2: Monday scan order — Meridian first, then sort by family. Compressed into “Meridian
  orders prioritized early.” The actual attentional sequence is gone.
- Run 2: “Hasn’t happened yet, knock on wood” for Line 2 down. IR keeps the panic response, drops
  the base-rate information (zero observed events).
- Run 2: QA staging “in totes or on pallets,” specialty up to a day. Physical move is lost; delay
  remains. Objective-relative collapse, but unmarked as such except in Boundary.
- Run 2: qualification list “changes maybe every couple months.” IR treats CT-12/14 as a static
  not-qualified fact. Horizon of the constraint is gone.
- Run 2: “barely worth starting the mill” for 50–100 unit tints. Buried as a parenthetical on an
  assumption about linear scaling, not as a grouped-movement / setup-cost typology.
- Run 2 last user turn never happened: the agent asked for a four-order Line 2 sequence
  walk-through. IR marks sequencing “Not yet asked” — correct — but a cold reader cannot see that
  the question was **posed and interrupted**, which changes what “smallest next question” is.

From IR vs construction:

- Run 1 constructor still needed Lines 2 and 3, the decision logic, due dates, and shift calendar
  — all marked in the IR, so conservation succeeded and acquisition failed. The net then invented
  `label`/`arcs` schema (`fe-1525-headless-runbook-pn.md` item 6).
- Run 2 IR is rich enough that a human can see crew contention, directional washdowns, and
  eligibility. The paid validated-construction run never reached places or arcs (nine `addType`
  schema rejections). That failure is a tool-schema miss, **not** an IR miss — but it also means
  we still lack evidence that this IR shape is sufficient to build a semantically faithful net.
  Proof: “There were no line modes, changeover-crew reservation, product restrictions, directional
  washdowns, arcs, or delivered loss review to compare against the IR.”
- Run 2 free-form `pn-json` construction (same IR, earlier in the interview transcript) **did** try
  to encode the IR and then: invented per-unit rates from 4–6 hour hedges; assumed FCFS for the
  crew; omitted the 6 AM–2 PM window; omitted VW-02 for missing “dark”; collapsed rinse to 0.4 hr
  midpoint. Several of those numbers were hedges in the IR (`4–6 hours`, `20–30 min`) silently
  hardened in the net — the exact hard-failure class the oracle names.

---

## Candidate structural families

Hypotheses only. None is a chosen schema. None restores the ten-kind kernel.

### Family A — Spine with overlays

One short process spine: what arrives, what it becomes, what occupies what, in what order,
including the walked case. Overlays attach to named spine items: resources (capacity, window,
eligibility), change matrix (from→to cost, who, when), rules (practiced/prescribed,
hard/preference), quantities (typical/tail/unknown), and a gap list **indexed to the objective**.

**Easier:** construction’s mapping rules (places / transitions / reserved tokens) have a home;
directional washdowns and crew windows stay together; collapse of mix→fill is a named overlay on
the case, not a second process.

**Harder:** elicitation must file into the spine instead of the expert’s thread; risk of
schema-shaped interviewing if the spine is shown too early. Situation notes would become overlay
seeds, not a parallel essay.

### Family B — Claim ledger, light grouping

Every material statement is an entry: text, author (expert/agent), epistemic mark, optional
excerpt, optional “bears on objective *id*.” Grouping headings are an index, not storage.
Situation-typology tags are optional labels, not types.

**Easier:** conservation and epistemic fidelity; cold audit; shadow-join to later captures
(statement→excerpt) without a fold; conflicts are two entries, not a paragraph.

**Harder:** constructor must assemble a plant from a bag — the exact problem ADR-0003 named for
typed captures. Without a required spine view, you can have a faithful ledger that is not a
model. Completion becomes “enough entries” unless an objective-slice index is mandatory.

### Family C — Objective slices, cases, then residue

The document opens on one or more modelling questions. Each slice lists: supporting settled
facts, licensed assumptions, blocking gaps, nominated next question, and what “good enough to
test this” looks like. Walked cases sit under the slice they serve. A residue section holds plant
facts that no current slice depends on (visible, not demanded).

**Easier:** question-relative completion without demand rows or precision ladders;
smallest-next-question is a field, not a hope; Run 2’s idle-hold vs Line-2-down would not compete
with mill-tank trivia.

**Harder:** facts that serve two questions duplicate or require references; a constructor still
needs a merged plant view; risk of dropping residue that later construction discovers it needed
(the return-to-elicitation path).

A hybrid of A+C is tempting and should stay unchosen until a probe shows which pain is live:
constructor reassembly (favours A) or completion-blind coverage (favours C). Family B is the
right probe if the next failure is silent hardening and missing quotes, not missing nets.

---

## Cold-review oracle

A reviewer who receives **only** the modelling objective (or the IR’s purpose section) and the IR,
not the transcript, should be able to:

1. **Retell the intended process** in the expert’s nouns: what arrives, what is occupied, what
   order, what branches, what waits. Failure class: *conservation miss* or *missing spine* (Run 1
   Line 2/3 holes are honest; an invented fourth line would be fabrication).
2. **State the decision the model is for**, and what it must not claim. Failure class: *syntactic
   fullness without an objective-relative slice*.
3. **Separate expert-settled claims from agent assumptions and from never-asked items.** Failure
   class: *silent hardening* / *unlicensed influence* (Run 1’s 3-hour washdown; Run 2’s “willing
   to accept assumptions”).
4. **Keep both sides of any conflict** and say it is unresolved. Failure class: *conflict
   collapse*.
5. **Name load-bearing unwritten rules and eligibility cuts** (who cannot run what, what cannot
   follow what). Failure class: *policy/practice collapse* or *preference encoded as physics*.
6. **Point at contended resources and say whether a practiced winner-rule exists.** Failure
   class: *inferred schedule-as-rule* or invented FCFS presented as theirs.
7. **List quantities with their basis** (one incident / typical / tail unknown / expert does not
   know). Failure class: *incident stored as rate*; *hedge stored as point*.
8. **Nominate the smallest next question** that would most change the ability to test the stated
   objective — not a tour of empty headings. Failure class: *gap laundry list*; *unsupported
   completion*; *construction-named gaps instead of a question* (proof fog 5).
9. **Say what a first net may omit** because the objective permits it, versus what the net cannot
   represent even if known. Failure class: *omission/loss confusion*; *prospective losses*.
10. **Refuse to certify completion** because the headings are populated. Failure class: *fluency /
    coverage as done*.

If two reviewers disagree on (3), (8), or (9), the IR’s marks are conventional, not structural.
If they can reconstruct (1) but not (8), the document is a plant essay, not a workpiece for
elicitation. If they can do (8) but not (1), it is a gap tracker, not a construction input.

---

## Keep / move / rewrite / cut

Assessment of `apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md` only. No edit implied.

**Keep**

- The six unsettled labels (Unknown, Not yet asked, Assumed, Conflict, Omitted, Loss) as
  **vocabulary**, including the one-line definitions. They earned their keep in both runs when
  used **in place**.
- “Construction consumes this document, not the transcript.”
- “Do not read these headings aloud as a questionnaire.”
- Prefer expert words; restatement is not theirs until settled.
- Empty demanded homes stay present with a hole mark.
- Full-document emit (recovery constraint).
- Situation notes as a **repeated entry shape**. The child headings Notice / What we know / Open
  questions are the best local design. `Record for construction` is useful and also the leak —
  rewrite, don’t cut the note.

**Move** (content obligation, not necessarily these titles)

- Purpose’s testable question should filter every later section; Who-it-is-for should not hold
  plant inventory.
- Stance (appetite, grain, assumption-tolerance) should not share a home with plant boundary, or
  the mixing in Run 2 repeats.
- Quantities should attach to the activity/resource they measure; a standalone Time section
  invited duplication.
- Eligibility, directional change, and calendar availability should be findable together (they
  are the construction spine for this case).
- Construction-time losses should not share a home with elicitation-time unknowns.

**Rewrite**

- `Unknowns, assumptions, conflicts, and omissions` as a closing dump: either make it an index of
  in-place marks (no new classification) or drop it. Run 1 used it to mis-file never-asked items
  as Unknowns.
- `Projection losses`: empty-before-construction is honest; “Will include” is not. Rewrite the
  instruction: seed only known unrepresentables; fill at construct.
- `Record for construction`: keep the intent (what the constructor must not miss); forbid PN
  nouns during elicitation, or mark that child as agent-only and optional until construct.
- Maintenance rule on supersession: untested. Rewrite only after a real correction appears; until
  then leave it.
- `Goals, constraints, measures, and thresholds`: the four nouns are four obligations. One
  heading made a dump.

**Cut** (or stop requiring)

- Any implication that matching the heading catalogue is IR completeness (`checks.md` already
  says it is not; the template’s empty-section rule still tempts coverage interviewing).
- Prospective loss bullet lists.
- Duplicate duration/changeover matrices across Activities, Flow, and Time — keep one canonical
  home once chosen.
- Do not cut Situation notes because they look extra; they did work the flat headings did not.

---

## Rejected re-entry

Prior typed machinery, and the strain that would be required to reconsider each item. Absence of
strain is not a forever ban; it is the current bar.

| Machinery | Why it looks tempting | Why evidence does not justify restore | Strain that would reopen it |
| --- | --- | --- | --- |
| Closed kind catalog (entity-type, activity, policy, …) | Investigation headings echo Layer B kinds | Mission 3 IRs classified nothing into kinds; situation notes used typology **names** as essays. Restoring kinds would recreate questionnaire interviewing (already an observed smell: opening batteries of 4–10 questions) | Constructor repeatedly cannot find a class of fact **and** elicitation already captured it under a wrong heading, after a spine/overlay rewrite failed |
| Kind/slot demand rows and must-know tables | Smallest-next-question wants a checklist | `checks.md` already states enough without slots; Run 2’s useful next questions came from objective + open typology holes, not from empty slots | Reviewers cannot name a next question from IR+objective after Family C is tried |
| Precision ladder (`number` / `range` / `spread`) gating completion | Hedges were silently hardened at construct (4–6 h → 0.0075 hr/unit) | The miss is **hardening**, not missing grade enums. Marking typical-vs-tail and forbidding midpoint-without-license would address it | Construction keeps emitting point values from hedges **after** an explicit “do not midpoint” rule is in the IR |
| Capture proposal types, envelopes, sweep, fold table | Auditability; oracle shadow-join | No capture store on this path (`wroteCaptureStore: false`). IRs have no ids. Condition-5 latency was the reason Mission 3 avoided this. Shadow-join is specified as **offline evaluation**, not interviewer mechanism | Offline maps show most IR claims are cross-turn editorial synthesis **and** a statement→excerpt index is still not auditable enough |
| Typed completion algebra / `evaluateCompletion` | “Done” without self-report | Both runs delivered `partial-with-named-gaps`. Floor counts would have passed Run 1 (it has an objective, entities, a flow) while the net could not test scheduling. That is the algebra’s known failure mode | A boolean is required by a consumer **and** question-relative slices in the IR still cannot stop unsupported completion |
| Epistemic-status enum as capture identity (`explicit \| inferred \| …`) | Distinctions 1–3 | The six Markdown labels already cover the live cuts. `defaulted` / `external-lookup` / `basis` never appeared (no lookups) | Non-user sources enter the IR and cannot be marked without colliding with Assumed |
| Confidence grades (`firm \| hedged \| speculative`) | 4–6 hours, ~3 hours, “maybe” | Hedging survived as numeric ranges and words. A third axis was not needed to see them; construction ignored the hedge anyway | Graders cannot agree whether a range is a value or a gap |
| Source-regime as a typed attribute on every node | VW-02, commercial penalties | A per-rule practiced/prescribed mark is enough; “one model not two” still holds | Divergent prescribed vs practiced accounts of the **same** step appear and get averaged |
| Evidence spans as session-id + entry-range | Oracle observability gap | Neither IR used pointers. Excerpts would already enable cold audit. Pointers without excerpts do not help a transcript-blind reader | Excerpts exist and still cannot disambiguate which turn settled a correction |
| Absence-state enum (`unknown-to-user \| not-applicable \| …`) | Template already has Unknown / Omitted | Two labels plus Not yet asked covered the artefacts. `declined` / `deferred` did not appear | Expert refuses a topic and the IR files it as Not yet asked, repeatedly |
| Motif/pattern vocabulary in the IR | Situation notes resemble patterns | Notes worked as prose. Motifs in the payload were already demoted historically for zero uptake | Projection demonstrably needs a hint the note’s Record-for-construction cannot carry |
| Register-2 fold as production IR | ADR-0003 acceptance oracle: a second projection consumes the model without the transcript | That oracle is **exactly** what the Markdown IR is testing. A fold is one implementation of the oracle, not the obligation. Mission 3 established a recoverable Markdown workpiece, not a pure fold | Order-perturbed interviews yield divergent active meaning that only a fold can stabilize, **after** evidence links exist |
| New persistence surface for the IR | Recovery via fence is brittle (omitted closing fence noted in proof fog 4) | A store would be a durability fix, not an IR-shape fix. Out of scope until recovery fails a mission | Fence scrape loses the workpiece on a real path after packaging is otherwise closed |

---

## Completion notes

The IR’s job is conservation and cold utility for elicitation, checking, and construction — not
syntactic fullness, not a typed kernel, not a capture fold.

What must be conserved from the expert is settled wording, walked cases, eligibility, directional
change, contention, unwritten rules, hedges, and honest holes. What the agent authors —
restatements, collapses, construction hints, assumption-tolerance — must stay marked. Assumptions
and transformations are licensed only when named. Unknown, not-yet-asked, conflict, omission, and
loss are different holes. Objective, stance, and boundary are filters, not plant chapters.
Process relationships need a locatable spine; quantities and rules attach to it. Evidence needs
at least a quote on load-bearing claims before anyone restores spans or stores. Completion is the
smallest next question relative to the objective. Later construction needs reservation/return,
from→to cost with who and when, and named inferences — which the current heading tree scattered
and duplicated.

The two real IRs show the template is good enough to file a construction-ready essay and not good
enough to make epistemic marks, quantity bases, or the process spine unambiguous. Situation notes
did the most work. The closing dumps did the least. Prior kinds, slots, grades, fold rules, and
completion algebra remain available as research evidence; they have not reappeared as
obligations.
