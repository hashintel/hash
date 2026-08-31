# Universal elicitation synthesis

> Provenance: read-only research compilation produced 2026-08-28 by a background research agent
> in the Cursor session behind this digest; companion to
> `cross-mission-elicitation-digest-2026-08-28.md`. Filed as `-cursor-` to avoid collision with
> same-titled documents produced by other agents. Reproduced verbatim.

**Scope.** Universal interviewing judgment only. No SDCPN/Petri-net semantics or Petrinaut contracts are introduced as guidance; where a source distinction exists only because of the downstream formal model, it is recorded as target-formalism material and excluded from universal propositions.

**Sources read.**
- `libs/@hashintel/brunch-agent/AGENTS.md` (epistemic posture: provenance is not warrant)
- `docs/specs/elicitation-to-ir-oracle-design.md` (claims 1–8, hard-failure gates)
- `docs/reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md` ("challenges" synthesis)
- `docs/reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md` ("criteria" synthesis)
- `docs/specs/structurally-typed-elicitation-runbooks.md` (universal-vs-target-formalism split, information hierarchy)
- `apps/brunch-agent/src/skills/sdcpn-modelling/elicitation.md`, `ir-template.md`
- `docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md` (two real runs + one side-quest run)
- `docs/reference/research/elicitation/elicitation-strategy-literature.md` (literature synthesis, [V]-verified citations) and `frontier-model-elicitor-failure-catalogue.md` (FM-01…FM-15)
- `docs/specs/elicitation-completion.md`; `packages/core/src/repertoire.yaml` (compiled universal teaching); `MISSION.next.md` (Mission 3 leftovers)

**Status convention.** *Observed* = directly supported by a local source (including literature recorded locally as verified `[V]`; noted where the observation is from literature rather than a Brunch run). *Inferred* = follows from sources but no source states it outright. *Proposed* = this synthesis recommends beyond current sources.

---

## Executive model

The smallest coherent model the sources jointly support:

> **The interview is objective-driven evidence acquisition, and every phase is governed by the same question: relative to the stated objective, what did the expert say that they did not volunteer?**
>
> 1. **Frame first.** Establish what the model must answer, the accuracy bar, the boundary, the horizon, and the expert's appetite before process content — because completeness is question-relative, not syntactic or conversational (literature §1.2, §4.2; elicitation.md "Objectives before structure").
> 2. **Acquire through concrete cases, not abstractions.** Walk one real case end-to-end; deepen with occasion probes ("when did that last happen", "what were you looking at"), quantile ladders, and contrastive discrimination; generalize only after instances exist. Hypotheticals escalate only from an anchored incident (literature §2.2–2.4; elicitation.md; repertoire).
> 3. **Keep epistemic separation visible everywhere.** Expert statement, your inference, your assumption, unknown, not-yet-asked, conflict, correction, and deliberate omission remain distinguishable in conversation and in the IR. Assent to agent-authored wording is not user evidence (challenges §3/§9; criteria "epistemic distinctions"; oracle claim 4; FM-06/07/15).
> 4. **Spend questions by information value.** Prefer one high-value question over several low-value ones; batch only cheap, independent breadth; probe one thread while deepening; change technique when yield drops (challenges §6; literature §2.4, §8; FM-12).
> 5. **Stop on criteria, never on vibes.** Not fluency, not fatigue, not representational stability, not budget. Close with a summary, named gaps, a clearinghouse probe, and one correction chance; deliver partial results with deposits, not promises (literature §4.2–4.3; FM-01/04/05; elicitation.md "Stopping and partial delivery").

---

## Proposition matrix

