# IR obligations synthesis

> Provenance: read-only research compilation produced 2026-08-28 by a background research agent
> in the Cursor session behind this digest; companion to
> `cross-mission-elicitation-digest-2026-08-28.md`. Filed as `-cursor-` to avoid collision with
> same-titled documents produced by other agents. Reproduced verbatim.

Research compilation — evidence, inference, and proposal separated. No files were edited.

---

## The IR's job

**What it is for.** The runbook IR is the shared workpiece of one looping lifecycle: filled during elicitation, consumed during construction, amended when construction exposes a gap
([`CONTEXT.md`](libs/@hashintel/brunch-agent/CONTEXT.md), "Runbook IR"; [`structurally-typed-elicitation-runbooks.md`](libs/@hashintel/brunch-agent/docs/specs/structurally-typed-elicitation-runbooks.md), decision 8; [`SKILL.md`](apps/brunch-agent/src/skills/sdcpn-modelling/SKILL.md)). Its job is **conservation and handoff**: what the expert disclosed, at the resolution and epistemic standing they gave it, in a form a construction phase — and a reviewer who never saw the transcript — can use without rereading the conversation ([`SKILL.md`](apps/brunch-agent/src/skills/sdcpn-modelling/SKILL.md): "Construction consumes this document, not the transcript").

**What it is not.** Not a fold target over captures, not a persistence surface, not the typed three-register IR, not a closed kind/slot/grade system ([`CONTEXT.md`](libs/@hashintel/brunch-agent/CONTEXT.md); [`structurally-typed-elicitation-runbooks.md`](libs/@hashintel/brunch-agent/docs/specs/structurally-typed-elicitation-runbooks.md), "Structural typing boundary"; [`MISSION.md`](libs/@hashintel/brunch-agent/MISSION.md) Constraints).

**Who reads it, and when.**
- *During elicitation:* the agent itself, to file findings, track not-yet-asked topics, and drive gap discipline — without letting headings become a questionnaire ([`ir-template.md`](apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md); [`checks.md`](apps/brunch-agent/src/skills/sdcpn-modelling/checks.md), "IR checks").
- *At construction:* the same agent, reading the IR instead of the transcript as the primary model ([`pn-construction.md`](apps/brunch-agent/src/skills/sdcpn-modelling/pn-construction.md)).
- *At delivery/audit:* the expert (correction chance), the delivery record (named losses), and — the hardest consumer — a **cold reviewer** who must reconstruct the intended process, its load-bearing assumptions, and the smallest next question from the IR alone ([`elicitation-to-ir-oracle-design.md`](libs/@hashintel/brunch-agent/docs/specs/elicitation-to-ir-oracle-design.md), claim 7 and cold-IR-reviewer loop).

**Observed caveat.** In both real runs the IR was *composed wholesale at the end of elicitation* and emitted once (run 1: transcript line 123, after 4 user turns; run 2: line 279, only at the construct request) — despite the template's "update one section without rewriting the whole file." Today it functions as a post-hoc digest, not a maintained workpiece. Whether incremental maintenance is an obligation or an aspiration is itself a finding.

---

## Obligation matrix

Status legend: **Observed** = seen in real artifacts; **Inferred** = implied by evidence; **Proposed** = this synthesis's hypothesis.

