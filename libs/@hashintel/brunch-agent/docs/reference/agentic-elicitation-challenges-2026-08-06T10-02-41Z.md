# Agentic Elicitation Challenges

- Source: chatgpt
- URL: https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678
- Exported: 2026-08-06T10:02:41.982Z
- Format: XML-style turn markers with raw markdown bodies

<turn index="001" role="user" url="https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678">

Some thoughts on agentic elicitation and capture of unstructured content from a user, in to some kind of structured representation:

- common thread: **parsing and mapping** of content
- parsing: seeing and identifying — possibly through different lenses?
- mapping: projecting and matching — against a schema, or rubric, criteria?
- requires:
  - knowing what to look for / how to look
  - knowing what you are trying to fulfill / satisfy

Help me reflect on how to approach this implementation challenge effectively. The levers I have are those such as provided by any contemporary agent harness. The actual target, in terms of (A) what kind of thing(s) are we eliciting, and (B) in what structure(s) to we intend to record them, needs to be swappable

</turn>

<turn index="001" role="assistant" url="https://chatgpt.com/c/6a7430db-490c-83eb-8491-ea376fd3f678">

Your parsing/mapping distinction is useful, but it becomes substantially more tractable if neither step writes directly into the final target structure.

The core abstraction should be:

> **Unstructured content → evidence-linked interpretations → target-specific projections**

That middle layer lets you vary both:

- **A: the semantic target** — requirements, preferences, risks, events, decisions, entities, arguments, and so on.
- **B: the representation target** — a form, JSON schema, graph, CRM record, issue tracker object, document section, or several of these simultaneously.

## 1. Treat the system as an interactive compiler

A useful analogy is a compiler with interactive error recovery:

```text
User conversation
      │
      ▼
Segmentation and observation
      │
      ▼
Semantic intermediate representation
      │
      ├──────────────► Target-schema projector
      │                         │
      │                         ▼
      │                  Structured record
      │
      ▼
Gap and conflict analysis
      │
      ▼
Clarification question
      │
      └──────────────► back into the semantic state
```

In this analogy:

- **Parsing** detects potentially meaningful content and anchors it to evidence.
- **Semantic analysis** decides what that content means, including modality, scope, and relationships.
- **Mapping** projects that meaning into a particular destination structure.
- **Validation** acts like type checking.
- **Elicitation** is error recovery: asking the user for information needed to resolve an ambiguity, contradiction, or missing requirement.

This avoids the brittle pattern:

```text
conversation → one large prompt → final JSON
```

That pattern couples recognition, interpretation, completeness, and serialization into a single operation.

## 2. Separate four contracts

A schema alone is not enough to tell the agent what to do. I would represent the task through four independently versioned contracts.

### Concept contract: what counts as the thing

This defines the semantic target:

- What kinds of objects or propositions are relevant?
- What distinguishes an instance from a near miss?
- What attributes and relations matter?
- What are examples and counterexamples?
- What kinds of inference are permitted?

For a “risk,” for example, the concept contract might distinguish:

- a present problem,
- a possible future adverse event,
- a constraint,
- a dependency,
- and a vague expression of concern.

These may all resemble one another linguistically but have different semantics.

### Observation contract: how to notice it

This defines the lenses through which content is examined:

- actor/action/object,
- temporal information,
- obligations and permissions,
- preference versus hard constraint,
- causality,
- risk and uncertainty,
- corrections and negations,
- entity identity and coreference.

A lens should generate **candidate observations**, not directly populate fields. Multiple lenses may notice different aspects of the same passage.

For example:

> “Friday would be ideal, but Monday is okay. Don’t schedule anything before ten.”

Different lenses might produce:

- a preferred date,
- an acceptable fallback date,
- a hard time constraint,
- a distinction between preference and obligation.

A direct mapping into a single `date` field would discard important meaning.

### Completion contract: what “enough” means

This is separate from both recognition and storage.

It determines:

- which concepts are required,
- acceptable cardinality,
- acceptable uncertainty,
- which conflicts must be resolved,
- which missing values may be defaulted,
- when the agent should stop asking questions.

There are actually two kinds of completeness:

1. **Semantic completeness**: enough information to understand the thing correctly.
2. **Representation completeness**: enough information to satisfy a particular downstream schema.

Those should remain distinguishable. A CRM may require a category code that the user never expressed. That is a property of the sink, not necessarily a property of the user’s underlying intent.

### Projection contract: how meaning is represented

This defines:

- output schema,
- field semantics,
- mapping functions,
- normalization rules,
- required fields,
- merge behavior,
- target-specific validators,
- treatment of unsupported or lossy content.

A projection operation should preferably declare what kind of operation it performs:

- literal copy,
- normalization,
- classification,
- aggregation,
- decomposition,
- inference,
- composition,
- defaulting.

Inference and defaulting should be explicitly distinguishable from user-stated information.

