# Spec: CPS interview guidance

Status: **provisional, desk-tested pack content**. This is the FE-1403 handoff to CPS plugin
authoring. It defines the evidence-bounded card and clarification-hint set supported by the two FE-1361
baseline transcripts, the FE-1407 failure catalogue, and the FE-1402 completion replay. It is not
runtime activation evidence.

The completion projection owns gap detection and adjudication. A card receives a clause-level
diagnostic and asks for evidence that could change the named slot. No card infers completeness,
changes a completion grade, turns `not-mentioned` into an absence, or claims that asking the expert
what was missed can discover an unknown omission.

Vocabulary and mechanics come from the [plugin contract](plugin-contract.md) and the
[completion contract](elicitation-completion.md). The fixed target IDs and full coordinates used
here are declared in the [FE-1402 replay
DemandTable](../evidence/proofs/design/elicitation-completion-rehearsal.md#provisional-cps-demandtable).
For this packet, the applicable quantity ladder is `verbal < point < range < quantiles`, the
condition ladder is `verbal < structured`, and the accepted completion statuses are `explicit`
and `inferred`. Other statuses remain representable but do not pass these fixed clauses.

## Card contract

Each card has the kernel-card fields `Detects`, `Goal`, `Questions`, and `Artifacts`, plus the two
classifications FE-1403 needs:

- **Tag** is `domain` or `envelope-generic`.
- **Mechanism** is `attention`, `technique`, or `license`. Attention points native model ability at
  a diagnostic. Technique supplies a method the baseline did not reliably apply. License permits a
  useful move that a cooperative model may suppress.

`Detects` means **the diagnostic this card accepts**, not detection performed by guidance. It names
either one of FE-1405's seven `firesWhen` predicates (`slot-unaddressed`,
`below-demanded-grade`, `unspecified-marker-present`, `conflicted-open`,
`absence-uncorroborated`, `uniformity-unprobed`, `identity-ambiguous`) or an explicitly different
interaction signal. A card does not widen that enum. Every produced capture keeps epistemic status
and grade separate: status says how the content relates to its source; grade says how narrowly the
slot is stated. Model-authored examples and transformations never become user evidence.

The `Detects` lists below are **design-time disjunctions**, not values that can already be serialized
losslessly into `ProposalType.affordance`. FE-1405 currently permits one `technique` and one singular
`firesWhen` value per proposal type. Several evidence-backed cards need the same technique under
more than one slot-state predicate. FE-1431 must therefore choose an authoring representation —
for example, multiplicity in the binding, or deliberately split proposal/card bindings — before
these lists compile. Until that decision, plugin authors must not collapse a list to one preferred
predicate or imply that the current hook represents the whole card.

## Surviving cards

### CPS-Q01 — Separate failure occurrence from repair

- **Tag:** `domain`.
- **Mechanism:** `technique`.
- **Detects:** `slot-unaddressed`, `below-demanded-grade`, or
  `unspecified-marker-present` on `dynamics[line-failure].occurrenceFrequency` or
  `.repairDuration`. Treat the two coordinates independently.
- **Goal:** obtain a range for how often each named failure occurs and calibrated distributional
  evidence for how long repair takes, without treating one memorable outage as a frequency.
- **Questions:**
  1. "For **[failure mode]**, how often does it happen in an ordinary period? Give a plausible
     range, not the worst incident."
  2. "Now separate repair from occurrence. Realistically, what is the lowest plausible repair
     time? The highest? Your best guess? How confident are you that the interval contains the next
     repair time?"
  3. When the clause still demands quantiles, follow the interval-first IDEA pass with a median and
     conditional quartiles. Do not start with "typical" and then fit a triangular distribution.
- **Artifacts:** distinct typed proposals that fold to occurrence and repair, each retaining its
  verbatim statement, qualifier, evidence span, status, confidence, and actual grade. An IDEA
  interval remains `range` until directly elicited percentile meanings justify quantiles; any
  later standardization follows its owning proposal and epistemic-status contract.
- **Targets:** `BR-OCC` / `dynamics[line-failure].occurrenceFrequency` at `range`; `BR-REPAIR` /
  `dynamics[line-failure].repairDuration` at `quantiles`.
- **Failure signatures:** FM-06 silent hardening, FM-07 invented-content leakage, FM-14 unresolved
  ambiguity bypass.