| Obligation | Reader/consumer | Source evidence | Current representation | Candidate structural home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Objective conservation — what the model must answer, for whom, what it must not claim | Agent (depth/boundary); cold reviewer; completion | Oracle claims 1, 7; `checks.md` sufficiency; run 2 objective sharpened to the idle-hold question (run-2 IR "What the model must answer") | Three prose subheadings under Purpose | Objective header block; anchor for every later depth decision | Objective-blind A/B: does a vaguer objective change what the IR records? | Observed (load-bearing) |
| Boundary & horizon — in/out, time span, why the boundary serves the objective | Agent; construction; reviewer | `elicitation.md` posture teaching; run 2 "Boundary and horizon" names out-of-scope explicitly | Prose under Posture | Objective/boundary block; each omission should reference it | Does an omitted entity appear later without an objective justification? | Observed |
| Posture, appetite, accuracy expectation | Agent (stance, partial delivery) | `elicitation.md`; run 2: "willing to accept assumptions for unknown durations" | Prose | Objective block | Does a stated appetite change how many assumptions the IR carries? | Observed |
| Entity & resource properties that change behavior (caps, qualifications, availability windows, who decides) | Construction (places, tokens, guards); reviewer | `elicitation.md` "Participants, locations, and resources"; run 2 crew: two techs, day shift 6 AM–2 PM, shared | Prose under one heading | Entity register: per-entity entries with consequential properties | Construct from IR: does the model miss a cap or window stated only inside a story? | Observed |
| Activity inventory at expert's stated granularity (inputs consumed/reserved/read, duration, failure) | Construction (transitions); typed-IR Layer B granularity rule (projection rule, not storage rule) | `intermediate-representation-plain.md` granularity rule; run 1 changeover/mix/mill/letdown entries | Prose per step under Activities | Entity or activity register; granularity = evidence's granularity | Does collapsing steps into model-shape units mid-interview occur? (anti-caricature probe) | Observed + prior design (granularity rule re-earned) |
| Flow, order, branching, unhappy paths | Construction (arcs, guards); `checks.md` "missing spine" | Run 1 happy-path prose; run 2 branching list incl. "evening shift family switch waits until 6 AM" | Prose narrative | Flow narrative tied to entity names | Cold reviewer: can order be stated without guessing? | Observed |
| Quantities with shape — typical vs tail, direction-dependence, unit vs rate | Construction (parameters); completeness | `elicitation.md` quantile teaching (typical → one-in-ten); run 1 directional washdown conflict (3 h vs 6 h) | Prose lists; direction-dependence only by convention | Quantity entries keyed by (entity, product, direction); shape named per entry | Reorder probe: does "maybe six hours total" survive as ambiguous or silently harden? | Observed |
| Stochastic character — rate vs vivid incident, drivers of variation | Construction; anti-invention check | `elicitation.md` "a memorable incident is not a rate"; run 1 QA hold "stretched once" marked not-yet-asked | Prose; incident/rate distinction only by teaching | Quantity entries with rate-vs-incident field of prose | Does a one-off story get recorded as a rate? | Observed (teaching worked once: run 1 flagged it) |
| Prescribed vs practiced vs unwritten rules (policy/practice regime) | Construction (guards, priority); loss review | Layer A source-regime pattern; run 2 "Unwritten rules" (VW-02 after dark tint); `elicitation.md` "normative language is policy, not practice" | Prose subsection names only | Rule entries carrying a regime mark | Hidden ledger: does a policy stated as practice get silently hardened? | Observed + prior design (regime distinction re-earned as prose, not enum) |
| Contention & who-wins — the rule or the named absence of one | Construction (priority/FCFS as parameter); reviewer | Run 2 crew contention: "supposed to be fine" but Tuesday backlogs; priority rule not-yet-asked | Prose under Policies + not-yet-asked marks | Rule entries under contested-resource typology | Construct: does the net invent a priority the expert never stated? | Observed |
| Triggers & thresholds — what starts/stops, the observable the expert watches | Construction | `elicitation.md` threshold-trigger typology; run 2 demand-book trigger | Prose | Entity/flow entries | | Inferred |
| Time-structure coupling (shift windows affecting what can happen when) | Construction (guards) | Run 2: evening washdown waits for day-shift crew; scheduler times washdowns at 6 AM | Prose, split across Resources and Flow | Entity properties (availability) + flow conditions | Does a duration recorded without its availability window produce a wrong net? | Observed |
| Epistemic status of every statement — expert-said / inferred / assumed-by-agent / unknown-to-expert / not-yet-asked | Cold reviewer; gap discipline; anti-hardening gate | Oracle claims 3–4; template mark vocabulary; run 2 inline **Not yet asked** / **Assumed** marks | Prose marks, in place + bulk section | Epistemic ledger: one entry per unsettled item, wherever the content lives | Hard-failure gate: any material statement with neither expert source nor assumption mark | Observed |
| Conflicts & corrections — both accounts kept; resolution needs user citation; supersession noted | Agent; reviewer; delivery | Template maintenance rule; run 1 washdown conflict kept in two places | Prose + rule "note supersession in conflicts section" | Single conflict/correction register | Does a correction leave two competing facts in one heading? (the exact failure the rule names) | Observed (rule exercised once: run 1 dual-homed it — half-followed) |
| Typed absences — unknown-to-user vs not-yet-asked vs deliberately omitted (why objective permits) vs not-applicable | Cold reviewer; smallest-next-question | Template marks; criteria doc "Absence states"; run 2 Omissions each tied to objective | Prose marks; "not applicable" not exercised distinctly | Epistemic ledger with named absence kinds | Is "not applicable" distinguishable from "unknown" in the artifact? (untested) | Observed for unknown/not-yet-asked/omitted; Inferred for not-applicable |
| Agent-authored synthesis marked, with why + how to check | Cold reviewer; delivery honesty | Template "Assumed — say why and how to check"; `elicitation.md` "proposed as yours"; run 2 assumptions list lacks how-to-check | Prose; how-to-check often absent | Assumption entries with required check-method | Do delivery and IR disagree about which numbers were defaults? | Observed (gap observed: how-to-check mostly missing) |
| Projection losses — what the net cannot represent, discovered at construction | Delivery; later capture/convergence work | `checks.md` loss review; `pn-construction.md` "Projection loss"; run 2 VW-02 dark-tint loss, unwritten commercial weights | One section, pre-filled speculatively at elicitation time | Loss register **opened at construction**, distinct from elicitation gaps | Is every delivered loss traceable to an IR item or a construction decision? | Observed (current home mixes phases — see artifact analysis) |
| Construction-decision notes — what the situation implies for mapping ("Record for construction") | Construction | Run 1 + run 2 situation notes; consumed by FE-1525 side-quest comparison ("no line modes, changeover-crew reservation … to compare against the IR") | Child of Situation notes | Construction-facing map layer, authored late | Do construction notes made mid-elicitation diverge from the net actually built? | Observed (load-bearing but phase-blurred) |
| Validation criteria — what observation would make the result accurate enough | Completion; delivery acceptance | `elicitation.md`; run 1 left it "Not yet asked"; run 2 filled it with replay tests | Prose section at tail | Objective-adjacent (asked early) | Does an empty validation section correlate with unsupported "complete-enough" delivery? | Observed (one empty, one filled) |
| Smallest-next-question capability — gaps named so the next move is derivable | Agent; cold reviewer; Mission 5's mechanical form | Oracle claim 5, gap discipline; MISSION.next Mission 5: "a missing required field names the smallest next question"; both runs' not-yet-asked lists | Bulk lists + inline marks (duplicated) | Epistemic ledger as the sole home | Cold reviewer: can they name the next question without the transcript? | Observed (material present; home duplicated) |
| Evidence traceability — statement → source support | Omniscient grader; audit | Oracle observability: "do not yet provide exact IR-statement → source-evidence links"; criteria doc "Evidence fidelity" | None — transcript-level provenance only | Deferred to capture/IR seam (standing constraint: no designed join) | Shadow-join probe: measure support coverage if links existed | Inferred (absence observed) |
| Path robustness — reordered evidence yields equivalent active meaning; corrections stay visible | Evaluation | Oracle claim 8; criteria doc "Path independence" | Nothing in IR supports this beyond maintenance prose | Ledger with supersession rather than silent overwrite | Reordering probe across replicates | Inferred |
| Cold reconstructability — process + assumptions + next question from IR alone | Cold reviewer | Oracle claim 7; MISSION.next "IR audit oracle" | Nothing tests it; artifacts not yet used this way | Any candidate home must serve it | The cold-review tasks in the oracle section below | Observed (as an unmet test, not an unmet content need) |

