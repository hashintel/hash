# Frontier-model elicitor failure catalogue

FE-1407 asks which failures matter once a capable language model already avoids most mistakes in
an instrument built from novice human interviews. This catalogue answers from the two existing
truck-fleet baseline transcripts and the repository's indexed elicitation literature. It specifies
what later evaluation should look for and which layer the evidence holds accountable for
prevention. It does not implement a detector, prove a prevention mechanism, or estimate a failure
rate.

The baseline runs are one sample per condition. A baseline citation therefore establishes that a
failure occurred, not how often it occurs. Literature entries retain the source population and
setting. A mechanism is a bounded causal account that fits the evidence; it is not a measured
internal state of the model.

## Type and evidence rules

Every entry has the same fields:

- **Class** groups the operational consequence: stopping, deposit, semantic integrity, coverage,
  delivery, or interaction.
- **Evidence** is explicitly labelled as a baseline observation, a published observation, or a
  synthesis made by this catalogue. An entry can contain more than one separately labelled
  evidence field.
- **Mechanism** states why a trained, cooperative model can still produce the failure.
- **Detection signature** states what a later instrument can inspect. It is a specification, not an
  implemented detector.
- **Accountable layer** uses the baseline's three-layer split. **Disposition** is native model
  behaviour that guidance may exploit but cannot guarantee. **Technique** is pack or strategy
  guidance. **Machinery** is a harness, plugin, projection, binding, or application invariant.
- **Prevention claim** names the mechanism that claims responsibility and grades its present state:
  **observed** for a baseline guidance effect, **specified** for required but unproved behaviour,
  or **candidate** for a design claim that still needs review and execution evidence.
- **Successor evidence input** records the evidence or design pressure available to FE-1402,
  FE-1403, FE-1404, FE-1406, or FE-1431. These mappings do not amend those issues' contracts.

An entry can name more than one accountable layer, but it names one primary owner. "The model
should do better" is not an owner.

## Catalogue at a glance

| ID | Failure | Class | Primary owner |
| --- | --- | --- | --- |
| FM-01 | Pleasantry-loop stall | stopping | machinery: completion controller |
| FM-02 | Deliverable deferral without deposit | deposit | machinery: target-document state |
| FM-03 | Phantom future-session commitment | deposit | machinery: session and re-entry contract |
| FM-04 | Premature accommodation closure | stopping | machinery: completion controller |
| FM-05 | Budget-exhaustion engagement | stopping | machinery: completion controller |
| FM-06 | Silent hardening | semantic integrity | machinery: sweep and capture validation |
| FM-07 | Invented-content leakage | semantic integrity | machinery: evidence and basis validation |
| FM-08 | Never-asked coverage blindness | coverage | machinery: plugin demands and completion |
| FM-09 | Complementary-miss instability | coverage | machinery: computed coverage; evaluation protocol |
| FM-10 | Evidence-to-artifact drop | semantic integrity | machinery: provenance and deterministic projection |
| FM-11 | Dead-artifact delivery | delivery | machinery: projection and realization gates |
| FM-12 | Opening overload | interaction | technique: question-shape guidance |
| FM-13 | Fluent incompleteness | coverage | machinery: completion independent of fluency |
| FM-14 | Unresolved ambiguity bypass | semantic integrity | technique plus machinery: clarification and issues |
| FM-15 | Unlicensed influence or boundary crossing | interaction | technique plus interaction policy |

## Stopping and deposit failures

### FM-01 — Pleasantry-loop stall