This card chooses the imported IDEA (Investigate, Discuss, Estimate, Aggregate) protocol's
interval-before-best-guess ordering over the [v0 prompt's](../../evaluations/protocols/process-model-elicitation/baseline/v0-prompt.md)
typical-first script because the imported protocol supplies that order and a calibration question.
The [FE-1360 research deposit](../reference/research/elicitation/elicitation-strategy-literature.md#14-numbers-vs-distributions-vs-stories),
not the transcript replay, owns the anti-anchoring rationale. The replay establishes only that the
baseline left demanded occurrence and repair grades unresolved.

### CPS-Q02 — Elicit changeover loss, including ramp scrap

- **Tag:** `domain`.
- **Mechanism:** `attention`.
- **Detects:** `slot-unaddressed`, `below-demanded-grade`, or `absence-uncorroborated` on
  `dynamics[family-changeover].rampScrap` or `dynamics[split-run].repeatedRampScrap`.
- **Goal:** make the product loss caused by a family switch answerable by transition direction, and
  account for the repeated loss introduced by a split.
- **Questions:**
  1. "For **[from family] → [to family]**, are the first units after the change usable? What range
     is scrapped on an ordinary changeover?"
  2. "If the order is split across two lines, which extra family switches happen, and does each
     create the same ramp loss?"
  3. If the expert does not know, ask for the least-burdensome source the expert identifies as
     authoritative for this fact (for example, one observed changeover or the line's scrap log).
     Do not substitute a threshold invented by the interviewer.
- **Artifacts:** a direction-scoped typed dynamics proposal for ramp-scrap magnitude and a distinct
  split-run proposal for repeated scrap. If the expert says they do not know, the clause remains
  failing; the current contract may propose a field-local absence only after the
  [absence-locator seam](plugin-contract.md#the-envelope-is-untouched) has an approved representation.
  A promised observation is not the value.
- **Targets:** `IW-SCRAP`, `CH-SCRAP`, and `SP-SCRAP` at `range`.
- **Failure signatures:** FM-08 never-asked coverage blindness, FM-09 complementary-miss
  instability, FM-13 fluent incompleteness, with FM-06/FM-07 guards on any numeric bridge.

The diagnostic discovers the hole. The question only reacts to it. Reflective self-inventory is
not a detection mechanism.

### CPS-Q03 — Bound the split-run policy

- **Tag:** `domain`.
- **Mechanism:** `attention`.
- **Detects:** `slot-unaddressed` or `below-demanded-grade` on the split-run batch, minimum-size,
  contiguity, or extra-changeover coordinates after a `split-run` objective activates its row.
- **Goal:** determine which splits are feasible and how a split changes the schedule, rather than
  representing "split it" as a cost-free allocation choice.
- **Questions:**
  1. "What is the smallest batch or run that each relevant line will actually accept? Give the
     ordinary range and any product-family exception."
  2. "Once an order starts on a line, must its batches stay contiguous? If another order may be
     interleaved, what rule permits it?"
  3. "For a real large order, compare whole-on-one-line with split-across-two: which additional
     changeovers, cleans, and ramp-scrap events occur? Across ordinary eligible orders, what is the
     plausible low-to-high count of extra changeovers or cleans?"
  4. "For each extra start or changeover, what ordinary low-to-high ramp-scrap quantity repeats,
     and which product-family exceptions change that range?"
- **Artifacts:** structured `batchStructure` and `split-contiguity.rule` proposals, a ranged
  `minimum-run-size.threshold`, and ranged `split-run.extraChangeover` and
  `split-run.repeatedRampScrap` proposals. Exceptions remain scoped; they do not overwrite the
  ordinary rule.
- **Targets:** `SP-BATCH`, `SP-MIN`, `SP-POL`, `SP-CO`, and `SP-SCRAP`.
- **Failure signatures:** FM-06 silent hardening, FM-08 never-asked coverage blindness, FM-13
  fluent incompleteness.

### CPS-Q04 — State the order-release gate

- **Tag:** `domain`.
- **Mechanism:** `attention`.
- **Detects:** `slot-unaddressed`, `below-demanded-grade`, or
  `unspecified-marker-present` on `boundary-condition[order-release].condition`.
- **Goal:** replace a time-shaped approximation such as "tomorrow morning" with the practiced
  release condition that permits production to begin.
- **Questions:**
  1. "What exact state or event makes an order runnable: a timestamp, an ERP status, a person, or a
     conjunction?"
  2. "For the **[named incident]**, what was still false, who or what changed it, and where could we
     observe that change?"
  3. If prescribed and practiced release differ, record both without choosing one silently.
- **Artifacts:** a structured `condition` proposal with the practiced trigger and its observable
  field/source; when present, a separate prescribed variant and an unresolved divergence rather
  than a synthesized winner.
- **Targets:** `IW-REL` / `boundary-condition[order-release].condition` at `structured`.
- **Failure signatures:** FM-06 silent hardening, FM-07 invented-content leakage, FM-14 unresolved
  ambiguity bypass.

### CPS-Q05 — Elicit the resource-conflict rule

- **Tag:** `domain`.
- **Mechanism:** `attention`.
- **Detects:** `slot-unaddressed`, `below-demanded-grade`, or
  `unspecified-marker-present` on `policy[resource-conflict].rule`.
- **Goal:** obtain the practiced priority and tie-break rule when simultaneous demands compete for
  a shared resource, including its exceptions, rather than assuming that the schedule itself
  resolves contention.
- **Questions:**
  1. "When **[demand A]** and **[demand B]** need **[shared resource]** at the same time, who or what
     wins first?"
  2. "What facts can override that priority — customer, lateness risk, line state, safety, or a
     named person's judgment — and how are ties broken?"
  3. "Give one recent borderline case. Which rule was actually used, and where could the decision
     or its cues be observed?"
- **Artifacts:** a structured `policy[resource-conflict].rule` proposal containing priority,
  tie-break, scope, and practiced exceptions; prescribed and practiced variants remain distinct
  when they diverge.
- **Targets:** `BR-POL` / `policy[resource-conflict].rule` at `structured`.
- **Failure signatures:** FM-06 silent hardening, FM-08 never-asked coverage blindness, FM-13 fluent
  incompleteness, and FM-14 unresolved ambiguity bypass.

C1 leaves `BR-POL` unaddressed. C2 reaches structured evidence only after the v0 prompt explicitly
directs conflict-point probing, so this is prompted success rather than redundant native instinct.
Penalty-weight co-construction remains a separate native strength and does not justify omitting the
conflict-rule card.

### GEN-Q02 — Bound a conversational question batch

- **Tag:** `envelope-generic`.
- **Mechanism:** `license`.
- **Detects:** an opening or follow-up turn about to contain more than four independent questions,
  or a user burden cue while a large batch is pending. A cohesive five-item group is a soft warning,
  not an automatic fire. This is an interaction signal read by the assembled pack instruction, not
  a new FE-1405 `firesWhen` value or an implemented dispatcher.
- **Goal:** preserve coverage without making the user choose silently among a battery of questions.
- **Questions:** default to two to four related questions in one turn. Five is permissible when the
  items form one compact response frame and the user remains engaged. After the answer, select the
  next batch from current clause diagnostics.
- **Artifacts:** ordinary evidence for the addressed objective or slots; no batch record and no
  completion implication.
- **Targets:** initially `SF-OBJ` and objective proposals (`question-to-answer`, `goal-noted`,
  `penalty-noted`), then whichever clauses the returned objective activates.
- **Failure signatures:** FM-12 opening overload and FM-04 premature accommodation.

The two-to-four default is a deliberate, one-run-vindicated departure from strict one-question
guidance. The replay distinguishes a 29-question overload from a successful four-question opener;
it does not establish a universal optimum or reject every five-item group.

## Clarification and close fragments

### HINT-STATUS-GRADE — Say what can change

When a clause fails, name the coordinate, current evidence status, current grade, demanded grade,
and missing evidence. Ask for the smallest evidence delta. Never say that a more precise answer is
more explicit, that an explicit answer automatically has adequate grade, or that a tentative
answer passes because it is numeric. These are inherited completion-contract invariants, not a
separate intervention effect established by this replay.

### HINT-RESPECTFUL-CLOSE — Best useful result now

When the user signals a time or appetite limit, first honor whether they choose to stop now or
explicitly offer a bounded continuation. If they stop now, the pack instructs the interviewer to:

1. acknowledge the limit and stop opening new lines of inquiry;
2. state the best useful result available now and the clause-level gaps that still affect it;
3. request the existing controller's settle, sweep, and durable current-projection operations, with
   visible loss; and
4. report the existing controller's deferral-licensing result rather than computing or storing one.

The user may stop regardless of licensing, and stopping never changes completion. If licensing
fails, stop asking as requested, say what is not recoverable, and do not promise a future session
or future delivery. The controller and existing authorities own every state change; this fragment
creates no persistence surface, delivery-obligation record, lifecycle status, or quieting action.

## Pack handoff

The five `CPS-*` cards belong in the CPS ElicitationPack. `GEN-Q02` is included for milestone one
but tagged for FE-1406's reusable-strategy review. FE-1406 should receive it as an evidence-bearing
candidate, not assume it has graduated into harness machinery.

The card IDs and their design-time diagnostic disjunctions are inputs to plugin authoring, but the
current singular `ProposalType.affordance.firesWhen` hook cannot represent several of them
losslessly. FE-1431 owns the multiplicity-versus-split-binding decision. Only diagnostics from the
existing seven-value enum may eventually populate `affordance.firesWhen`; the batching and
respectful-close interaction signals remain pack guidance unless their owning contracts later
adopt them. This packet therefore hands authoring a tested content set **and an explicit blocking
representation seam**, not a compilable manifest.

## Claims and limits

- "Smallest" means the selected set after the recorded candidate dispositions, not a proof that no
  smaller equivalent pack exists.
- The cards are desk-supported against two fixed transcripts, one run per condition. They do not
  establish activation reliability, effect size, or runtime behavior.
- The replay DemandTable is provisional. These IDs bind this evidence packet, not the final plugin
  schema.
- The singular FE-1405 affordance hook cannot encode the cards' observed diagnostic disjunctions.
  FE-1431 must settle binding multiplicity or an evidence-preserving split before authoring can
  claim a lossless declarative representation.
- The absence-locator seam remains unresolved. A card may ask for evidence but cannot make a
  field-local absence storable by inventing a locator.
- The repository's truck-fleet dossier is missing. The cards have baseline-case provenance, not
  dossier-backed domain provenance.
- Completion, delivery, stopping, deferral, and no-progress remain separate computed or observed
  facts. Guidance owns none of their adjudication.
