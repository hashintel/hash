# Provenance by lineage with declared basis — mini spec, 2026-09-04 (revised)

> Design evidence, not execution authority. This document projects the [decision log of 2026-09-04](provenance-and-tooling-decision-log-2026-09-04.md), including its post-review dispositions (F1 to F16), into one reviewable statement of intent, design, and consequences for the Brunch mission spine. It was revised the same day after the [independent review](provenance-by-lineage-independent-review-2026-09-04.md); the revision corrects the turn topology, the hook pattern, and the claim strength, adds the declared basis, the mutation transition record, and the operation protocol, consolidates the construction and explanation missions, and enumerates the scenario-derived tool subset. Nothing here may be implemented until it is re-evaluated and cut into a live `MISSION.md`.

## 1. Intent

Brunch must be able to say, for any consequential element of a Petri net it helped build, what it rests on: the workpiece passage the constructor declared as its basis, the revision that carried that passage, the conversation context behind that revision, and who did what, or an honest refusal. It must do this without a comprehensive typed domain model, without a second conversation log, and without anyone hand-authoring links after the fact.

Two earlier approaches failed in opposite directions. A comprehensive typed intermediate representation tried to make provenance a property of the domain model; the typology receded as it grew and the model worked worse with it. The structural Markdown workpiece that replaced it is legible and cheap but has no seam to either the conversation or the net, and provenance was deferred without the tension being named in the planning record.

The resolving observation, as corrected by review: provenance has two parts. **Lineage** is who changed what, in response to what, when; it is recoverable from Flue's append-only log once workpiece revisions and net mutations are tool calls. **Basis** is why an element exists; it is not in the log unless the actor who knows declares it at the moment they know. The design therefore combines recovered lineage with a declared basis, and says plainly which of the two any given answer rests on (F5).

## 2. The lineage model, as the log actually records it

```text
submission S1   user message                        (submissionId S1, no turnId)
                assistant turn T1                   (turnId T1)
                  ├─ update_workpiece {markdown}     revision R, identity = callId
                  ├─ tool result {revision, sha256}
                  └─ addArc {…, basis}               request; server output = awaiting client
                state_write workpiece = {callId, sha256, revision, markdown}
submission S2   system dispatch  client-tool-result  [{toolCallId, output}]   (may repeat earlier ids)
                assistant turn T2                   continuation
```

Correlation is by `toolCallId` plus submission order; a shared turn id between the request and the browser result does not exist (F1). The lineage reader deduplicates cumulative result signals by call id.

Resolution walks from an element:

```text
element id
  → mutation transition records naming it            (created, changed, deleted; F7)
  → the declared basis on the creating request        passage locator(s) + rationale (F5)
       ├─ present: the passage in the revision current at that request
       └─ absent:  the revision current at that request, and a temporal range, marked as such
  → the conversation context behind that revision      turns between it and the previous revision
       └─ verbatim quote where the passage quotes; reported as string occurrence, not endorsement
  → actors reported separately: workpiece author, evidence actor, requesting principal, mutation actor
```

What the model does: it calls the tools and interprets structured results in prose. What it may not do: author a basis after the fact, reread the transcript as provenance, or explain an element the tools mark unsupported or not attributable (C3, F7).

## 3. Mechanisms

### 3.1 `update_workpiece` (core, server-side) — C4, F2, F10

| Aspect | Decision |
| --- | --- |
| Input | one Markdown string, the full current workpiece |
| Hook pattern | `usePersistentState('workpiece', …)` called at render; its setter captured in the tool closure; called from `run`, which receives `toolCallId` |
| State value | `{ callId, sha256, revision, markdown }`, written with the updater form so the revision number composes; the Markdown is in state so the agent always has its current workpiece at render regardless of compaction |
| Validation | core checks non-empty and size; template conformance is plugin participation |
| Durability | `durable: true` protects the server tool attempt only |
| Ownership | core owns the tool; plugins own the template |
| Replaces | the fenced `runbook-ir` block in assistant text; the prepared-signal route stays for test-authored revision zero |

Costs acknowledged: the full document crosses the wire each revision and is written twice, as tool input and as state; a structured-patch input is the later absorber. A model may call a tool less readily than it emits text; cadence is unmeasured either way (B6).

### 3.2 Declared basis on mutation requests — F5