---

## Required distinctions

The smallest semantic/epistemic distinctions the IR must preserve, with a judgment on whether Markdown convention suffices. "Stronger structure" means a required repeated shape (e.g., a mandatory child heading or per-entry field), *not* a closed enum.

1. **Expert-said vs agent-assumed.** The template's mark convention worked (run 2 marks assumptions throughout). But "say why and how to check" was frequently not honored — the *shape* of an assumption entry (why + how-to-check) is the gap, not its label. **Verdict:** prose marks sufficient; an enforced per-entry shape (assumption → check method) is the one candidate strengthening, because cold reviewers and delivery both consume it.
2. **Unknown-to-user vs not-yet-asked vs not-applicable vs declined.** First two exercised and kept distinct in both runs. Not-applicable never exercised — the exact collapse the criteria doc warns about ("I don't know the budget" ≠ "there is no budget"). **Verdict:** convention suffices but is untested for not-applicable; keep the vocabulary mandatory, watch for silent collapse.
3. **Conflict vs resolved vs averaged.** Run 1 kept the washdown conflict alive; run 2 asserted "None identified yet" with nothing to check against. The distinction survived — but only because the agent followed prose instructions. **Verdict:** convention sufficient; a *single* home is needed (run 1 dual-homed the conflict inline and in the bulk section).
4. **Deliberate omission (objective-permitted) vs gap.** Run 2's omissions each carry an objective justification — this worked. **Verdict:** prose sufficient.
5. **Prescribed vs practiced vs unwritten.** Run 2 represented this purely by subsection naming ("Unwritten rules"); the VW-02 rule's unwritten-ness is load-bearing for whether it becomes a guard or a loss. Prior typed design (source-regime) re-earned the distinction but not its enum. **Verdict:** convention currently suffices; this is the strongest candidate for a per-rule mark if a rerun shows an unwritten rule silently hardening into a documented constraint.
6. **Typical vs tail (quantity shape).** Teaching landed (run 1 flagged "typical vs tail" as not-yet-asked rather than inventing a distribution). **Verdict:** prose sufficient; it is question-teaching, not IR structure.
7. **Direction/context-dependence of quantities.** Washdown cost depends on from/to pair; run 1's 3h-vs-6h conflict is exactly this ambiguity. Represented only by prose list convention. **Verdict:** weakest spot observed; a per-pair quantity entry shape is a candidate strengthening, falsifiable by whether the ambiguity recurs.
8. **Incident vs rate.** Preserved via teaching; no IR structure involved. **Verdict:** prose sufficient.
9. **Elicitation-time gap vs construction-time loss.** Both real IRs mixed these in "Projection losses" (run 2's "Loss if not elicited further"; run 1's speculative pre-construction list). **Verdict:** observed evidence *for* stronger structure — two different phases produce two different kinds of "loss."
10. **Expert's words vs agent paraphrase.** Template rule ("a restatement you offered is not their statement until they settle the wording") exists; nothing in either artifact shows it being applied or violated. **Verdict:** convention only; the shadow-join / evidence-fidelity probe is where it would bite.
11. **Who authored a note and when (elicitation vs construction decision).** Run 2's situation notes contain construction decisions ("Omitted from first net", "Assumed: Line 3 unavailable on evening shift in base model") filed as if elicitation-era. **Verdict:** candidate for stronger structure — authorship/phase is currently invisible.
12. **Objective-relative depth vs schema fullness.** Preserved by checks prose, not by IR shape. **Verdict:** prose sufficient; it is a completion concern, not a storage concern.

