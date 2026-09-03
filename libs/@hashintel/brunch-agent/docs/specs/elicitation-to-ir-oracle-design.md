# Spec: elicitation-to-IR oracle design

Status: **provisional**, captured 2026-08-28 from the Mission 2+3 talkthrough review.
This is verification design and research guidance, not execution authority or a CI gate.
Implement only through a live mission.

Sources:

- [`../reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md`](../research/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md)
- [`elicitation-completion.md`](elicitation-completion.md)
- [`structurally-typed-elicitation-runbooks.md`](structurally-typed-elicitation-runbooks.md)
- [`../evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`](../evidence/implementations/fe-1525-headless-runbook-pn.md)
- [`../../MISSION.next.md`](../../MISSION.next.md)

## Verification stance

Compare coherent variants of the agent's system prompt, skill material, runbook, and IR structure
through the end of elicitation, before PN construction. The primary question is not whether the IR
looks complete. It is whether the conversation acquired objective-relevant evidence and the IR
conserved its meaning, epistemic status, conflicts, gaps, and losses in a form another reader can
use.

Do not begin with one scalar score. Keep a quality vector, hard-failure gates, and blind pairwise
comparisons. A weighted total is a secondary summary only: it must not let eloquent prose, broad
coverage, or low turn count average away fabrication, silent hardening, unresolved conflict, or
unsupported completion.

The oracle should also test possible capture/IR joins offline. It must not wire Mission 2's capture
store into the interviewer or make capture extraction part of the question-turn latency path.

## Diagnostic assessment

- **Observability: partial.** Real runs retain transcripts, IR artifacts, tool/resource paths, and
  timings. They do not yet provide exact IR-statement → source-evidence links.
- **Reproducibility: partial.** Situation packs and the headless Flue drive are reusable, but the
  interviewer and simulated expert are stochastic. Existing real runs are one-offs around a
  teaching edit, not replicated baselines.
- **Controllability: high.** Elicitation can run headlessly with a fixed model, case, hard stop, and
  protocol. Construction can be excluded, and raw artifacts can be retained for regrading.

The first improvement is therefore grader-only case truth and disclosure metadata, not more
product instrumentation.

## Claims to prove

1. **Acquisition.** Questions expose the load-bearing, discoverable material relevant to the stated
   modelling objective without pursuing exhaustive process trivia.
2. **Conservation.** Facts, relationships, branches, timing, contention, qualifications, policy vs
   practice, corrections, and alternatives disclosed in conversation survive into the IR.
3. **Epistemic fidelity.** Explicit statements, inferences, assumptions, unknowns, absences,
   conflicts, omissions, and losses remain distinguishable.
4. **Evidence fidelity.** Every material IR statement is supportable from user evidence or marked
   as the agent's assumption; assent to agent-authored language is not treated as user evidence.
5. **Gap discipline.** The IR names the smallest consequential gaps without equating syntactic
   fullness, user fatigue, delivery, or model self-report with completion.
6. **Conversational quality.** The agent follows the expert's thread, deepens before surveying,
   uses expert vocabulary, and avoids opening overload, schema-shaped questioning, repetition, and
   premature accommodation.
7. **Cold utility.** A reader who did not see the transcript can reconstruct the intended process,
   identify its load-bearing assumptions, and name the smallest next question from the IR alone.
8. **Path robustness.** Materially equivalent evidence presented in different orders normally
   produces equivalent active meaning, while genuine corrections and conflicts remain visible.

## Case design: hidden truth ledger

Each reusable case keeps interviewee-visible material under `evaluations/cases/` and reviewed
answer keys under `evaluations/oracles/`, never in interviewer inputs. Alongside the expert's
situation pack, maintain a grader-only ledger whose smallest useful entry records:

```yaml
- id: washdown-shared-crew
  importance: load-bearing # load-bearing | useful | incidental
  epistemic_character: practiced-rule
  discoverable: true
  expert_can_answer: true
  reveal_when: asked about simultaneous demand or resource contention
  expected_ir_homes:
    - participants-resources
    - policies-exceptions
  traps:
    - do not infer the rule from the published schedule
```

The ledger is not the product's semantic schema. It is an evaluation oracle. It should include
facts the expert knows, facts they do not know, relevant absences, contradictions, policy/practice
divergences, irrelevant detail, and facts whose importance depends on the objective.