Every construction request carries `basis`: one or more passage locators into the workpiece revision current at the request, plus a one-line rationale. The plugin strips `basis` before forwarding the canonical input to Petrinaut, so Petrinaut's contract is unchanged, and the full request with basis is retained in the log as the tool-call input. The skill teaches that a mutation without a basis is a mutation the model must justify in Construction notes or not make. Passage locator form is decided by the probe in 3.7.

### 3.3 Mutation transition record and operation protocol — F7, F8

The browser returns, per call: document identity, expected base hash, outcome (applied, no-op, failed, stale, unknown), confirmed post hash, and affected element ids or retained pre and post definitions. One authoritative result per call; a duplicate rule for repeated signals. The workpiece update and the browser mutation are separate boundaries, so the protocol is:

```text
requested(callId, documentId, baseHash, workpieceRevision, basis)
  → outcome(applied | no-op | failed | stale | unknown, postHash, effects)
  → reconciled | incomplete | unknown
```

A document transition no record explains is "not attributable from recorded transitions"; provenance for the affected state is refused until an explicit external revision is imported. No Petrinaut schema change is needed; the wrapper has no provenance slot and none is added (F3).

### 3.4 Lookups and their executable boundary — C5, F9

Core owns revision and query semantics. Plugin-sdcpn owns mutation names, inputs, outputs, and effect interpretation. Binding and app own authorized acquisition of Flue history through the in-process fetch pattern the capture sweep already uses, and compose the model-facing tool. Whether the model sees one composed why tool or two follows interaction quality. Retrieved conversation text is untrusted evidence returned in the smallest range needed (F11).

### 3.5 The visible workpiece — C7

Chat projects `update_workpiece` parts out of assistant messages and leaves a one-line marker. A pane in the Petrinaut Brunch panel shows the current revision, the revision list, and a diff, derived from Flue history through the Mission 5 transport. The why answer renders into the same pane. This projection lives in the app or transport layer, not the Petrinaut library. It is the surface every later mission assumes and a product-manager-visible advance in its own right.

### 3.6 Schema carrier repair — B9, C11

Precondition for admitting any nested tool. Flue accepts Valibot only and rejects other Standard Schema vendors; the construction factory declares an empty loose object with the JSON Schema pasted into the description. Fix by a mechanical JSON Schema to Valibot interpreter for the subset Petrinaut uses, or upstream Flue Standard Schema support. Prove one real nested call before broad admission.

### 3.7 Passage identity — F6

A prerequisite, not fog. Candidates: heading path, Markdown anchor, companion manifest. The probe covers rename, move, paraphrase, split, merge, deletion, and reintroduction on one real workpiece. If no scheme survives, the first claim is revision-local text with no cross-revision "introduced by."

### 3.8 Scenario-derived tool admission — F13

The inherited six-tool subset is retired. The admitted subset is generated mechanically from Petrinaut's AI tool bundle by the document entity classes the six persona cases exercise, surveyed on 2026-09-04:

| Entity class | Case evidence | Admitted operations |
| --- | --- | --- |
| places, transitions, arcs | every case | add, update, remove; arc weight and type |
| scenarios (initial state) | every case | add, update, remove |
| types and type elements | most cases name colours or token attributes | add, update, remove, move element |
| parameters | industrial gas | add, update, remove |
| metrics | vestera | add, update, remove |
| differential equations | data-centre thermal, pharma cold chain | add, update, remove |
| queries and commands | all | `getLatestNetDefinition`, `getNetCompilationErrors`, `applyAutoLayout`, `setNetTitle` |
| excluded for now | only vestera hints at hierarchy | subnets, component instances, position updates |

Expansion is by observed need with the case named. Admission in ordinary SDCPN conversation is the default; parity with the stock modeller is still not the goal.

### 3.9 Teaching and subtraction — C9, C12

The skill gains construction posture: read the definition first, mutate in small steps with a declared basis, check compilation errors, record decisions in Construction notes, call `update_workpiece` before and after construction. The `ask` and `sweep` client handling is retired from code. The capture store is not consumed; it re-enters only if the compaction probe shows `history()` loses records (F4).

## 4. Tool inventory after this design

