# Voice runtime ownership and conversational delegation

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

Design recorded on 2026-09-07 from the [architecture discussion](https://ampcode.com/threads/T-01a07c91-dcec-766d-acca-ad98f239ed26). This is an unallocated design proposal, not a new numbered mission, an implementation plan, or an amendment to the current branch's authority. The permitted target-runtime changes below are design choices, not permission to implement them under the existing mission.

## Summary: who owns each part of the voice interaction?

**Recommend split-ownership voice conversation: separate conversational control from domain authority.**

The user experiences one continuous conversation, not a sequence of gap-filling tasks. Brunch directs the domain work; Realtime handles natural conversation within delegated authority; Flue records the interaction; Petrinaut safely executes tools.

Every exchange must be recorded, but not every exchange needs to invoke Brunch. Typed and Brunch-owned turns continue through normal admissions. Realtime-local exchanges may use a proposed persistence-only API into the same canonical Flue conversation. When domain interpretation is required, Realtime submits an attributed proposal for Brunch validation.

A Brunch-defined clarification gap remains one conservative form of delegation and the smallest initial experiment. It is an internal mechanism, not the overall interaction model or a user-facing workflow.

## Cold-start reads and inspected foundation

The discussion first queried PR #9564's `headRefOid`, then inspected exact Git objects at [`132831f14300c577c5d0b73cea9d817c8e5c6c7d`](https://github.com/hashintel/hash/commit/132831f14300c577c5d0b73cea9d817c8e5c6c7d). This is the inspected foundation, not a claim about a later PR head or the current working-tree branch. Re-query the head before an implementation cut.

Read these sources at that revision:

- [Mission 6b authority](https://github.com/hashintel/hash/blob/132831f14300c577c5d0b73cea9d817c8e5c6c7d/libs/%40hashintel/brunch-agent/MISSION.md) and [owner witness](https://github.com/hashintel/hash/blob/132831f14300c577c5d0b73cea9d817c8e5c6c7d/libs/%40hashintel/brunch-agent/docs/evidence/implementations/voice-resumable-reconciliation/owner-witness-2026-09-07/witness.md).
- `apps/petrinaut-website/src/server/voice/openai-voice-policy.ts` and `src/main/app/voice-interview/{openai-realtime-session,realtime-brunch-bridge,voice-turn-controller,canonical-speech}.ts` for current media and turn ownership.
- `libs/@hashintel/brunch-agent/packages/transport-aisdk/src/{index,transcript,ui-stream}.ts` and `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx` for causal continuations, projection, execution, and local withholding.
- `apps/petrinaut-website/src/main/app/local-storage-demo/crew-reservation-settled-manifest.ts` for the fixture-specific coherence boundary; Brunch core `src/prompts/SYSTEM.md`, `src/skills/elicitation/SKILL.md`, and the SDCPN plugin for authored responsibilities.
- [Flue routing guidance](../reference/architecture/flue-routing.md) before adding persistence or runtime mechanisms; the [future spine](../../MISSION.next.md) for existing provenance, construction, and deployment planning owners.

### Existing capabilities versus limits

| Existing at the inspected revision | Boundary of the claim |
| --- | --- |
| Typed and completed spoken inputs share canonical Brunch/Flue admission. | Spoken text survives hydration; direct spoken-user origin does not. |
| Correlated Brunch prose feeds Realtime speech with acknowledged half-duplex handoff. | Realtime has no tools and cannot independently acknowledge, clarify, or rewrite responses. |
| Browser continuations preserve original calls; result collection selects the latest relevant client-tool step, including mixed server/browser topology. | Preserve this repair when introducing local dialogue; do not reintroduce stale cumulative results. |
| Explicit true-user fixture evidence is required before mutation. | A fragment such as `SDCPN`, an inspection request, or a prepared hypothesis does not authorize a change. |
| The witness records coherent fixture resume, active-submission Stop, and stopped-entry recovery. | Coherence is fixture-specific; post-settlement locally withheld browser work can reappear after reopen. |

The committed witness records a narrowed accepted local Voice → causal browser mutation → coherent resume → active-submission Stop path. Direct-user attribution after hydration, durable post-settlement withholding, and comparative audible latency remain explicitly deferred. The full pre-registered telemetry bundle was not retained. Witness test results are historical evidence, not checks rerun during this design discussion.

The witness exposed excessive explanation before a necessary clarification and poor Stop discoverability while Voice was active. These are interaction-design inputs, not evidence that Realtime should own domain strategy.

## Directions discussed in the call versus later mechanisms

The call directions below come from the user's account of the meetings, not an independently inspected meeting transcript:

1. Keep Realtime as the media relay.
2. Let Realtime lead the conversation and delegate to Brunch as a domain service or subagent.
3. Separate text/voice runtime responsibilities while sharing Brunch behavior and session state. The second meeting summary favored Brunch-led elicitation with a conversational voice agent.

The architecture discussion subsequently proposed **persistence-only events, delegation scopes, structured handbacks, and durable operation dispositions**. These are candidate mechanisms, not established call decisions or capabilities already implemented in #9564. The meeting preference is an architectural hypothesis to evaluate, not empirical proof of better interaction.

## Visible product advance

**Release-note hypothesis:** Talk naturally with Brunch, clarify what you mean without repeated handoffs, switch between speaking and typing, and keep the same model and conversation recoverable.

**Proposed demo:** Open a process conversation, describe an approval rule, answer a natural follow-up, interrupt to correct a detail, and finish the correction by typing. Observe the accepted workpiece and any authorized net change. Reopen the same conversation and continue without repeating the interview, replaying old speech, or duplicating work. An uncertain answer remains visibly unresolved rather than silently changing the model.

**Previously unavailable:** Realtime cannot currently conduct permitted local clarification independently of a Brunch invocation. The UI should not expose delegation scopes or gap-completion machinery; it remains one assistant, one timeline, one composer, and one shared workpiece.

## Three approaches and recommendation

### 1. Improved Brunch-led relay

Brunch owns both substance and conversational wording. Realtime transcribes and speaks supplied responses. Improve Brunch's brevity, response structure, and playback controls without adding conversational autonomy.

This is the smallest change and the clearest authority model. Its limitation is that minor rephrasing and follow-ups still require Brunch. Challenge the assumption that awkwardness requires a second conversational model: better Brunch responses may remove much of the strain. Keep this as the baseline and fallback.

### 2. Realtime-led conversation

Realtime directs the conversation and delegates domain work to Brunch. It offers the greatest conversational freedom, but deciding which evidence to seek is already elicitation strategy. Brunch's later validation cannot undo a leading question or recover an important question never asked.

The independently Realtime-led variant conflicts with the required authority boundary. If Brunch must authorize strategic direction, this approach converges toward split ownership. Do not select it merely because post-hoc mutation validation exists.

### 3. Split-ownership voice conversation — recommended

Brunch owns the domain agenda and supported conclusions. Realtime owns conversational expression and permitted local interaction. This improves natural follow-ups without creating competing domain authorities or replacing the integrated Brunch/Flue/Petrinaut path.

The recommendation separates conversational control from domain authority; it does not make the experience fundamentally gap-driven. The hypothesis to test is whether bounded conversational freedom adds enough elicitation value to justify its runtime contracts over an improved relay.

## Authority boundaries

| Responsibility | Owner |
| --- | --- |
| Elicitation strategy and evidence sufficiency | Brunch |
| Interpretation, uncertainty, substantive claims, and IR/workpiece updates | Brunch |
| Domain-tool selection | Brunch; requesting a tool is not evidence that its effect succeeded |
| Natural wording, pacing, interruption, acknowledgements, and permitted local follow-ups | Realtime, through application-enforced media and delegation controls |
| Canonical conversation and provenance across modalities | Flue |
| Tool validation, serialization, execution, and recovery | Petrinaut, using authoritative runtime records |
| Prompt, skill, and resource authorship | Brunch-owned sources with explicit role-specific composition |

Realtime must not independently expand domain strategy, settle an interpretation, or authorize mutations. An acknowledgement such as “Got it” is conversational; it is not a validation receipt or a claim that the model changed. Brunch determines which substantive claims are supported; Realtime expresses them without adding claims or removing consequential qualifications.

Text/voice consistency means shared evidence, interpretation, and state, not identical independently generated prose. During voice, the transcript shows the actual conversational wording rather than a different hidden Brunch script. Domain artifacts remain separate from their spoken explanation.

## Current and target architecture

### Current — inspected #9564 foundation

```text
 Typed input --------------------+
                                 |
 Microphone -> Realtime           |
               | transcript      |
               +-----------------+
                                 v
                    +-------------------------+
                    | Flue normal admission   |
                    | Invokes Brunch          |
                    +------------+------------+
                                 v
                    +-------------------------+
                    | Brunch                  |
                    | Strategy + wording      |
                    | Interpretation + tools  |
                    +------+-----------+------+
                           |           |
                 canonical text        | tool requests
                           v           v
                 +-------------+  +--------------------+
                 | Chat panel  |  | Petrinaut           |
                 | Realtime    |  | Validate / execute |
                 | speaks text |  | Return results     |
                 +-------------+  +---------+----------+
                                            |
                                            v
                                     Flue continuation

                 One canonical Flue conversation
```

### Proposed — split conversational and domain ownership

```text
                  +--------------------------------+
                  | One conversation UI            |
                  | Text / voice / tools / workpiece|
                  +----------+---------------------+
                             |
              +--------------+----------------+
              |                               |
              v                               v
 +-------------------------+     +-------------------------+
 | Brunch                  |     | Realtime                |
 | DOMAIN AUTHORITY        |---->| CONVERSATIONAL CONTROL  |
 |                         |     |                         |
 | Strategy and sufficiency|     | Wording and pacing      |
 | Interpretation and IR   |<----| Interruption and ack.   |
 | Claims and tool choice  |     | Permitted follow-ups    |
 +------------+------------+     +------------+------------+
              |   delegation / handback       |
              |                               |
              v                               v
 +--------------------------------------------------------+
 | Flue: ONE CANONICAL CONVERSATION AND PROVENANCE RECORD   |
 | Normal admissions invoke Brunch                        |
 | Proposed event-only appends record local exchanges     |
 +---------------------------+----------------------------+
                             |
                  Brunch-selected domain work
                             v
                 +----------------------------+
                 | Petrinaut                  |
                 | Validate / serialize       |
                 | Execute / record / recover |
                 +-------------+--------------+
                               |
                               v
                       Shared workpiece / net
                       Results return to Flue
```

These are responsibility boundaries, not new services. Flue recording is not mutation authorization. Provider histories are reconstructible context, not independent conversation authorities. One canonical conversation does not require duplicating document storage inside Flue or pretending the stores already share a transaction.

## Proposed runtime contracts

### Persistence-only events

Typed and Brunch-owned turns retain normal admissions. Realtime-local exchanges append to the same Flue conversation without scheduling Brunch. This requires a supported extension; an unsupported local Flue patch, hidden synthetic user turn, or browser transcript sidecar is not the proposed solution.

The contract needs authenticated attribution, canonical order and causal references, stable event identities, idempotent same-payload retries, changed-payload conflicts, hydration, and visibility to subsequent Brunch reasoning. Appending text or tool-shaped data cannot execute tools or forge Brunch validation. Runtime code records every exchange, including unsuccessful or interrupted ones; recording cannot depend on the model voluntarily calling an audit tool.

### Conversational delegation and structured handback

A delegation scope makes permitted freedom explicit: purpose, relevant evidence/workpiece basis, allowed exploration, return conditions, and an identity/version. The first conservative scope can be a Brunch-defined clarification gap. Realtime chooses wording and permitted follow-ups, then proposes an interpretation rather than marking domain understanding complete.

Handback is an agent-authored normal admission referencing original exchange events, the delegation basis, proposed meaning, uncertainty, and why Brunch is needed. Return on a useful answer, conflict, new topic, out-of-scope uncertainty, decline, or stop. Brunch reads the evidence and accepts, rejects, or requests more information. Never relabel the proposal as another human message or replace the exchange with its summary.

Typed instructions, explicit stop, or relevant state changes suspend or invalidate outstanding delegation. Playback acknowledgements must not invalidate it merely because they advance the log. A stale proposal may remain attributable evidence but cannot authorize a current mutation.

### Durable operation dispositions

Pending browser work needs a durable disposition independent of whether its originating model step has settled. A generic recorded “stop” does not enforce cancellation: an authorized runtime control action must establish the disposition that Petrinaut consults.

Distinguish cancelled-before-execution, already executing, applied, failed, and uncertain outcomes. Preserve stable operation identity, original call/step ownership, validated inputs, expected document basis, and effect/result records. Prefer an atomic document-change/receipt boundary where available; otherwise require explicit reconciliation before retry. Serialization and idempotent admission alone do not prove exactly-once effects.

## End-to-end interaction flows

### Local voice interaction

1. Brunch records the delegated conversational purpose and evidence basis.
2. Realtime generates natural wording; the adapter records its authorship, delegation reference, and actual output.
3. Playback is tracked, and each finalized user transcript is recorded once.
4. Realtime continues within permission or submits a structured handback through normal admission.
5. Brunch validates meaning and records the resulting decision, workpiece change, or next delegation.

### Voice evidence leading to a domain effect

1. Brunch reads the original evidence behind the proposal and validates its interpretation.
2. The workpiece basis for construction settles before dependent mutation work.
3. Brunch selects a domain operation; Petrinaut validates and serializes execution.
4. The original call receives its own causal result, including refusals, no-ops, and partial failures.
5. Brunch reports the observed outcome. Coherence checks determine what can be claimed as settled and recoverable.

### Typed input and modality switching

1. Typed input uses normal admission into the same conversation.
2. Suspend current voice delegation and stop or finish delivery according to the interaction policy; do not implicitly cancel effects.
3. Brunch receives the recorded local exchanges, including unresolved proposals, without duplicating human messages.
4. Brunch continues through the same interpretation, workpiece, and tool boundaries.
5. Returning to voice uses current canonical context and renewed delegation.

The UI remains one assistant identity and timeline. Attribution belongs in inspectable provenance. Keep interrupt-speech and stop-work controls distinct and available during voice; do not require leaving voice to discover durable Stop.

## Provenance, cancellation, and recovery

Preserve five distinct milestones: input recorded/admitted, Brunch step complete, browser operation complete, coherent state settled, and playback complete. A single UI “busy” label must not become their shared runtime meaning.

Record human transcript and any normalization separately; actual generated wording and its author; explicit decisions and concise rationale; tool requests, attempts, results and effects; playback identities, attempts, progress and uncertainty. Preserve user evidence separately from agent suggestion, interpretation, and assent to supplied wording. Decision records do not depend on obtaining private model reasoning.

| Event or failure | Required behavior |
| --- | --- |
| Interrupt speech | Stop audio promptly and record the cutoff; preserve admitted domain work unless separately cancelled. |
| Stop work | Durably prevent eligible pending operations and further reasoning; report already-running/applied work without claiming rollback. |
| Append/admission acknowledgement lost | Resolve the original identity; do not create a new logical exchange blindly. |
| Effect applied before result acknowledgement | Recover the receipt or reconcile authoritative document state before retrying. |
| Disconnect or late events from an old connection | Rebuild from canonical evidence and operation state; fence stale authority; no autoplay or implicit cancellation. |

New speech may be recorded while an existing operation settles, but state-dependent proposals and mutations cannot overtake it. Initially retain one active execution owner per workpiece; another tab observes until ownership transfers. Fresh-tab recovery does not establish active-active safety.

For the text-level playback requirement, retain full generated wording plus acknowledged playback position and uncertainty, not an invented exact heard prefix. A lost final acknowledgement leaves an unknown delivery tail. OpenAI's [Realtime interruption documentation](https://developers.openai.com/api/docs/guides/realtime-conversations#interruption-and-truncation) does not promise a precisely truncated text transcript. If audio becomes audible before corresponding wording is durable, a crash can leave unrecorded speech; test short-utterance persistence before release, with buffered or text-first rendering as the conservative fallback. Permanent audio retention is not required by this design.

## Prompt, skill, and resource consistency

Use shared authored material with explicit role-specific composition:

- Shared: authorship, uncertainty, vocabulary, evidence discipline, and respecting stop.
- Brunch: strategy, evidence sufficiency, interpretation, workpiece maintenance, substantive claims, and construction.
- Realtime: delivery, acknowledgement semantics, and permitted conversational exploration.
- Resources: versioned shared references with role-appropriate access.

Do not copy the complete elicitation strategy into Realtime and call that consistency. Start with straightforward composition rather than a general profile compiler. Record effective prompt, skill, resource, and model versions; make upgrades explicit. Behavioral tests are necessary because shared source text cannot guarantee matching model behavior.

## Migration stages and readiness gates

| Stage | Change | Required evidence before promotion |
| --- | --- | --- |
| Preserve the foundation | Re-pin #9564 and retain accepted behavior and explicit deferrals. | Causal results, evidence gating, conversation isolation, Stop, and coherent reopen regression coverage. |
| Add recording | Event-only local dialogue and playback records, initially without autonomous clarification. | Fresh-process reconstruction; append does not invoke Brunch or mutate domain state. |
| Delegate one interaction | One conservative clarification scope and structured handback. | Useful natural clarification without evidence laundering or unauthorized effects. |
| Integrate recovery | Durable pending-operation cancellation, modality transfer, reconnect, and interleaving. | Fault-injected contracts and real browser/microphone witnesses. |
| Expand only under evidence | Broader delegated interaction or freer substantive presentation. | Better elicitation quality without weakened provenance, claims, or execution safety. |

The smallest first experiment is one delegated clarification, two Realtime-local exchanges, one structured handback, one Brunch-validated workpiece update, and fresh-process reconstruction. This is a throughline proof floor, not permission to call the complete target safe. Add browser mutation and interruption races before claiming the integrated product advance. Existing deferrals remain valid for #9564's narrowed claim, not as passes for the broader target.

## Candidate evidence and required tests

These are proposed acceptance scenarios, not tests claimed to exist or pass. Reuse the existing test owners rather than introducing a parallel evaluation runtime.

| Test owner or boundary | Required discriminator |
| --- | --- |
| Supported Flue event API and `apps/brunch-agent` runtime integration | Multiple local events cause zero Brunch invocations; one proposal admits the intended invocation. Reopen reconstructs attribution without browser correlation state. |
| `packages/transport-aisdk/test/chat-transport.test.ts` and transcript tests | Duplicate/conflicting events and proposals preserve identity. Local dialogue between calls/results cannot corrupt mixed server/browser step causality or sibling outcomes. |
| Petrinaut `ai-assistant-panel.test.tsx` and actual tool boundary | Event content cannot forge authorization; race and crash cases prevent duplicate effects or resurrection of durably cancelled work. |
| Website voice session/controller/bridge tests and `voice-browser-tools.integration.test.tsx` | Mode switches, interruptions, stale connections, playback uncertainty, and delegation invalidation preserve ownership and state. |
| Real browser/microphone comparative witness | Improved relay versus split ownership: useful information gained, unsupported assumptions, repetition, correction effort, naturalness, and audible interruption/recovery. |

Retain the inspected revision's causal-result, explicit-evidence, and conversation-owned callback repairs. Test question identity across split/folded messages: the current selector requires marker/prose co-location, while the witness reports working replay for its scenario. That warrants alternate-topology coverage, not a claim that replay is universally broken. Future question identity should connect delegated intent, actual wording, and playback without depending on a rendered message boundary.

Inner tests establish schema, identity, and state rules; runtime/host integration tests establish actual boundary crossings; outer microphone/browser witnesses establish audible and user-visible behavior. A future implementation owner must retain the evidence, and the product owner must adjudicate promotion. Set numerical quality/latency thresholds and any paid budget before trials; this draft authorizes neither spending nor a test campaign. Preference or lower latency alone is insufficient to justify degraded evidence quality.

## Unresolved experiments and stop conditions

| Uncertainty | Why it matters | Smallest discriminating experiment |
| --- | --- | --- |
| Supported Flue extension | External dialogue must share ordering, hydration, and context without waking Brunch. | Append local user/assistant events, reopen, then invoke Brunch once with original evidence references. |
| Delegation usefulness | Local follow-ups may drift into strategy or repeatedly hand control back. | Compare one bounded interaction against a better-prompted relay, including leading-question and ambiguous-assent controls. |
| Media durability | Generated wording may lag audible delivery. | Interrupt/disconnect at output boundaries and inspect durable wording versus acknowledged playback; measure buffering cost. |
| Durable execution boundary | Browser effects and runtime acknowledgements can separate on failure. | Crash around effect/receipt and Stop/claim boundaries; reconcile the resulting document without duplicate execution. |
| General recovery and explanation | The prepared fixture is not a general workpiece transaction or provenance system. | Extend only on the selected real scenario and integrate with existing revision/basis work rather than inventing a competing ledger. |

Stop or reorient if the design needs a second conversation authority, promotes Realtime interpretation without Brunch validation, treats a prompt instruction as an execution safeguard, invents missing evidence, revives cancelled work, or produces no useful clarification benefit over the improved relay. Do not add a generalized workflow language, new deployment topology, comprehensive ontology, or full profile compiler merely to implement this split.

The recommendation remains **split ownership**, with clarification as the first conservative delegation experiment—not a fundamentally gap-driven user experience.