| Proposition | Source evidence | Lifecycle phase | Candidate home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- |
| Objectives before structure: what the model must answer, accuracy bar, scope, and boundary precede process structure | lit §1.2 (Robinson, Sargent, [V]); elicitation.md "Objectives before structure"; repertoire "Objectives first" | Opening | Skill body/lifecycle router (phase sequencing); detail in teaching resource | Variant that opens with structure; compare acquisition of objective-relevant material and cold-IR reconstruction (oracle claim 7) | Observed |
| Posture parameters (time, required confidence, appetite for assumptions, boundary, horizon) are set early and change later behavior | elicitation.md "Posture…"; repertoire "The posture"; lit §1.2/§4.1 (accuracy bar set early, [V]) | Opening | Teaching resource; one-line reminder in skill body | Ablate posture section; measure silent-hardening rate and boundary-violating IR content across replicates | Observed (behavior-differential is Inferred — no source shows a run where posture absence caused a measured failure) |
| Bounded opener (3–6 steps) fixes the abstraction level of the first account | lit §1.2 (ACTA, [V]); elicitation.md | Opening | Teaching resource | Unbounded-opener variant; measure detail drift, rework, and first-answer dependence | Observed |
| One real case walked end-to-end before any property is swept across cases | elicitation.md; repertoire "One concrete case end to end"; lit §2.2 (incident-based CDM, [V]); lit §8 (depth is the differentiator, [V]) | Eliciting | Teaching resource | Sweep-first variant A/B; compare weighted discovery of load-bearing material (oracle claim 1) | Observed |
| Occasion probes over generalization: "when did that last happen and what did you do?" beats "how do you usually do this?" | elicitation.md; repertoire "Ask for the last time"; lit §2.3 (hypothetical bias median 1.35×, [V]) | Deepening | Teaching resource | Minimal pair (below): normative answer accepted vs occasion follow-up; check whether divergence between policy and practice enters the IR | Observed |
| No bare "why" as a primary probe; ask for an occasion and what was attended to | elicitation.md; repertoire "No bare why"; lit §2.4 (Nisbett & Wilson, Ericsson & Simon, [V]) | Deepening | Teaching resource | Paired runs: "why" primary vs occasion probe; compare rate of expert-supplied rationalizations contradicted later in the pack ledger | Observed |
| First answers on load-bearing facts are not accepted as sufficient; probe depth is the value-add | lit §8 (first-response vs post-probe delta, [V]); lit §5.1 ("no probing questions", 11/28, [V]) | Deepening | Teaching resource | Compute ledger content extractable from first responses only vs full transcript; elicitor adding little beyond first responses is failing | Observed (literature) |
| Batch only cheap, independent breadth questions; probe one thread when deepening; an opening battery is a failure | elicitation.md; repertoire "Batch breadth, sequence depth" + "Opening overload"; FM-12 (baseline: 29 opening questions; v0 guidance improved shape in one run); FE-1525 fog 1 (4–10 numbered questions in both real runs) | All elicitation turns | System prompt (small, always-on invariant) + teaching resource detail | Count questions in opening turn across ≥3 replicates as a hard gate; also probe whether moving the rule to the system prompt reduces violations | Observed (failure); counter-technique efficacy Observed (one run) but the 2–4 batch number is Inferred |
| Vague terms hide a distribution or an exception; deepen before recording | elicitation.md; repertoire "Vague terms and quantifiers"; lit §1.4 | Deepening | Teaching resource; IR template marks make the residue legal | Ledger hedge fact; check IR holds a range/ambiguity or a clarification turn occurred (hard gate: silent hardening) | Observed |
| Quantities elicited as a quantile ladder (typical, then one-in-ten worse/better); never min/likely/max | elicitation.md; repertoire "Quantiles, never three points"; lit §1.4 (triangular overstated a measured mean ~69%, [V]) | Deepening (quantities) | Teaching resource | Variant that accepts a three-point triple; compare against ledger ground truth | Observed |
| One vivid incident is not a rate; ask how many opportunities over what period | elicitation.md; repertoire "One incident is not a rate" | Deepening | Teaching resource | Pack with a single memorable incident; check the IR does not contain a probability invented from it | Observed |
| After a substantive answer, ask "how would you know — what are you actually looking at?" | elicitation.md; repertoire "Cues the expert relies on"; lit §2.2 (ACTA universal follow-up, [V]) | Deepening | Teaching resource | Check whether the IR records observables/cues or only decisions, on a ledger designed around cues | Observed |
| Hypotheticals escalate only from a narrated real case; ask for cues, not decisions | repertoire "Escalate hypotheticals only from a real case"; lit §2.3 ([V]) | Deepening | Teaching resource (absent from elicitation.md today) | Free-floating "what would you do if…" variant; compare answers against practiced-practice evidence in the ledger | Observed (directive in repertoire); inclusion Proposed |
| Contrastive/discriminating probes (key difference, triadic, expert–novice contrast) surface attributes the expert uses without naming | lit §5.2, §2.2 ([V]); partially in repertoire | Deepening | Teaching resource (absent from elicitation.md today) | Pack with two near-identical entity types; check whether the discriminating attribute is elicited unprompted or by contrast probe | Observed (literature); inclusion Proposed |
| Clairvoyant test: a quantity is recordable only when a definition exists that a no-judgment observer could answer; run first when definitions may differ | lit §1.4, §5.3 ([V]); repertoire "The clairvoyant test" | Deepening (quantities); divergence | Teaching resource (absent from elicitation.md today) | Pack where two uses of a quantity differ by an implicit boundary (e.g. includes setup or not); check whether the definitional question precedes recording | Observed (directive in repertoire); inclusion Proposed |
| Assumptions may be proposed to unblock, but are stated as the agent's, entered with why and how-to-check, never as the expert's | elicitation.md; challenges §3/§9 (explicit vs inferred vs default); oracle claim 4; FM-07 | All | Teaching resource; IR template "Assumed" mark | IR audit: every load-bearing value traces to a user span or an assumption mark (hard gate) | Observed |
| Assent to agent-authored restatement is not user evidence; only the expert's settled wording is | elicitation.md; ir-template.md maintenance; challenges criteria "inference presented as user fact"; FM-15; oracle claim 4 | Deepening; IR maintenance | Teaching resource (rule); IR template (mark mechanics) | Inject turn: agent proposes a value, expert says "sure"; check IR provenance records agent authorship, not user evidence | Observed |
| When two answers tension, name the tension and ask; do not pick silently | elicitation.md; ir-template.md "Conflict" mark; lit §5.3 (do not average, preserve, [V]); completion spec §13 (never averages); challenges criteria "conflict handling" | Divergence | Teaching resource (conversation move); IR template (Conflict mark) | Pack with two conflicting statements; check IR holds both with an open question rather than one value | Observed |
| A correction supersedes with a recorded supersession; history is not erased; recency is not universal truth | ir-template.md maintenance; challenges criteria "revision and correction", "recency as universal truth"; oracle claim 8 | Divergence | IR template (mechanics); teaching resource (conversation move) | Inject a mid-interview correction; check the stale value is replaced and the supersession is visible; also inject a same-scope recency change vs a different-actor divergence and check they are handled differently | Observed |
| Unknown ≠ not-yet-asked ≠ assumed ≠ conflict ≠ omitted ≠ loss; each stays visible in place | ir-template.md marks; challenges criteria "absence states"; completion spec §8–11; lit §7.1 (declined/deferred list) | All (IR) | IR template | Minimal pairs (below): "I don't know the budget" vs "there is no budget" vs "N/A"; check IR marks differ | Observed |
| Policy vs practice is surfaced, not collapsed: normative language triggers a "when did that last actually happen" follow-up; a document is not practice | elicitation.md; repertoire "Policy versus practice", "Document treated as practice"; lit §2.1 (work-as-done, [V]); lit §9 (de facto/de jure, [V]) | Eliciting/deepening | Teaching resource | Pack with a documented rule contradicting practice; check IR records the divergence and its reason, not the document | Observed |
| Consistency probe across the held transcript: "you said X earlier, then Y — how do those fit?" | lit §5.1 (question typology, [V]); repertoire "Consistency probe"; elicitation.md generic tension rule | Divergence | Teaching resource (absent in specific form today) | Contradiction separated by many turns; check whether the elicitor detects and surfaces it before close | Observed (literature + repertoire); inclusion Proposed |
| Depth is objective-relative; do not probe threads no stated question depends on | elicitation.md; lit §4.2 (question-relative completeness, Sargent, [V]) | Prioritization | Skill body (router) + teaching resource | Ledger marks incidental-but-deep facts; check turn/token spend on them vs load-bearing material | Observed |
| When several turns produce nothing new, change technique (story, contrast, absences) rather than repeat | elicitation.md; repertoire; lit §2.4 (yield decay of open conversation, [V]) | Mid-interview | Teaching resource | Inject a plateau; check mode switch vs repetition | Observed (rule); threshold Inferred (no source defines "several") |
| Clearinghouse probe before close: "what have I not asked that is important?" — as a ritual, never as the only coverage source | lit §5.1 ([V]); repertoire smell "Clearinghouse as coverage" (anti-pattern framing); FM-08 (self-report cannot see untouched categories) | Closing | Teaching resource (absent from elicitation.md today) | Close with vs without clearinghouse; compare late-discovered load-bearing facts (acquisition misses) | Observed (literature + FM-08 mechanism); inclusion Proposed |
| Stopping is criterion-based (stated questions + objective-relevant coverage), never stability-, fluency-, fatigue-, or budget-based | lit §4.2 (representational stability is the premature-stopping rule, [V]); elicitation.md "A fluent conversation is not completion"; completion spec §15; FM-04/05/13 | Closing | Skill body (completion criteria per phase); teaching resource | Variant that stops when its own model of the process stops changing; measure premature-stop rate against ledger | Observed |
| Closeout ritual: summarize, state what is missing or assumed, one correction chance; do not end because they seem busy — name what is missing and let them choose; when they stop, open no new topic | elicitation.md; lit §4.3 (structured walkthrough, [V]); Bano incorrect-ending 19/28 via failure catalogue; FM-04 | Closing | Teaching resource | Omit closeout; measure silent-gap deliveries | Observed |
| Burden cues trigger the cheapest valid disposition (answer now / defer with deposit / deliver with named loss), never a silent end with unnamed holes | elicitation.md (partial); FM-04 ([V] published); FM-02/03 (deferral-without-deposit baseline); repertoire "Burden and impatience", "Defer with a deposit" | Closing | Teaching resource | Inject impatience cue; check a deposit exists before quieting (FM-04 detection signature) | Observed |
| Deferral always leaves a deposit: what is missing, why, and where it would come from | elicitation.md; repertoire "Defer with a deposit"; FM-02/03 | Closing | Teaching resource; IR template carries the residue | Expert defers a topic; check the IR names the gap, reason, and source | Observed |
| Expert vocabulary only in expert-facing questions; formalism vocabulary appears only in the construction phase | runbooks spec decisions 7 and elicitation-separation section; elicitation.md purpose; FE-1525 proof item 4 (Observed); oracle inner-loop check | All elicitation turns | System prompt (invariant) + skill body (phase resource gate) | Transcript scan for formalism terms during elicitation (hard gate); A/B whether construction resource reads precede first questions | Observed |
| Partial delivery names gaps; "partial-with-named-gaps" is a legal outcome; the delivery contract is not completion | FE-1525 fog 5 (Observed on real run); completion spec §15; FM-02 | Closing | Skill body (phase completion criteria); IR template carries the named gaps | Stop the run early; check the delivered IR names the smallest consequential gaps (oracle claim 5) | Observed |
| Small quiver, not a catalogue: questioning guidance should be a few parameterized moves, not a long menu of pattern-triggered questions | runbooks spec (rejected shapes: mechanically fired triggers); lit §3.1 (Börger reduction, [V]); AGENTS.md law 2 (anti-caricature) | Authoring-time | Teaching resource design constraint | Grow the resource with a new typology; check whether existing behavior needed it or the resource degraded in use (attention strain) | Inferred |
| Yield monitors (new material per turn; questions per turn) are observations, not quality | oracle design (counts are observations); lit §2.4 (propositions-per-minute reference rates) | Evaluation | Checks | Use counts as a gate and see whether quality diverges from counts (they should, so they must not gate) | Observed (as design instruction) |

