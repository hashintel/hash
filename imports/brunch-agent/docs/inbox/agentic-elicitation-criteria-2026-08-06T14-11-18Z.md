# 2. Structural criteria

- Source: chatgpt
- URL: https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678
- Exported: 2026-08-06T14:11:18.579Z
- Format: XML-style turn markers with raw markdown bodies

<turn index="002" role="user" url="https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678">

In order to test how well this has been abstracted and generalized, and how well the plugin API has been designed to enable ease-of-implementation of elicitation flows against arbitrary goals/targets, what structural and/or semantic criteria would you apply? What kinds of smells would you look for?

</turn>

<turn index="002" role="assistant" url="https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678">

The strongest test is not whether the framework can technically load many plugins. A framework with a `run(context: any) -> any` hook is infinitely extensible in a trivial sense. The real test is whether different elicitation goals and representation targets can be introduced **without bypassing the semantic guarantees of the system**.

A useful model is an hourglass:

```text
Many elicitation goals and lenses
                │
                ▼
     Claims · Evidence · Issues
       Revisions · State deltas
                │
                ▼
Many schemas and representation targets
```

The waist should be narrow enough to remain stable, but semantically rich enough that the runtime can reason about provenance, uncertainty, conflicts, completeness, and projection loss. Two opposite failures are common:

* The waist becomes a union of every domain concept ever introduced.
* The waist becomes `type: string, payload: any`, leaving the runtime unable to enforce meaningful behavior.

## 1. The main proof obligations

I would judge the abstraction against five proof obligations.

### Independent variability

You should be able to change:

* what is being elicited,
* how completeness is judged,
* how questions are selected,
* how the result is represented,

without unnecessarily changing the others.

A particularly strong test is:

> Can I add a new elicitation goal and project it into an existing target without changing the target plugin, and add a new target for an existing goal without changing the elicitation plugin?

Some target-specific backpressure is legitimate. For example, a destination may require a project identifier. But that requirement should appear as a **target-originated issue**, not become part of the universal definition of the semantic object.

### Semantic conservation

Relevant distinctions in the source should survive until an explicit component decides to discard or normalize them.

For example:

```text
“Friday is ideal, but Monday is acceptable.”
```

should not immediately become:

```json
{ "date": "Friday" }
```

The semantic state should preserve at least:

```text
preferred date: Friday
acceptable fallback: Monday
```

A target that supports only one date can select Friday, but it should recognize that the projection is lossy.

### Explicit transformation

Every material transformation should be attributable:

* user-stated,
* inferred,
* normalized,
* classified,
* aggregated,
* defaulted,
* omitted,
* overridden.

This is more important than preserving the exact original wording. The system should be able to explain why a target field has a value and what evidence supports it.

### Controlled elicitation

Plugins should contribute domain knowledge without independently taking over the conversation.

A plugin may identify:

```text
Deadline is ambiguous because the quarter and year are unknown.
```

The runtime should decide:

* whether this matters,
* whether another source can resolve it,
* whether to ask the user,
* how to phrase the question,
* and whether some higher-priority issue should be addressed first.

Otherwise, composing plugins produces competing agents rather than one coherent elicitation flow.

### Local implementation

A plugin author should need to understand the domain contract and public SDK, not the internal orchestration graph, prompt assembly system, persistence layer, or retry logic.

The implementation should be locally testable. A developer should be able to test:

```text
input semantic state
→ plugin output
```

without running a full conversational agent.

---

# 2. Structural criteria

## Core independence

The runtime should contain no branches such as:

```python
if plugin.name == "requirements_capture":
    ...
elif plugin.name == "sales_qualification":
    ...
```

Nor should its common enums continually grow with domain-specific concepts:

```text
REQUIREMENT
SALES_LEAD
MEDICAL_SYMPTOM
DESIGN_GOAL
...
```

The core should know about generic constructs such as claims, evidence, issues, revisions, actions, and projections. Domain-specific types should be registered or namespaced by plugins.

A useful mechanical test is to inspect the core diff after adding a plugin. Within an existing extension category, the expected core diff should normally be zero.

Zero core changes are not sufficient, however. A plugin that receives the entire runtime object and implements everything itself has merely escaped the abstraction.

## Dependency direction

Plugins should depend on public runtime contracts. The runtime should not depend on plugin implementation classes.

Prefer:

```text
plugin receives immutable state snapshot
plugin returns observations, issues, or state deltas
runtime validates and applies them
```