---

## Artifact analysis

Both artifacts: [`runbook-headless-2026-08-28T10-56-59-351Z.ir.md`](libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/runbook-headless/runbook-headless-2026-08-28T10-56-59-351Z.ir.md) (run 1) and [`…T11-03-53-683Z.ir.md`](libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/runbook-headless/runbook-headless-2026-08-28T11-03-53-683Z.ir.md) (run 2), against [`ir-template.md`](apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md). Two runs, one edit cycle, no replication — calibration material only (oracle spec, "Historical calibration").

### Headings that carried useful meaning

- **What the model must answer** — run 2's sharpened objective ("Can the master scheduler justify holding a line idle to avoid a later washdown?") demonstrably drove what counted as an omission ("Idle-hold optimization logic … exposing the scenario is enough"). Run 1's is vaguer and its omissions are correspondingly blunter.
- **Participants, locations, and resources** — carried the run's most consequential discovery (changeover crew: two techs, day shift only, shared across three lines, contention observed on Tuesdays). Both runs' situation notes about contention draw on it.
- **Goals/constraints and Policies** — run 2's constraints (Meridian on Line 2, VW-02 restriction, CT-12/CT-14 qualification) and "Unwritten rules" subsection are exactly the material construction consumed.
- **The mark vocabulary** (Unknown / Not yet asked / Assumed / Conflict / Omitted / Loss) — used intensively in run 2 (≈20 inline "Not yet asked" marks); this is the template's clearest success.
- **Validation criteria** — filled meaningfully in run 2 ("It can compare hold-vs-switch… outputs show late orders, changeover hours, utilization").