- **Class:** stopping.
- **Evidence — baseline observation:** Baseline condition 1 said the interview was done and that
  only data remained, but did not deliver. Eleven subsequent turns included acknowledgements,
  dashes, and an explicit no-further-response message. The forced wrap then produced the artifact
  immediately
  ([condition 1 transcript](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-1.md),
  [baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#headline-findings)).
- **Mechanism:** The model had locally completed its interview plan and entered a socially polite
  closing mode. No state transition required it either to deliver or to record why delivery was
  blocked, so conversational closure replaced task closure.
- **Detection signature:** The last material state change and the last new evidence both precede a
  run of acknowledgement-only turns; required deliverables remain absent; completion has not been
  adjudicated.
- **Accountable layer:** **Machinery**, completion controller and no-progress advisory. Disposition
  explains the politeness but cannot own the stop decision.
- **Prevention claim — candidate:** A completion contract must separate interview sufficiency,
  unresolved obligations, and delivery. A no-progress signal may force adjudication, but it must
  not itself declare completion.
- **Successor evidence input:** FE-1402 receives an observed no-progress case in which interview
  sufficiency did not cause delivery. FE-1404 receives evidence for distinguishing "wound down
  without delivery" from delivery and licensed deferral.

### FM-02 — Deliverable deferral without deposit

- **Class:** deposit.
- **Evidence — baseline observation:** Condition 1 correctly refused to invent missing data,
  prescribed spreadsheet, rate, demand, and breakdown pulls, then placed the promised deliverable
  behind those pulls even though it could already produce a useful, caveated artifact
  ([condition 1 transcript](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-1.md),
  [readout: the 1→2 delta](../../evidence/evaluations/vestera-legacy-baseline/readout.md#the-12-delta--what-pack-content-alone-buys)).
- **Mechanism:** A sound epistemic disposition—do not fabricate—was coupled to an all-or-nothing
  notion of delivery. The model treated missing inputs as permission to postpone the output rather
  than as typed gaps inside a deliverable.
- **Detection signature:** The elicitor names external data or future work as a prerequisite; no
  current artifact is delivered; the unresolved items have no stored absence, typed issue,
  supporting evidence, owner, or resume action.
- **Accountable layer:** **Machinery**, target-document capture store and completion projection;
  **technique** can teach partial delivery but cannot make it durable.
- **Prevention claim — specified:** Missing inputs must become recorded absences or typed issues,
  and a projection must expose their loss. Refusal to invent remains correct. The prevention claim
  is that refusal no longer causes existing work to disappear.
- **Successor evidence input:** FE-1402 receives evidence that delivery with deposited gaps differs
  from deferral without deposit. FE-1403 receives pressure to preserve refusal to invent while
  enabling partial delivery. FE-1431 receives the provenance pressure around absence location and
  loss reporting.

### FM-03 — Phantom future-session commitment

- **Class:** deposit.
- **Evidence — baseline observation:** Condition 2 honestly inventoried missing work, scheduled a
  second session, prepared precise data requests and scenarios, and continued to do useful work.
  The evaluation setting could not grant the promised session, and the baseline implementation had
  no target-document state for that future session to inherit
  ([condition 2 transcript](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-2.md),
  [readout: headline finding 2](../../evidence/evaluations/vestera-legacy-baseline/readout.md#headline-findings)).
- **Mechanism:** The model followed a realistic multi-session practice without checking whether the
  substrate offered persistence and re-entry. The social promise created an imagined capability.
- **Detection signature:** A future session is promised, but there is no durable target-document,
  archived session pointer, swept high-water mark, open issue set, pending affordance, or re-entry
  briefing that would let another session resume the work.
- **Accountable layer:** **Machinery**, session binding, storage port, and re-entry briefing. The
  multi-session technique is not itself the failure.
- **Prevention claim — specified:** A session may go quiet with completion unsatisfied only after
  the evidence and unresolved obligations are deposited durably. Re-entry must be computed from
  that state. If those capabilities are absent, the elicitor must not promise a future session.
- **Successor evidence input:** FE-1402 receives a case separating session stopping from
  target-document completion. FE-1404 receives evidence that this baseline instance is evasive
  because no durable deposit was available, not because later continuation is inherently wrong.

### FM-04 — Premature accommodation closure

- **Class:** stopping.
- **Evidence — published observation:** LLMREI's GPT-4o interviewers responded to low-time or
  low-interest signals by ending quickly and could skip closing summaries and
  additional-stakeholder questions. The authors warn that this can lose important information, but
  report no frequency
  ([LLMREI](https://arxiv.org/html/2507.02564v1)). Bano's novice-human instrument includes an
  incorrect-ending item, but reduces it mainly to the missing summary
  ([Bano et al. manuscript](https://par.nsf.gov/servlets/purl/10105611)).
- **Mechanism:** Helpfulness and respect for user burden dominate an unrepresented completion
  obligation. The model treats a request to stop as evidence that the work is complete.
- **Detection signature:** A burden or impatience cue is followed by termination while demanded
  slots remain unaddressed and no explicit stop-with-gaps deposit exists.
- **Accountable layer:** **Machinery**, completion controller; **technique** owns a respectful
  closing script.
- **Prevention claim — candidate:** A user can always stop a session. Stopping must not silently
  change the target-document's completion status. Before quieting, the system records remaining
  obligations and offers the cheapest valid disposition: answer now, defer with deposit, decline,
  descope, or deliver with loss.
- **Successor evidence input:** FE-1402 receives published pressure to separate user control from
  completion adjudication. FE-1403 receives evidence for evaluating burden-aware closing guidance
  without treating a close as a completion verdict.

### FM-05 — Budget-exhaustion engagement

- **Class:** stopping.
- **Evidence — baseline observation:** Both baseline conditions required the forced wrap
  ([baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#headline-findings)).
- **Evidence — published observation:** In ReqElicitGym, GPT-5.2 without
  explicit reasoning averaged 19.98 of 20 turns while eliciting only 0.13 of the annotated implicit
  requirements; the authors read this as the absence of an effective stopping criterion
  ([ReqElicitGym](https://arxiv.org/html/2602.18306v1)). Other evaluated models stopped much earlier,
  showing that turn count alone does not identify the right boundary.
- **Mechanism:** Probing remains locally productive, so the model has no endogenous reason to
  adjudicate. A turn cap then becomes the de facto stopping rule even though it says nothing about
  completeness.
- **Detection signature:** The run reaches its budget or external force while required items remain
  open; no explicit finish decision relates the remaining work to the user's objectives.
- **Accountable layer:** **Machinery**, completion controller and evaluation protocol.
- **Prevention claim — candidate:** Completion is computed from plugin-declared demands, not turn
  count, conversational stability, or recent novelty. A budget can stop a session, but must route to
  a deposited incomplete state.
- **Successor evidence input:** FE-1402 receives evidence that budget exhaustion and completion are
  independent events. FE-1404 receives pressure to score stopping separately from coverage and
  turn economy.

## Semantic-integrity failures

### FM-06 — Silent hardening

- **Class:** semantic integrity.
- **Evidence — baseline observation:** Condition 1 turned "every week or two, half a shift" into an
  approximately ten-day failure interval and a triangular distribution; it placed an invented shade
  threshold and exact lateness limits inside confirmed rows. Condition 2 invented exact shift times
  and a truck schedule despite its detailed ledger
  ([readout: silent-assumption audit](../../evidence/evaluations/vestera-legacy-baseline/readout.md#silent-assumption-audit)).
- **Mechanism:** A model must make a precise artifact from vague language. If the semantic bridge is
  implicit, a useful formalization is easily mistaken for user-grounded fact.
- **Detection signature:** A precise value, category, threshold, distribution, or rule appears in a
  capture or artifact, but the cited utterance supports only a broader range or different grade; the
  bridge has no inferred/defaulted status and no documented transformation.
- **Accountable layer:** **Machinery**, sweep proposal validation, capture envelope, plugin proposal
  schema, and verbatim-containment checks.
- **Prevention claim — specified:** Low-grade values remain legal. Every semantic bridge is a
  reviewable inferred or defaulted assertion with provenance or basis. The deterministic fold may
  combine declared assertions but may not invent a narrower meaning.
- **Successor evidence input:** FE-1403 receives evidence for comparing grade-promoting follow-up
  guidance with guidance that forces false precision. FE-1431 receives the semantic-integrity
  pressure around proposal interiors, grade, basis, and the no-interpretation fold boundary.

### FM-07 — Invented-content leakage

- **Class:** semantic integrity.
- **Evidence — baseline observation:** Condition 1 invented a `SHADE` 1–5 instrument and a VW-02
  threshold inside confirmed model content. Condition 2 invented a daily truck schedule that
  directly affected its penalty window
  ([baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#silent-assumption-audit)).
- **Evidence — published observation:** LLMREI separately reports an unsupported project-price
  estimate ([LLMREI](https://arxiv.org/html/2507.02564v1)).
- **Mechanism:** The model fills a representational hole with a coherent local construct, then loses
  the distinction between its construction and the source record.
- **Detection signature:** A load-bearing artifact element has no supporting user span and no
  declared-default or documented-transformation basis, or a model-authored construct is cited as if
  it were user evidence.
- **Accountable layer:** **Machinery**, capture-store evidence/basis refusals and projection
  provenance; interaction policy owns unrelated privacy or data-scope requests.
- **Prevention claim — specified:** User-derived captures require user evidence. Defaults and
  external transformations require an explicit basis and cannot masquerade as confirmed user fact.
- **Successor evidence input:** FE-1404 receives evidence that invented interiors can exist inside
  confirmed rows even when an assumptions ledger is present. FE-1431 receives pressure to preserve
  the structural split between evidence and basis.

### FM-10 — Evidence-to-artifact drop

- **Class:** semantic integrity.
- **Evidence — baseline observation:** Condition 1's draft lateness place disappeared from the final
  net. Condition 2 dropped the volunteered skeleton night crew. Both interviews used prose
  attribution that required manual reconsolidation
  ([readout: residual gaps 2–4](../../evidence/evaluations/vestera-legacy-baseline/readout.md#residual-gaps-in-condition-2--the-evidence-derived-plugin-requirements)).
- **Mechanism:** The model repeatedly rewrites a large artifact from its narrative summary. A fact
  can be understood and even acknowledged, yet vanish during later synthesis with no broken
  reference to reveal the loss.
- **Detection signature:** A source-grounded active assertion has no model slot or projection
  disposition; or a previously present, still-active assertion disappears between renderings
  without supersession, retraction, exclusion, or loss report.
- **Accountable layer:** **Machinery**, durable capture, evidence spans, deterministic fold,
  projection loss reporting, and stable-element comparison.
- **Prevention claim — candidate:** Projections consume the derived model, not a reread transcript.
  Every active assertion is represented, explicitly excluded, or named in loss. Unrelated regions
  remain stable across a localized change.
- **Successor evidence input:** FE-1431 receives two observed losses for its fold, loss-reporting,
  and stable-element evidence, including the distinction between a localized change and unrelated
  projection stability.

### FM-14 — Unresolved ambiguity bypass

- **Class:** semantic integrity.
- **Evidence — published observation:** Ferrari, Spoletini, and Gnesi found that ambiguity in 34
  interviews often exposed tacit knowledge; silently choosing one interpretation loses that
  opportunity
  ([author postprint](https://openportal.isti.cnr.it/data/2016/353983/2016_353983.postprint.pdf)).
  ReqElicitGym found that all evaluated models strongly favored probing over clarification
  ([ReqElicitGym](https://arxiv.org/html/2602.18306v1)).
- **Evidence — baseline observation:** The baseline runs contain silent hardening from vague
  language into precise assertions
  ([baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#silent-assumption-audit)).
- **Evidence — catalogue synthesis:** Silent hardening is the artifact-side signature of the
  ambiguity bypass described in the published observations; the cited sources do not themselves
  make that cross-setting identification.
- **Mechanism:** Continuing the topic is generatively easier than pausing to preserve competing
  readings. A fluent interpretation hides the unresolved fork.
- **Detection signature:** A vague term, quantifier, unexplained domain term, contradiction, or
  multiple plausible reading feeds one precise assertion without a clarification turn, alternative
  group, or typed ambiguous/conflicting issue.
- **Accountable layer:** **Technique**, clarification hints and contrastive questions; **machinery**,
  alternative groups and typed issues.
- **Prevention claim — candidate:** Ambiguity remains durable until evidence resolves it. Guidance
  asks a contrastive question; storage prevents silent resolution.
- **Successor evidence input:** FE-1403 receives published and synthesized pressure for comparing a
  clarification card with native probing. FE-1406 receives evidence bearing on whether a generic
  disambiguation strategy can name a trigger in harness-owned ambiguity vocabulary.

## Coverage failures

### FM-08 — Never-asked coverage blindness

- **Class:** coverage.
- **Evidence — baseline observation:** Condition 2 never asked about ramp scrap, so the fact was
  absent from its model, assumption ledger, and self-reported gaps. Both conditions missed
  maintenance and the historian despite strong accounting of topics they had touched
  ([readout: excavation table](../../evidence/evaluations/vestera-legacy-baseline/readout.md#excavation-against-the-situation-packs-tiers)).
- **Mechanism:** Self-report can enumerate only concepts already in the model's active context.
  Untouched categories leave no conversational residue from which the model can infer that it
  omitted them.
- **Detection signature:** A plugin-declared required kind, slot, motif obligation, or
  objective-demanded grade remains unaddressed, but the elicitor's own gap list does not name it.
- **Accountable layer:** **Machinery**, plugin demand table, validation, typed `missing` issues, and
  harness-computed completion.
- **Prevention claim — specified:** Coverage is computed against declared domain structure and
  question-relative demands. It is never inferred from the interviewer's confidence or summary.
- **Successor evidence input:** FE-1402 receives an observed case for evaluating a demand table as
  completion evidence. FE-1403 receives the ownership pressure separating gap-filling guidance
  from gap detection. FE-1431 receives the unresolved question of how a stored absence locates a
  missing slot.

### FM-09 — Complementary-miss instability

- **Class:** coverage.
- **Evidence — baseline observation:** Each baseline run surfaced deep facts the other missed.
  Condition 1 found the VW-02 veto; condition 2 found the moving bottleneck and the cliff/slope
  penalty structure; both shared other blind spots
  ([readout: complementary misses](../../evidence/evaluations/vestera-legacy-baseline/readout.md#excavation-against-the-situation-packs-tiers)).
- **Mechanism:** Adaptive questioning creates path dependence. Early answers and locally salient
  threads change which later questions become likely, so strong depth in one region can coexist
  with an untouched region.
- **Detection signature:** Replays over the same case produce materially different required-slot
  coverage, or a single run claims completion while declared required slots remain untouched.
- **Accountable layer:** **Machinery**, computed coverage; the **evaluation protocol** owns repeated
  runs before making reliability claims.
- **Prevention claim — candidate:** A static floor and objective-demanded slots constrain path
  dependence without prescribing one interview order. This catalogue does not show that the
  mechanism reduces run-to-run variance.
- **Successor evidence input:** FE-1404 receives a fixed answer key and n=1 existence evidence for
  condition-3 scoring, together with pressure to distinguish that evidence from any later
  repeatability or regression claim.

### FM-13 — Fluent incompleteness

- **Class:** coverage.
- **Evidence — baseline observation:** The baseline Bano scores were nearly clean while important
  gaps remained
  ([baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#bano-questionnaire-scores)).
- **Evidence — published observation:** LLMREI's interviewers communicated well and appeared
  adaptive but elicited at most 60.94% of requirements fully and 12.76% partially. ReqElicitGym's
  best implicit-requirement ratio was 0.32
  ([LLMREI](https://arxiv.org/html/2507.02564v1),
  [ReqElicitGym](https://arxiv.org/html/2602.18306v1)).
- **Mechanism:** Fluency, rapport, relevant follow-ups, and a good summary are visible qualities.
  Coverage of information that was never raised is not. A rater or model can mistake the former for
  the latter.
- **Detection signature:** High communication or Bano-style scores coexist with unaddressed
  answer-key items, declared slots, or required grades.
- **Accountable layer:** **Machinery**, coverage and completion projection; **evaluation** must keep
  interaction quality and semantic coverage as separate axes.
- **Prevention claim — specified:** Completion reads model state and demands, never fluency or
  self-assessment. Published novice-human measures remain a floor check, not the completion oracle.
- **Successor evidence input:** FE-1404 receives evidence that inherited Bano dimensions and typed
  semantic failures expose different properties. FE-1406 receives pressure against treating a
  smoother transcript as sufficient strategy evidence.

## Delivery and interaction failures

### FM-11 — Dead-artifact delivery

- **Class:** delivery.
- **Evidence — baseline observation:** Condition 1 delivered a partial plain net with non-executable
  annotations and a token-loss structural bug. Condition 2 delivered a clear coloured-net
  specification with types and capacities outside the target format and no runnable scenario.
  Neither produced a loadable model
  ([readout: output artifacts](../../evidence/evaluations/vestera-legacy-baseline/readout.md#output-artifacts)).
- **Mechanism:** The model optimizes for a coherent description when the target contract and
  deterministic validation are unavailable. It can sincerely call the description runnable
  without executing it.
- **Detection signature:** The promised artifact cannot be parsed, compiled, opened, or simulated
  at the production entrypoint; required scenario or sidecar material is absent; structural checks
  fail.
- **Accountable layer:** **Machinery**, plugin `project` and `validate`, typed loss and code
  obligations, application realization, compiler, and simulation gates.
- **Prevention claim — specified:** Delivery succeeds only when the deterministic scaffold and
  obligations cross the application-owned realization path and pass the target's compile and
  simulation checks. A specification can be a useful intermediate artifact but not a successful
  model delivery.
- **Successor evidence input:** FE-1431 receives evidence separating projection and validation from
  elicitation. FE-1404 receives a target-contract scoring pressure plus the limit that prompt-only
  condition 3 cannot prove the production realization path.

### FM-12 — Opening overload

- **Class:** interaction.
- **Evidence — baseline observation:** Condition 1 opened with 29 questions. Condition 2 used groups
  of three to five and scored better on long-question and opening items
  ([baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md#bano-questionnaire-scores)).
- **Evidence — published observation:** LLMREI found during prompt development that models could
  overwhelm users with multiple questions, an error absent from the Bano list
  ([LLMREI](https://arxiv.org/html/2507.02564v1)).
- **Mechanism:** The model can plan a comprehensive interview in one response and mistake plan
  completeness for a usable interaction.
- **Detection signature:** One turn contains many independent questions, especially before the
  first answer; the user must choose which to answer or silently drop some.
- **Accountable layer:** **Technique**, pack question-shape guidance. The UI may make a structured
  questionnaire usable, but does not excuse an unbounded conversational battery.
- **Prevention claim — observed:** The v0 guidance coincided with a smaller opening and better
  interaction scores in one run. It does not establish a rate or prove the exact batch-size rule.
- **Successor evidence input:** FE-1403 receives one-run support for the interaction-shape rule and
  evidence of its departure from stricter one-question guidance. FE-1404 receives pressure to keep
  user burden distinct from semantic coverage.

### FM-15 — Unlicensed influence or boundary crossing

- **Class:** interaction.
- **Evidence — published observation:** The Bano taxonomy retains influencing the customer and
  asking the customer for solutions. LLMREI reports that model suggestions sometimes changed
  conversation direction, an unsupported price estimate, and a request for an email address to
  arrange follow-up
  ([Bano et al. manuscript](https://par.nsf.gov/servlets/purl/10105611),
  [LLMREI](https://arxiv.org/html/2507.02564v1)).
- **Mechanism:** A helpful assistant proposes options and takes actions beyond elicitation. The
  interview then risks recording assent to the assistant's proposal as independent user evidence.
- **Detection signature:** Any of three disjunctive cases is sufficient: the model supplies an
  unsupported estimate or invention, or frames an ungrounded solution as established; the model
  requests data or action outside the declared interaction scope; or a downstream assertion treats
  user assent to a model-authored option as if the user independently originated the content.
- **Accountable layer:** **Technique**, neutral and contrastive question guidance; **machinery**,
  evidence provenance and interaction/data-scope policy.
- **Prevention claim — candidate:** Model-authored options stay visibly model-authored. A user's
  classification of an option may be evidence for the classification, not for prior independent
  authorship. Requests outside the declared capability and data scope are refused.
- **Successor evidence input:** FE-1403 receives evidence for distinguishing productive
  proposal-and-classify moves from leading questions. FE-1406 receives provenance pressure for any
  generic strategy that introduces model-authored options.

## Licensed deferral is a deposit, not a promise

Deferral is correct when a user needs to stop, an external source owns the answer, or a later
session is cheaper and more reliable. The target-document has no terminal lock, so multi-session
elicitation is part of the architecture. The catalogue calls a deferral **licensed** only when all
of the following are observable:

1. Evidence already obtained is swept or otherwise present in the durable session archive.
2. Each unanswered required item is represented as a user-evidenced `deferred` absence or a typed
   issue such as `missing`; `not-mentioned` remains computed rather than fabricated as evidence.
3. Completion is recomputed from durable state; session stopping does not assert a new completion
   value. Whether any further named status vocabulary is useful remains FE-1402's open decision.
4. The next session can recover the unswept tail, changed world state, open issues, and pending
   affordance from a re-entry briefing.
5. A deliverable that can already be produced is delivered with its gaps, or the undelivered
   obligation itself is recorded with a reason and next action.

Deferral is **evasive** when "later" substitutes for adjudication: a future session, data pull, or
follow-up is promised while the current evidence and unresolved work have no durable home. The
condition-2 future-session move is therefore not prohibited behaviour. It is a failure in the
baseline only because no later session could inherit its work. No indexed paper validates this
deposit schema; it is the repository architecture's prevention claim, informed by published
premature-ending, incorrect-ending, and missed-ambiguity evidence.

## Evidence inputs for the selected design frontier

These mappings are a durable epistemic handoff, not amendments to successor issue contracts.
Linear issue contracts, STEERING, and ratified specifications remain authoritative for the work
each successor performs.

- **FE-1402 — completion and stopping:** Receives observed and synthesized distinctions among
  target-document completion, session stopping, delivery, no progress, budget exhaustion,
  user-requested quiet, and licensed deferral. The catalogue also leaves any further named
  completion-status vocabulary as FE-1402's open decision.
- **FE-1403 — guidance verdicts:** Receives evidence that guidance can affect interaction shape and
  supply clarification or close-out moves, plus ownership pressure where durable deposit, computed
  coverage, evidence status, projection validity, and re-entry belong to machinery.
- **FE-1404 — condition-3 scoring:** Receives the inherited baseline dimensions, typed detection
  signatures, provenance categories, and the distinction between licensed and evasive deferral.
  The evidence also marks prompt-only observability and unexercised prevention claims as limits.
- **FE-1406 — generic strategy quiver:** Receives candidate strategy pressures around clarifying
  competing readings, closing respectfully with gaps, and responding to no-progress, together with
  the boundary between guidance and deterministic machinery. The catalogue does not settle their
  empirical value.
- **FE-1431 — plugin-authoring handoff:** Receives evidence pressure around demanded slots and
  grades, firing conditions, absence location, typed issues, fold behaviour, projection validation,
  and loss; the catalogue does not define the resulting authoring contract.

## Provenance

### Repository evidence

- [Baseline condition 1 transcript](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-1.md)
  and [delivered model](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-1-model.txt).
- [Baseline condition 2 transcript](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-2.md)
  and [delivered model](../../evidence/evaluations/vestera-legacy-baseline/transcripts/condition-2-model.txt).
- [Baseline readout](../../evidence/evaluations/vestera-legacy-baseline/readout.md),
  including the single-run limitation, scored instruments, coverage comparison, silent-assumption
  audit, output inspection, and residual requirements.
- [Baseline protocol](../../../evaluations/protocols/legacy-baseline/protocol.md)
  and its information-wall account.
- [Indexed interviewing source catalogue](interviewing-literature-source-catalog.md) and
  [elicitation strategy synthesis](elicitation-strategy-literature.md).
- [Research-patterns audit](../../evidence/proofs/audits/research-patterns-audit.md), which
  identifies the novice-human population mismatch and the locally synthesized stopping claims.
- [Elicitation harness specification](../../specs/elicitation-kernel.md) and
  [provisional plugin contract](../../specs/plugin-contract.md) for the prevention mechanisms;
  these are design authorities, not evidence that the mechanisms work.

### Primary-source verification

- Bano et al., 34 mistakes from 110 students in 28 groups
  ([author manuscript](https://par.nsf.gov/servlets/purl/10105611)).
- Korn, Gorsch, and Vogelsang, LLMREI: human-centric instrument mismatch, premature accommodation,
  unsupported content, and boundary crossing
  ([arXiv primary text](https://arxiv.org/html/2507.02564v1)).
- Jin et al., ReqElicitGym: termination variation, budget exhaustion, low implicit-requirement
  coverage, late effective questions, and clarification/probing imbalance
  ([arXiv primary text](https://arxiv.org/html/2602.18306v1)).
- Ferrari, Spoletini, and Gnesi, ambiguity as a source of tacit-knowledge questions
  ([author postprint](https://openportal.isti.cnr.it/data/2016/353983/2016_353983.postprint.pdf)).

## Residual uncertainty and strain

1. The two baseline runs establish instances, not frequencies. Their complementary misses suggest
   path dependence but do not estimate run-to-run reliability.
2. The catalogue is typed by operational consequence and ownership, not by a validated statistical
   clustering. It is sufficient to make FE-1404 discriminating; it is not claimed exhaustive.
3. Mechanisms describe evidence-compatible behaviour. No source exposes the frontier model's
   internal causal state, and anthropomorphic accounts such as boredom or confidence are excluded.
4. Prevention claims are mappings to specified or proposed architecture. FE-1407 exercises none of
   them. They remain claims until the owning production layer and an oracle test them.
5. Detection signatures have unknown false-positive and false-negative rates. FM-03 in particular
   changes verdict entirely when durable deposit exists.
6. The dead-artifact verdict is relative to the Petrinaut delivery contract. Both baseline outputs
   remain useful specifications; neither is a successful loadable-model delivery.
7. LLMREI used 33 student-role-play interviews and GPT-4o, and reports premature accommodation
   qualitatively without a count. ReqElicitGym is a 2026 preprint over website scenarios with an LLM
   oracle user and evaluator. Neither is field evidence for Brunch's CPS setting.
8. Bano's taxonomy was built from novice human group interviews. Content, interaction, and closure
   items transfer as floor checks; voice, laptop use, confidence display, and team choreography do
   not transfer directly to a text-only single agent.
9. "Licensed deferral with durable deposit" is a Brunch architecture distinction, not a published
   empirical category. The literature supports preserving and confirming unresolved work, not this
   exact deposit schema.
10. The repository's truck-fleet dossier is still missing. This catalogue cites only the committed
    baseline case, transcripts, models, and readout; it makes no dossier-backed domain-provenance
    claim.

> **Reflection:** The catalogue's main result is an ownership correction. Better interviewing
> guidance can change question shape, but the failures that survived the strong baseline mostly
> concern state the model cannot reliably police about itself: what was never asked, what changed
> epistemic grade, what vanished during synthesis, whether a stop preserved work, and whether a
> delivered artifact runs. Those are the places where Brunch must make a refusal or computed fact
> observable rather than asking the model to remember another instruction.
