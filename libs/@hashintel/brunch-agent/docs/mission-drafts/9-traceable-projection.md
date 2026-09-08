# Draft Mission 9 — Repeatable projection breadth over the accepted lineage seam

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

Recut on 2026-09-04. The construction half of the former Mission 9 (schema-carrier repair, the first real nested mutation, one meaningful region built by the model, stable ids, and the positive why over a generated element) moved into the consolidated [Mission 7](7-explainable-construction.md), because the owner chose fully connected parts over thin tracers and because the provenance design showed that lineage only exists when the model actually constructs. This draft keeps what "repeatable" first makes load-bearing: unchanged repeat, changed input, deletion and retirement, concurrent user change, cross-conversation document access, broader schema classes, and the per-action versus batch decision if Mission 7 has not settled it. The reasoning is recorded in the [decision log](../evidence/design/provenance-and-tooling-decision-log-2026-09-04.md) entries F12 and G16 and the [follow-up review](../evidence/design/provenance-by-lineage-follow-up-review-2026-09-04.md) items 16 and 18.

## Cold-start reads

- [FE-1438](https://linear.app/hash/issue/FE-1438/project-an-evidence-backed-workpiece-into-a-traceable-live-sdcpn) — tracker projection for this future branch mission; the eventual branch `MISSION.md` remains execution authority. Its description predates the 2026-09-04 recut and must be re-titled to breadth and repeat behaviour with owner approval before the cut.

A fresh builder must resolve these authorities and evidence before choosing a mechanism:

- [`../../MISSION.md`](../../MISSION.md) — the current branch's live authority. Mission 9 may be cut only after Mission 7 validly closes its construction-and-explanation stratum and a new owner-authorized mission replaces the then-current branch authority.
- [`../../MISSION.next.md`](../../MISSION.next.md) — compact future spine, FE-1476 floor, cross-mission obligations, standing locks, the 2026-09-04 planning migration matrix, and the current Mission 10 handoff.
- [`7-explainable-construction.md`](7-explainable-construction.md) — the consolidated predecessor at cut-level detail: settled-revision protocol, declared basis, transition record, identity epochs, passage policy, document reconciliation, recorded roles, scenario-selected tool admission, and its readiness gate. At cut time replace this draft pointer with Mission 7's accepted archive and close evidence, and consume the actual seam it shipped.
- [`../evidence/design/provenance-by-lineage-mini-spec-2026-09-04.md`](../evidence/design/provenance-by-lineage-mini-spec-2026-09-04.md) and the two reviews beside it — the design rationale, the four contracts, the probe decision tables, and the rejected alternatives. Design evidence, not authority.
- [`../mission-archive/3-structurally-typed-runbook-to-headless-pn.md`](../mission-archive/3-structurally-typed-runbook-to-headless-pn.md) and [`../evidence/implementations/fe-1525-headless-runbook-pn.md`](../evidence/implementations/fe-1525-headless-runbook-pn.md) — accepted workpiece leg, canonical callback fixture, the provider-visible nested-schema failure that Mission 7 now retires, and the vacuous empty-net warning.
- [`../specs/petrinaut-batched-construction-tools.md`](../specs/petrinaut-batched-construction-tools.md) — candidate `pn_read`/`pn_edit` design input and its corrected transaction, outcome, identity, carrier, and ownership constraints. It does not select batching. Mission 7 repairs the single-action carrier; this mission admits a batch only if the probes below establish it as the least sufficient mechanism for repeat and changed-input projection.
- [`../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts), [`../../packages/plugin-sdcpn/src/flue.ts`](../../packages/plugin-sdcpn/src/flue.ts), and [`../../packages/plugin-sdcpn/test/construction-tools.test.ts`](../../packages/plugin-sdcpn/test/construction-tools.test.ts) — the tool factory, mounting seams, and alignment guards as Mission 7 leaves them.
- [`../../../petrinaut-core/src/ai.ts`](../../../petrinaut-core/src/ai.ts), [`../../../petrinaut-core/src/action-schemas.ts`](../../../petrinaut-core/src/action-schemas.ts), [`../../../petrinaut-core/src/schemas/entity-schemas.ts`](../../../petrinaut-core/src/schemas/entity-schemas.ts), and [`../../../petrinaut-core/src/ai.test.ts`](../../../petrinaut-core/src/ai.test.ts) — canonical Petrinaut AI schemas, mutation callbacks, ids, nested types, and JSON Schema evidence. These are the authority; Brunch prose or copied field catalogs are not.
- [`../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`](../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx) and its test — current `useChat` / `onToolCall`, canonical input parsing, mutation execution, and visible failure surface.
- [`../../packages/transport-aisdk/src/client-tool-history.ts`](../../packages/transport-aisdk/src/client-tool-history.ts) and the Mission 7 transition-record contract — how browser results are correlated and deduplicated by call id.
- [`../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md), [`templates/workpiece.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md), and [`references/pn-construction.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/pn-construction.md) — construction posture as Mission 7 leaves it.
- [`../reference/architecture/flue-routing.md`](../reference/architecture/flue-routing.md) — the per-conversation versus cross-conversation state distinction that governs the document-scoped owner this mission may need.
- Commit `157730cc5a214dd9c543e8d95c7193a219c48aef` on `ln/fe-1569-brunch-agent-deployment`, especially `libs/@hashintel/brunch-agent/docs/evidence/implementations/mission-8-deployment-handoff.md` — the locally verified application contract and the still-open infrastructure handoff. Mission 9 names local posture unless a Mission 8 successor has landed.
- [`../../../petrinaut/docs/ai-assistant.md`](../../../petrinaut/docs/ai-assistant.md) and [`drawing-a-net.md`](../../../petrinaut/docs/drawing-a-net.md) — user-visible projection behaviour must update the user guide and prompt screenshot replacement.

The accepted Mission 7 region, proving scenario, transition-record shape, and passage policy are not yet canonical paths. Name them from accepted predecessor evidence when this draft is cut.

## Visible product advance

**Release note:** ask Brunch to model the next part of the process and the net grows without disturbing what was already built; ask again and nothing duplicates.

**Demo script (no engineer present):** open the Mission 7 demo conversation and its net in the Petrinaut Brunch panel, on the deployment posture named at cut time. Ask Brunch to model the part of the process the workpiece already describes but the net does not yet contain. Watch a non-empty region appear that a person who knows the process recognises. Ask the same thing again and confirm nothing duplicated or moved. Change one fact in the workpiece through the conversation, ask Brunch to bring the net up to date, and confirm only the affected elements changed while every other id and shape stayed put. Ask why about one generated element after the change and get the current-state answer, not the original one.

**Previously impossible:** Mission 7 proves Brunch can build and explain one region once. Nothing yet shows that doing it again is safe, that a changed workpiece yields a bounded change, or that removed meaning retires elements honestly.

Repeat, changed-input, and retirement behaviour are the visible advance. Provider-schema classes beyond Mission 7's proving scenario, the per-action versus batch decision, and the document-scoped lineage owner are internal sequencing recorded under the throughline hypothesis; they are not the advance.

**Completion:** the mission is done when a product manager can run the demo script at the readiness gate below, not when the first unchanged repeat is idempotent.

## Contract stratum

Close the **repeatable projection stratum over the accepted Mission 7 lineage seam for the same document incarnation**: unchanged repeat, changed input, deletion and retirement, concurrent user change, and the schema classes the extended region requires.

The bounded stratum includes:

- unchanged repeat against current net state: no duplicate elements, no id churn, no unrelated mutation, attempt history only;
- changed input: identity-preserving change for touched elements, stable ids and definitions for untouched ones, an explicit impact boundary, and a visible reason where widening is legitimate;
- deletion and retirement: identity epochs closed rather than ids reused; retired elements keep origin and change history and answer why with a retired disposition;
- concurrent or hand change during projection: stale-base refusal per the Mission 7 transition record, external-import semantics, and never a silent overwrite;
- cross-conversation document access, if the proving scenario needs it: a document-scoped durable owner for shared current-workpiece and lineage indexes, replacing Mission 7's one-conversation-one-incarnation binding with its own identity and authorization rule;
- every canonical schema and mutation class the extended region uses, admitted per the scenario-selected rule with canonically derived schemas;
- the per-action versus bounded-batch decision, only if Mission 7 left it open and repeat or changed-input projection exposes a measurable need;
- basis and transition records for every generated, changed, and retired element, and the current-state why answer over them.

Stratum closure is over the named extended region, accepted peer set, and mutation classes actually used, not all Petrinaut tools or the full optimisation handoff. Mission 10 owns reviewer authority; Mission 11 owns broadening to its accepted handoff scenario.

## Boundary crossings and current throughline hypothesis

```text
accepted Mission 7 conversation, settled workpiece revisions, transition records, identity epochs
  → person asks, in the Petrinaut Brunch panel, to model the next region or bring the net up to date
  → Mission 5 browser Flue transport dispatches to the ChatAgent
  → agent reads the current workpiece revision from state, the live document through getLatestNetDefinition, and its own lineage through the why lookups
  → agent emits a projection plan: intended effects per element with basis locators, stable caller-supplied ids, and expected base hash
  → each mutation request cites the settled revision and carries declared basis; the turn terminates on browser tools
  → Petrinaut panel validates against the observed pre-apply hash, executes canonical mutations, returns transition records
  → agent reconciles effects against the plan; unanticipated effects become basis-absent; stale outcomes refuse
  → repeat: the plan finds every intended effect already present and records attempt history only
  → changed input: the plan names touched elements, untouched elements, retirements, and any widening, and applies only that
  → why over a generated, changed, or retired element resolves through current-state semantics
```

Actor and authority crossings:

- **Workpiece to projector:** semantic interpretation occurs here and is recorded as declared basis; the transcript is not primary input.
- **Projector to identity:** stable caller-supplied ids and identity epochs are load-bearing; a retired id is never reused.
- **Petrinaut Zod to provider schema:** Mission 7's repaired carrier; this mission adds classes, never a copy.
- **Browser to record:** the transition record is the only admissible statement of what happened; the plan is not.
- **Conversation to document:** if a second conversation or principal reaches the same document, the document-scoped owner arbitrates; otherwise Mission 7's binding stands and cross-conversation access refuses.

Internal sequencing hypothesis: first the unchanged repeat against the Mission 7 net, because it is the cheapest discriminator of duplicate and churn behaviour; then one changed input with an expected impact set frozen in advance; then one retirement; then, only if the extended region needs it, additional schema classes and the batch comparison from the batched-tools spec (bounded core transaction probe, then five-action production-path comparison against per-action tools).

## Throughline proof floor

The smallest deployed end-to-end proof must observe all of the following on the accepted Mission 7 conversation and document:

1. An unchanged repeat request produces no canonical change, no duplicate element, no id churn, and one attempt-history record per intended effect.
2. One changed input produces a bounded canonical change whose applied effects equal the frozen expected impact set, with every untouched id and definition unchanged.
3. One retirement closes an identity epoch, leaves origin and change history queryable, and returns a retired disposition on why.
4. Why over one generated, one changed, and one retired element resolves through current-state semantics without fixture translation.

This floor is the first internal milestone, not completion. It does not close concurrent change, cross-conversation access, broader schema classes, the batch decision, or the accepted peer set.

## Readiness ratchet

```text
Mission 7 construction-and-explanation stratum closed on one conversation and document
→ inherited: settled-revision protocol, declared basis, transition record, identity epochs, passage policy, reconciliation, recorded roles
→ unchanged repeat → changed input → retirement → current-state why
→ readiness gate
├─ close concurrent change, cross-conversation access, schema-class breadth, batch decision, peer set
├─ admit a stable region identity, impact-boundary semantics, and one selected correction into Mission 10
└─ leave reviewer authority, observer consolidation, full handoff breadth, and optimisation unearned
```

### Inherited stratum closure

Mission 9 requires accepted evidence, not draft promises, for everything Mission 7 closed: the settled-revision protocol; declared operation-level basis with intended-effect mapping; the independently verifiable transition record; identity epochs; passage identity policy; live-document reconciliation; recorded roles; the one-conversation-one-incarnation binding; the scenario-selected tool set with a repaired carrier; the compaction posture and fixture materialization route; the safety and utility gates. If Mission 7 shipped a different representation, consume that actual contract or return here for re-cutting. Automatic repetition cannot turn a provisional line into a dependable base by using it.

### Readiness gate after the new throughline

For the extended region, enumerate and close:

- unchanged repeat under duplicate delivery, retry, and reload;
- changed input for each accepted change class: added meaning, changed meaning, removed meaning, and legitimate widening;
- retirement semantics, including elements referenced by executable code, scenarios, or metrics;
- concurrent user mutation and hand edit during projection: stale-base refusal, external import, and no silent overwrite;
- cross-conversation and second-principal access to the same document, or an explicit refusal and its owner;
- every canonical schema and mutation class used by the extended region, including nested arrays and objects, optional and null fields, runtime-only refinements, and actions that can no-op without throwing;
- provider-schema rejection versus canonical per-step rejection, repair budget, timeout, abort, and partial sequence failure;
- if batching is selected: supported handle scope, rollback contract, readonly and disabled-extension parity, per-step outcomes, and state postconditions;
- unsupported consequential defaults and every assumption, inference, omission, or construction-opened loss;
- semantic correspondence of the extended region, with the behavioural discriminator carried from Mission 7 rerun after each change;
- visible partial failure and recovery without duplicate state;
- path isolation from the stock assistant and unrelated regions;
- latency, usage, compaction, and replacement behaviour where the real path crosses them.

Mission 10 may inherit: one accepted region identity and current revision; one generated neighbourhood with stable unrelated ids; the impact-boundary semantics; one selected operational distinction whose correction has observable but bounded consequences; and change-account semantics able to represent retained, changed, added, retired, unsupported, external, and widened dispositions. **Owner:** Mission 10. **Re-entry gate:** an explicitly authorized reviewer supplies new evidence in 3–5 focused turns, a foreground phase-boundary synthesis creates an inspectable revision citing reviewer message ids, and the same projector applies a scoped patch or explicit refusal without unrelated churn. **Oracle:** Mission 10's deployed correction, qualification, coexistence, conflict matrix and stable-unrelated-id check.

Do not defer repeat idempotence, changed-input identity, retirement, or concurrent-change refusal to Mission 10: Mission 9's repeatable claim already depends on them.

## Candidate evidence and oracles

| Claim leaf | Existing evidence or candidate oracle |
| --- | --- |
| Canonical callbacks build a non-empty parser-accepted fixture | Existing `apps/brunch-agent/test/headless-petrinaut-client.test.ts`, test `constructs a parser-accepted document through the bounded callbacks`. Inner headless evidence only. |
| Petrinaut tool metadata aligns with canonical schemas; callbacks validate before applying | Existing `libs/@hashintel/petrinaut-core/src/ai.test.ts`, suite `Petrinaut AI core exports`. |
| Repaired carrier admits nested inputs; scenario-selected classes are mounted | Mission 7 close evidence; cite its exact tests at cut time. |
| Transition records are independently verifiable; duplicates resolve to unknown | Mission 7 close evidence; cite at cut time. |
| Unchanged repeat is idempotent | **ORACLE GAP:** bind to exact before/after canonical definitions, the transition-record log showing attempt history only, and a stable-id assertion when implemented. |
| Changed input yields bounded identity-preserving change | **ORACLE GAP:** freeze the expected impact set before the run; compare applied effects, untouched ids, and definitions. |
| Retirement closes an epoch and answers why | **ORACLE GAP:** bind to an epoch ledger assertion and a why answer with retired disposition. |
| Concurrent or hand change refuses rather than overwrites | **ORACLE GAP:** inject a hand edit between plan and apply and assert stale refusal plus external-import disposition. |
| Cross-conversation access is arbitrated or refused | **ORACLE GAP:** decide at cut time whether the proving scenario needs it; if so, bind a second-conversation probe to the document-scoped owner. |
| A bounded batch improves repeat or changed-input projection | **ORACLE GAP:** follow the three probes in `docs/specs/petrinaut-batched-construction-tools.md`; batch selection requires rollback, readonly and extension parity, indexed failure, no-op honesty, supported-handle scope, production client routing, and material measured benefit. |
| Semantic correspondence of the extended region | **ORACLE GAP:** workpiece-specific human adjudication plus the Mission 7 behavioural discriminator rerun after each change. |
| Mission 10-ready correction | **ORACLE GAP:** choose with the owner after the extended region exists; record expected retained and changed ids and behaviour before Mission 10 is cut. |

## Verification approach

- **Inner mechanism:** projection-plan construction from workpiece revision and live definition; intended-effect to basis mapping; stable id planning; epoch ledger; reconciliation of transition records against the plan; no basis for unanticipated effects; no state advance on rejected or no-op calls.
- **Middle integration:** drive the built Brunch application through the Mission 5 transport into a real Petrinaut instance on the Mission 7 conversation. Run unchanged repeat, one changed input, one retirement, a duplicate delivery, a stale-base attempt, and a hand edit between plan and apply. Inspect canonical state, transition records, epochs, and why answers.
- **Outer deployed and user-visible:** a human runs the demo script in the panel and witnesses no duplication, a bounded change, an honest retirement, and a current-state why. Stock mode remains independent. Mission 9 owns this evidence.
- **Semantic and behavioural:** compare the extended region with the workpiece meaning, and rerun the Mission 7 behavioural discriminator after each change.
- **Failure:** provider-schema error, canonical rejection, client callback failure, stale state, repair exhaustion, and partial sequence failure remain visible and never produce false success.
- **Mechanism decision:** only after repeat and changed input work per action, compare the bounded batch through the production client path and keep per-action tools unless the batch earns its core and host contracts.

## Inputs and joins

- **Mission 7 join:** the accepted conversation, settled revisions, transition records, epochs, passage policy, tool set, compaction posture, fixture route, and gates. Draft promises are not join evidence.
- **Petrinaut canonical-contract join:** consume `petrinautAiTools`, `mutationActionInputSchemas`, entity schemas, and writable callbacks by import or mechanical generation. Mismatches route upstream. The batched-tools design is candidate input: Petrinaut core may own a generic subset-derived schema and first-class transaction operation; Brunch retains selection, Flue carriage, client routing, and identity.
- **Flue join:** the repaired carrier from Mission 7; a new upstream requirement if a class cannot be carried.
- **Host join:** preserve `useChat` / `onToolCall` and client-tool result resumption; mutation execution remains browser and Petrinaut owned.
- **Scenario join:** the owner selects the extended region, expected impact sets, accepted change classes, and one Mission 10 correction.
- **Mission 10 output join:** region identity, impact boundary, change-account semantics, and the selected correction with expected consequences.
- **Mission 11 horizon:** record the omissions needed to broaden from this region to the accepted handoff; do not implement that breadth here.

## Risks and assumptions

| Risk or assumption | Impact if false | Cheapest discriminating validation |
| --- | --- | --- |
| A projection plan can find already-present intended effects without re-mutating | Repeat duplicates or churns | Run unchanged repeat against the Mission 7 net and inspect the transition log for attempt history only. |
| Stable caller-supplied ids plus epochs are enough for changed-input locality | Ids churn, stale edits land, or retired ids are reused | Frozen expected impact set; before/after id inventory; retire one element and attempt to reuse its id. |
| Mission 7's one-conversation-one-incarnation binding is sufficient for the proving scenario | A second conversation or principal reaches the document with no arbiter | Decide at cut time; if needed, place a document-scoped owner behind the existing storage boundary and probe two conversations. |
| A first-class bounded batch improves repeat or change without weakening canonical behaviour | Atomicity is handle-specific, no-ops look successful, coarse feedback increases retries | Compare sequential and batch results under readonly and disabled extensions with injected duplicate, missing, and invalid late steps, then the production client path. |
| The projector can consume the region plus named dependencies rather than the full workpiece | Locality and later revision become unreliable | Withhold unrelated workpiece sections and observe whether the plan remains sufficient. |
| Desired-region recomputation with bounded applied diff satisfies locality | Hidden global dependence causes churn | Compare accessed inputs, proposed diff, and applied mutations; the owner decides whether applied locality suffices. |
| Retirement can be represented without breaking executable references | Removing meaning breaks scenarios, metrics, or code | Retire an element referenced by a scenario and observe the canonical outcome and why answer. |
| Parser plus visual inspection plus the discriminator are enough for the extended region | Semantically wrong dynamics look plausible | Rerun the Mission 7 discriminator after each change; promote a second discriminator only if it catches a plausible wrong projection. |

## Accepted constraints and guarded invariants

- **Petrinaut owns canonical schemas and mutations.** Guard: imports or mechanical generation and structural alignment tests. A generic batch, if earned, is a first-class Petrinaut operation with explicit supported-handle, readonly, extension, rollback, and outcome semantics; Brunch does not reach through an instance to `handle.change`.
- **The transition record is the only statement of effect.** Guard: no basis, epoch, or why state advances from a plan or a self-reported effect set that fails diff accounting.
- **Identity epochs are never reused.** Guard: epoch ledger assertion on retire and recreate.
- **Repeat is idempotent; change is bounded; widening is declared.** Guard: attempt-history-only repeat log; frozen impact set; visible widening reason.
- **Workpiece is semantic input; captures and transcript are not.** Guard: projector input manifest names the settled revision; declared basis on every request.
- **No unsupported consequential defaults.** Guard: expected semantic account and assumption, default, loss inspection.
- **No observer or automatic workpiece revision.** Mission 9 projects the current accepted revision; it does not consolidate evidence or decide reviewer authority. Guard: no scheduler, fold queue, or canonical workpiece writes outside `update_workpiece` called by the foreground agent.
- **One agent, one mounted job skill, existing panel door.** Guard: composition and dependency inventory.
- **Stock assistant remains independent.** Guard: path isolation and host witness.
- **Deployment claims match observed evidence.** Guard: name local posture unless a Mission 8 successor has landed.
- **Paid provider evidence requires cut-time authorization and a stated budget.** Guard: the live mission records model, maximum calls, and spend ceiling before execution.

## Cross-cutting obligations

- Projection fidelity, evidence provenance, and workpiece sufficiency as stated in the spine's cross-mission obligations, over generated, changed, and retired elements.
- Identity and change-account integrity: repeat and change preserve unrelated identities and explain all necessary widening.
- Failure visibility across provider schema, canonical rejection, unsupported meaning, stale state, hand edit, client callback, and partial failure.
- Interaction quality: projection and why in operational language; construction vocabulary does not take over reviewer interaction.
- Runtime migration matrix continued from Mission 7 for any representation this mission changes, with a removal gate.
- User docs: request, visible generated result, repeat and change behaviour, retirement, failure states; prompt replacement of stale screenshots.
- Mission 10 readiness: one selected correction and trustworthy impact-boundary semantics, not a generic revision platform.
- Mission 11 horizon: retained omissions and breadth gaps.

## Expected touched paths

Tentative only; Mission 7's accepted seam may shrink or redirect this manifest.

```text
libs/@hashintel/brunch-agent/
├── MISSION.md                                                        ~ cut-time authority only
├── docs/evidence/                                                    + repeat/change/retirement witnesses and adjudication
├── packages/plugin-sdcpn/src/tools/                                  ~ additional scenario-selected classes; projection plan if plugin-owned
├── packages/plugin-sdcpn/src/skills/sdcpn-modelling/                 ~ repeat/change/retirement posture
├── packages/plugin-sdcpn/test/                                       ~ alignment and plan guards
├── packages/core/                                                    ~ epoch and change-account semantics if core-owned
└── packages/binding-flue/                                            ? document-scoped owner only if cross-conversation access is admitted

apps/brunch-agent/
├── src/agents/chat-agent/                                            ~ compose the projection capability
└── test/                                                             ~ repeat, change, retirement, stale, hand-edit integration

libs/@hashintel/petrinaut-core/
├── src/ai.ts, src/instance.ts, src/handle/                           ? subset batch schema and first-class transaction only if the batch probe earns it
└── src/*.test.ts                                                     ~ canonical, transaction, readonly/extensions, no-op guards

libs/@hashintel/petrinaut/
├── src/ui/views/Editor/panels/ai-assistant-panel*                    ~ generic host execution and visible failure only if needed
└── docs/                                                             ~ affected user-facing guidance
```

Do not add a hand-copied Brunch schema catalog, graph database, generalized projection framework, automatic observer, capture fold, workflow engine, second agent or server, or full stock-modeller parity.

## Fog-line

- The extended region, its accepted change classes, and the peer set; the broader demo portfolio remains unenumerated.
- Whether the proving scenario needs cross-conversation document access and therefore a document-scoped owner.
- How retirement interacts with executable references in scenarios, metrics, and code.
- Whether repaired per-action tools or a bounded batch are the least sufficient surface after measured schema cost, calls, latency, correction behaviour, and failure visibility.
- If batching is selected, which handles support rollback, how silent canonical no-ops are reported, and whether one history checkpoint is acceptable in the stock editor.
- Repair budget, provider-envelope versus canonical per-step feedback, timeout, and partial-sequence policy for multi-element plans.
- Whether desired-region recomputation with a bounded applied diff satisfies the owner or genuinely local computation is required.
- The selected Mission 10 correction and what counts as a sufficiently local patch when connected semantics legitimately widen impact.
- Representative deployed latency, usage, and compaction behaviour for longer conversations.

## Stop or reorient

Stop and surface evidence if:

- Mission 7's accepted seam is unavailable or repeat and change require a fixture-specific translation;
- canonical Petrinaut field shapes are manually copied into Brunch;
- a class cannot be carried through the repaired carrier; record the upstream blocker rather than extending an opaque carrier;
- batching is implemented before per-action repeat and change are proved, or selected without transaction scope, parity, honest no-ops, production routing, and measured advantage;
- repeated unchanged projection duplicates elements, churns ids, or mutates unrelated state;
- changed input triggers unrelated regeneration without a visible impact boundary and reason;
- a retired id is reused or a retired element loses its history;
- a hand edit or concurrent change is overwritten rather than refused and imported;
- rejected or failed calls acquire basis or advance epochs, or partial state is represented as complete;
- semantic correspondence cannot be distinguished from attractive canvas output;
- the region expands toward a complete net or all Petrinaut tools without an accepted consumer;
- an observer, automatic evidence fold, reviewer-authority mechanism, or generic revision platform enters to prepare Mission 10;
- Brunch-specific logic enters Petrinaut's published library;
- stock assistant behaviour or separate history becomes dependent on Brunch; or
- deployment, owner binding, or replacement durability is claimed without real-boundary evidence.

## Carried evidence and rejected alternatives

- Mission 3 proved canonical Petrinaut callbacks can construct a non-empty fixture through `getLatestNetDefinition`, `addType`, `addParameter`, `addPlace`, `addTransition`, and `addArc`, and proved runtime rejection of a zero-weight arc with correction in the faux path.
- The paid Mission 3 model run falsified the provider-visible Valibot `looseObject({})` + `rawTransform` carrier: nine `addType.elements` arrays arrived as strings, all correctly rejected, and the parser accepted only an empty legacy document. Preserve the 0-for-9 result. Mission 7 now owns the repair; this mission consumes it.
- The next accepted move from that evidence was Flue support for Standard Schema or supplied JSON Schema, or a mechanical shape-preserving conversion. Extending the open-object carrier or copying Petrinaut fields into Valibot remains rejected.
- Petrinaut's canonical Zod schemas, action schemas, AI tool bundle, and mutation callbacks are current authority; file-format and action-schema families are aligned by source and tests, not guaranteed by Brunch.
- The former Mission 7 "honest prebuilt pair" with a hand-authored derivation fixture was rejected on 2026-09-04 as useless; provenance now comes from constructor-declared basis and recorded transitions on a genuine conversation, so this mission's why join is to Mission 7's real seam, not to a prepared translation.
- A comprehensive requirements graph, process-domain ontology, universal subject/predicate/value model, closed kinds and slots, typed completion algebra, deterministic capture-to-model fold, and full regeneration engine remain rejected; they re-enter only under repeated observed inability of workpiece prose plus declared basis to support projection or readiness.
- Optional SDCPN mapping hints remain advisory and absent by default; they may re-enter only if projection repeatedly misses consequential structures and a hint demonstrably helps without biasing meaning, and they never copy Petrinaut payload fields.
- Stable caller-supplied ids plus identity epochs remain the least identity hypothesis; a stronger identity ledger re-enters only if repeat or change demonstrates unavoidable churn or ambiguity.
- Full desired-net recomputation with bounded applied diff remains fog, not accepted architecture; unrelated churn or hidden global dependence rejects it.
- Broad stock-modeller tool parity is rejected; admission is scenario-selected with canonically derived schemas and expands on observed need.
- `pn_read` / `pn_edit` are candidate model-facing names, not accepted architecture; reuse `getLatestNetDefinition` unless an alias earns its routing cost; retain per-action tools unless a bounded batch earns its transaction and host surface.
- An inferential observer remains absent; Mission 10's default revision mechanism is foreground phase-boundary synthesis.
- Mission 11 owns broadening to the accepted full optimisation handoff scenario; Mission 9 must not stop automatically after one repeat, but neither may it expand without the named region, peer set, and oracle.