### Headings that became dumping grounds

- **Situation notes.** In both runs most entries *duplicate* content already recorded under Activities/Time/Resources (run 1's "Changeover cost asymmetry" repeats the 25–30 min and ~3 h figures; run 2's "Changeover crew as bottleneck" repeats Resources + Policies). The only genuinely new content is "Record for construction" — and that content includes *construction-phase decisions* ("Omitted from first net", "Assumed: Line 3 unavailable on evening shift") made while the agent had construction guidance in view, blurring which phase authored what.
- **Projection losses.** Run 2 mixes representability losses ("unwritten commercial relationships"), construction decisions ("will model FCFS or make priority a parameter"), and *elicitation gaps* ("Loss if not elicited further"). Run 1 pre-fills it speculatively before any construction ("Not yet constructed, so losses not yet identified. Will include…"). Three obligations share one heading.
- **What it must not claim** overlaps **Omissions** (run 1: raw-material shortages and post-QA shipping appear in both).

### Empty or formulaic

- Run 1 **Validation criteria**: "Not yet asked." — the tail position after long quantitative sections plausibly contributed; run 2, with a more pointed objective, filled it.
- Run 1 **Assumptions**: "None introduced yet — construction will require many" — a forward-looking placeholder, whereas run 2 shows real assumptions (Line 3 speed, all-tints-are-dark) that were introduced and are listed. The empty state was not maintained as a live discipline.
- Run 2 **Conflicts**: "None identified yet." — verifiable only against the transcript; run 1 shows a real conflict being found, so the empty state is a claim, not a check result.

### Distinctions held only by prose convention

- Prescribed/practiced/unwritten (subsection names).
- Direction-dependence of washdown durations (flat prose list; run 1's conflict is the strain made visible).
- Typical vs tail; incident vs rate.
- "Not applicable" vs "unknown" (never exercised).
- Which statements are the expert's settled wording vs the agent's paraphrase (rule exists; no artifact trace).
- Inline unsettled-marks vs the bulk Unknowns/Not-yet-asked section — the same fact is often represented twice (run 2: Line 3 speed is marked inline and listed in bulk; ramp scrap is "Unknown" inline and in the bulk list). No rule says which is authoritative.

### Hard to find or reconstruct from the IR alone

- **Evidence support.** No statement carries even a coarse pointer to the turn that grounds it (the oracle spec records this as an observability gap). A cold reviewer must take "2023 QA contamination scare" on faith.
- **Conflict resolution state.** Whether run 1's 3h-vs-6h conflict was ever resolved cannot be determined from the IR.
- **Why a quantity is recorded at its granularity** ("Half a shift" (~4 hours?) for small specialty batch) — the hedge and the parenthetical guess are adjacent with no mark separating them.
- **Assumption check-methods.** Run 2's assumptions list mostly lacks the "how to check" the template requires.
- **Construction-consumability audit.** FE-1525's side quest had to compare the built net against the IR by hand: "There were no line modes, changeover-crew reservation, product restrictions, directional washdowns… to compare against the IR" — the IR supported this, but nothing in the IR's structure made the correspondence checkable.

---

## Candidate structural families

Hypotheses, not a chosen schema. None restores the typed kernel.

**A. Case-slice narrative + epistemic ledger.**
The IR's spine is one or more *walked cases* (arrival → leaving narratives, expert's words) plus a single **ledger** where every unsettled item — unknown, not-yet-asked, assumed, conflict, omission — is one entry with its check-method and the objective-relevance of closing it. Main sections reference ledger entries rather than duplicating marks.
- *Easier:* smallest-next-question derivation (one scan); gap discipline (the ledger is the gap list); cold-review of assumptions; removal of the inline-vs-bulk duplication observed in both runs.
- *Harder:* reading the "what is the process" narrative requires following cross-references; risks a second dumping ground if ledger entries are not required to name their content home; the objective block and entity properties still need homes.

