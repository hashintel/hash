# Contract decomposition: kernel / host / plugin / pack boundary

Type: grilling
Status: resolved
Resolved: 2026-08-06
Blocked by: 01, 03 (both resolved)

## Question

What exactly does the kernel own (mechanism + orchestration), what does the host supply (input shapes and pathways, deploy target), and what do plugins define (target policy) — and does the four-contract + pack decomposition (ElicitationPack: concept/observation/completion; ProjectionPack: projection) survive contact with the Flue facts and the brunch audit?

Sub-questions this grilling must close:

- Are the A-axis (semantic target) and B-axis (representation target) genuinely separately swappable in our first milestone, or bundled per plugin?
- Where does the evidence-preserving IR / claim graph live, and how thin is its common core?
- Persistence: does the plugin-owned-persistence hypothesis hold, or does the host (deploy target) own it with plugins declaring shape? What state must the kernel externalize (session, transcript refs, artifact-in-progress, episteme ledger)?
- Where is control inverted: typed issues as backpressure (projector → elicitation controller) — is that the only inversion, or do observation lenses invert too?
- The policy-vs-mechanism rule: enumerate what would otherwise become the central `switch` and check each is on the plugin side.

Primary input: docs/reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md

Named input from the portfolio decision (issue 07): **behavioral over procedural** — agents do better with behavioral guidance than procedural scripts, and with clear shapes/patterns to fill rather than schemas that require extensive parsing to build a model of the output shape. Brunch's unsolved problem — specifying how an elicitation process should work plus skill material to guide an agent through it, without over-proceduralizing — is a core stress test for the pack contract. The decomposition must say what a pack _feels like_ to the agent consuming it, not only what it validates.

Concrete test cases for every boundary claim (from issue 07): how would `elicit-gherkin` do this vs. `elicit-proof-obligations`? The spec mandates both packs are authored before the pack interface freezes.

## Answer

> Resolved by HITL grilling, 2026-08-06 (four rounds, including an evidence pass over `~/Clones/mattpocock/skills` + `../brunch/docs/design/BEHAVIORAL_KERNELS.md`, and integration of [agentic-elicitation-criteria](../../../../reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md), the second inbox doc).

### Ownership table

