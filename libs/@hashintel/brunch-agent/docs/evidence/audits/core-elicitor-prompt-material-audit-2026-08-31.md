# Core elicitor prompt material audit

**Date:** 2026-08-31

**Status:** Research and implementation audit for owner review. This compiles existing Brunch material for possible inclusion in the context- and formalism-independent core elicitor prompt. It does not amend the prompt, the runbook, or `MISSION.md`.

## Question

What has this project already said, taught, observed, or tested about conduct that should hold for a Brunch elicitor across domain contexts and output formalisms, and which part of that material is small and universal enough to remain in the always-on core system prompt rather than a progressively disclosed skill, plugin resource, workpiece contract, evaluator, or suspended mechanism?

## Method

The audit read all six current files under `docs/research/elicitation/`, the paired 2026-08-28 universal syntheses and their overview, current executable prompt/skill sources, the suspended repertoire renderer, frozen legacy and prospective prompts, mission/spec placement decisions, and evaluation evidence. Three isolated read-only inventories separately covered executable material, research, and historical prompt forms; they were used as completeness checks, not as independent evidence.

## Verdict

The current one-line prompt is correctly context-independent but under-specifies the stable conduct that the project repeatedly treats as universal. The corpus does not support copying the old repertoire or v0 prompt wholesale into the system prompt. It supports a concise always-on invariant set surrounded by progressively disclosed generic elicitation teaching.

The strongest always-on candidates are: objective-relative attention; expert vocabulary rather than schema traversal; authorship and uncertainty preservation; no independent opening battery; divergence before reconciliation; and honest partial delivery rather than fluency-based completion. Detailed interviewing moves, quantitative scripts, lifecycle procedure, workpiece marks, target investigation, and detection signatures belong elsewhere.

## Evidence discipline

Repeated text is not independent corroboration when the active skill, repertoire, universal syntheses, and later specifications all descend from the same local source pool. Confidence rises where different evidence classes align: verified literature, observed Brunch runs, independently observed LLM-interviewer failures, and current executable teaching. Historical specifications and prompt variants show design lineage and candidate wording, not effectiveness by themselves.

The corpus itself warns against prompt accretion: [`elicitation-to-ir-oracle-design.md`](../../specs/elicitation-to-ir-oracle-design.md) says not to paste source material wholesale into the system prompt or skill; [`structurally-typed-elicitation-runbooks.md`](../../specs/structurally-typed-elicitation-runbooks.md) says the always-on instruction is a concise router and invariant set, while bulky universal material remains lazy.

## Source register

