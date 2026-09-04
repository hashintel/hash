# Provenance by lineage — mini spec for review, 2026-09-04

> Design evidence, not execution authority. This document projects the [decision log of 2026-09-04](provenance-and-tooling-decision-log-2026-09-04.md) into one reviewable statement of intent, design, and consequences for the Brunch mission spine. It is written for an independent reviewer who has not seen the originating conversation. Entry references such as C4 point into the log. Nothing here may be implemented until it is re-evaluated and cut into a live `MISSION.md`; the intended vehicle is the Mission 7 cut.

## 1. Intent

Brunch must be able to say, for any consequential element of a Petri net it helped build, where that element came from: the workpiece passage that motivated it, the revision that introduced the passage, and the conversation turns behind that revision, or an honest refusal. It must do this without a comprehensive typed domain model, without a second conversation log, and without anyone hand-authoring links.

Two earlier approaches failed in opposite directions. A comprehensive typed intermediate representation tried to make provenance a property of the domain model; the typology receded as it grew and the model worked worse with it. The structural Markdown workpiece that replaced it is legible and cheap but has no seam to either the conversation or the net, and provenance was deferred as "later" without the tension being named in the planning record (B3).

The resolving observation: provenance is not a domain fact. It is who changed what, in response to what, when. Three actors know a link at the moment it is created, and each moment is already recorded in Flue's append-only canonical log once the artifacts they produce are tool calls (C1).

## 2. The lineage model

```text
turn N: user says X                                  (user message, turnId T)
  └─ assistant response                              (assistant message, turnId T)
       ├─ text
       ├─ tool call  update_workpiece { markdown }   revision R, identity = call id
       ├─ tool result { revision, sha256 }
       ├─ tool call  addArc { ... }                  net mutation, same turnId
       └─ tool result { ..., documentSha256 }        net revision, same turnId
  state_write  workpiece = { callId, sha256, revision }   same batch, same durability
```

Resolution walks backwards from an element and is a point at every hop but the last:

```text
element id
  → mutation call that created it, and calls that changed it     point(s)
  → latest update_workpiece at or before that call                point
  → the passage in that revision                                  point
  → blame: the revision that introduced the passage               point
  → user turns between that revision and the previous one        RANGE
        └─ narrowed to one line where the passage quotes the expert verbatim
```

The honest why answer is therefore: one creating call, one workpiece passage, one introducing revision, and then either a quoted line or a short turn range (C2). The range is where workpiece cadence is coarser than turn cadence. Elements changed several times report introducing and last-changing calls separately. Every hop is a lookup in the canonical log; nothing is stored elsewhere and nothing is inferred.

What the model does: it calls the tools and interprets structured ranges in prose. What it may not do: author a link, reread the transcript as provenance, or explain an element the tools mark unsupported (C3).

## 3. Mechanisms

### 3.1 `update_workpiece` (core, server-side) — C4

| Aspect | Decision |
| --- | --- |
| Input | one Markdown string, the full current workpiece |
| Run | validate non-empty and well-formed; SHA-256; `usePersistentState('workpiece', { callId, sha256, revision })`; return `{ revision, sha256 }` |
| Durability | `durable: true`, so an interrupted call replays rather than settling unknown |
| Ownership | core owns the tool because the mechanism is formalism-independent; plugins own the template |
| Replaces | the fenced `runbook-ir` block in assistant text; the prepared-signal route stays for test-authored revision zero |

Why a tool rather than a fenced block: the revision identity is a call id instead of a regex over prose; the tool can refuse a truncated document; the next render reads the current pointer without the model echoing it; mutations and revisions share `turnId`; the UI can project the part into its own pane. Costs acknowledged: the full document still crosses the wire each revision, and a model may call a tool less readily than it emits text. A structured-patch input is the later absorber for token cost; cadence must be measured for either shape (B6).

### 3.2 `query_workpiece` (core) and `locate_elements` (plugin-sdcpn) — C5

`query_workpiece` takes a revision pointer or a passage locator and returns the turn ranges behind it with the user text, plus verbatim-quote matches where the passage quotes. `locate_elements` takes element ids and returns, per id, the mutation calls with their turn ids and document hashes, and the workpiece revision current at each. The split follows knowledge: core knows revisions and history; only the plugin knows which calls are mutations and where ids sit in inputs. Names are provisional.

### 3.3 Net revision identity through the client-tool result — C6

The browser returns the post-mutation document SHA-256 inside each client-tool result. Mission 6 already computes this hash for its settled manifest. A document hash that no tool result explains is reported as "changed outside the conversation." Petrinaut's schema is not extended: elements are strict objects with no metadata slot and the file wrapper carries only `title` and a generator (B7). A file-level provenance pointer in `meta` is deferred until Mission 11 has a consumer for a self-describing export.

### 3.4 The visible workpiece — C7

The chat rendering projects `update_workpiece` parts out of assistant messages and leaves a one-line "workpiece updated" marker. A pane in the Petrinaut Brunch panel shows the current revision, the revision list, and a diff between any two, all derived from Flue history through the Mission 5 transport. The why answer renders into the same pane because it resolves to a passage the reviewer must see. This projection lives in the app or transport layer, not in the Petrinaut library. The pane is the surface every later provenance and revision mission assumes and none has built; it is also the product-manager-visible advance in its own right.

### 3.5 Schema carrier repair — B9, C11

Precondition for admitting any tool beyond the flat ones. Flue accepts Valibot schemas only and rejects other Standard Schema vendors; the construction factory therefore declares an empty loose object and pastes Petrinaut's JSON Schema into the description. Fix by a mechanical JSON Schema to Valibot interpreter covering the subset Petrinaut uses (objects, strings, numbers, enums, arrays, nullable, optional, unions), or by upstream Flue Standard Schema support. The local interpreter is derived rather than hand-copied and is reversible if upstream support arrives.