over:

```text
plugin receives session/database/runtime
plugin mutates arbitrary state directly
```

Declarative returns make validation, tracing, rollback, replay, and access control possible.

## Orthogonal interfaces

The API should not force a plugin to implement unrelated responsibilities.

For example, these are distinct concerns:

```text
ObservationPlugin
SemanticAssessmentPlugin
ProjectionPlugin
ValidationPlugin
QuestionPolicyPlugin
NormalizationPlugin
```

They do not necessarily need to be separate deployment packages, but they should be separate interfaces or capabilities. A plugin manifest can declare which capabilities it provides.

A single required interface such as:

```python
run_conversation(...)
```

is too broad. Conversely, forty lifecycle hooks are likely to produce callback soup. The ideal surface consists of a small number of semantically meaningful operations.

## Typed semantic contracts

Inputs and outputs should have machine-checkable structure.

For example:

```text
observe(turn, state) -> Observation[]

assess(state) -> SemanticIssue[]

project(state) -> ProjectionResult

validate(record, state) -> ProjectionIssue[]

propose_questions(issues, state) -> QuestionCandidate[]
```

Free-form explanatory text can accompany these objects, but should not be the sole integration mechanism.

Particularly important types include:

* issue origin,
* issue severity,
* evidence reference,
* epistemic status,
* revision operation,
* mapping operation,
* loss classification,
* supported capability.

## Stable identity and namespacing

Claims, entities, evidence spans, issues, and plugin-defined concepts need durable identifiers.

The API should define:

* who creates identifiers,
* how plugin namespaces work,
* whether two plugins can refer to the same claim,
* how duplicate observations are reconciled,
* what happens when a plugin is removed,
* how plugin-generated IDs survive replay.

Without this, composition tends to rely on field names and execution order.

## State ownership

The runtime should own canonical conversational and semantic state. Plugins may maintain caches or indexes, but the authoritative meaning should not be hidden inside opaque plugin state.

Opaque private state is dangerous when:

* another plugin needs to consume the information,
* the conversation is replayed,
* a plugin version changes,
* the system needs to explain a decision,
* the plugin crashes or is removed.

Plugin-specific state may be appropriate for implementation details, but not as the only representation of captured user meaning.

## Idempotence and replay

Calling a plugin twice on the same state should not create duplicate semantic facts or produce uncontrolled side effects.

The system should support:

```text
raw event log
→ replay observations
→ rebuild semantic state
→ regenerate projections
```

Purely deterministic replay may not be possible for every model call, but the runtime should at least preserve the original plugin outputs, model versions, prompts or prompt identifiers, and state transitions.

A retry caused by malformed output should not accidentally count as a second user assertion.

## Composition semantics

The API should define what happens when two plugins:

* identify the same concept,
* assign different types to the same evidence,
* make conflicting inferences,
* require incompatible normalizations,
* propose competing questions,
* produce issues with different priorities.

“Run all plugins and concatenate their output” is not a composition model.

The runtime needs explicit merge and conflict behavior. Plugins should be able to express:

```text
supports
refines
contradicts
supersedes
possibly-equivalent-to
```

without being forced to resolve every disagreement themselves.

## Capability negotiation

Plugins should declare constraints such as:

```text
supported input kinds
concepts produced or consumed
incremental-processing support
required tools
external side effects
supported languages
supported core contract versions
lossless versus lossy mapping
required semantic features
```

This permits the runtime to reject invalid compositions before a conversation begins.

For example, a projector that requires stable entity identity should not silently consume a state containing only anonymous text spans.

## Versioning and migration

A plugin API is not mature if its state cannot survive plugin evolution.

You need to distinguish:

* API contract version,
* plugin implementation version,
* plugin concept-schema version,
* target-schema version,
* persisted state version.

A change to the meaning of a field is not merely a serializer change. The system should be able to determine whether existing state can be:

* reused,
* migrated mechanically,
* reinterpreted from retained evidence,
* or must be elicited again.

---

# 3. Semantic criteria

## Evidence fidelity

Every material claim should be linked to the content that supports it.

The link should be precise enough to distinguish:

* the sentence stating a fact,
* the phrase supplying a value,
* surrounding context that changes interpretation,
* the later correction that supersedes it.

A claim with only a conversation-level provenance marker is often insufficient.

Test whether the system can answer:

> What exact user content supports this value?