---

## Technique families

Rather than a catalogue, the retained propositions form five families that share one mechanism each:

1. **Frame-setting (completeness is question-relative).** Objectives before structure; posture parameters; bounded opener; objective-relative depth. Mechanism: the stated objective is the denominator for every later judgment — what to ask, when to stop, what counts as a gap.
2. **Case-anchored deepening (instances before generalizations).** Slice-then-sweep; occasion probes; no bare why; cue follow-up; quantile ladders; incident-≠-rate; anchored hypotheticals; contrastive probes; probe depth. Mechanism: tacit knowledge surfaces on concrete occasions and under probing, not on first-pass general answers.
3. **Epistemic bookkeeping (the conversation and the IR keep grades apart).** Assumption marks; settled-wording rule; unknown/absent/assumed/conflict/omitted/loss marks; correction-supersession. Mechanism: every distinction the conversation exposes must survive into the workpiece with provenance; agent-authored content can never borrow user authority.
4. **Divergence work (tension is information).** Policy-vs-practice surfacing; consistency probes; conflict preservation without averaging; clairvoyant-test definitional repair. Mechanism: contradictions, divergences, and definitional mismatches are the highest-yield elicitation material and are destroyed by silent resolution.
5. **Economy and close (burden, stopping, delivery).** Batching discipline; technique switching; criterion-based stopping; clearinghouse; closeout ritual; burden dispositions; partial delivery with deposits. Mechanism: the interview's end state is an evidence-bearing artifact plus named gaps, not a social conclusion.