| Source | What it contributes | Evidence status | Use in this audit |
| --- | --- | --- | --- |
| [`packages/core/src/repertoire.yaml`](../../../packages/core/src/repertoire.yaml) | The largest executable compilation of formalism- and domain-independent lenses, techniques, movements, licenses, smells, rabbit holes, failure modes, and lifecycle moves | Compiled teaching with per-entry provenance; suspended from production | Primary inventory of candidate generic conduct; too large and mechanism-coupled to use as an always-on prompt |
| [`packages/core/src/instructions.ts`](../../../packages/core/src/instructions.ts) | `HARNESS_PREAMBLE` and the renderer that combined repertoire with typed plugin definitions | Executable but suspended mechanism | Useful negative control: several sentences assert capture/fold/completion machinery the active agent does not have and therefore must not enter the current core prompt |
| [`plugin-sdcpn/.../elicitation.md`](../../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/elicitation.md) | A compressed active version of universal questioning, evidence, prioritization, stopping, caveats, and failure knowledge mixed with SDCPN investigation | Current production teaching; headings explicitly mark `universal`, `sdcpn`, and `mixed` provenance | Direct evidence that universal content is currently misplaced in the plugin; useful wording source, not the correct final home |
| [`universal-elicitation-synthesis.md`](../../archive/research/elicitation/2026-08-28-ensembles/universal-elicitation-synthesis.md) and its [independent companion](../../archive/research/elicitation/2026-08-28-ensembles/universal-elicitation-synthesis-cursor-2026-08-28.md) | Proposition-by-proposition source mapping, candidate homes, falsifying probes, current-material assessment, and unresolved tensions | Read-only syntheses over substantially shared local sources | Best existing placement analysis; agreement is editorial corroboration, not independent empirical evidence |
| [`elicitation-research-synthesis-2026-08-31.md`](../../research/elicitation/elicitation-research-synthesis-2026-08-31.md) | Cold-adjudicated synthesis across universal elicitation, SDCPN investigation, IR obligations, and capture/IR separation | Authoritative synthesis of the 2026-08-28 research batch | Current high-level evidence and uncertainty calibration |
| [`elicitation-strategy-literature.md`](../../research/elicitation/elicitation-strategy-literature.md) | Verified literature on objectives-first framing, concrete cases, probe depth, cue elicitation, quantities, disagreement, stopping, and technique selection | Mixed `[V]`, `[C]`, and `[R]` source grades, explicitly labelled | Main independent literature evidence; only `[V]` claims are treated as strong prompt candidates without further checking |
| [`interviewing-literature-source-catalog.md`](../../research/elicitation/interviewing-literature-source-catalog.md) | Verbatim instruments and frequencies: Bano/Ferrari mistakes, ambiguity cues, question typologies, completeness and stopping literature, and LLM interviewer findings | Source-preserving research report | Supplies exact failure observations and guards against over-compressed claims in later summaries |
| [`frontier-model-elicitor-failure-catalogue.md`](../../research/elicitation/frontier-model-elicitor-failure-catalogue.md) | FM-01–15 with mechanism, detection signature, accountable layer, and prevention status | Separates local observations, published observations, and synthesis | Prevents assigning machinery failures to prompt prose; identifies opening overload, ambiguity bypass, and unlicensed influence as technique-owned or partly technique-owned |
| [`evaluations/protocols/legacy-baseline/v0-prompt.md`](../../../evaluations/protocols/legacy-baseline/v0-prompt.md) | The first compact seven-move elicitor prompt: objectives first; slice then sweep; probe; ask absences; batch breadth/sequence depth; assumption ledger; end properly | Sealed historical evaluation instrument | Strong wording lineage and one observed intervention, but process-model categories and a full deliverable contract make it too target-specific and too large for core |
| [`harness-teaching-lineage-audit.md`](harness-teaching-lineage-audit.md) | Fifteen historical formulations of generic interviewer craft and their migration among plugin, harness, mechanism, and prompt layers | Historical audit | Establishes that generic ownership was repeatedly intended but never cleanly delivered; does not select final content |
| [`structurally-typed-elicitation-runbooks.md`](../../specs/structurally-typed-elicitation-runbooks.md) | Explicit Flue information hierarchy and the universal-repertoire versus target-runbook split | Historical specification, not live authority | Supplies the placement rule: concise always-on router/invariants; lifecycle in skill body; bulky teaching in resources |
| [`elicitation-to-ir-oracle-design.md`](../../specs/elicitation-to-ir-oracle-design.md) | Eight quality claims, hard-failure gates, mistake taxonomy, and source-to-home method | Evaluation design hypothesis with calibrated artifacts | Converts broad virtues into observable failures; most detection detail belongs in evaluation, not the prompt |
| [`vestera-legacy-baseline/readout.md`](../evaluations/vestera-legacy-baseline/readout.md) and [`vestera-prospective-baseline-v1/campaign-adjudication.md`](../evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md) | Observed failure and success ranges under different prompt/runbook conditions | Local run evidence; small samples | Grounds invention, hardening, stopping, opening-load, acquisition variability, and strong behavior to preserve without treating one run as representative |
| [`agentic-elicitation-challenges`](../../research/elicitation/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md) and [`criteria`](../../research/elicitation/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md) | The early interactive-compiler framing, semantic conservation, explicit transformation, controlled elicitation, and swappable targets | Imported design conversations | Useful conceptual sieve; not direct prompt copy and not independent research evidence |

## Candidate material by placement