| Tool | Owner | Executes | Status |
| --- | --- | --- | --- |
| `ping`, `activate_skill`, `readPetrinautDoc` | app, Flue, plugin | server, server, browser | keep |
| scenario-derived Petrinaut subset (3.8) | plugin-sdcpn, derived | browser | admit after carrier repair |
| `update_workpiece` | core | server | new |
| why lookup (one or two model-facing tools) | composed at app from core and plugin | server | new |
| `ask`, `sweep` client handling | core, website | browser | retire |
| six-tool and two-tool subsets | plugin-sdcpn | browser | retire once Mission 6 archives |

## 5. Real honest fixtures — D1 to D5, F14, F15

The provenance pair is a real conversation with a real revisioned workpiece and a real constructed net, produced by persona interviews against the production agent. The Mission 6 prepared fixture stays a viability proof.

```text
probe: one tiny genuine conversation → export or retain → relocate → reopen → authorize → query   (F14, first)
then: persona runs (Pi harness, production ChatAgent, real-headless host), several cases in parallel
      → Flue store holds conversation, revisions, mutations with basis, transition records
      → harness retains snapshot.json + projections per settled read
      → frozen element inventory and consequential rule; frozen behavioural discriminator
      → grade coverage against the hidden oracle ledger afterwards
```

Stop rule: a turn cap as budget, early stop when Brunch declares construction handoff, ledger coverage as the post-hoc grade (D4). Runs go to construction so the fixture contains lineage and basis (D5).

## 6. Mission topology — F12

Construction and explanation ship in one mission. Its body: carrier repair, orphan retirement, `update_workpiece`, the workpiece pane, scenario-derived tool admission and teaching, declared basis and transition records, the persona programme to construction, and the why route over real lineage. Its first act is the adversarial tracer: one genuine conversation, two distinguishable passages, two mutations, one no-op or failed mutation, one correction, one hand edit, with deterministic answers or explicit refusals before any breadth. The following mission takes projection breadth, repeat and changed-input behaviour, and readiness closure. Reviewer revision follows. Local posture is named; remote durability goes to a scheduled Mission 8 or an explicit pre-handoff release gate, and "locally run," "locally verified image," and "remote replacement-safe" stay distinct claims (F15).

Release wording, narrowed (C13, F5): "Ask why about any element and see the passage the constructor declared as its basis, the conversation context behind it, and who did what, or an explicit refusal." Actor identity and causal wording strengthen only as the records do.

## 7. Consequences for the planning record

1. **Name the tension** in the spine: lineage plus declared basis as the hypothesis; typed IR and hand-authored derivation rejected with reasons; revision cadence, compaction survival, and passage identity as the named strains; the visible workpiece as the precondition.
2. **Re-cut the mission drafts**: one consolidated construction-and-explanation mission replaces the current Mission 7 and the construction half of Mission 9; the remainder of Mission 9 becomes breadth and repeat behaviour; Mission 10 inherits basis, transition records, and passage identity rather than a derivation fixture.
3. **Mission 6 close report**: fixture-rigging admission, the carried fenced-block-to-tool change, the credential cause of the blocked witness.
4. **Migration matrix** with a removal gate for any dual-read bridge (F15).
5. **Consumer discovery** with Chris and Yannis before the construction region is chosen (F15).
6. **Authority**: every settled item becomes authority only when written into the cut `MISSION.md`, with Mission 6's construction-tool constraint amended there.

## 8. Fog-line and probes, in order

1. Compaction: whether `history()` keeps folded messages; set `keepRecentTokens` low, run past threshold, read history (F4).
2. Fixture materialization: export, relocate, reopen, authorize, query one tiny genuine conversation (F14).
3. Passage identity under semantic edits (F6).
4. Carrier repair for one real nested mutation from the 3.8 subset.
5. Revision cadence: whether the model calls `update_workpiece` often enough for revisions to have grain (B6).
6. Basis quality: whether the constructor declares a usable basis unprompted, and how often it is absent.
7. Whether the why answer over a real pair is useful to a reviewer, judged by a human.
8. Token cost of full-document emission, and when a structured patch earns its place.

## 9. Questions for the next reviewer

1. Does the declared basis reintroduce any rejected mechanism, or does it stay a thin creation-time relation?
2. Is the transition record the minimum that makes "not attributable" decidable?
3. Does the consolidated mission have one coherent visible advance, or does it still have too many independent failure fronts after the adversarial tracer?
4. Is the scenario-derived subset honestly derived from the cases, and is anything in it unearned?
5. Which probes, if negative, should stop the cut rather than reshape it?