---

## Failure modes and minimal pairs

Compact taxonomy (each entry: failure → counter-technique → where it is already written down):

- **Opening overload** → batch only cheap independent breadth; probe one thread while deepening → elicitation.md, FM-12, repertoire.
- **Schema-shaped questioning** (interview follows the workpiece headings; syntactic fullness impersonates coverage) → conversation follows the expert's thread; IR is filed alongside or after; construction material stays phase-gated → elicitation.md rabbit holes, criteria "schema-shaped questioning" smell, runbooks spec, oracle hard gate.
- **Policy vs practice collapse** (normative language or a document taken as practice) → occasion follow-up; work-as-done framing → elicitation.md, lit §2.1/§9.
- **Hedge → precise value (silent hardening)** → deepen vague terms before recording; grade marks keep ranges legal → elicitation.md failure modes, FM-06, completion spec §12, oracle hard gate.
- **Correction vs conflict conflation** (correction recorded twice, or conflict silently resolved by recency) → supersession note for corrections; both-values Conflict mark for divergence; recency is not universal truth → ir-template.md, criteria "revision and correction"/"recency as universal truth".
- **Unknown vs absent conflation** ("I don't know" recorded as "none"; "not mentioned" as negative evidence) → the six IR marks; distinct conversational treatment of declined answers → ir-template.md, challenges criteria absence states, completion spec §9–11. Note: "declined to answer" has no mark today (see Tensions).
- **Premature accommodation** (burden cue ends the interview with unnamed holes) → name what is missing and let them choose; cheapest-valid-disposition; deposit → elicitation.md, FM-04.
- **Agent-authored restatement treated as user evidence** (assent to your phrasing becomes their content; proposed options become independent user fact) → local restatement for correction; settled wording captured; assumption marks; unlicensed-influence guard → elicitation.md, ir-template.md, FM-15, oracle claim 4.

