# Independent review of provenance-by-lineage replanning — 2026-09-04

> Review evidence, not execution authority. This document evaluates [`provenance-and-tooling-decision-log-2026-09-04.md`](provenance-and-tooling-decision-log-2026-09-04.md) and [`provenance-by-lineage-mini-spec-2026-09-04.md`](provenance-by-lineage-mini-spec-2026-09-04.md) against the checked-out Brunch and Petrinaut code, the installed Flue 2.0.3 documentation and types, the current future mission record, and three independent adversarial reviews. It identifies factual corrections, semantic gaps, and strategic blind spots. It changes no owner-settled policy and authorizes no implementation.

## Executive verdict

The replanning is directionally strong. Making the workpiece visible, making revisions first-class tool calls, refusing to turn the capture store into semantic IR, repairing the provider schema carrier before trusting construction, and deriving audit information from the canonical conversation record are all sound moves.

The central claim is nevertheless overstated. The proposed mechanism establishes **temporal audit lineage**, not yet **motivational or causal provenance**. It can show which workpiece revision was current when an assistant requested a mutation and which conversation context preceded that revision. It cannot deterministically establish that a particular workpiece passage motivated a particular element. Passage selection, element-effect attribution, actor identity, and durable exact evidence each require information or contracts that the described lineage does not contain.

The defensible near-term claim is:

> Show the logged assistant mutation request, its later browser outcome, the workpiece revision temporally current for that request, and the intervening authorized conversation context, with explicit warnings where motivation, causal derivation, actor attribution, or exact historical evidence is not established.

Anything stronger requires reopening C1–C3, C5, C6, C8, C10, C13, and C15 before Mission 7 authority is cut. The proposed Mission 7 also absorbs the central automatic-construction advance currently assigned to Mission 9 and is too large to remain a bounded explainability mission without an explicit recut.

## Critical semantic gaps

### 1. “Latest workpiece before mutation” is correlation, not causation

The decisive unsupported traversal is:

```text
element id
  → mutation call
  → latest update_workpiece at or before that call
  → the passage in that revision
```

The conversation log contains no deterministic relation from a mutation to the passage that motivated it. A workpiece can contain many claims; one call can realize several claims; several mutations can be made while the same multi-topic workpiece is current; and a mutation can arise from formalism constraints, model inference, an external source, or a mistake. A post-construction workpiece update may contain the actual rationale but is excluded by the backward-selection rule.

The proposed `locate_elements` returns mutation calls and the workpiece revision current at each. The proposed `query_workpiece` begins from a passage locator. No mechanism produces that locator from the mutation. Therefore the mini spec's statement that “every hop is a lookup in the canonical log; nothing is stored elsewhere and nothing is inferred” is false as written: selecting the relevant passage necessarily requires semantic inference or an explicit relation.

This is not repaired merely by sharing a `turnId`. Shared temporal correlation still does not establish motivation, and the current client-tool result does not in fact share the mutation request's turn, as described below.

**Required decision:** choose explicitly between:

1. **Temporal-lineage claim:** report the workpiece revision current for the mutation and a broader conversation range, without saying that one passage motivated the element; or
2. **Small creation-time association:** carry a revision identifier and one or more passage locators with the mutation request or with a thin construction-operation envelope.

A small creation-time relation is not the comprehensive typed IR previously rejected, and it differs materially from a retrospective hand-authored derivation fixture. If neither is acceptable, the system must return a broader range or refuse rather than invent a point passage.

### 2. Passage identity and blame are prerequisites, not downstream fog

The intent promises one workpiece passage, the revision that introduced it, and blame across revisions while passage identity remains undecided. Heading paths fail under rename or movement; exact text fails under edits; ordinary line blame fails under reformatting; anchors remain stable only if their lifecycle is defined; and a companion manifest can drift from the Markdown.

The proposed C15 probe changes one non-semantic line. That is too weak to establish the promised semantics. It does not test:

- heading rename or movement;
- passage split or merge;
- paraphrase that preserves meaning;
- deletion and reintroduction;
- a passage accumulating evidence from several non-adjacent periods;
- duplicate quotations or repeated headings; or
- correction, qualification, contextual coexistence, and conflict.

For split, merge, paraphrase, and reintroduction there may be no unique mechanically discoverable “introducing revision” without explicit successor/predecessor semantics.

**Required decision:** either define durable passage identifiers and their edit lifecycle before promising blame, or narrow the first claim to revision-local text and refuse cross-revision “introduced by” answers. The passage-identity probe should cover rename, move, paraphrase, split, merge, deletion, and reintroduction, not only a non-semantic line edit.

### 3. User-turn ranges are not attribution and do not establish “who prepared it”

The range between two workpiece revisions can contain unrelated statements and can omit older evidence reused in the new revision. A verbatim match proves string occurrence, not endorsement, origin, authority, or causation. A user may quote another person, reject the quoted proposition, or repeat wording supplied by the assistant. Non-verbatim synthesis, declared defaults, formalism constraints, assumptions, external sources, and construction-opened losses require distinct treatment.

The proposed answer also collapses several different actors:

- the assistant that authored the workpiece revision;
- the expert whose evidence supports a claim;
- the person who requested construction;
- the browser principal that applied the mutation;
- a later reviewer; and
- the owner or authority that permits canonical change.

A Flue `role: "user"` is not sufficient actor identity. The release note's promise to show “who prepared it” is therefore unsupported by the described records.

**Required contract:** represent and report workpiece author, source/evidence actor, mutation actor, requesting principal, and authorization context separately. Conversation ranges may be supporting context; they are not, by themselves, authorship or authority.

### 4. Element IDs in tool inputs do not establish actual mutation effects

Seeing an element ID in a mutation input does not prove that the call created or changed that element. Calls can fail, no-op, apply against stale state, affect several entities, create derived entities, delete an entity, replace or recreate an ID, or be successfully applied while their result delivery is lost. Commands such as layout can affect many elements without identifying them individually in the input.

The current `clientToolHistoryFrom` projection treats results as opaque correlated outputs. It does not establish canonical effect semantics or reconcile conflicting and repeated results.

**Minimum settled mutation evidence:**

- mutation call or operation identity;
- target document identity or incarnation;
- expected base document hash;
- applied, no-op, failed, stale, or unknown outcome;
- confirmed post-document hash;
- exact created, updated, deleted, and derived element IDs, or retained canonical pre/post definitions from which those effects are mechanically derived; and
- one authoritative result per call with duplicate-result rules.

Without this, the honest statement is “the assistant attempted this mutation,” not “this call created this element.” Deleted and recreated elements also need explicit lifecycle semantics; “creating call and last-changing call” is not sufficient when identity can be retired and reused.

### 5. The browser mutation and workpiece update do not share one atomic boundary

`update_workpiece` would be a server-side Flue tool. Its `usePersistentState` setter can commit atomically with that server tool's unit of work. Petrinaut mutation executes later in the browser and its result returns as a separate `client-tool-result` system dispatch. The workpiece update and the browser mutation therefore do not share durability or a transaction.

A workpiece update can settle while a browser mutation fails, times out, applies against stale state, or is manually superseded. A browser mutation can apply while its result is lost. Two tabs or two conversations can target the same document. A later result can arrive after another mutation or hand edit.

Atomicity across these boundaries is not necessarily required, but observable incomplete states and deterministic reconciliation are. The design should model an operation protocol rather than imply a shared batch:

```text
mutation requested(callId, documentId, baseDocumentHash, workpieceRevision, intended scope)
  → browser outcome(applied | no-op | failed | stale, postDocumentHash, effects)
  → reconciled | incomplete | unknown
```

This protocol must define retry identity, duplicate delivery, stale-base refusal, lost-result behavior, and what provenance is safe to report for an incomplete or unknown operation.

### 6. A post-document hash is not an adequate join