When practical, the simulated expert returns a private side channel:

```json
{
  "reply": "The user-facing expert reply",
  "disclosedFactIds": ["washdown-shared-crew"]
}
```

Only `reply` enters Flue history. The side channel lets the evaluator distinguish:

- an **acquisition miss** — discoverable material was never elicited;
- a **conservation miss** — disclosed material was lost or distorted in the IR;
- an **expert-simulator miss** — a suitable question was asked, but the simulator failed to
  disclose the material.

Do not grade naive recall against every fact in the situation pack. Weight only objective-relevant,
discoverable material, and keep "the expert cannot answer" distinct from "the interviewer did not
ask."

## Quality vector

Score each dimension from 0–4 with citations to fact ids, turns, and IR sections:

| Dimension | Provisional weight | What it measures |
| --- | ---: | --- |
| Objective-aligned acquisition | 20 | Weighted discovery of load-bearing, discoverable material |
| Semantic conservation | 20 | Whether disclosed process meaning survives into the IR |
| Epistemic and evidence fidelity | 20 | Grounding; correct uncertainty, inference, assumption, conflict, and correction states |
| Gap and loss discipline | 15 | Consequential unknowns, omissions, and unrepresentable material named accurately |
| Cold IR utility | 15 | Independent reconstruction and smallest-next-question quality |
| Conversation quality and burden | 10 | Adaptive deepening, expert vocabulary, discoveries per turn/token, no opening overload |

The weighted total is reported on a 0–100 scale only after the dimension scores. Weights remain
provisional until calibrated against historical artifacts and human judgments.

### Hard-failure gates

Report these separately; do not average them away:

- a fabricated load-bearing fact;
- silent hardening of ambiguity, hedge, unknown, or policy into a practiced precise value;
- silent collapse of a conflict or correction;
- a material IR statement with neither evidence nor an explicit assumption mark;
- a syntactically full IR with no objective-relative process slice;
- schema-shaped interviewing that mechanically reads the IR headings;
- terminal delivery or "complete" based on model self-report rather than evidence-bearing criteria.

A hard failure is a gated failure even if the weighted score is otherwise high.

## Oracle plan

### Inner loop: cheap and agent-runnable

- IR structural checks and unsettled-state vocabulary.
- Questions per turn, opening-battery detection, turn/token counts, and latency.
- No PN vocabulary in expert-facing questions; construction resources remain out of elicitation.
- Disclosed fact ids are represented, explicitly omitted, or named as gaps.
- Raw transcript, IR, model/config, prompt variant, and side-channel metadata are retained.

These checks expose gross regressions while editing. Counts are observations, not quality by
themselves.

### Middle loop: two independent graders

1. **Omniscient grader.** Receives situation pack, hidden ledger, transcript, and IR. Scores
   acquisition, conservation, fidelity, gaps, and burden. Every judgment cites evidence.
2. **Cold IR reviewer.** Receives the modelling objective and IR only. Reconstructs the process,
   states assumptions and ambiguities, and identifies the smallest next questions.

For the same case, compare baseline and candidate blindly with randomized A/B labels. Report:

- wins / losses / ties by dimension;
- median dimension deltas across replications;
- hard-failure rate;
- grader disagreement;
- cost, turns, tokens, and latency as separate operational measures.

Do not ask one grader to generate the case, simulate the expert, and grade its own output without
human calibration and retained raw artifacts.

### Outer loop: human calibration

A human reviews all hard failures and grader disagreements, plus one best and one worst run per
variant. Use these reviews to refine rubric anchors and grader prompts. Do not require human review
of every run once the graders are calibrated.

## Historical calibration versus a repeatable baseline

The two Mission 3 real-run artifacts are calibration material, not yet a repeatable baseline:
there is one run before and one after a teaching edit, with no replication. Use them to:

1. draft the hidden truth ledger retrospectively from the existing situation pack;
2. discover and name mistake classes;
3. write the first omniscient-grader and cold-reviewer prompts;
4. compare their judgments with the existing human proof/review findings;
5. tune score anchors until disagreements are explicit and intelligible.