**High-value minimal-pair probes** (pack injects; grader checks the conversation and IR diverge appropriately):

1. *Opening overload:* expert opens cooperatively; baseline variant emits a numbered battery; candidate asks the bounded opener. Gate: questions in the opening turn; acquisition-weighted discovery.
2. *Schema-shaped questioning:* ledger's load-bearing fact has no heading of its own and surfaces only on a follow-up inside the expert's thread. Gate: hard gate on mechanically reading IR headings; ledger reveal condition "asked about X".
3. *Policy vs practice:* expert says "the rule is 30 minutes" early; later narrative shows the practiced version differs. Pass: the divergence is surfaced and both are recorded; fail: the rule is silently hardened to 30.
4. *Hedge vs precise value:* "every week or two, half a shift" (a real baseline hardening). Pass: range recorded or clarification asked; fail: an exact interval or distribution appears.
5. *Correction vs conflict:* "Make that Monday, not Friday" (correction → supersession note, not two active values) vs "Night crew says 20; day crew says 15" (conflict → both kept, question open). Recency variant: a different-actor statement later must not silently overwrite.
6. *Unknown vs absent:* "I don't know the budget" vs "we have no budget" vs "budget is N/A here" — three different IR marks; plus a declined answer with no IR mark today (probe whether one is needed).
7. *Premature accommodation:* expert signals impatience with two ledger items unaddressed. Pass: gaps named, disposition offered, deposit; fail: quiet close or silent completion claim.
8. *Agent-authored restatement:* agent proposes "so roughly 15 minutes?" and expert says "sure". Pass: IR records agent origin/assumption or elicited confirmation of the expert's own wording; fail: 15 minutes becomes user evidence.