A whole-document SHA-256 is a content fingerprint, not a mutation lineage record. It does not identify the pre-state, the transition, the actor, or the affected elements. Identical hashes can recur after revert and reapply. A hand edit followed by a logged mutation can yield a post-hash that appears “explained” by the tool result even though the resulting document includes an outside-conversation change. Serialization changes or a missing client-tool result can produce the opposite false classification.

Consequently, “a document hash that no tool result explains is changed outside the conversation” is too strong. The safe classification is “not attributable from the recorded transitions.” Reliable attribution needs at least document identity, expected base hash, serialized operation order, result hash, operation ID, and confirmed effects.

After an unexplained transition, the system should refuse provenance for the affected state—or for the entire document when no trustworthy diff can isolate the effects—and begin a new explicitly imported external revision if lineage is to continue.

## Critical durability and access gaps

### 7. Flue's supported history projection does not preserve exact lineage across compaction

The design conflates Flue's append-only canonical storage with the public `history()` projection. Flue's underlying `ConversationStreamStore` is an ordered append-only canonical record, but its record types are not the supported application read surface. Brunch reads `createFlueClient(...).history()`, which returns a materialized conversation snapshot.

Flue 2.0.3 explicitly compacts older messages into a summary while retaining only recent history verbatim. After compaction, the supported materialized history may no longer contain:

- exact old user lines;
- old `update_workpiece` inputs;
- old mutation tool parts and results;
- the full workpiece revision series; or
- the exact text needed for quote verification.

Brunch's current Flue history reader consumes only `snapshot.messages`; it has no supported access to the private pre-compaction records. This breaks the exact-line answer, workpiece revision pane, passage blame, and mutation lookup at once.

C8 therefore understates the re-entry condition for independent retention. Compaction is already a known behavior, not merely hypothetical future strain.

**Required decision:** either scope Mission 7 explicitly to uncompacted local conversations and visibly refuse once required evidence has compacted, or retain an immutable, authorized, compaction-independent lineage projection before compaction. That projection need not resurrect the current one-envelope-per-user-utterance capture design, but some stable retained evidence is required for the longer Mission 9 and Mission 10 story.

Retention, export, audit, revocation, and migration are additional reasons a canonical operational conversation store may not be sufficient as the product's evidentiary archive.

### 8. `query_workpiece` and `locate_elements` have no specified executable history-access boundary

The ownership split is conceptually plausible but omits the runtime boundary. Inside a Flue agent there is no history hook. The supported read path is `createFlueClient(...).history()`, which requires a host-resolved conversation URL and transport. The current Brunch architecture deliberately places this absorption in the binding and app layer.

Therefore “core knows revisions and history” is not currently true as an executable capability. A core server tool cannot silently self-HTTP without host composition, and a plugin-owned server tool cannot inspect Flue history without acquiring a substrate dependency or an injected history service.

**Recommended boundary:**

- core owns pure formalism-independent workpiece revision and query semantics;
- plugin-sdcpn owns interpretation of Petrinaut mutation names, inputs, outputs, and element effects;
- the binding/app owns authorized acquisition of the Flue materialized history or retained lineage projection; and
- the app composes the model-facing query tool from those capabilities.

Whether there is one composed why tool or two model-facing tools should follow the minimum useful product interaction; package ownership does not require exposing package seams to the model.

### 9. The proposed persistent-state pointer does not give the model the current workpiece

The proposed state contains only `{ callId, sha256, revision }`. It contains no Markdown, and `usePersistentState` values are server-side; they are not automatically shown to the model. The statement that “the next render reads the current pointer without the model echoing it” does not explain how the model obtains the current workpiece content.

Reading the content back from `history()` reintroduces the unavailable-history and compaction problems. A pointer alone also cannot validate or recover the current document after old tool parts disappear from the materialized projection.

**Required mechanism:** persist the current Markdown with the pointer, or provide a retrieval capability backed by a compaction-independent store. The design must also distinguish generic core validation from plugin-specific validation. Core can check non-empty Markdown and generic size/integrity constraints, but it cannot validate conformance to the SDCPN workpiece template without plugin participation.