**B. Entity/resource-centric register.**
The spine is the named things the expert distinguishes (lines, crews, customers, SKUs, stages) as stable entries with consequential properties, quantities, and eligibility; flow is a narrative *referencing* those names; quantities get per-(entity, product, direction) entries, from which a directional matrix naturally emerges.
- *Easier:* construction consumption (stable symbolic identity — the same pattern the typed Layer A graded SHOULD: symbolic name references survive supersession); quantities with context-dependence; contention material.
- *Harder:* policies, objectives, and global rules fit awkwardly (they are not "things"); strongest known anti-pattern risk — schema-shaped interviewing (the criteria and `elicitation.md` both name it as a failure mode); run 1's story-first quality (TC-17 trace) would be squeezed.

**C. Phase-separated registers (current shape, tightened).**
Keep the investigation-mirroring sections, but split by **authorship and phase** rather than by topic alone: expert-given content (with regime marks for prescribed/practiced/unwritten), agent-assumed content (why + how to check, enforced per entry), construction-decided content (authored only at construction, consumed by delivery), and a loss register opened at construction, distinct from the elicitation gap list.
- *Easier:* minimal change to what demonstrably worked (both runs filled the investigation sections well); directly fixes the two observed dumping grounds (situation notes and projection losses) and the assumption-shape gap; preserves story-first interviewing.
- *Harder:* cross-cutting questions (a contended crew touches Resources, Policies, Flow, and Time in four places — run 2's crew facts are scattered across four sections); smallest-next-question derivation still requires reading everything; duplication risk remains if marks stay both inline and bulleted.

**D. (variant of A) Append-only journal with supersession.**
Every change appends a dated entry; corrections supersede rather than overwrite.
- *Easier:* auditability of corrections and path-independence testing (oracle claim 8).
- *Harder:* directly contradicts the template's "update one section without rewriting the whole file" maintenance model and makes the document harder to read as a model; unjustified by any observed correction event in the two runs. Recorded only to bound the space.

---

## Cold-review oracle

Exact tasks a transcript-blind reviewer (receiving the modelling objective and the IR only) should be able to perform:

1. **State the objective** — what the model must answer, for whom, and what it must not claim — in the reviewer's own words.
2. **Reconstruct the intended process**: the entities, the main flow and its order, the branching conditions, and which resources are contended — without inventing unstated order.
3. **Separate epistemic classes**: list (a) expert-stated facts, (b) agent assumptions (with their check-method), (c) unknowns, (d) not-yet-asked topics, and (e) deliberate omissions with their objective justification — and not confuse (b) with (a) or (c) with (e).
4. **Name every unresolved conflict** and say why it matters for the objective.
5. **Name the smallest next questions** — the few topics whose closure most reduces risk to the objective.
6. **Judge construction readiness**: could a net be built without inventing the spine (what flows, what happens to it, in what order, what is reserved vs consumed)? Name what would be lost or defaulted.
7. **Trace a spot-check claim** (e.g., a specific duration) to its epistemic standing and typical-vs-tail shape.

Failure classes this exposes (mapping to the oracle spec's hard-failure gates and mistake taxonomy): fabricated or unmarked agent synthesis; silent hardening of hedges/policy/unknowns into precise values; conflict or correction collapse; conservation loss (disclosed material absent from the IR); gap-blindness (no derivable next question); syntactic fullness mistaken for completion; and loss-mixing (elicitation gaps masquerading as representability losses). Tasks 3 and 6 are the ones the current artifacts have never been tested against.

---

## Keep / move / rewrite / cut

Assessment of [`ir-template.md`](apps/brunch-agent/src/skills/sdcpn-modelling/ir-template.md) as-is (no edits proposed here):

**Keep.**
- The six-mark vocabulary (Unknown / Not yet asked / Assumed / Conflict / Omitted / Loss) with one-line definitions — observed working in both runs.
- The maintenance rules: expert's words; restatement-is-not-statement; supersession noted rather than two competing facts; empty sections stay present with an explicit mark.
- The role statement ("construction consumes this document, not the transcript") and the anti-questionnaire warning (headings not read aloud) — both honored; run transcripts show expert-thread questioning, no schema-shaped batteries beyond the acknowledged opening-overload smell (FE-1525 fog 1).

**Move.**
- **Validation criteria**: from tail position to objective-adjacent placement — it stayed empty exactly once, at the tail, with the vaguest objective.
- **"Record for construction"**: out of Situation notes into a construction-facing register authored/updated when construction thinking happens, so elicitation-time and construction-time authorship are distinguishable.

**Rewrite.**
- **Projection losses**: require it to be opened at construction, and forbid pre-construction speculation; split "loss if not elicited further" out to the gap/ledger home. This is the single strongest observed structural correction.
- **Situation notes**: require them to be *difference-only* (what the main sections cannot hold), not restatements; give each note an explicit phase/authorship frame.
- **Unsettled-mark home**: pick one authoritative home (inline marks or ledger/bulk section, with a cross-reference rule) — the current dual representation is the main divergence risk, already visible in run 1's dual-homed conflict.
- **Assumption shape**: make "how to check" a required part of the mark, not an aspiration — run 2 shows it routinely omitted.

**Cut.**
- The **duplicated bulk unknowns list** if a single ledger home is adopted (in the current template it is redundant with inline marks).
- The **"Loss" mark as an elicitation-time category** — its only observed content is speculative or misfiled.

Nothing in the template's content is observed to be dead weight; the failures are of placement, phase-separation, and single-homing, not of missing content.

---

## Rejected re-entry

Prior typed machinery the evidence does not currently justify restoring, each with the concrete strain that would force reconsideration (consistent with [`structurally-typed-elicitation-runbooks.md`](libs/@hashintel/brunch-agent/docs/specs/structurally-typed-elicitation-runbooks.md) "Structural typing boundary" and [`MISSION.md`](libs/@hashintel/brunch-agent/MISSION.md) stop-lines: "A need for one semantic commitment is not permission to restore the whole typed kernel"):

1. **Closed kind catalog (the ten kinds).** *Strain:* Mission 5's typed map cannot locate material by prose home + name-reference alone, and construction repeatedly fails to find a class of material the kind catalog would have indexed — not once, but across replicates.
2. **Slots / demand rows / precision ladder (`Must know` rows, `range` vs `spread`).** *Strain:* smallest-next-question derivation stays unreliable model judgment where a mechanical missing-field→question would work — exactly the hook MISSION.next Mission 5 names ("a missing required field names the smallest next question"). One miss is noise; a pattern across the baseline replicates is evidence.
3. **Capture envelope, sweeps, and the fold (ADR-0003 registers 1→2).** *Strain:* the oracle spec's shadow join shows support links materially improve auditability, or cold reviewers repeatedly fail on provenance where an evidence span would decide. Until then, the standing "no designed join" constraint holds.
4. **Typed completion algebra (`evaluateCompletion`, floor/precision/absence predicates).** *Strain:* readiness self-report misleads across the baseline — delivery marked complete-enough when the objective-relative slice is absent. The current checks prose plus the named stopping outcomes are untested substitutes; they must fail before the function re-earns itself.
5. **Epistemic-status enum + separate confidence + absence-state enums on every statement.** *Strain:* the prose mark vocabulary demonstrably collapses under the reordering probe or cold review (hardened hedges, conflated unknown/not-applicable) in a way a per-entry required shape does not fix. Note the observed distinction failures so far were duplication and phase-mixing, not vocabulary collapse.
6. **Typed per-capture loss categories (mapped-exactly…unrepresentable).** *Strain:* the construction delivery cannot be audited against the IR — losses named in delivery that nothing in the IR accounts for. The phase-split of the loss register (above) is the cheap first answer; typed categories are the expensive one.
7. **`firesWhen` pattern triggers, motif quiver, repertoire runtime, plugin YAML contract.** *Strain:* none observed or anticipated in evidence; these are teaching-shape mechanisms whose jobs the skill resources discharge. Re-entry would require a second real consumer (the spec's stated bar) — e.g., a second target formalism — which does not exist.

**Re-earned as content (not machinery), keep regardless:** the granularity rule (store at the expert's stated resolution), symbolic name references, prescribed/practiced distinction, quantile-shaped quantity elicitation, question-relative completion *anchored on the objective* (as prose discipline), rationale-on-everything, and expert names verbatim. These are semantic distinctions the artifacts show under real strain — they survive as prose obligations and candidate entry shapes, not as enums, tables, or folds.