Label the retrospective ledger as authored after seeing the run; it is unsuitable as an unbiased
final oracle. After calibration, freeze the case ledger, grader prompt versions, model/config, and
protocol. Then rerun the unchanged current prompt/runbook at least three times per case. Those runs
form the actual baseline for later variant comparison.

## Variant comparison

System prompt, skill material, runbook, and IR structure interact. First compare a small number of
coherent whole-package variants; this answers "which shape works?" but does not attribute causality.
Keep model, expert pack, hard stop, and graders fixed.

Once one coherent shape wins, run ablations or one-intervention comparisons to answer "which
change caused the gain?" Change one layer at a time, rerun the fixed cases with at least three
replicates, and record both target improvements and regressions. Do not mix model changes with
prompt/structure changes without a factorial comparison.

Use a stable mistake taxonomy across rounds. At minimum include misses, hallucination/invention,
silent hardening, conflict/correction collapse, boundary/scope errors, unsupported completion,
opening overload, schema-shaped questioning, conservation loss, and simulator nondisclosure.
Add ids; do not rename prior classes after results exist.

Generative probes are exploratory evidence, not CI gates. Promote only reviewed, stable cases into
regression fixtures.

## Shadow join: testing capture/IR convergence offline

After each conversation, test possible joins without changing interviewer behavior or product
runtime:

```text
conversation
  ├─ runbook IR
  └─ Mission 2-style settled-range capture envelopes
          ↓ offline evaluator
     IR statement ↔ evidence/capture support map
```

Apply the mechanical Mission 2 sweep after the interview, or derive equivalent immutable envelope
ids in the evaluation harness. An offline grader maps each material IR statement to:

- one direct capture/span;
- several captures synthesized together;
- an inference from captures;
- an explicit Brunch assumption;
- unsupported content;
- a correction/supersession relation;
- a projection loss.

This map is evaluation evidence, not a production IR feature. Measure:

- **support coverage:** weighted IR claims with evidence or explicit assumption provenance;
- **synthesis fan-in:** captures/turns required per IR claim;
- **capture utility:** captured material that contributes to the IR;
- **context dependence:** claims that isolated quotes cannot justify;
- **correction integrity:** superseded evidence handled coherently;
- **path sensitivity:** reordered evidence produces equivalent or divergent active meaning.

Interpret the evidence as follows:

- If important IR material is cross-turn editorial synthesis, captures should remain an audit
  ledger and the IR an independent workpiece.
- If support links materially improve auditability without shaping the conversation, the smallest
  useful join is likely IR statement → capture/evidence references.
- If a capture fold reproducibly regenerates equivalent IRs across order perturbations without
  restoring Condition 5 latency or judgment, deeper convergence becomes plausible.

The candidate narrow waist is therefore not assumed to be either typed captures or the runbook
template. Test whether it is only evidence links, epistemic state, and explicit transformation/loss.

## Research syntheses before authoring variants

Produce four source-grounded syntheses:

1. universal interviewing moves, counter-techniques, and failure modes;
2. SDCPN investigation obligations that do not expose PN vocabulary to the expert;
3. IR obligations — what meaning the workpiece must conserve and make auditable, independent of
   the first heading catalogue;
4. capture/IR seam hypotheses from Mission 2, ADR-0003, the criteria research, and Mission 3
   evidence.

For each proposition, record:

```text
source claim
→ universal or SDCPN-specific
→ lifecycle phase
→ home: system / skill body / resource / IR / checks
→ probe that could falsify it
```

Use these syntheses to design coherent variants. Do not paste source material wholesale into the
system prompt or skill.

## Blind spots and stop conditions

- LLM graders can prefer polished verbosity over faithful meaning; blind pairwise comparison and
  human calibration reduce but do not eliminate this.
- A simulated expert may reward questions unlike a real expert. Retain a future human-expert outer
  check, but do not put it in the inner probe loop.
- The retrospective ledger for existing runs is vulnerable to hindsight. Freeze prospective
  ledgers before using scores to choose variants.
- If graders cannot distinguish acquisition from conservation, add disclosure metadata before
  running more probes.
- If weighted score and human judgment repeatedly disagree, keep the vector and discard the total;
  do not tune weights until the preferred variant wins.
- If a shadow join requires in-loop extraction or changes the interviewer's questions, stop: it is
  no longer an evaluation and must return to mission design.