and:

> Which parts of this record are unsupported by direct user evidence?

## Epistemic distinctions

The representation should not collapse:

```text
explicit user statement
reasonable inference
tentative hypothesis
system default
external lookup
plugin classification
```

A single floating-point `confidence` value does not solve this. Confidence is not the same as provenance or epistemic status.

These statements must remain distinguishable:

```text
“Priya owns this.”
“Priya could own this.”
“I assume Priya owns this.”
“The directory lists Priya as owner.”
```

They may all refer to the same relation, but they do not have the same evidential or modal force.

## Polarity, modality, and preference

Minimal semantic differences should not collapse into the same representation:

```text
Use Friday.
Prefer Friday.
Friday is acceptable.
Friday is required.
Do not use Friday.
No later than Friday.
Friday might work.
```

This is one of the best areas for minimal-pair tests because field-oriented extraction frequently loses these distinctions.

## Absence states

The system should distinguish:

```text
not mentioned
unknown to the user
not yet decided
not applicable
explicitly absent
declined to answer
intentionally deferred
```

Treating all of these as `null` makes both elicitation and downstream behavior unreliable.

For example, “I don’t know the budget” should not be interpreted as “there is no budget.”

## Ambiguity and alternatives

The semantic model should be able to preserve more than one live interpretation.

For example:

```text
“We need it after the review with Alex.”
```

may be ambiguous because:

* there are several Alexes,
* there are several reviews,
* “it” has multiple possible referents,
* “after” may describe scheduling or dependency.

The parser should not be forced to pick one answer solely because the destination schema accepts only one.

## Revision and correction

A correction should modify the active semantic state while preserving history:

```text
“Make that Monday, not Friday.”
```

should not yield two unrelated dates.

The model should represent that:

* Friday was previously asserted or inferred,
* Monday supersedes Friday,
* the correction is supported by a later turn,
* projections using the prior value are now stale.

Test both direct corrections and less explicit revisions:

```text
“Actually, the later option is better.”
```

## Conflict handling

Contradictory content should not be silently merged or resolved based on recency in every case.

Recency may be appropriate for a correction, but not necessarily for two claims from different actors or sources.

The state should distinguish:

```text
revision
disagreement
inconsistent evidence
context-dependent truth
multiple valid values
```

A target may require a single value, but that is a projection constraint rather than evidence that the conflict has disappeared.

## Scope and qualification

Claims need enough scope to avoid false generalization.

Compare:

```text
“No meetings before ten.”
“No meetings before ten next week.”
“No customer meetings before ten.”
“I generally avoid meetings before ten.”
```

A weak representation may normalize all four into the same global scheduling constraint.

Useful scope dimensions include:

* actor,
* entity,
* time interval,
* location,
* scenario,
* source,
* conditional context,
* degree of generality.

## Relationship and cardinality support

The abstraction should not assume that all elicitation is field filling.

It should support:

* one-to-many relations,
* many-to-many relations,
* ordered sequences,
* conditional constraints,
* alternatives,
* dependencies,
* hierarchies,
* claims about claims,
* rationales and evidence.

A new target such as a graph should not require reconstructing relationships that were flattened during capture.

## Semantic completeness versus target completeness

The API should treat these as separate assessments.

A semantic object may be adequately understood while a particular target remains invalid:

```text
Semantic state:
  “The project should begin after legal approval.”

Target requirement:
  exact ISO start date
```

Conversely, a record may be structurally complete because defaults were inserted, while the user’s actual intent remains poorly understood.

Each issue should identify its origin:

```json
{
  "origin": "semantic",
  "kind": "ambiguous_dependency"
}
```

or:

```json
{
  "origin": "projection",
  "target": "calendar_event",
  "kind": "missing_exact_start_time"
}
```

## Loss-aware projection

Every projector should classify unmapped content.

Typical outcomes include:

```text
mapped exactly
normalized without semantic loss
mapped approximately
collapsed with other concepts
omitted because unsupported
omitted by target policy
defaulted
unrepresentable
```

A projection that silently discards a fallback preference, qualification, uncertainty, or conflict is semantically unsafe even when its output passes JSON Schema validation.

## Path independence

Equivalent evidence should normally lead to equivalent semantic state regardless of the order in which it was elicited.

For example:

```text
Path 1:
  user gives deadline, then owner

Path 2:
  user gives owner, then deadline
```

should converge to equivalent active claims.

