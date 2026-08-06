# Dev-target portfolio confirmation

Type: grilling
Status: resolved
Resolved: 2026-08-06
Blocked by: 02

## Question

Confirm the first milestone's two live dev targets. The zil-lean survey resolved the shape of the second: full elicit-lean is **not** dev-sized (writing Lean statements from intent is the deep-expertise step), but the **elicit-proof-obligations** slice is — capture an assumption/lemma/theorem/guarantee dependency graph with criticality and evidence refs, validated by acyclicity + Datalog closure (no Lean statements, no proofs), per the ElicitationPack/ProjectionPack sketches in the survey answer. The survey judges it a *better* second target than BPMN on both pack axes; BPMN stays third.

Proposed portfolio to confirm: **elicit-gherkin** (tracer) + **elicit-proof-obligations** (second, forces the pack swap and the evidence-graded IR).

## Answer

> Resolved by HITL grilling, 2026-08-06.

**Portfolio confirmed**: `elicit-gherkin` + `elicit-proof-obligations` are the first milestone's two live dev targets; `elicit-BPMN/process-mining` is named third; full elicit-lean is deferred (writing Lean statements from intent is the deep-expertise step zil-lean itself never attempts).

**Order — hybrid, addressing the real risk at the design layer**: the spec mandates that **both packs are authored before the pack interface freezes** (design against both simultaneously, on paper — the "two targets on each axis from the beginning" rule), while **elicit-gherkin wires end-to-end first** as the cheap mechanism proof, with elicit-proof-obligations immediately after. Rationale: the user's identified risk — brunch failed to find a scalable, modular way to specify an elicitation process plus guiding skill material without over-proceduralizing — lives in interface design, not wiring order. The trivial target must not freeze the pack contract before the hard target has stressed it.

**Design principle surfaced (routed to Contract decomposition as a named input)**: agents do better with *behavioral* guidance than procedural, and with *clear shapes/patterns to fill* rather than schemas that require extensive parsing to build a model of the output shape. Packs are shapes-to-fill plus behavioral guidance — not procedural scripts, not parse-heavy schemas.

**Proof-obligations output format**: steal the ideas, own the format. Adopt zil-lean's load-bearing vocabulary (evidence-graded assurance lattice with prohibited promotions; PROVED/CONDITIONAL/WEAK/BROKEN status ladder; acyclicity + Datalog-closure validation) in our own claim-DAG serialization, **hewing to whatever existing canon fits** — Dafny's `requires/ensures/invariant` contract vocabulary is the leading candidate; Geolog (ARIA program, axioms addressed via Datalog-like queries) is plausibly adjacent. Grounding this is the new **Formal-verification canon survey** ticket (09), which blocks Assemble-the-spec so the milestone lands canon-grounded. `.zc` export is someday-maybe; no dependency on the unproven zil-lean repo.

**Gherkin validator depth (milestone one)**: parse validity + optional **pack-declared step-lexicon** binding check. The apparent codebase coupling dissolves: a step lexicon carried as pack policy needs no external project; only live-codebase step binding defers, named as the target's growth path.

Sub-questions:

- Do the two chosen targets differ materially on *both* pack axes (semantic + representation)?
- What is each target's smallest honest output contract for milestone one?
- Which target is the tracer (built first) and which trails to force the second-pack swap?