### 10. Authorization, disclosure, retention, and untrusted-history handling are absent

Returning coarse ranges “with the user text” can expose unrelated material and supplies old conversation content to the model as untrusted input. Answer-time equality with one owner key is insufficient for:

- a second authorized reviewer;
- partial disclosure;
- revocation;
- restored fixtures;
- cross-conversation document access;
- a document whose owner changes;
- sensitive or deleted evidence; and
- later Mission 10 authority distinctions.

The lineage must bind principal or actor identity, conversation identity or incarnation, document identity, and authorization context. Restoring or relocating a fixture must preserve those identities or explicitly establish replacements. Reads must fail without leaking the existence or content of unauthorized evidence.

Retrieved conversation text should be treated as untrusted evidence rather than fresh instructions. The why operation should return only the smallest authorized range necessary for the answer and preserve a clear boundary between quoted evidence and model-authored interpretation.

## Factual corrections to the mini spec and decision log

### 11. The depicted client-tool turn topology is incorrect

The mini spec depicts a user message, assistant response, mutation request, and mutation result as sharing one `turnId`. In current Flue history:

- user messages commonly carry a `submissionId` but no `turnId`;
- the assistant mutation request carries the model turn's `turnId`;
- the construction tool's immediate Flue output is only `{ awaiting: "client" }` and terminates that response;
- the browser's actual output arrives later in a separate `client-tool-result` system dispatch under another submission; and
- the assistant continuation has a new model turn.

Correlation is by `toolCallId`, plus submission and record order where needed—not by assigning the same `turnId` to the original user message and later browser result. Conversation-range resolution must join user deliveries, assistant turns, client-result signals, and continuations through their actual submission/order semantics.

The retained Mission 6 witness also shows cumulative client-tool-result signals that repeat earlier call IDs. The lineage reader must deduplicate and reconcile by call ID rather than treating every signal occurrence as a new result.

### 12. Current browser mutation results do not contain `documentSha256`

The current construction tool settles server-side with `{ awaiting: "client" }`. The retained Mission 6 `addArc` browser result contains title, detail, target, and `applied`, but no document hash. Mission 6 computes the document hash separately in its settled manifest.

Accordingly, the sentence “the browser returns the post-mutation document SHA-256 inside each client-tool result” describes proposed work, not observed current behavior. The browser result contract, its caller, and the production routing must be changed and tested before C6 exists.

### 13. `usePersistentState` cannot be called inside the tool's `run`

Flue hooks must be called while the agent function renders. The implementable pattern is:

1. call `usePersistentState` during agent render;
2. capture the returned setter in the tool closure; and
3. invoke that setter from the tool callback, where `toolCallId` is available in the tool context.

The mechanism table's pseudocode is therefore technically wrong or materially ambiguous. It should describe a render-time hook and tool closure, including how the revision number is computed with updater semantics and how the returned revision is kept consistent with the buffered state write.

### 14. The Petrinaut file-wrapper description is imprecise

The versioned Petrinaut file wrapper carries more than `title` and `meta.generator`: it also includes `version`, the SDCPN document arrays, and optional generator-version metadata. Runtime entity schemas use strict objects in important places, but the file import schemas are not uniformly strict.

The narrower conclusion remains sound: there is no currently supported provenance metadata slot on individual elements, and no established file-level provenance field. The documents should state that directly rather than claiming that the wrapper has only two fields or that every relevant file-level object is strict.

### 15. “Durable tool” does not make the browser side effect exactly once

`durable: true` can protect the server-side tool attempt and its recorded Flue state effects. It does not make an external browser mutation exactly once. The browser can apply a mutation and lose its result; a retry can encounter changed state; signal admission can be deduplicated while the external side effect has already happened more than once.

The durability statement must be scoped to the server workpiece tool. Browser mutation idempotency, base-state checking, and unknown outcomes require their own contract.

## Strategic gaps in the mission sequence

### 16. The proposed Mission 7 absorbs Mission 9's central product advance

The recut Mission 7 now includes:

- provider schema-carrier repair;
- broad ordinary-conversation mutation-tool admission;
- construction teaching;
- `update_workpiece` and persistent revision mechanics;
- a workpiece revision/diff pane;
- retirement of old client-tool surfaces;
- several real persona interviews through construction;
- production of a real constructed net; and
- the final why route over that lineage.

Mission 9's current release note is that Brunch constructs a recognizable net region itself. If Mission 7's real persona run constructs the provenance pair, that advance has already been crossed. M7 becomes a large multi-front construction, UI, evaluation, persistence, and explainability mission whose user value arrives last, while M9 later repeats the same terrain under a different completion bar.

**Required recut:** choose explicitly between:

1. consolidate the real construction and explanation advance, then give the following mission projection breadth, repeat/change behavior, and readiness closure; or
2. make the visible revisioned workpiece a smaller precursor mission, followed by one mission that constructs and explains a real bounded region.

At minimum, carrier repair plus one canonical production-path mutation should be an early go/no-go tracer before committing to the pane, persona campaign, and whole-net coverage.

### 17. M7 is not bounded around one coherent visible advance

Even if one branch may contain several tracer bullets, the proposed M7 has too many independent failure fronts: schema conversion, model tool selection, workpiece cadence, history access, passage identity, browser mutation effects, new UI, fixture restoration, persona quality, and reviewer usefulness. Several can invalidate the architecture after substantial unrelated implementation has landed.

The first working line should answer the disputed semantic question with the least mechanism: one genuine conversation, at least two distinguishable workpiece passages, at least two mutations, one failed or no-op mutation, one correction, and one hand edit. If the why resolver cannot distinguish those cases without guessing, the architecture should stop before whole-net breadth.

### 18. Fixture restoration is unresolved but lies on the critical path

The mini spec accurately marks a `???` between a genuine persona run and a live demo fixture. Keeping a dev store, importing private Flue records, and replaying a materialized snapshot each make a different product claim. Replaying signals creates a prepared projection rather than preserving the original live lineage.

Running several paid persona construction campaigns before proving that one minimal genuine conversation can be exported or retained, relocated, reopened, authorized, and queried risks producing evidence that cannot power the demo.

**Recommended order:** run the export/restore/reopen probe on one tiny genuine conversation before the broader persona programme. Record whether the product fixture is a retained live store, a supported relocation of genuine records, or an honestly labelled prepared projection.

### 19. Broad canonical-tool admission contradicts the stated restraint

The mini spec says to admit Petrinaut's canonical mutation, query, and command tools by default and scope down only after observed misbehavior, while saying stock-modeller parity remains a non-goal. That is parity-first admission in practice. It also conflicts with the current Mission 9 record's rejection of broad tool parity and risks a large provider tool-definition cost, selection ambiguity, inappropriate commands, and a much larger failure surface before any scenario requires metrics, subnets, differential equations, scenarios, removals, and layout together.

Rejecting the inherited arbitrary six-tool subset does not require admitting everything. Replace it with a **scenario-derived canonical subset**, mechanically generated from Petrinaut's authority, and expand it when the selected scenario or observed failure requires another mutation class. Measure schema size, prompt-cache effects, tool-selection behavior, latency, correction behavior, and provider errors before making a broad bundle the ordinary default.

### 20. The completion criterion remains underdefined

“Any element” and “consequential element” lack a mechanical inventory rule. The old M7 draft at least required a frozen element inventory and explicit supported or unsupported dispositions. That obligation should survive the mechanism change.

Before a run is graded, freeze:

- the selected document and workpiece revisions;
- the element inventory;
- the rule distinguishing consequential elements from presentation-only artifacts;
- expected supported, partially supported, externally changed, and refused dispositions; and
- what happens to deleted or recreated elements.

Without this, whole-net completion can be gamed by excluding difficult elements after the fact.

### 21. Migration and rollback are missing