### Always-on core system prompt

These propositions are short, context-independent, relevant before any skill resource is read, and supported by either observed failure or multiple evidence classes.

| Candidate invariant | Existing formulations | Evidence and confidence | Why always-on |
| --- | --- | --- | --- |
| **Context-independent elicitor identity** | Current core: “You are the Brunch elicitation assistant.” The v0 prompt used “expert process-model elicitor,” which is too narrow. | Product-policy decision; no empirical claim needed | Establishes role without selecting a domain, editor, workpiece, or formalism |
| **Purpose-relative attention** | Repertoire: “Objectives first” and “Depth is objective-relative.” Research synthesis: establish the decision, comparison, or worry, audience, boundary, horizon, and accuracy need. Literature: objectives determine responses, factors, scope, and detail. | Strong: verified simulation-modeling literature plus local stopping/acquisition failures; exact opening script remains unsettled | Every later question-selection and stopping judgment needs a purpose denominator; the detailed stance interview stays in the skill |
| **Expert vocabulary, not target-schema traversal** | Active skill: follow the expert’s thread; do not interview by workpiece headings. Oracle gate: schema-shaped interviewing. Mission 3 observed operational vocabulary without PN leakage. | Medium-high: design principle, evaluator gate, and local positive observation; no comparative proof that jargon always harms acquisition | It must constrain the first substantive question, before lazy teaching is available, and remains valid for every plugin |
| **Authorship and uncertainty remain distinct** | Repertoire and active skill: a value the expert did not give cannot appear as theirs; assumptions are stated as the agent’s with reason and check; tension is preserved. Challenges/criteria: semantic conservation and explicit transformation. | Strong: local invention/hardening failures, published LLM hallucination, and prospective evidence that explicit partials can remain cold-usable | This is the stable trust contract across every domain and target; detailed workpiece marks and capture machinery stay outside the prompt |
| **No independent opening battery** | Repertoire: opening battery is failure; active skill: batch two to four only under one frame. Universal synthesis: hard rule is no independent battery before the first answer; the numeric batching license is unearned. | Medium: two historical Mission 3 opening batteries and FM-12; no opening overload in either valid prospective run; literature supports one-question/depth but not one universal count | Placement, not just content, was observed to matter: lazy teaching arrived after the offending first turn. The exact post-opening batching policy belongs in the skill |
| **Divergence is information, not permission to reconcile** | Repertoire: two answers in tension; sources that disagree; consistency probe. Literature: ambiguity exposes tacit knowledge and disagreement must not be silently averaged. | Strong for preservation; medium for exact questioning cadence | The prohibition on silent reconciliation is universal and compact; detailed correction-versus-coexistence handling belongs in the skill/workpiece |
| **Completion is not fluency; stopping yields an honest partial** | Repertoire: “End properly,” “Honour a stop,” and “Name the stopping outcome.” Failure catalogue: premature accommodation, budget exhaustion, and fluent incompleteness. Research synthesis: stop on evidence-bearing criteria, not fluency, fatigue, turn count, or self-report. | Strong that false stop rules fail: local legacy failures plus independently published LLM early-stop and budget-exhaustion behavior. The active path lacks typed completion machinery. | A concise behavioral guard is honest; claiming that the harness computes completion would be false. Detailed close ritual and target sufficiency stay outside the prompt |

### Core elicitation skill body or lazy resource

These are generic, but too procedural, conditional, lengthy, or evidence-sensitive for the always-on prompt.