### 3.6 Tool admission and teaching — C10, C12

Petrinaut's canonical mutation, query, and command tools are admitted to ordinary SDCPN conversations, mechanically from Petrinaut's AI tool bundle, and scoped down only from observed misbehaviour. The inherited six-tool subset is retired as a product surface. The skill gains construction posture: read the definition first, mutate in small steps, check compilation errors, record decisions in Construction notes, call `update_workpiece` before and after construction. Parity with the stock modeller remains a non-goal; the change is the direction of the default.

### 3.7 Subtraction — C8, C9

Retired from code under Mission 7 authority: the `ask` and `sweep` names in core, the suspended ask contract, the website ask interactive tool and test, the sweep filter and output module in the panel transport, and the two Voice references. The capture store and sweep are not consumed by Mission 7; the store re-enters only if answer-time verification strains under compaction or ownership.

## 4. Tool inventory after this design

| Tool | Owner | Executes | Status |
| --- | --- | --- | --- |
| `ping` | app | server | keep, diagnostic |
| `activate_skill` | Flue | server | keep |
| `readPetrinautDoc` | plugin-sdcpn | browser | keep |
| Petrinaut canonical bundle | plugin-sdcpn, derived | browser | admit to ordinary conversation after 3.5 |
| `update_workpiece` | core | server | new |
| `query_workpiece` | core | server | new |
| `locate_elements` | plugin-sdcpn | server | new |
| `ask`, `sweep` client handling | core, website | browser | retire |
| six-tool and two-tool subsets | plugin-sdcpn | browser | retire as product surfaces; Mission 6 fixture mode stays until Mission 6 archives |

## 5. Real honest fixtures — D1 to D5

The provenance pair is a real conversation with a real revisioned workpiece and a real constructed net, produced by persona interviews against the production agent. The Mission 6 prepared fixture remains a viability proof and is not promoted (A3).

```text
persona run (Pi harness, production ChatAgent, real-headless host)
  → Flue store holds the genuine conversation, revisions, mutations
  → harness retains snapshot.json + projections per settled read
  → grade coverage against the hidden oracle ledger afterwards
  → ??? → live fixture the demo opens                       (D3, open)
```

Settled: run several cases in parallel; six cases exist. Recommended: a turn cap larger than the 6–10 used so far as budget, early stop when Brunch itself declares construction handoff or delivery, ledger coverage as the post-hoc grade rather than the stop rule (D4); runs go to construction so the fixture contains lineage, which sequences the carrier fix and tool admission before the construction campaign, with an earlier elicitation-only campaign to measure revision cadence (D5).

Open: how a retained genuine conversation becomes a live fixture in a fresh store. Keeping the dev store as shipped data, restoring genuine records through Flue's storage adapter, and replaying the snapshot as prepared signals each have a named cost in D3; the first probe is whether Flue 2.0.3 tolerates export and restore at its storage boundary.

## 6. What this changes in the mission spine

1. **Name the tension.** The spine states provenance-by-lineage as the current hypothesis, the typed IR and hand-authored derivation as rejected with reasons, revision cadence as the named strain, and the visible workpiece as the precondition (E1).
2. **Re-cut Mission 7.** Body: carrier fix, orphan retirement, `update_workpiece`, workpiece pane, tool admission and teaching, persona programme to construction. Last step: the why route over real lineage. Release note narrowed to the honest framing (C13). Local posture; remote durability to Mission 8 (C14). Capture-store chain and Mission 2 inherited closure dropped (E2).
3. **Adjust Missions 9 and 10.** They inherit the seam from lineage: revision id equals call id, passage identity per the probe in C15, stable element ids, document hash per C6. They no longer assume a derivation fixture or a prebuilt pair (E3).
4. **Mission 6 close report.** Record the fixture-rigging admission, the carried fenced-block-to-tool change, and the credential cause of the blocked witness (E4).
5. **Authority.** Every settled item is an owner decision expressed in conversation. It becomes authority only when written into the cut Mission 7 `MISSION.md`, with Mission 6's construction-tool constraint amended there and not in the Mission 6 tie-off (E5).

## 7. Fog-line

- Revision cadence: whether the model calls `update_workpiece` often enough for blame to have grain; unmeasured (B6).
- Passage identity: heading path, Markdown anchor, or companion manifest; decided by the probe in C15.
- Carrier repair route: local interpreter versus upstream Flue support (3.5).
- Fixture materialization from a genuine conversation (D3).
- Token cost of full-document emission on long interviews, and when a structured patch earns its place.
- Which canonical tools misbehave at the provider boundary once the carrier carries fields; only observed failure scopes admission down.
- Whether the why answer over a real pair is useful to a reviewer, not merely correct; a human judges, per the Mission 7 draft's existing risk row.

## 8. Questions for the independent reviewer

1. Is provenance-by-lineage a sufficient answer to the stated intent, or does it smuggle an assumption the log did not check?
2. Is the tool split in 3.2 the right ownership boundary, or should one tool serve both lookups?
3. Is returning the document hash in the client-tool result an adequate join between net and workpiece revisions, given hand edits in Petrinaut?
4. Does anything in sections 3 and 4 reintroduce a mechanism the spine's rejected-mechanisms list has already refused?
5. Is the persona programme's stop rule and fixture-materialization plan honest about what a "real" fixture is?
6. Which settled items should be re-opened before they enter the Mission 7 authority, and why?