The plan changes persisted workpiece representation from fenced assistant text to tool parts and state, changes ordinary-conversation tool admission, removes `ask` and `sweep` handling, and changes the lineage expected by future missions. Existing conversations and retained runs contain only the old representation. Rollback after new state records and new tool calls is unspecified.

A migration matrix should cover:

- old history with new code;
- new history with rolled-back code;
- conversations containing both fenced and tool revisions;
- mixed-version browser and server;
- Mission 6 fixture mode;
- retained evidence restoration; and
- tool-manifest rollback.

Given the prototype posture, a permanent compatibility layer is not warranted, but the transition crosses persisted data and separately deployed browser/server boundaries. An additive introduction with a bounded dual-read period may therefore be the least safe mechanism. The bridge should have an explicit removal gate.

### 22. Deployment ordering is inconsistent

C14 moves remote durability back to Mission 8, but current Mission 9 and Mission 10 drafts still require deployed or replacement-safe inherited state. Historical Mission 8 stopped before remote deployment, and no new executable M8 is yet scheduled. This leaves later missions either blocked on an unscheduled dependency or tempted to silently weaken “deployed.”

Choose explicitly between:

- scheduling a real Mission 8 persistence/deployment mission before the first remote claim; or
- making M9 and M10 explicitly local-product missions and naming a pre-M11 remote release gate.

“Locally run panel,” “locally verified application image,” and “remote replacement-safe service” must remain distinct claims.

### 23. Consumer discovery may be too late

Deferring self-describing export and optimization-consumer discovery until Mission 11 risks choosing an M9 region and M10 correction that do not exercise the scenario, parameter, metric, executable, or behavioral semantics Chris and Yannis actually need. Mission 11 could then become an unexpectedly large rebuild rather than a handoff.

Do lightweight, non-binding consumer discovery before selecting the M9 region: one optimization question, minimum scenario and parameter semantics, expected execution boundary, required outputs, and minimum credibility checks. Keep implementation in M11, but use the real consumer to select a representative proving case and decide whether file-level provenance is load-bearing earlier.

### 24. Semantic and behavioral proof is too visual until the optimization handoff

A visually plausible, parser-valid SDCPN can still have incorrect enabling, resource conservation, timing, scenarios, or stochastic behavior. Human semantic review is necessary but insufficient for operational behavior.

When selecting the first meaningful generated region, require at least one executable discriminator derived from the workpiece—for example resource reservation and release, reachability, token conservation, or one scenario outcome—and carry it unchanged through the reviewer-revision mission. This need not become broad simulation coverage; it should be the cheapest check capable of catching a plausible but behaviorally wrong projection.

## Items that should be reopened before Mission 7 authority

### Reopen C1–C3: lineage and the honest why answer

Decide whether the product promises temporal audit context or causal provenance. If causal provenance remains the intent, identify the smallest explicit mutation-to-passage relation and separate authorship, evidence, rationale, and authority.

### Reopen C5: lookup ownership and execution

Keep semantic package ownership, but assign supported Flue history acquisition, authorization, and tool composition to the binding/app boundary. Decide whether the model needs two tools or one composed why operation based on interaction quality rather than package topology.

### Reopen C6: hash-only net/workpiece join

Replace the post-hash-only proposal with a transition and effect contract, or narrow the claim to unattributed state correlation.

### Reopen C8: excluding capture or another retained evidence projection

Known Flue compaction already threatens exact evidence and revision recovery. Decide the uncompacted limitation or the minimal compaction-independent retention mechanism before promising exact historical lines.

### Reopen C10: full-bundle default admission

Retire the inherited arbitrary six, but choose a scenario-derived canonical subset and expand from observed need rather than mounting near-parity by default.

### Reopen C13: release wording

“Who prepared it” and “the exact conversation line it rests on” exceed the represented identity and causality. Narrow the release note until actor identity, evidence retention, and causal association are established.

### Reopen C15: passage identity

Treat passage identity as a prerequisite to point-passage provenance and blame. Strengthen the probe to semantic edits, or defer blame and report only revision-local text.

### Reopen D1, D3, and D5: real fixtures and construction sequencing