There will be legitimate path-dependent conversational behavior, but the final semantic state should not depend on arbitrary plugin execution order or the order of schema fields.

---

# 4. Plugin authoring criteria

The API should be evaluated not only by what it can express but by what plugin authors must implement repeatedly.

A well-designed plugin SDK should provide standard machinery for:

* evidence anchoring,
* claim identity,
* issue construction,
* schema validation,
* retries,
* idempotency,
* state-delta application,
* tracing,
* test fixtures,
* model invocation,
* question candidate formatting,
* version declaration.

The plugin author should mainly provide:

```text
domain concept definitions
examples and counterexamples
observation or classification logic
semantic completeness rules
target mappings
domain validators
optional question guidance
```

## Authoring locality

Adding one concept should generally involve changing one concept definition and its tests, rather than editing:

* a global prompt,
* a central enum,
* the orchestration graph,
* the persistence schema,
* several target mappings,
* the conversation controller.

Count the number of files and public concepts a plugin author must understand. This “change surface” is a useful practical metric.

## Defaults without confinement

The SDK should provide sensible defaults for ordinary plugins while allowing specialized behavior through explicit extension points.

Two smells sit at the extremes:

* Every plugin reimplements the entire lifecycle.
* The default lifecycle is impossible to escape without forking the runtime.

## Local simulation

A plugin developer should have a harness that can run fixtures such as:

```yaml
conversation:
  - user: "Friday is ideal, but Monday works."
expected_claims:
  - kind: date_preference
    preferred: Friday
    acceptable:
      - Monday
expected_issues: []
```

The simulator should expose:

* observations,
* claim merges,
* unresolved issues,
* proposed questions,
* projection outputs,
* loss reports,
* trace events.

Debugging should not require reading an entire agent transcript.

## Actionable failures

A contract error should say:

```text
Projection plugin emitted a claim reference that does not exist.
```

rather than:

```text
Invalid plugin output.
```

The runtime should distinguish plugin defects from legitimate semantic uncertainty.

## Escape-hatch accounting

Some domains will require custom processing. Escape hatches are reasonable, but they should be visible.

For example:

```text
custom reconciliation hook used
custom direct model invocation used
opaque state storage used
non-idempotent side effect used
```

The more frequently plugins require these, the less successful the abstraction probably is.

---

# 5. High-value test matrix

Testing one goal against one JSON schema will mostly confirm that the happy path works. A better test matrix crosses three axes.

## Axis A: semantic goals

Use goals with materially different semantic shapes:

1. **Finite fact capture**
   Contact or account details.

2. **Constraint elicitation**
   Requirements, prohibitions, dependencies, and acceptance criteria.

3. **Preference elicitation**
   Rankings, tradeoffs, acceptable alternatives, and hard versus soft constraints.

4. **Temporal reconstruction**
   Events, durations, recurring patterns, and corrections.

5. **Decision rationale**
   Options, arguments, evidence, assumptions, and confidence.

6. **Open-ended design intent**
   Desired effects, references, exclusions, and aesthetic criteria.

## Axis B: representation targets

Use targets with different representational properties:

1. Flat form or JSON object.
2. Nested document schema.
3. Normalized relational records.
4. Property graph.
5. Constraint or rules representation.
6. Human-readable report.
7. Several simultaneous targets with different required fields.

## Axis C: dialogue perturbations

Run each combination against:

* information given in narrative order,
* fields given out of order,
* indirect statements,
* corrections,
* contradictions,
* multiple entities,
* ambiguous pronouns,
* uncertainty,
* refusal to answer,
* “not applicable,”
* off-topic content,
* target change mid-conversation,
* plugin failure and retry.

The most revealing cases are usually not random long conversations but carefully constructed minimal pairs.

Examples:

```text
“The budget is €20,000.”
“The budget might be €20,000.”

“Alex approved it.”
“Alex should approve it.”

“We have no deadline.”
“I don’t know the deadline.”

“Friday is preferred.”
“Friday is required.”
```

The IR and elicitation behavior should differ appropriately in each pair.

---

# 6. Specific swap tests

## Projector substitution test

Capture one conversation once, then project the same semantic state into:

* a flat record,
* a graph,
* a narrative summary.

The projections should agree about the underlying facts. Differences should be traceable to target capabilities or declared mapping policy.

## Elicitation-goal substitution test

Run the same source through two semantic packs, such as:

* project requirement capture,
* risk identification.

The packs should be able to identify different relevant content from the same evidence without corrupting or overwriting one another.

## Mid-session target swap

Begin eliciting for one target, then add or replace a target during the conversation.

The system should:

* retain previously gathered evidence,
* reproject where possible,
* identify only genuinely new gaps,
* avoid asking the user to repeat information.

## Multi-target backpressure test

Attach two targets, one of which requires extra fields.

The extra requirement should be namespaced to that target. It should not make the entire semantic state globally incomplete unless satisfying both targets is explicitly the active goal.

## Loss challenge

Use a rich semantic state and deliberately project it into an impoverished schema.

The projector should report exactly what it cannot represent. A successful JSON serialization is not a passing result.

## Unsupported-concept test

Supply content that a plugin cannot interpret safely.

A good plugin should return something like:

```text
unsupported
unmapped
ambiguous
requires specialist interpretation
```

It should not fabricate a nearest matching concept merely to produce complete output.

## Replay test

Replay a completed conversation with:

* the same plugin versions,
* an upgraded projector,
* an upgraded elicitation plugin.

Verify which stages can be reused and which claims need reinterpretation.

## Composition collision test

Install two plugins that define overlapping concepts or observe the same evidence. Confirm that namespacing, equivalence, and conflict policies work without execution-order dependence.

## Plugin removal test

Remove a plugin after state has been captured.

The runtime should still be able to:

* inspect the evidence,
* preserve claims in a generic serialized form,
* identify which interpretations came from the removed plugin,
* continue operating with unaffected plugins.

## Black-box implementation test

Give the public API documentation and SDK to a developer who has not read the core implementation. Ask them to implement a new goal plugin and target plugin.

Measure:

* time spent understanding the framework,
* number of core concepts they must learn,
* boilerplate written,
* core changes requested,
* undocumented assumptions discovered,
* ability to test locally,
* number of escape hatches needed.

This is one of the best tests of actual ease of implementation.

---

# 7. Structural smells

## The universal callback

```python
plugin.run(context) -> dict
```

The callback has access to everything and may return anything. This provides extension without abstraction.

## The giant context bag

Plugins receive an object containing the model client, database, user session, prompt builder, tool registry, HTTP client, and internal state.

This causes implicit coupling and makes permissions, testing, and replay difficult.

## The monolithic domain plugin

One plugin performs extraction, question selection, conversation management, state mutation, validation, projection, and persistence.

Such a plugin may work, but A and B are no longer independently swappable.

## Core branching by plugin identity

Plugin-specific behavior appears in the runtime, often as conditionals, special registries, or domain-specific exception handling.

## The ever-growing common schema

Every new plugin adds fields to the supposedly universal claim model. This produces a central ontology bottleneck.

## The opaque payload waist

The common API contains little more than:

```json
{
  "plugin": "x",
  "payload": {}
}
```

The runtime cannot reason about evidence, conflicts, completeness, or revisions.

## Callback soup

The plugin API exposes many weakly defined hooks:

```text
before_parse
after_parse
before_map
after_map
before_question
after_question
before_save
...
```

Behavior becomes order-sensitive and difficult to compose.

## Direct mutation

Plugins alter canonical state, mark issues resolved, or write projections directly. The runtime cannot validate the transition or reconstruct why it happened.

## Order-sensitive execution

Changing plugin registration order changes active claims or projected results without an explicit priority or merge rule.

## Copy-paste plugin development

New plugins are created by cloning an existing one and replacing prompts, field names, and validators. This usually indicates that common mechanics have not been captured by the SDK.

## Full-stack testing requirement

A plugin cannot be unit tested without launching the whole agent, model, database, and UI.

## Hidden target leakage

Target-specific terms appear in the semantic layer:

```text
jira_project_key
salesforce_lead_status
database_column_name
```

even though the same underlying meaning should support other targets.

---

# 8. Semantic smells

## Schema-shaped questioning

The conversation follows the order of destination fields:

```text
What is field one?
What is field two?
What is field three?
```

This often indicates that the schema is being treated as the semantic model.

## Syntactic completeness treated as semantic completeness

The system stops because every required field has a value, even though some values were guessed, defaulted, or remain contradictory.

## One confidence score for everything

A scalar `confidence: 0.82` is used instead of distinguishing user uncertainty, model uncertainty, weak evidence, ambiguity, inference, and source disagreement.