## 3. Use an evidence-preserving intermediate representation

The key to swappability is a semantic intermediate representation, or IR.

It should be richer than any one destination schema but much smaller than a universal ontology. A good pattern is a **thin common core with domain-specific payloads**.

For example:

```json
{
  "id": "claim-17",
  "kind": "constraint",
  "payload": {
    "relation": "start_time_not_before",
    "value": "10:00",
    "scope": "scheduling"
  },
  "epistemic_status": "explicit",
  "modality": "must",
  "evidence": [
    {
      "turn_id": "turn-8",
      "text": "Don't schedule anything before ten."
    }
  ],
  "confidence": "high",
  "alternatives": [],
  "status": "active"
}
```

The important parts are not the exact field names. They are the distinctions the model preserves:

- what was said,
- where it was said,
- what interpretation was assigned,
- whether it was explicit or inferred,
- how certain the interpretation is,
- whether alternatives remain,
- whether later content corrected or contradicted it.

For more relational targets, represent the IR as a claim graph:

```text
Actor ──owns──► Work item
Work item ──blocked_by──► Legal approval
Work item ──has_deadline──► Ambiguous quarter end
Legal approval ──concerns──► Data-retention policy
```

The IR should be an interface between stages, not an attempt to create one ontology for every possible application.

## 4. Make parsing hypothesis-generating rather than decisive

“Parsing” is doing several different jobs:

1. **Segmentation**
   Identify spans, clauses, discourse boundaries, quotations, lists, and references.

2. **Candidate detection**
   Notice that a span might express a relevant concept.

3. **Interpretation**
   Assign semantic type, scope, modality, polarity, temporality, and participants.

4. **Evidence anchoring**
   Preserve the exact source that supports the interpretation.

The output should initially be hypotheses such as:

```text
Possible deadline:
  value: quarter-end
  ambiguity: quarter and year unspecified
  evidence: "before quarter-end"

Possible owner:
  value: Priya
  modality: proposed rather than confirmed
  evidence: "Priya can own it"
```

A reconciliation stage can then merge overlapping observations, resolve coreference, recognize corrections, and maintain competing interpretations where necessary.

This matters because repeated model calls do not necessarily resolve semantic ambiguity. A formatting failure should trigger a retry. A genuine ambiguity should become an explicit issue or user question.

## 5. Let projection create backpressure without controlling semantics

A swappable output target may discover that it cannot produce a valid record from the current semantic state.

For example, a projector might report:

```json
{
  "issue": "missing_required_value",
  "origin": "projection",
  "target": "jira_issue",
  "required_concept": "project_key",
  "can_default": false,
  "needs_user_input": true
}
```

The projector should not directly ask the user. It should return a typed issue to the elicitation controller.

That controller can then decide whether to:

- ask the user,
- derive the value from context,
- call a lookup tool,
- use a declared default,
- leave it unresolved,
- or reject the projection.

This gives the representation layer controlled influence over elicitation without tightly coupling the two.

A useful issue vocabulary is:

```text
missing
ambiguous
conflicting
invalid
unsupported
unmapped
low-confidence
```

Each issue should record whether it originated in the semantic target or a particular representation target.

## 6. Put the “agentic” behavior in selection and control

Most extraction and mapping steps can be structured pipeline operations. The agentic part is primarily deciding:

- which lenses are relevant,
- which observations deserve deeper analysis,
- which ambiguity is worth resolving,
- which tool to invoke,
- what to ask next,
- and when to stop.

The next-question policy can be thought of as maximizing expected information value:

```text
priority =
    requiredness
  × downstream impact
  × current uncertainty
  × likelihood the user can answer
  ÷ interaction cost
```

This prevents the system from mechanically asking for every empty field.

Good clarification behavior generally means:

- ask about ambiguities that materially affect the result;
- prefer one high-value question over several low-value questions;
- ask in the user’s language, not in schema terminology;
- make the current interpretation visible when correction is useful;
- distinguish “not mentioned” from “no,” “unknown,” and “not applicable”;
- stop when additional precision has low downstream value.

A question such as:

> “You mentioned quarter-end. Which quarter and year should I record?”

is better than:

> “Please provide `deadline_date`.”

## 7. Package the variable parts

A practical modularization might look like this:

```text
ElicitationPack
  concept definitions
  examples and counterexamples
  eligible lenses
  permitted inference rules
  semantic completeness rules
  clarification hints

ProjectionPack
  target schema
  mapping functions
  normalizers
  target validators
  merge and default policies

DialoguePolicy
  issue prioritization
  question budget
  confirmation thresholds
  stop conditions

RuntimeState
  raw turns
  observations
  claim graph
  unresolved issues
  active projections
  revision history
```

The stable interfaces could be:

```text
observe(content, elicitation_pack) -> Observation[]

reconcile(
    prior_claims,
    observations
) -> ClaimGraph

project(
    claim_graph,
    projection_pack
) -> DraftRecord + ProjectionIssues

validate(
    claim_graph,
    draft_record,
    elicitation_pack,
    projection_pack
) -> Issue[]

choose_next_action(
    issues,
    dialogue_policy
) -> Question | ToolCall | Complete
```

With this arrangement:

- Changing **A** swaps the elicitation pack and potentially reruns observation over the retained source.
- Changing **B** swaps the projection pack and reprojects the existing claim graph.
- Multiple **B** targets can operate simultaneously.
- A new target structure does not require rewriting all extraction behavior.
- A new semantic target does not require redesigning the orchestration runtime.

## 8. Use the agent harness as a typed state machine

The useful harness capabilities map naturally to this design.

| Harness capability      | Appropriate use                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| Structured model output | Observation, claim, issue, and question contracts                      |
| State graph             | Explicit observe → reconcile → project → validate → ask transitions    |
| Tool calling            | Lookups, normalization, deterministic validation, identity resolution  |
| Model routing           | Cheap model for detection; stronger model for difficult reconciliation |
| Parallel execution      | Independent lenses over the same content                               |
| Checkpointing           | Durable claim state and resumable conversations                        |
| Human-in-the-loop       | Clarification, confirmation, and correction                            |
| Tracing                 | Evidence, transformations, model decisions, and validator output       |
| Retries                 | Malformed output and transient failures, not genuine uncertainty       |
| Evals                   | Regression testing at each pipeline boundary                           |

A graph of narrowly typed stages is usually easier to reason about than a set of autonomous agents exchanging prose. Multiple agents are most justified when they need genuinely independent perspectives, different permissions, separate context, or adversarial review.

## 9. Preserve distinctions that are commonly lost

Several distinctions should be first-class because they strongly affect mapping:

- explicit statement versus inference,
- preference versus requirement,
- current fact versus future intention,
- entity versus role,
- proposed assignment versus confirmed assignment,
- absence of evidence versus negative evidence,
- correction versus contradiction,
- recurring condition versus one-time event,
- exact value versus approximate value,
- source content versus system-generated default.

The system should also retain information that is relevant but currently unmapped. Otherwise, changing the destination schema later will require re-eliciting it.

A projection can be intentionally lossy, but it should produce a warning such as:

```text
The target schema supports one date only.
The semantic state contains:
- preferred date: Friday
- acceptable fallback: Monday
Projection policy selected Friday and omitted the fallback.
```

## 10. Evaluate the stages separately

End-to-end accuracy alone will not tell you where the system is failing.

Useful evaluation categories include:

### Observation quality

- concept-level recall,
- false-positive rate,
- evidence-span accuracy,
- handling of negation and correction,
- modality classification.

### Reconciliation quality

- duplicate merging,
- entity resolution,
- conflict preservation,
- temporal ordering,
- revision handling.

### Projection quality

- schema validity,
- semantic correctness,
- unsupported-content detection,
- correct default and inference labeling,
- consistency across multiple projections.

### Elicitation quality

- required information obtained,
- number of questions,
- information gained per question,
- unnecessary-question rate,
- user correction rate,
- premature stopping rate.

A particularly valuable test is **reprojection consistency**: capture once into the IR, project into two different target schemas, and verify that both preserve the same underlying semantics.

## 11. Avoid several common implementation traps

The main traps are:

1. **Using the output schema as the semantic specification**
   Field names rarely define what counts as valid evidence.

2. **Premature normalization**
   Converting “the end of next quarter” into a date before resolving context can silently invent information.

3. **Silent inference**
   A plausible value should not become indistinguishable from a user assertion.

4. **Over-generalizing the IR**
   A universal ontology often becomes less useful than a small claim/evidence core with domain extensions.

5. **Treating all missing fields equally**
   Some are essential to meaning; others are merely required by a sink.

6. **Using another model call as the only validator**
   Structural constraints, date validity, enum membership, and many consistency checks should be deterministic.

7. **Discarding source evidence after capture**
   Without provenance, correction, audit, and future reprojection become difficult.

## 12. A sensible initial implementation

A good first system would be deliberately small:

- one claim/evidence IR;
- four or five issue types;
- three lenses, such as entity/action, temporal, and modality/constraint;
- one reconciliation stage;
- two materially different elicitation packs;
- two materially different projection packs;
- one question-selection policy;
- deterministic schema and consistency validation;
- complete tracing of every transformation.

Using two targets on each axis from the beginning is important. It forces the abstractions to demonstrate actual swappability rather than merely appearing configurable.

The governing design principle is:

> **Capture meaning and evidence before committing to representation. Let semantic requirements and destination requirements both generate issues, but keep their origins explicit.**

That makes parsing a process of forming grounded hypotheses, mapping a controlled projection, and elicitation an information-seeking policy over unresolved semantic and representational obligations.

</turn>
