# zil-lean survey

Type: research
Status: resolved
Resolved: 2026-08-06

> **Rename note (2026-08-10, spec assembly):** occurrences of `elicit-proof-obligations` below are the historical name; the second target is the **assurance argument**, package `plugin-assurance` (per the [Formal-verification canon survey](09-formal-verification-canon-survey.md)'s category-error verdict). This ticket's ElicitationPack sketch is superseded by ticket 09's `Statement` contract (pre-pass S10); the surviving contributions are the existence proof, the assurance lattice with prohibited promotions, derivation provenance, and the derived-status idea.

## Question

What elicitation-for-formal-verification insights does https://github.com/jagg-ix/zil-lean hold, and is a lean/formal-flavored elicitation target _dev-sized_ — small enough to develop the kernel against without wading into a massively complex target?

Specifically:

- What is the repo: purpose, structure, how it relates natural-language intent to Lean formalization
- What would an **ElicitationPack** for a lean-flavored target need: concept contract (what counts as a proposition/invariant/assumption), observation lenses, completion criteria
- What would its **ProjectionPack** need: output contract/shape, validators (does Lean itself act as the deterministic validator?), lossiness
- Verdict: dev-sized or too heavy? If too heavy, what is the smallest formal-flavored slice that still exercises both pack axes differently from elicit-gherkin? (Fallback second target is BPMN/process-mining.)

## Answer

> Resolved by `/research` subagent, 2026-08-06. Local clone for follow-up: scratchpad `zil-lean/` (session-temporary).

# zil-lean survey

## 1. What it is

**Documented facts.**

- `jagg-ix/zil-lean` — "ZIL: a relational knowledge language implemented in Lean 4 with a Clojure runtime and toolchain." Primary language Clojure; no license file; 31 stars, 1 fork, 0 subscribers, 1 open issue, no topics.
- **Provenance/activity**: repo created 2026-07-27T06:10, last push 2026-07-29T02:26. Entire history is **27 commits over ~2 days**. First commit is "Initial public snapshot" by `github-actions[bot]`; all six PRs are branches named `agent/modularize-*`, `agent/complete-engine-governance-modules`. There is also a `PUBLIC-CONTENT-POLICY.md` and commits titled "Isolate validated source publication." **Inference (high confidence)**: this is an agent-authored code dump published from a private working repo — ~140k tracked lines landed in one snapshot, then mechanically split into modules. Not an organically evolved project, and not battle-tested.
- **Size/structure**: 532 files. `Zil/` (106 files, 14.2k lines Lean 4 — the native library), `src/zil/` (75 files, 17.5k lines Clojure — runtime/CLI/bridges), `spec/` (44 markdown specs, 5.3k lines), `examples/` (133 files, 85k lines — dominated by generated data), `lib/` + `libsets/` (`.zc` macro libraries), `test/` (57 files, 6.1k). Lean pinned to `leanprover/lean4:v4.31.0`.
- **What "ZIL" is**: a **relation-tuple + Horn-rule (Datalog) knowledge language**, explicitly modeled on Google's Zanzibar `object#relation@user` tuple syntax, extended from authorization into general project knowledge: `declaration ─implements→ requirement`, `theorem ─validates→ component`, `claim ─supportedBy→ document`. Four primitives: nodes, relations, rules, queries. Two surface syntaxes (`.zc` tuple text; native Lean macros `zil_fact` / `zil_theorem_rule`) plus a canonical IR, snapshot format `ZILX/1`, delta format `ZILD/1`, revision log `ZILR/1`, and exporters to Soufflé and Prolog.
- **Relation to Lean**: Lean is (a) the implementation host of the engine and (b) a **certification backend for a narrow slice**. `Zil.Trust` has three levels — `asserted` (registered fact), `graphDerived` (rule-inferred), `certified` (a rule paired with a Lean proposition + proof term, kernel-checked). Everything else about proofs is _bookkeeping_: `spec/proof-obligation-governance-v1.md` governs declared obligations across `z3 | tlaps | lean4 | acl2 | manual` and validates _presence of evidence references_, not their content ("Lean kernel validation remain[s] the responsibility of [its] producing system").

**It is not**: a benchmark, a proof-automation system, an autoformalization pipeline, or anything with an LLM in it. `grep -ril 'openai|anthropic|llm|prompt|natural.language|gpt-'` across the repo hits **two files, both false positives** (a Terraform API schema, a config macro lib). "assistant" appears only as node names in examples (`assistant.formalization`, `assistant.codegen`) — agents are _modeled as nodes in the graph_, never as interviewers. **There is no elicitation, no question-asking, and no natural-language front-end anywhere in this repo.**

## 2. Elicitation-relevant insights

The bookmark intuition is wrong about the surface but partly right about the substrate. zil-lean contains **no informal→formal capture**, but it is an unusually well-worked-out example of **the layer the kernel calls the claim graph** — and it is worth reading precisely for that.

Transferable, documented:

- **Evidence-graded claim graph as a first-class artifact.** `spec/assurance-levels-v1.md` defines five orthogonal labels — `exploratory`, `validated`, `kernel-backed`, `externally-attested`, `byte-attested` — with an explicit **prohibited-promotion lattice** (`validated ↛ kernel-backed`, `externally-attested ↛ kernel-backed`, `byte-attested ↛ validated`). Crucially: "Assurance labels state what checked a result… must not be inferred from a successful exit code alone." Directly reusable as the kernel's IR annotation on captured claims, and the sharpest thing in the repo.
- **Full derivation provenance.** `spec/derivation-provenance-v1.md`: every fact node carries `id / fact / origin / stratum`, where origin is `base` or `rule(ruleName, premiseFactIds, negativeChecks, binding)`. Query answers emit witnesses with premise fact IDs and bindings. Reports are deterministic and **timestamp-free** so they hash stably. This is the evidence-preserving IR the kernel wants, worked out concretely — including the honest caveat: "The trace is graph-derived evidence. It is not a Lean kernel proof term."
- **A concept vocabulary for formal-flavored capture that already distinguishes the kernel's hard cases.** `examples/formalization-arc-demo.zc` + `lib/theorem-dsl-macros.zc` separate **assumption** (with class + `ASSUME_HOLDS(source)` / `ASSUME_BROKEN(source, reason)`), **lemma**, **theorem**, **guarantee** (`THEOREM_ENSURES`), **evidence** (engine + token), **component**, **signal**, and **incident** (which can _break_ an assumption and propagate). Derived statuses: `PROVED` (deps satisfied + witness), `CONDITIONAL` (witness but assumption under review), `WEAK` (no witness), `BROKEN` (required assumption broken). That is a completion-criteria ladder, expressed as Datalog, that the kernel could adopt nearly verbatim.
- **Two forms of "enough."** `spec/formalization-plan-v1.md` schedules `FORMALIZATION_TARGET` declarations (`module, file, declaration, status, priority, dependencies?`) over a validated acyclic dependency graph, defining _readiness_ as `status ∈ {ready, in_progress} ∧ ∀dep. dep.status ∈ {verified, reviewed, proved}`, with structured blocking reasons (`status:<s>`, `missing:<t>`, `dependency:<t>:<s>`). `spec/agent-context-v1.md` defines a **context bundle** for handing a task to an agent — changed nodes → reverse impact → relevant facts → originating rules → auto-selected queries and targets — with explicit incompleteness issues (`unknown-changed-node`, `missing-query`, `missing-formalization-target`) and `context_bundle_id = sha256(report bytes)`.
- **Drift detection on formal statements.** `spec/theorem-statement-locks-v1.md` locks `(token_id, declaration, module, kind, type_fingerprint)` and reports ordered check states (`fingerprint_changed`, `declaration_changed`, `missing_token`, `current_unresolved`, `unexpected_token`…). Answers "did the formalization silently stop meaning what the user said?" — a re-elicitation trigger.
- **A request-elicitation schema that already exists.** `spec/request-form-core-v0.1.md` (draft) formalizes "a requester asks for `<something>`" as `Data | Action | Compound | Recursive`, with `mode ∈ {dry_run, apply}`, explicit `Effect` entities, and `Criterion` acceptance predicates, lowered to canonical tuples with derived judgments (`has_side_effect`, `is_recursive`, `execution_contract plan_only`). **Inference**: this is the closest thing in the repo to an elicitation target schema, and it is _not_ Lean-flavored at all — it is intent-flavored. It may be more useful to the kernel than the theorem DSL.

What zil-lean does **not** show, and the kernel must supply: how anyone _arrives_ at these declarations. Every `.zc` file is hand-authored. There is no question generation, no ambiguity detection, no candidate extraction from prose, no clarification loop. The Lean checker is used as an oracle over _already-formal_ artifacts, never as a feedback signal into a conversation.

## 3. ElicitationPack sketch (elicit-lean/formal)

Grounded in the vocabulary zil-lean shows is actually load-bearing.

**Concept contract** — five kinds, distinguished by their _evidential obligations_, not their grammar:

| Kind                  | Test                                                       | Obligation on capture                         |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `assumption`          | Taken as given; not to be discharged here                  | must name a holder/source and a review status |
| `invariant`           | Must hold at all times over a named state/scope            | must name scope + the state it constrains     |
| `proposition/theorem` | A claim asserted to follow from others                     | must name required assumptions + lemmas       |
| `guarantee` (ensures) | An outcome promised to a consumer                          | must attach to a producing component          |
| `constraint`          | A restriction on inputs/config, not a claim about behavior | must name what it restricts                   |

Non-negotiable per-item fields (from `THM_*` + proof-obligation governance): `id`, `criticality`, `depends_on: [assumption|lemma]`, `evidence?: (engine, token)`, `status`, and — added by the kernel, absent in zil-lean — `source_span` (the utterance it came from) and `paraphrase_confirmed: bool`.

**Observation lenses** (what to notice in conversation):

1. **Modal/quantifier lens** — "always", "never", "must", "for every", "at most one" → invariant candidate.
2. **Hedge lens** — "assuming", "as long as", "we can take for granted", "in practice X is well-formed" → assumption candidate, and a _required_ follow-up on who guarantees it. `a_input_well_formed` in the demo is exactly this shape.
3. **Consequence lens** — "so then", "which means", "that guarantees" → proposition with an implicit dependency edge to name.
4. **Break lens** — "except when", "unless", "this fell over once when…" → either a missing precondition on an existing item, or an incident that breaks an assumption (`INCIDENT_BREAK_ASSUMPTION`).
5. **Undefined-term lens** — a noun used in a claim that has no node yet → must be introduced before the claim can be normalized.

**Completion criteria** (ladder taken from the demo's status computation, plus dependency-closure from the plan spec):

- _Structurally complete_: every claim's `depends_on` targets exist; dependency graph acyclic; every term referenced has a node. (Directly = the plan spec's set-validation rules.)
- _Epistemically complete_: no claim is `WEAK` without the user having explicitly deferred it; every `CONDITIONAL` names the assumption under review and its owner; every `critical` item has either evidence or an explicit, reasoned waiver (governance spec forbids waiving critical items).
- _Faithfulness_: every captured item has a user-confirmed paraphrase. This is the one criterion zil-lean cannot inform — there is no user in it.

## 4. ProjectionPack sketch

**Output contract**: the claim graph projects to a `.zc`-shaped tuple set plus derived-status queries — the `formalization-arc-demo.zc` shape is a working, concrete target. Textual, diffable, deterministic, machine-checkable _without Lean_.

**Deterministic validators, in ascending cost** — and this is the important structural finding: **zil-lean demonstrates that Lean is the wrong first validator.** Three cheaper tiers exist and catch most errors:

1. **Schema/graph validation** (free): unique IDs, nonnegative priorities, existing dependency targets, acyclicity, stratification safety, relation declared in some base fact or rule head (`unknown-relation` verdict).
2. **Datalog closure** (cheap, deterministic, bounded — default fuel 64/stratum): derives `PROVED / CONDITIONAL / WEAK / BROKEN`, impact sets, break roots. The real workhorse oracle, and it runs on the _informal_ graph.
3. **Obligation governance** (cheap): checks that declared statuses are supported by evidence references — `proved-status-requires-evidence`, `obligation-not-discharged`, `waiver-reason-missing`, `critical-obligation-cannot-be-waived`.
4. **Lean elaboration** (expensive, narrow): only for items actually written as Lean declarations. `spec/lean-verification-report-v1.md` runs `lake env lean <file>` per module + SHA-256 manifest match; `Zil.Trust.CertifiedRule` kernel-checks a proposition/proof pair.

So: **Lean serves as the deterministic validator only for the `kernel-backed` tier, and zil-lean's own architecture says you must not let success at tiers 1–3 masquerade as tier 4.** The prohibited-promotion table is the lossiness policy, pre-written.

**What's lossy**: the natural-language statement itself (`statement` is a free-text field in the obligation schema, unvalidated); the _reason_ an assumption is believed (only `source` is kept); alternative derivations (v1 provenance retains only the first witness); and — the deep one — the gap between "Lean accepted this declaration" and "this declaration means what the user said." `theorem-statement-locks` spells it out: "The lock does not claim that unchanged type fingerprints imply unchanged proof terms, source text, or external scientific meaning." The kernel must keep the utterance→claim→declaration chain because nothing downstream can reconstruct it.

## 5. VERDICT — dev-sized?

**A full elicit-lean/formal target is not dev-sized. A slice of it is, and it's a good one — but it is not the slice with Lean in it.**

Reasoning:

- **The heavy part is real.** Getting from a user's claim to a Lean _statement_ (not proof) requires committing to a type-theoretic encoding of the domain — the step autoformalization research finds hardest. That is deep-Lean-expertise work, and the contract is not definable without it. zil-lean quietly concedes this: it never writes theorem statements from intent. It stores `proof:Normalize.idempotent` as an opaque **token naming a declaration a human already wrote**. The demo file says so outright: "Proof status here is bookkeeping only. The proof assistant remains the sole proof authority; proof tokens name checked declarations but do not assert them."
- **The light part is genuinely there, and zil-lean is a working existence proof of it.** Eliciting an **assumption/lemma/theorem dependency graph with criticality and evidence pointers** — no Lean statements, no proofs — is weeks-scale. Every validator you need is graph-level and already specified in this repo.

**Smallest formal-flavored slice: "elicit-proof-obligations" / the verification arc.** Interview a user about a system they believe is correct; capture assumptions (with owners and review status), lemmas, theorems, guarantees, and the dependency edges among them; attach evidence references where they exist; project to a `.zc`-style graph; validate by acyclicity + stratified Datalog closure yielding `PROVED/CONDITIONAL/WEAK/BROKEN` + break-root and impact queries.

**Does it differ from elicit-gherkin on both pack axes? Yes, cleanly:**

- _ElicitationPack_: Gherkin's concept contract is **scenario-shaped and example-driven** (Given/When/Then, concrete instances, no cross-item structure); completion is per-scenario coverage. This target's contract is **claim-shaped and dependency-structured** — the unit is a proposition with edges to other propositions, the hedge lens is central (Gherkin has no notion of an assumption), and completion is _graph closure plus evidence adequacy_, not enumeration. Different lenses, genuinely different "enough."
- _ProjectionPack_: Gherkin projects to a flat, independently-executable list; validation is parse + step-binding. This projects to a **DAG with derived statuses**, validated by fixpoint computation and an evidence-promotion lattice. The lossiness policy is substantive (assurance levels, first-witness-only) rather than near-absent.

**Fallback comparison.** Take this slice **over** elicit-BPMN/process-mining as second target. Both differ from Gherkin, but the proof-obligation slice stresses the kernel harder on the axes the design cares about: it forces the claim-graph IR to carry _evidence grades and derivation provenance_ (BPMN mostly forces sequencing and gateway structure, which Gherkin partly covers), and it gives you a deterministic non-trivial validator — a Datalog fixpoint — without any external tooling or domain SME. Keep BPMN as third; it's the better _breadth_ target once the IR is stable, and it has an easier user-recruitment story. **Inference**, based on pack-axis distance, not on any BPMN sources reviewed here.

One caveat worth carrying: nothing in this repo has been validated by use. Treat the specs as well-reasoned design documents by an agent-assisted author, not as field-tested contracts — the `assurance-levels` lattice and the `THM_*` status ladder are worth stealing on their merits, not on their track record.

## 6. Unreached sources

- Did not build or run anything (`lake build`, `lake exe zilLeanTests`, `clojure -M:test`) — no Lean toolchain here; **all correctness claims are from specs and source, not execution.**
- Did not read: the 129 Lean files in `Zil/` beyond filenames; `spec/zil-formal-core-v0.1.md` (427 lines, the core semantics); `spec/canonical-relational-ir-v0.1.md`; `spec/evidence-envelope-v1.md`; `spec/query-governance-v1.md`; `spec/recovery-audit-v1.md`; `spec/dmetavm-core-v0.1.md`; `formal/` (TLA+/SMT); the 17 `libsets/` domain packs; the 133 example files beyond three.
- Repo wiki is enabled (`has_wiki: true`) — not checked. 1 open issue — not read. No discussions, no releases checked.
- Author `jagg-ix` (Jorge A. Garcia) — no external profile or publication search performed, so no independent read on provenance beyond commit metadata.