- **Stance before structure:** purpose, audience, boundary, horizon, accuracy need, time/appetite, and tolerance for proposed assumptions, sampled conversationally rather than administered as a form.
- **Concrete case before generalization:** a bounded three-to-six-step account, one remembered occasion from trigger to end, then one property across what that case revealed.
- **Deepening moves:** last-time probes; cue and observable follow-ups; no bare why as the primary probe; contrastive and expert–novice questions; anchored hypotheticals; change technique when yield drops.
- **Practice versus policy:** normative language and documents are claims to test against recent practice, not practiced facts.
- **Quantitative judgment:** determine whether typical or tail matters; use quantiles rather than min/mode/max; one incident is not a rate; use the clairvoyant test when definitions are unstable. Exact scripts should remain lazy and source-labelled.
- **Assumption and deferral licenses:** propose low-risk structure for correction only with agent authorship visible; defer only with what is missing, why, and where it would come from.
- **Divergence handling:** ask whether a later account is a correction or a context in which both apply; preserve unresolved alternatives and long-range contradictions.
- **Closing procedure:** summarize, name assumptions and consequential gaps, offer one correction opportunity, use a clearinghouse only as a cheap correction rather than coverage proof, and open no new topic after a stop.
- **Rare-event and taxonomy techniques:** premortem, CDM/ACTA probe families, laddering, card sorting, triadic comparison, exception sweeps, and tradeoff pairs. These are disclose-on-strain resources, not default prompt furniture.

### Plugin-owned material

- What kinds of things the selected formalism needs investigated and how to recognize them.
- Workpiece structure, emission/recovery convention, and target-specific sufficiency.
- SDCPN situation typologies, Petri-net mapping, Petrinaut construction/check behavior, and target projection loss.
- Any vocabulary such as place, transition, token, colour, firing, SDCPN, Petrinaut, runbook IR, or `runbook-ir` fence.

### Evaluator- or machinery-owned material

- Detection signatures, weighted score dimensions, hidden ledgers, mistake IDs, question counts, token/turn budgets, and comparative thresholds.
- Claims that captures, folds, completion demands, affected slices, provenance links, or projection loss reports are mechanically computed. The current production path does not provide those mechanisms.
- Stable identity, typed claim schemas, capture-store commands, observer folds, and plugin proposal contracts.
- Absolute completion claims. The verified literature supports purpose-relative sufficiency and explicit gaps, not knowable exhaustive completion.

## Existing prompt forms and what they teach

### The one-line current core

Strength: correctly names no domain or output formalism after the latest ownership correction. Weakness: it gives the model no stable trust, attention, interaction-load, or stopping contract. All consequential conduct is currently contingent on plugin activation and resource reads.

### The v0 prompt

Strength: the clearest compact historical sequence and the origin of much current teaching. Weakness: it makes a seven-category process-model surface the completion checklist, mixes universal method with process-model content, and is large enough to encourage schema-shaped interviewing. Reuse its seven generic move headings as source material, not its complete system prompt.

### The repertoire

Strength: the richest provenance-bearing inventory, including licenses and anti-guidance lost from the active compression. Weakness: it is a catalogue, contains unresolved or one-run-vindicated choices, and was designed to be rendered with typed plugin/completion machinery. Use it to populate and test a core skill, not as one large prompt.

### The active SDCPN elicitation resource

Strength: a terse, field-usable compression that valid prospective runs used without hard failures. Weakness: it explicitly mixes universal and SDCPN material; universal rules arrive too late to constrain skill-activation turns; several rules are labels without triggers; acquisition varied materially across the two valid runs.

### `HARNESS_PREAMBLE`

Strength: compact statements of provenance and completion intent. Weakness: four of five sentences describe suspended capture/fold/completion/affected-slice behavior. Importing them would make the prompt lie about the active runtime. Only the non-invention distinction may be restated behaviorally, without machinery claims.

### Condition 3

[`condition-3-prompt.md`](../../../evaluations/protocols/legacy-baseline/condition-3-prompt.md) combined the v0 identity with single-session controls, operator-supplied completion diagnostics, CPS cards, bounded batching, status/grade language, and respectful close. It was never run and was retired. Its close and evidence fragments remain candidates for progressive teaching; diagnostic coordinates and CPS cards are evaluation/plugin material.

### Conditions 4 and 5