|                                          | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kernel** _(mechanism + orchestration)_ | The conversation loop, agent-forward (agent judgment at the helm) · the questioning-UX contract (issue 05's subject) · the **capture envelope** (below) around opaque plugin payloads · the **typed issue queue** (vocabulary, storage, factual attributes; the only stored agenda-like state; also where conflict/equivalence live) · the private scratchpad · the **turn-suspension protocol** (Flue has no ask-primitive; the kernel owns one) · operation _signatures_ (`observe/reconcile/project/validate`) with snapshot-in/deltas-out calling convention, validation, and application of returned deltas · completion evaluation (running plugin-declared criteria) · pack loading, progressive disclosure, kernel-card activation · capture-id minting · the **storage port** definition |
| **Host** _(embedding + affordances)_     | Input surfaces and pathways (TUI / web / chat channel / Petrinaut later) · verified respondent identity · deploy target · **storage port implementation** · artifact delivery (repo write, API, post) · model/provider via the Pi family                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Plugin** _(target policy)_             | Its **own IR payload structure** — graph, flat list, whatever fits; shared between its packs, never universal; namespaced concepts · **ElicitationPack**: kernel cards (Detects / Goal / contrastive Questions / Artifacts), completion contract, clarification hints · **ProjectionPack(s)**: `project` + `validate` (required), `reconcile` (optional), output contract, annotated shapes, **typed loss reports**, lossiness policy · artifact persistence _shape_ · domain vocabulary                                                                                                                                                                                                                                                                                                          |

### The capture envelope (the hourglass waist)

Kernel-defined, domain-free — semantically rich, structurally minimal:

- `id` (kernel-minted), evidence spans (utterance provenance, phrase-level where possible)
- **Epistemic status** enum, distinct from confidence: `explicit | inferred | tentative | defaulted | external-lookup`
- Confidence (qualitative), status: `active | superseded | retracted`, one `supersedes` link
- **Absence states** as first-class capture values: `not-mentioned | unknown-to-user | not-yet-decided | not-applicable | explicitly-absent | declined | deferred`
- **Alternatives** grouping: >1 live interpretation of the same evidence may coexist until resolved
- Opaque, plugin-typed payload. **No kernel edges, no graph, no kind taxonomy** — structure is payload business. Conflict (`conflicting`) and equivalence (`possibly-equivalent`) are **typed issues referencing capture ids**, not edges; resolution must be an explicit event (supersession or recorded decision) — "no silent conflict resolution."

### Operations

- **Required**: `project` (captures → draft artifact **+ typed loss report**: `mapped-exactly / normalized / approximate / collapsed / omitted / defaulted / unrepresentable`) and `validate` (→ typed issues).
- **Optional**: `reconcile` (dedup/merge over the plugin's own structure); kernel calls it when present.
- **Agent-native**: `observe` — noticing is the agent's work guided by pack kernel cards; code-level extractors are an optimization, never the required path.
- **Calling convention**: plugin ops receive an **immutable state snapshot**, return observations/issues/deltas; the kernel validates and applies. Buys atomic plugin failure, semantically idempotent retries (a retry never counts as a second user assertion), and tracing.
- **Backpressure**: validators and projectors never address the user; they return typed issues the agent consumes.

### Dialogue policy

Behavioral guidance + factual issue queue. **Facts computed, weights judged**: the kernel computes issue facts (blocks-required-criterion, origin semantic|representational, can*default); the agent weighs them qualitatively. The inbox doc's priority formula is adopted as \_prose the agent thinks with*, never as a computed score — computed-priority dimensions are judgments wearing metric costumes, and a stored ranking becomes an authority the agent defers to instead of reading the conversation (brunch's no-stored-agenda lesson).

### Cross-cutting decisions

1. **No universal IR** — the kernel's slice is the envelope; structure is plugin-unique. Typed-entity-graph maximalism explicitly not adopted; a graph remains any plugin's private choice (including a future brunch-target plugin).
2. **Smallest-honest-plugin test** — a flat record list + one validator must suffice; every kernel-contract addition is checked against the bar it raises. Empirical form: the black-box authoring test.
3. **Axes separated in contract, bundled in shipping** — one ElicitationPack + N ProjectionPacks per plugin sharing the plugin's IR; swappability proven by reprojection.
4. **Principle v2 (ratified, replaces "behavioral over procedural")**: _procedure for mechanism, anchors for judgment, shapes for output_. Evidence: the mattpocock skills are full of procedure that works because it is short, carried by leading words (pretrained concepts recruited deliberately), ends on checkable completion criteria, and rides on shapes/templates with progressive disclosure. Failure modes to design against: sprawl, negation-steering, no-ops, judgment-encoded-as-procedure — not procedure itself. `writing-for-agents` is the cited pack-authoring standard.
5. **Kernel cards** (from BEHAVIORAL_KERNELS.md) are the unit of ElicitationPack content: Detects (signal-phrase activation) / Goal / contrastive Question patterns / Artifacts (typed claims emitted) / validator hooks. The fifteen-kernel ontology itself stays brunch prior art; packs declare their own kernels. Contrastive classification over open-ended essays.
6. **Pack physical form**: kernel cards + annotated shapes + deterministic validators + small wire schemas (boundary-teaching: shallow for model legibility, deep requiredness in validators) + completion contract as checkable bounds.

### Acceptance material adopted into the spec (from the criteria doc)

- The **five proof obligations** as contract acceptance criteria: independent variability, semantic conservation, explicit transformation, controlled elicitation, local implementation.
- The **ten kernel invariants** (§9) as kernel-enforced test properties (no unsupported value without provenance; no silent conflict resolution; no silent projection loss; corrections don't erase history; retries idempotent; target issues namespaced; plugin failures atomic; equivalent state → equivalent projection; unknown ≠ false; explicit ≠ inferred/defaulted).
- Gating tests: **reprojection/projector substitution**, **minimal pairs** ("the budget is / might be €20,000"), **black-box authoring test** (count concepts, boilerplate, escape hatches).
- Named smells as review vocabulary: opaque payload waist, giant context bag, schema-shaped questioning, null collapse, silent coercion/loss, correction-as-duplication, hidden target leakage.

### Deferred to fog (post-milestone)

Simultaneous multi-plugin composition · plugin removal · full replay · capability negotiation · version/migration machinery (the spec names the five version axes — API contract / plugin impl / concept-schema / target-schema / persisted state — implements nothing).

### Routed onward

- §4 SDK-machinery list (evidence anchoring, issue construction, fixtures, **local simulation harness** — "debugging should not require reading an entire agent transcript") → issue 06 (Shipping shape).
- Envelope + absence states + turn-suspension → issue 05 (Questioning-UX contract).

## Comments

**2026-08-07 (vocabulary clarification from issue 05's resolution).** The ownership table's "Host (embedding + affordances)" bundled two concerns that later split: the **ui** shell (interface: rendering, input, reply transport, identity) and the **substrate** (the embedding environment: deploy target, storage-port implementation, artifact delivery, model/provider). Under the hardened lexicon (`CONTEXT.md`), this table's "Host" row reads as substrate concerns plus ui concerns; "kernel" reads as **harness**. No substantive change to the decomposition.