---

## Current-material assessment: `apps/brunch-agent/src/skills/sdcpn-modelling/elicitation.md`

**Keep (well supported; maps to verified literature, FM catalogue, or observed runs):**
- Purpose frame: expert vocabulary, traceability, "you do not build the net during the interview," where-knowledge-stops honesty.
- The whole "Questioning and deepening" block: bounded opener, slice-then-sweep, occasion probes, no bare why, vague-term deepening, policy-vs-practice, cue follow-up, quantile ladder, incident-≠-rate, restatement discipline, tension surfacing, batching discipline. Every line has independent literature support; "slice, then story, then absences" lines were observed to steer a real run (FE-1525 fog 7).
- "Evidence and uncertainty" block (assumption marks, deferral deposits, no-value-without-their-words) — directly serves oracle claims 3–4 and the hard gates.
- Objective-relative depth and technique-switching in "Prioritization".
- "Stopping and partial delivery" block.

**Duplicated (consolidate to one home each, per the runbooks spec's one-authoritative-home rule):**
- "Caveats and rabbit holes" vs "Failure modes": schema-shaped questioning, whole-model restatement, document-as-practice, and building-the-net-in-conversation are restated across both lists and partly overlap the questioning block. One failure-mode list with counter-techniques would do.
- The restatement/settled-wording rule appears in elicitation.md, ir-template.md maintenance, and (as "Assent taken as origin") in repertoire. Keep the conversational rule in the teaching resource and the mark mechanics in the IR template; drop the re-statement from one.
- Typology "Questions that may help" children repeat the last-time probe three times; the typology should reference deepening moves, not restate them.
- The failure-mode list restates 8 of the 15 FM catalogue entries verbatim; that is fine as distillation but should not grow into a second catalogue.

**Too vague to change behavior:**
- "These set stance; they are not a form" (posture) — no observable differential; nothing says what changes when appetite or time is low (the answer exists elsewhere — "when time is tight, synthesise and invite correction" — but is not connected).
- "When appetite is high, follow the slice" — no signal for "high appetite".
- "When several turns produce nothing new" — no threshold; risks collapsing into the stability-based stopping the literature warns about.
- "Deepen before recording" (vague terms) — does not say deepen to what end state (a range? a distribution shape? an explicit branch?), which is what a grader would need.

**Appears misplaced:**
- "Transform to PN" lines inside the elicitation-phase typologies are construction-phase content. Fog answer 2 records they caused no leakage on two runs, but the runbooks spec's separation principle and the assumption that separating construction reference reduces schema-shaped questioning both argue they belong in the construction resource, with the elicitation typology keeping only "notice when / information needed / questions / record / caveats / checks". Two-run non-observation is weak evidence either way — keep the question live.
- "What to investigate" and the typologies are target-formalism material (`provenance: sdcpn`) living in the merged elicitation teaching file. That is the accepted Mission 3 design, but several typology question-shapes (last-time, borderline-case, "what do you actually look at") are universal moves wearing SDCPN nouns; whether they migrate up is an unresolved editorial call (see Tensions).

**Absent (important behavior with no home in elicitation.md):**
- Clearinghouse probe as a closing ritual (repertoire has only the anti-pattern framing; FM-08 shows the need).
- Hypothetical-escalation precondition (in repertoire, lost in the merge).
- Clairvoyant-test definitional check before recording quantities (in repertoire, lost).
- Contrastive/discriminating probes and the expert–novice contrast (lit §2.2/§5.2).
- The verbatim consistency probe for long-range contradictions (elicitation.md covers only immediate tension).
- Probe-depth policy: never accept a first answer on a load-bearing fact (lit §8).
- Vagueness guard on the elicitor's own questions — vague questions are the single most frequent human mistake (21/28) and LLM fluency invites them.
- Exception/absence sweep as an explicit move (repertoire "Ask for absences", "Exceptions as a sweep").
- Declined-to-answer as a distinct conversational outcome feeding the IR (lit §7.1; no IR mark exists).
- Anti-leading / forced-choice guard (lit §5.1 anti-patterns; repertoire "Press without trapping" is adjacent but not carried).
- Premortem phrasing for failure-focused objectives (repertoire "Premortem", lost).

---

## Tensions and open questions

1. **Batching rule vs observed behavior.** elicitation.md's "batch two to four related survey questions" did not prevent 4–10-question opening batteries in both FE-1525 real runs, and MISSION.next records the fix as "a known one-home edit that no mission owns." Open: is the rule too weak in the resource tier (should the invariant live in the system prompt), or is the 2–4 number itself unearned relative to the stricter one-question-per-turn evidence in lit §8?
2. **Deepen vs clarify on ambiguity.** ReqElicitGym found models favor probing over clarification (FM-14); elicitation.md's default is also probing ("deepen before recording"). The hard gates require no silent hardening, but no source says when ambiguity must pause the thread for a clarifying question rather than be probed further. Unresolved and consequential for the grader rubric.
3. **Stopping signal.** "Several turns produce nothing new → change technique" is adjacent to representational stability, the stopping rule the literature associates with premature stopping. Criterion-based stopping needs the objective/questions table to be first-class in the IR; today it lives only implicitly under "What the model must answer."
4. **Universal ↔ target-formalism migration is unexercised.** Provenance tags ran zero migrations on real evidence; the merged file's typology question-shapes may be universal moves in SDCPN dress. Whether to migrate them up (and how to decide without a second target formalism as comparison) is open.
5. **One expert per session vs conflict machinery.** The disagreement literature (§5.3) assumes multiple experts; Brunch interviews one. Cross-session or document-vs-testimony conflicts do occur (the IR has a Conflict mark), but how the clearinghouse, contested-fact record, and definitional repair apply within a single-expert session is not worked out.
6. **Grader feedback loop risk.** The oracle warns LLM graders prefer polished verbosity (FM-13). Conversational-quality guidance ("deepen," "restate") could be optimized for fluency rather than acquisition if variant selection uses the weighted total. The quality vector and hard gates mitigate this only if the total is never used to pick variants.
7. **"Transform to PN" lines' retention.** Kept on two-run non-observation; the separation principle predicts eventual leakage risk. Needs a deliberate probe (a case inviting place/transition talk) before the question closes.