The exact [Condition 4 system prompt](../evaluations/vestera-legacy-baseline/transcripts/condition-4-system.md) rendered the complete repertoire and SDCPN plugin into one large text-only prompt. The exact [Condition 5 system prompt](../evaluations/vestera-legacy-baseline/transcripts/condition-5-system.md) added ask, settlement, capture/fold, and typed completion instructions. These are valuable archaeological snapshots and negative controls: adding comprehensive teaching and mechanism claims did not make them suitable always-on core prompts, and Condition 5 imposed minute-scale foreground work.

### Frozen Mission 3 runbook

The prospective v1 control at source commit `b738aa1be1a62a9f9cdde89ced78558f04293a77` is the exact predecessor of the current package-owned skill. It supplies no additional semantic source beyond the active files, but it is the immutable behavioral control against which prompt placement changes must be compared.

### Stock Petrinaut prompt

`libs/@hashintel/petrinaut-core/src/ai.ts` contains a separate active Petrinaut prompt with “interview first, build second,” grouped questions, process/timing/metrics/scenario coverage, tool policy, and an offer to “make it up/use sensible defaults.” It is useful as coverage evidence but not reusable Brunch policy: most of it is editor/formalism-specific, and invented defaults conflict with Brunch’s provenance contract.

## Provisional compact compilation

This is a candidate assembled from existing material, not a recommended edit yet. Each paragraph should be accepted, rejected, or relocated independently before implementation.

```text
You are the Brunch elicitation assistant. Help a person make their knowledge explicit enough for the selected purpose and target without assuming a domain or output formalism.

Establish what the result must help them decide or answer, then spend questions on distinctions that can change that result.

When speaking with the person, use their vocabulary and follow concrete cases rather than traversing a schema or target representation. Do not open with a battery of independent questions; deepen one answerable thread at a time, and group questions only when they share one frame.

Preserve authorship and uncertainty. Distinguish what the person said from your inference, assumption, unknown, ambiguity, conflict, correction, omission, or default. Never invent content, silently make a hedge more precise, or treat assent to your own wording as independent evidence.

Treat tensions as information and ask before reconciling them.

Do not treat fluency, document fullness, your own confidence, user fatigue, or a turn budget as completion. If the person stops, return the best useful partial result with consequential gaps and assumptions named.
```

## Conservative smaller candidate

If the first prompt iteration should include only the highest-confidence trust and routing invariants, defer the disputed batching and fuller stopping language:

```text
You are the Brunch elicitation assistant. Help a person make their knowledge explicit enough for the selected purpose and target without assuming a domain or output formalism.

Establish what the result must help them decide or answer, and use their vocabulary rather than traversing a schema or target representation.

Preserve authorship and uncertainty. Never invent content, silently harden an answer, reconcile conflicting accounts without asking, or present your own wording as the person’s evidence.

When the person stops, return the best useful partial result with consequential gaps and assumptions named.
```

## Decisions still required before editing the core prompt

1. Whether “selected purpose and target” is useful generic orientation or unnecessary abstraction in the identity paragraph.
2. Whether the observed first-turn placement failure justifies an always-on no-opening-battery sentence despite no opening-overload gate in the two valid prospective runs.
3. Whether core should say “one answerable thread at a time,” “one question at a time,” or only prohibit independent batteries; the `2–4` batching number is not independently established.
4. Whether the always-on epistemic list should name all distinctions or state the compact governing prohibition and leave the vocabulary to the core skill/workpiece.
5. Whether stopping language should name false stopping rules or only require honest partial delivery; core must not imply typed completion machinery that is suspended.
6. Whether “person,” “expert,” “user,” or “source” is the generic counterpart. The literature warns that domain experts may not be modelers, while Brunch may eventually elicit from non-expert stakeholders too.
7. Whether the core prompt should direct activation of a generic elicitation skill. Flue already presents mounted skill descriptions; plugin-specific skill names do not belong in core.

## Recommended next move

Review the conservative candidate one paragraph at a time against the decisions above. Then create a core elicitation skill from the generic teaching inventory before adding more detail to the always-on prompt. The first candidate evaluation should preserve the frozen baseline and separately test whether moving the no-opening-battery and epistemic invariants into the always-on tier changes first-turn load or evidence fidelity.
