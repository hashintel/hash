# Mission 6 — resume one prepared workpiece and Petrinaut document

## Status

**Live on `ln/fe-1575-resumable-workpiece-petrinaut` from 2026-09-03.** [FE-1575](https://linear.app/hash/issue/FE-1575/resume-one-brunch-workpiece-and-petrinaut-document-across-tabs) is in progress. This authority cut is committed separately before product or evaluation implementation begins. It was recut on restack the same day to carry the product-manager litmus adopted in [`MISSION.next.md`](MISSION.next.md#current-authority-and-accepted-spine) after the first cut: completion is the readiness gate below, not the first green two-tab pass. The owner subsequently accepted the probe-backed prepared-history semantics under [Accepted fixture and boundary crossings](#accepted-fixture-and-boundary-crossings); that amendment must land separately before dependent implementation.

## Imperative

Determine whether one canonical Brunch conversation can maintain a useful Markdown workpiece and drive a meaningful change to a real Petrinaut document through the browser without reviving a comprehensive typed domain IR.

Mission 3 separately showed a recoverable Markdown workpiece and hermetic canonical Petrinaut callbacks, but its paid model could not carry a nested construction schema and no product path joined the two results. Mission 4 accepted the independent core `elicitation` capability and SDCPN job-skill composition but produced no full-run candidate. This mission must retire the join and resume uncertainty honestly with one deliberately prepared fixture rather than treating either historical result as an integrated product.

### Visible product advance

**Release note:** Brunch edits the Petrinaut net you are looking at from the conversation, and your work survives closing the tab.

**Demo script (no engineer present):** with the local Brunch/Petrinaut development stack running, open the stable demo fixture selector for the labelled prepared crew-reservation case. Its canonical Brunch conversation, current Markdown workpiece, and non-empty Petrinaut net come back together. Tell Brunch the one new realistic fact the fixture is prepared for: final inspection uses the single dispatch crew, and sign-off releases it. Watch the workpiece update and a new arc appear in the live net from `Dispatch crew available` to `Start final inspection`. Save. Open the same fixture in a second tab and continue the conversation from the saved state. The fixture announces out loud that it is test-authored and prepared, and what it does not claim.

**Previously impossible:** Brunch only produced off-canvas net JSON for manual load; nothing it did touched the live document or survived a reload.

**Deployment posture:** the demo runs against the locally run Petrinaut website and Brunch agent (`yarn dev:brunch`). Mission 8 stopped before remote deployment, so no product-manager-noticeable claim here depends on remote infrastructure; remote durability stays with Mission 8.

**Completion:** the mission is done when a product manager can run that demo script end to end for this fixture and every readiness-gate obligation in [Proof](#proof) is closed. The first green pass through the two-tab path is an internal milestone inside the mission, not its completion.

## Throughline

### Observed departure point and first unproved boundary

The production browser already has most local pieces:

- `apps/petrinaut-website`'s local-storage demo owns an editable `PetrinautDocHandle`, writes handle changes to `petrinaut-sdcpn`, maps each net to a persistent Brunch conversation id, and hydrates panel messages from the Brunch history door;
- Petrinaut's stock AI panel already validates and executes canonical read, mutation, and command tools against the active browser document and returns the original tool-call id;
- `apps/brunch-agent` already maps the principal plus conversation id to one Flue conversation, exposes `GET /api/chat?id=…` history, resumes client-tool results as correlated Flue signals, and projects the resulting stream back to the panel; and
- the SDCPN skill already emits a full recoverable `runbook-ir` block and requires construction to consume that workpiece rather than transcript archaeology.

The first unproved boundary is ordinary Brunch conversation → mounted canonical document read / least mutation → browser execution → correlated continuation. Today ordinary SDCPN conversations mount only the Petrinaut documentation reader as a browser tool; the validated construction subset is headless-only, and no stable fixture selector or coherent cross-tab witness joins the conversation, workpiece, and document lifecycles.

### Accepted fixture and boundary crossings

Prepare the existing final-inspection / dispatch-crew case as an explicitly test-authored fixture. Its starting workpiece and non-empty net preserve this narrow account: one crew is reserved during final inspection, sign-off releases it, the batch then becomes dispatch-ready, and timing plus failure/recovery remain unresolved. Its prepared material must identify its authorship and must not be presented as a Mission 4 candidate or model-produced evidence.

Deliver the prepared starting workpiece exactly once through Flue's public dispatch surface as a tagged structured signal. Its canonical record must remain `role: system`, `purpose: dispatch`, carry the fixture id, `test-authored` authorship, and non-claims as signal attributes, and preserve the exact Markdown body. This record is prepared revision zero. Later full `runbook-ir` blocks emitted in genuine assistant responses are model-produced revisions; the workpiece resolver selects the latest eligible revision without rewriting Flue's append-only history. This is analogous to last-one-wins selection of extension-contributed artifacts in a Pi raw session log, not permission to overwrite either log.

The disposable production-route probe established the carrier facts: the tagged signal retained its exact body and attributes, an exact idempotent retry converged on the original submission without adding messages, and the snapshot survived process reopen unchanged. The current `ChatAgent` rejected fixture authorship supplied as `initialData` with `400` and created no history; `initialData` is not a substitute for the public workpiece source. A user delivery would impersonate the person, while faux-provider output, hand-authored assistant records, private canonical record types, direct database writes, and a second history store are not preparation routes. The probe's configured Anthropic credential was rejected with `401`, so its separately classified faux assistant response established no model-behavior claim.

Prepare the net with `Batch ready`, `Under final inspection`, `Ready for dispatch`, and `Dispatch crew available` places plus `Start final inspection` and `Sign-off` transitions. Preserve the batch-flow arcs and the return of the crew from sign-off, but deliberately omit the standard input arc that reserves the sole crew when final inspection starts. Use one realistic confirming answer: final inspection consumes the sole available dispatch crew, sign-off returns it, and timing plus recovery remain unknown. The least candidate mutation is one canonical weight-1 standard input arc from `Dispatch crew available` to `Start final inspection`. The exact before/after edge makes the semantic oracle discriminating while avoiding Mission 3's deeply nested schema failure. If that shallow mutation still cannot cross Flue faithfully, stop with the carrier blocker rather than weakening the claim.

```text
stable prepared-fixture selector
→ resolve distinct fixture, Petrinaut document, and Flue conversation identities
→ open the prepared non-empty browser document and hydrate canonical Flue history
→ recover prepared revision zero from the tagged dispatch record, or the latest eligible assistant revision, by source message id plus content hash
→ submit the realistic crew-reservation confirmation through the production panel door
→ Brunch emits an inspectable full workpiece revision without erasing prior meaning or the remaining unknown
→ SDCPN construction reads that current workpiece and the live browser document
→ Brunch requests the least canonical meaningful mutation
→ Petrinaut validates and executes it against the bound document
→ the original tool-call id and result resume the same Flue conversation
→ inspect the canonical non-empty document and record a settled fixture witness only after conversation/workpiece/document state is observable
→ a second tab opens the same fixture selector, resolves the same identities and settled hashes, and can continue
```

The fixture witness is a small local viability manifest, not a new event log, independent workpiece store, or distributed transaction. It records distinct ids, prepared inputs, latest settled workpiece source/hash, document hash or local revision token, and limitations. A failed history load, workpiece recovery, rejected/no-op mutation, or missing result correlation must not advance that witness; the partial state remains visible for diagnosis. The existing automatic localStorage mirror is the only document-save mechanism unless a real failure proves it insufficient.

### Expected touched paths

This manifest is provisional and may shrink or move when the first real probe exposes the deeper existing boundary:

```text
libs/@hashintel/brunch-agent/
├── MISSION.md                                                   ~ live authority and eventual close evidence
├── MISSION.next.md                                              ~ future joins and carried flags only
├── packages/plugin-sdcpn/                                       ~ mount only the read/mutation capability earned by this tracer
└── docs/evidence/                                                + prepared fixture manifest and browser witness
apps/brunch-agent/
├── src/agents/chat-agent/ and src/conversation/                  ? only if normal client-tool mounting/correlation requires it
└── test/                                                         + real Flue/client-tool fixture integration
apps/petrinaut-website/
└── src/main/app/local-storage-demo/                              ~ fixture selection, prepared seed, settled witness, and cross-tab resume
libs/@hashintel/petrinaut-core/ or libs/@hashintel/petrinaut/      ? only for an observed canonical contract or browser-host defect
```

## Proof

The visible advance is the demo script in the imperative, run by a product manager against the named local posture. The evidence that backs the claim is one stable local demo URL or fixture selector plus its labelled prepared manifest, exact before/after Flue snapshots, recovered Markdown workpiece revisions, canonical Petrinaut document states, and two-tab witness; those are oracles for the builder and adjudicator, not the advance itself. Together they establish single-fixture browser-backed viability. They do **not** establish automatic full-net projection, capture-backed or selected-pair provenance, behavioral execution, broad scenario coverage, remote replacement durability, concurrent editing, Mission 3/4 quality superiority, or a promoted reusable product seed.

### Internal milestone: first green throughline

The first internal milestone is one pass through the throughline for the prepared fixture: a cold reader can reconstruct the spine and distinguish supplied evidence, inference, and the explicit unknown in the workpiece; one realistic turn produces an inspectable workpiece revision without erasing the unknown; Brunch reads the live document and applies the one supported arc through the real browser client-tool boundary; the canonical net is non-empty and visibly corresponds to the confirmed meaning; and a second tab observes the same settled conversation, workpiece, and document revision and continues without duplicate submission or identity drift. Reaching this milestone authorizes the readiness work below; it does not close the mission.

### Readiness gate: completion bar

The mission completes only when the demo script works for this fixture and these obligations are closed: stale fixture/workpiece/document revision refusal, duplicate tool delivery, read/write failure visibility, unsupported meaning, no-op mutation honesty, partial-save behavior, second-tab rehydration, separate identity integrity, and one negative mutation case. Do not close every consequential-element provenance link, remote task replacement, broad scenario coverage, or repeated automatic projection here; those become Mission 7 or Mission 9 obligations only after this tracer exposes a finite peer set and load-bearing seams.

Every final leaf has a discriminating oracle:

1. **The prepared fixture is honest and sufficient for this narrow test.** The committed fixture manifest, raw Flue snapshot, and a cold-reader adjudication identify the prepared workpiece's tagged system/dispatch source, exact test-authored Markdown, process spine, constrained crew, release policy, quantity context, explicit unknown, prepared net meaning, and non-claims. The same inspection distinguishes every later assistant revision as model-produced and must not require transcript archaeology.
2. **One evidence turn maintains the Markdown workpiece.** A production-agent fixture integration mechanically recovers prepared revision zero from the tagged dispatch record, then selects the latest eligible assistant `runbook-ir` block after the confirming turn, retaining each source message id and SHA-256. Before/after adjudication must find the supplied contextual quantity, retained crew/release meaning, retained unsupported context, and no invented fact or hardened unknown.
3. **The real browser executes a correlated Petrinaut read and write.** Focused plugin/transport tests prove that `getLatestNetDefinition` and the selected `addArc` schema come mechanically from Petrinaut's canonical contracts, fixture mode advertises only the selected operations, duplicate result delivery does not apply the mutation twice, rejected input remains visible, and a mutation that would change nothing is reported as a no-op rather than as a change. The browser witness must retain tool name, call id, parsed input, execution output, resumed signal, and resulting canonical definition; a headless callback alone does not pass.
4. **The document change is meaningful rather than merely accepted.** A structural comparison proves there was no standard input arc from `Dispatch crew available` to `Start final inspection` before the turn and exactly one weight-1 arc afterward, while `Sign-off` still returns the crew and the prepared net remains non-empty. The changed workpiece retains the reservation/release meaning and unresolved timing/recovery. Parser/schema acceptance or a disconnected convenience element fails.
5. **The settled witness cannot bless partial state.** A focused failure test injects history/workpiece-recovery failure, rejected `addArc`, or missing/duplicate result correlation and shows that the prior settled manifest remains selected while the failure and any partial state are inspectable. Do not invent a localStorage failure interface solely to satisfy this leaf.
6. **A second tab resumes the same fixture.** With `yarn dev:brunch` running, the recorded browser protocol opens the stable selector in Tab A, performs and settles the turn, then opens it in Tab B. The witness compares fixture id, document id and canonical definition hash, Flue conversation id and history, latest workpiece source/hash, and absence of duplicate submission before one read or continuation succeeds in Tab B. Tab B opened against a stale or mismatched revision must refuse visibly rather than silently select older artifacts.
7. **The cut has not smuggled in the later architecture.** Public-schema and dependency inspection finds only fixture identity/revision links, Markdown recovery metadata, and canonical Petrinaut payloads—no closed process ontology, typed capture-to-workpiece reducer, graph database, second conversation log, or general projection engine.

Verification proceeds inside-out but closure requires the outer boundary:

- **Inner:** fixture parsing and prepared-label checks; identity separation; workpiece recovery/hash; canonical `addArc` schema and exact before/after edge assertion; idempotent client-tool result handling; settled-witness refusal.
- **Middle:** the built production `ChatAgent` and `/api/chat` path hydrate the prepared Flue conversation, accept the evidence turn, recover the revised workpiece, and carry actual browser-tool calls/results. Run the focused workspaces through root Turbo (`test:unit`, `lint:tsc`, `lint:eslint`, and `build` where changed).
- **Outer:** the two-tab `yarn dev:brunch` witness above, with retained before/after artifacts.
- **Semantic:** a cold human accepts fixture/workpiece honesty and the workpiece-to-document correspondence. The oracle may falsify those claims; it may not rewrite the interaction or architecture policy.
- **Product:** a product manager who did not watch the work runs the demo script from the imperative without an engineer and notices the advance. This is the last check before close, after the readiness gate; it is not a substitute for the oracles above.

## Constraints

- Keep fixture id, Flue conversation id, latest workpiece source/revision, and Petrinaut document id/revision distinct and explicitly linked. One id must not impersonate all lifecycles.
- Flue history remains the canonical conversation log. Browser message caches and fixture artifacts are projections or evidence, never a second authority.
- The tagged prepared signal is the only test-authored workpiece source admitted by this fixture. It remains a diagnostic system/dispatch record; latest-revision selection may supersede it with a genuine assistant workpiece but may not mutate, relabel, or hide its authorship.
- Markdown remains the semantic workpiece. Recover its full latest version; do not introduce a comprehensive typed domain IR to make fixture lookup convenient.
- Projection consumes the current workpiece. The transcript may establish provenance and help recover that artifact but may not become the primary construction IR.
- Petrinaut owns canonical schemas, browser validation, mutations, and document state. Brunch imports or mechanically derives those contracts and does not hand-copy their field shapes.
- Client tools execute against the active bound browser document and return the original tool-call id. Stale, duplicate, cross-document, malformed, failed, and no-op outcomes fail visibly.
- Publish a new settled fixture witness only after the claimed Flue snapshot, workpiece revision, and document state can all be inspected. The witness does not make the browser and Flue stores transactional. Do not invent explicit save or cross-store transaction machinery without an observed recovery failure requiring it.
- Preserve the accepted Mission 4 `useBrunchAgent()` plus `useSdcpnPlugin()` architecture. The app composes; the plugin owns SDCPN operation semantics; the transport carries results; the UI executes them.
- Keep construction tools unavailable to unrelated ordinary conversations unless the real path proves the smallest safe selection can be scoped to this fixture/mode. Stock-assistant behavior must remain unchanged when Brunch is absent or unselected.
- The fixture is local and deliberately prepared. Make no remote durability, capture provenance, automatic projection, behavioral execution, or concurrent collaboration claim.
- No HASH Graph, Temporal, Redis, new database, observer, workflow engine, second agent, second event log, or closed workpiece schema.
- Update the affected Petrinaut user guide in the same change if the selector, save/resume behavior, or panel behavior becomes user-facing; add one Petrinaut changeset only if a published Petrinaut package changes.

## Fog-line

- Whether the selected shallow `addArc` schema survives the provider-visible Flue carrier and results in exactly one browser mutation without reopening the broader nested-schema problem.
- The least safe way to expose canonical `getLatestNetDefinition` plus `addArc` in a fixture conversation while retaining the headless-only guard for broader construction.
- Whether the latest `runbook-ir` message id and hash are sufficient workpiece revision identity or the two-tab consumer exposes a need for a separate persisted workpiece artifact.
- Whether Mantine/localStorage synchronization plus the active `PetrinautDocHandle` is sufficient for the same-browser two-tab witness, and which document hash/revision signal best distinguishes settled from stale state.
- Whether the known provider-visible nested-schema failure is absent for the selected flat mutation. Do not generalize one success to nested construction classes.
- Which of history recovery, invalid `addArc`, or duplicate result delivery is the cheapest discriminating failure for the settled-witness rule after the first real path reveals the ordering.

Resolve these at the named production/browser boundaries. Clarifying prose alone does not clear them. If a choice changes the accepted interaction policy, architectural ownership, or proof claim, return it to the owner and amend this authority before implementation continues.

## Stop or reorient

Stop and surface evidence if:

- fixture preparation requires pretending a Mission 4 candidate exists, placing prepared text in a user or assistant record, accepting an untagged preparation signal, or otherwise hiding test-authored/model-authored boundaries;
- the path conflates fixture, conversation, workpiece, and document identities or creates a second canonical conversation history;
- the agent rereads transcript prose as its primary projection input because the current Markdown workpiece cannot carry the needed meaning;
- parser/schema acceptance, document non-emptiness, or a disconnected convenience element is offered as semantic correspondence;
- client-tool results lose their original call id, can target the wrong document, or duplicate execution on retry/reload;
- a partial or failed write advances the settled witness, or second-tab reopening silently selects stale/mismatched artifacts;
- exposing one browser mutation requires mounting an unrestricted construction surface for every ordinary conversation;
- the selected provider/Flue schema cannot faithfully carry the least meaningful mutation—record the crisp blocker rather than hand-copying Petrinaut schemas or widening into Mission 9;
- the tracer needs a closed ontology, typed claim ledger, general projection engine, distributed transaction, or new durable service before a concrete failure demonstrates that need; or
- work widens into capture-backed why/provenance, automatic projection breadth, remote deployment durability, concurrent collaboration, or broad scenario readiness.

## Deferred

Mission 7 still owns capture-backed visible why/provenance and broken-link refusal after this fixture is viable. Mission 9 still owns repeatable automatic projection, broader nested provider-schema classes, stable generated-element derivations, repeated/changed-input behavior, and the breadth of semantic correspondence. Remote replacement durability and release infrastructure remain in the historical Mission 8 handoff. Multi-tab concurrent editing, a durable cross-store commit protocol, explicit localStorage failure injection and refusal of a concurrent write from a tab holding an older revision (distinct from the readiness-gate refusal to reopen onto stale or mismatched artifacts), and promotion of this prepared fixture into a reusable product seed re-enter only if the automatic mirror loses or overwrites state, a later consumer requires atomic bundle identity, or this mission otherwise exposes concrete strain; their current planning home and re-entry conditions remain in [`MISSION.next.md`](MISSION.next.md) and the linked Mission 7/9 drafts.