## Null collapse

Unknown, absent, declined, not applicable, and not yet decided all become `null`.

## Silent coercion

A vague phrase is converted into a precise value without recording the normalization assumption:

```text
“toward the end of the month”
→ 2026-08-28
```

## Silent loss

The output schema cannot represent alternatives or qualifiers, and the projector simply discards them.

## Correction as duplication

The semantic state contains both the old and corrected values as equally active claims.

## Recency as universal truth

The most recent statement always wins, even when the later statement comes from a different actor, concerns a different scope, or expresses uncertainty rather than correction.

## Inference presented as user fact

A plausible interpretation becomes indistinguishable from something the user explicitly stated.

## Field-level provenance only

The system can say that a field came from “turn 8” but cannot identify which phrase supported which aspect of the interpretation.

## Validation limited to schema syntax

The output is celebrated as valid because it conforms to JSON Schema, despite being semantically contradictory or unsupported.

## Extraction that cannot abstain

Every input span must be classified into one of the plugin’s concepts. There is no unsupported, irrelevant, or ambiguous outcome.

## Questions generated directly from missing fields

The runtime sees a missing key and asks for it without first determining:

* whether the user already implied it,
* whether it can be derived,
* whether it matters,
* whether the user can answer,
* whether another ambiguity should be resolved first.

## Premature normalization

Relative dates, vague quantities, organizational roles, and entity references are resolved before sufficient context exists.

## Projection-specific gaps contaminating global state

Adding a target with extra required fields suddenly causes an otherwise complete semantic object to become globally incomplete.

---

# 9. Useful invariants to encode as tests

A strong runtime can enforce several properties independent of domain plugins:

1. **No unsupported value without provenance.**
   Every projected value must point to a claim, a declared default, or a documented transformation.

2. **No silent conflict resolution.**
   Resolving contradictory active claims must produce an explicit revision or resolution event.

3. **No silent projection loss.**
   Relevant active claims that cannot be represented must appear in a loss report.

4. **Corrections do not erase history.**
   Superseded claims remain inspectable but are not treated as active.

5. **Retries are semantically idempotent.**
   Retrying a failed plugin call cannot create additional user assertions.

6. **Target issues are namespaced.**
   A target-specific requirement does not automatically become a semantic requirement.

7. **Plugin failures are atomic.**
   A failed invocation cannot leave partially applied state.

8. **Equivalent state produces equivalent projection.**
   Projection results should not depend on the order in which claims were discovered.

9. **Unknown remains distinct from false.**

10. **Explicit remains distinct from inferred and defaulted.**

These invariants give the core genuine semantic responsibility without requiring it to understand every domain.

---

# 10. A compact scorecard

A plugin system can be scored from 0–2 on each dimension:

| Dimension            | 0                         | 1                    | 2                                               |
| -------------------- | ------------------------- | -------------------- | ----------------------------------------------- |
| Goal swappability    | Core rewrite              | Adapter work         | Plugin-only change                              |
| Target swappability  | Coupled to extraction     | Partial separation   | Independent projection                          |
| Semantic fidelity    | Field values only         | Some provenance      | Evidence, modality, ambiguity, revision         |
| Loss handling        | Silent                    | Informal warning     | Typed, attributable loss report                 |
| Composition          | Order-dependent           | Manual coordination  | Defined merge and conflict semantics            |
| State model          | Mutable opaque state      | Partial events       | Replayable validated deltas                     |
| Authoring ergonomics | Requires core knowledge   | Usable with examples | SDK, fixtures, diagnostics, local testing       |
| Versioning           | Replace in place          | Manual migration     | Explicit compatibility and migration            |
| Observability        | Transcript only           | Stage logs           | Claim-level provenance and transformation trace |
| Failure isolation    | State corruption possible | Recoverable manually | Atomic, idempotent, replayable                  |

The overall result should not be averaged blindly. Some dimensions are gating requirements. In particular, semantic fidelity, explicit loss handling, and state integrity should be treated as non-negotiable for high-stakes use.

The central smell to watch for is **accidental coupling hidden by configurability**. A framework may appear general because schemas and prompts are configurable, while its actual semantics remain field-oriented and target-dependent. The better abstraction demonstrates that meaning can be captured once, revised coherently, interrogated by the runtime, and projected into materially different structures without either turning the core into a universal ontology or reducing the plugin boundary to an untyped escape hatch.

</turn>