Prove one genuine conversation can become an authorized live fixture before the persona campaign, and resolve whether construction in M7 intentionally consumes M9's visible advance.

## Recommended next sequence

1. **Adjudicate the product claim.** Decide causal provenance versus temporal audit lineage and amend the release wording accordingly.
2. **Build one adversarial tracer on paper or in the smallest executable harness.** Use one conversation with two workpiece passages, two mutations, one failed or no-op mutation, one correction, and one hand edit. Require deterministic answers or explicit refusals.
3. **Correct the Flue topology model.** Represent user delivery, assistant mutation request, later client-result signal, continuation, duplicate result delivery, and server-state writes using their real identities.
4. **Define the minimum mutation transition/effect record.** Include document identity, base state, outcome, post state, affected elements, and unknown-result behavior.
5. **Force compaction.** Verify which exact user text, workpiece revisions, and tool records remain available through the supported public surface; choose an explicit limitation or retained projection.
6. **Export or retain and reopen the tracer conversation.** Exercise authorization and why resolution after relocation or restart before launching paid persona breadth.
7. **Probe passage identity under semantic edits.** Include rename, move, paraphrase, split, merge, deletion, and reintroduction.
8. **Repair the provider schema carrier for the smallest scenario-derived mutation subset.** Prove one real nested call before broad admission.
9. **Re-cut the mission topology from the observed results.** Explicitly resolve the M7/M9 overlap, deployment order, migration boundary, and consumer-driven proving scenario.
10. **Only then run the broader persona construction campaign.** Freeze the consequential-element inventory and behavioral oracle before grading.

## Evidence consulted

- [`provenance-and-tooling-decision-log-2026-09-04.md`](provenance-and-tooling-decision-log-2026-09-04.md)
- [`provenance-by-lineage-mini-spec-2026-09-04.md`](provenance-by-lineage-mini-spec-2026-09-04.md)
- [`../../../MISSION.next.md`](../../../MISSION.next.md)
- [`../../mission-drafts/7-capture-backed-review.md`](../../mission-drafts/7-capture-backed-review.md)
- [`../../mission-drafts/9-traceable-projection.md`](../../mission-drafts/9-traceable-projection.md)
- [`../../mission-drafts/10-bounded-reviewer-revision.md`](../../mission-drafts/10-bounded-reviewer-revision.md)
- [`../../specs/petrinaut-batched-construction-tools.md`](../../specs/petrinaut-batched-construction-tools.md)
- [`../../../packages/core/src/workpiece.ts`](../../../packages/core/src/workpiece.ts)
- [`../../../packages/plugin-sdcpn/src/flue.ts`](../../../packages/plugin-sdcpn/src/flue.ts)
- [`../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts)
- [`../../../packages/binding-flue/src/history-reader.ts`](../../../packages/binding-flue/src/history-reader.ts)
- [`../../../packages/transport-aisdk/src/client-tool-history.ts`](../../../packages/transport-aisdk/src/client-tool-history.ts)
- [`../../../../../../apps/brunch-agent/src/agents/chat-agent/agent.ts`](../../../../../../apps/brunch-agent/src/agents/chat-agent/agent.ts)
- [`../implementations/fe-1575-outer-browser-witness-2026-09-04-r2/witness.md`](../implementations/fe-1575-outer-browser-witness-2026-09-04-r2/witness.md)
- Installed Flue 2.0.3 documentation for agent hooks, public conversation history, compaction, streaming, and conversation persistence under `node_modules/@flue/runtime/docs/` and `node_modules/@flue/sdk/docs/`
- Petrinaut canonical AI, action, entity, and file-format schemas under `libs/@hashintel/petrinaut-core/src/`

## Review disposition

The design should not be discarded. Its useful core is a first-class revisioned workpiece plus mutation-call audit history. The correction is to stop calling temporal adjacency a complete provenance relation, then add only the smallest identities, effects, retention, and authorization contracts that the real why answer requires. The mission sequence should be recut after those disputed seams are probed, not before.
