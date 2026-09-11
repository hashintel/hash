# Mutation capability matrix

Every canonical Petrinaut AI operation, in both assistant modes: who owns it, whether Brunch's `mutate_petrinet` admits it, whether the stock assistant offers it, where it executes, what test evidence exists, and what the model sees when it is refused. This is the operation-coverage authority Mission 7c's proof floor points at; `MISSION.md` cites it rather than restating it.

The acceptance rule it serves:

> Any ordinary construction or correction request inside the declared capability envelope either succeeds through canonical Petrinaut operations or produces a clear unsupported-operation refusal. It must not crash, stall indefinitely, corrupt the net, silently omit requested meaning, leave hidden partial state, or claim success.

## The two modes

**Canonical owner** of every operation below is Petrinaut Core (`libs/@hashintel/petrinaut-core/src/action-schemas.ts`, exposed as AI tools by `ai.ts`). Neither mode copies a field contract.

| | Stock assistant | Brunch |
| --- | --- | --- |
| Tool surface | Every `petrinautAiTools` entry as an individual tool: all mutation actions, `applyAutoLayout`, `getLatestNetDefinition`, `getNetCompilationErrors`, `setNetTitle`, `readPetrinautDoc` | `getLatestNetDefinition`, `getNetCompilationErrors`, `readPetrinautDoc`, `applyAutoLayout`, and one `mutate_petrinet` batch carrying the admitted operations below |
| Where mutations execute | `@hashintel/petrinaut` panel (`apply-petrinaut-ai-mutation.ts`) directly on the open document | `apps/petrinaut-website/.../mutate-petrinet-tool.ts`, mounted through the panel's `automaticTools`, with per-operation observed pre/post hashes and effects |
| Where reads and layout execute | `@hashintel/petrinaut` panel | `@hashintel/petrinaut` panel; the website attaches `observation` / `layoutRecord` metadata to the result |
| Diagnostics after a mutation | Panel waits up to 1 s for the refresh; on timeout it reports **pending**, never the previous version's diagnostics | Same panel behaviour; Brunch is instructed that a pending read is not a result and must be repeated before any compiler claim |
| Envelope | Whatever the schema admits, including subnets, scenarios, metrics, positions | Root net only: places, transitions, arcs, coloured types and elements, parameters, differential equations. Positions belong to `applyAutoLayout`. |

Stock mode's surface is unchanged by Brunch; the Brunch column is a selection over the same canonical actions, never a replacement of them.

Three schemas must agree on the Brunch-admitted set, and tests hold them in step:

| Layer | Home | Test |
| --- | --- | --- |
| Canonical batch (Petrinaut-owned) | `libs/@hashintel/petrinaut-core/src/selected-mutation-batch.ts` | `selected-mutation-batch.test.ts` |
| Model-facing carrier (plugin-owned, root-only, `basisId` per operation) | `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/mutate-petrinet.ts` | `test/mutate-petrinet.test.ts` |
| Browser executor (website-owned) | `apps/petrinaut-website/src/main/app/local-storage-demo/mutate-petrinet-tool.ts` | `mutate-petrinet-tool.test.ts` |

## How a Brunch operation earns `applied`

The executor reports `applied` only when the plugin's verifier agrees, against the independently observed pre and post definitions:

- **Predicted definition** — the plugin replays the canonical action on the pre observation and requires the post observation to match it exactly (`expectedNodeDefinition`). Used for every node, type, parameter, equation and `removeArc` operation.
- **Single field** — the effect set must be exactly one direct update to the named arc field with the requested value (`updateArcWeight`, `updateArcType`).
- **Single creation** — exactly one created arc equal to the requested arc (`addArc`).

Effects are partitioned into direct (the requested change) and derived (everything else Petrinaut changed as a consequence: arcs removed with a place, a place's `colorId` or `differentialEquationId` cleared with its type or equation). The derived set must account for the complete canonical diff — a record that omits part of a cascade is refused at the receiving boundary — and derived effects never inherit the operation's declared basis.

Stock mode has no equivalent verification: the panel applies the action and reports the action's own summary.

## Matrix

Columns: **Stock** — offered as an individual tool in stock mode. **Brunch** — admitted in `mutate_petrinet`. **Evidence** — the host test that runs the operation through the Brunch executor and verifies its record at the receiving boundary, plus the plugin test that derives its effects; where an operation has referenced dependents, the petrinaut-core test that shows what happens to them. **Refusal** — what happens when the operation cannot be carried in Brunch.

### Root places, transitions and arcs

| Operation | Stock | Brunch | Evidence | Refusal |
| --- | --- | --- | --- | --- |
| `addPlace` | yes | yes | host `executes created-ID dependencies…`; plugin `root-node.test.ts` | — |
| `updatePlace` | yes | yes | host `edits existing parts by ID…`; plugin `root-node.test.ts`; core `renaming a place dirties transition code…` | — |
| `updatePlacePosition` | yes | no | — | schema refusal (below); positions belong to `applyAutoLayout` |
| `removePlace` | yes | yes | host `removes a place, its connected arcs, and a transition`; plugin `mutation-record.test.ts` | — |
| `addTransition` | yes | yes | host `executes created-ID dependencies…`; plugin `root-node.test.ts` | — |
| `updateTransition` | yes | yes | host `edits existing parts by ID…`; plugin `root-node.test.ts` | — |
| `updateTransitionPosition` | yes | no | — | schema refusal; positions belong to `applyAutoLayout` |
| `removeTransition` | yes | yes | host `removes a place, its connected arcs, and a transition` | — |
| `addArc` | yes | yes (root `placeId` endpoint only) | host `executes created-ID dependencies…`; plugin `mutation-record.test.ts` | component-port endpoints refused by the carrier schema |
| `updateArcWeight` | yes | yes | host `edits existing parts by ID…`; plugin `root-arc.test.ts` | — |
| `updateArcType` | yes | yes | host `edits existing parts by ID…`; plugin `mutation-record.test.ts`; core `turning an input arc into an inhibitor…` | — |
| `updateArcPlace` | yes | no | — | schema refusal; re-pointing an arc changes identity, remove and add is the honest record |
| `removeArc` | yes | yes | host `removes one arc without deleting its endpoints`; core `removing an input arc dirties transition code…` | — |

### Types, elements, parameters and equations

| Operation | Stock | Brunch | Evidence | Refusal |
| --- | --- | --- | --- | --- |
| `addType` | yes | yes | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` | — |
| `updateType` | yes | yes | host `edits existing parts by ID…`; plugin `root-state.test.ts` | — |
| `removeType` | yes | yes | host `removes net-level state by ID…`; plugin `a referenced removal accounts for every canonical cascade…` (uncolours places and equations); core `removing a referenced type…` (readers of its tokens go dirty) and `unused … removals stay compiler-clean` | — |
| `addTypeElement` | yes | yes | host `edits existing parts by ID…`; plugin `root-state.test.ts` | — |
| `updateTypeElement` | yes | yes | host `edits existing parts by ID…`; plugin `root-state.test.ts`; core `renaming a token element dirties…` | — |
| `removeTypeElement` | yes | yes | host `removes net-level state by ID…`; plugin `mutation-record.test.ts`; core `removing a referenced token element dirties every reader` and `unused … stay compiler-clean` | — |
| `moveTypeElement` | yes | no | — | schema refusal; element order only matters to scenario rows |
| `addParameter` | yes | yes | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` | — |
| `updateParameter` | yes | yes | host `edits existing parts by ID…`; plugin `mutation-record.test.ts`; core `renaming a parameter variable dirties…` | — |
| `removeParameter` | yes | yes | host `removes net-level state by ID…`; plugin `mutation-record.test.ts`; core `removing a referenced parameter dirties the dynamics…` and `unused … stay compiler-clean` | — |
| `addDifferentialEquation` | yes | yes | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` | — |
| `updateDifferentialEquation` | yes | yes | host `applies invalid dynamics…`; plugin `mutation-record.test.ts` | — |
| `removeDifferentialEquation` | yes | yes | host `removes net-level state by ID…`; plugin `a referenced removal accounts for every canonical cascade…` (clears the place's reference); core `removing a referenced equation clears the place's dynamics reference and stays clean` | — |

Removals of state that code still reads leave that code compiler-dirty. The batch reports the structural change as `applied` (evidence level 1); cleanliness is read separately through `getNetCompilationErrors` (level 2), which reports **pending** rather than the earlier version's diagnostics when the refresh has not landed (`wait-for-diagnostics-refresh.test.ts`). The removal is never hidden: the cascade is recorded in full as derived effects and the dependent code's errors name what it lost.

### Outside the Brunch envelope

| Operation | Stock | Brunch | Refusal |
| --- | --- | --- | --- |
| `addScenario`, `updateScenario`, `removeScenario` | yes | no | schema refusal; pending PM confirmation (`MISSION.md`) |
| `addMetric`, `updateMetric`, `removeMetric` | yes | no | schema refusal; pending PM confirmation |
| `addSubnet`, `updateSubnet`, `removeSubnet` | yes | no | schema refusal; nested construction is outside the root-net envelope, and every admitted input omits `targetSubnetId` |
| `addComponentInstance`, `updateComponentInstance`, `updateComponentInstancePosition`, `removeComponentInstance` | yes | no | schema refusal; as above |
| `deleteItemsByIds` | yes | no | schema refusal; a mixed-kind deletion cannot carry one declared basis per operation |
| `commitNodePositions` | yes | no | schema refusal; positions belong to `applyAutoLayout` |

### Commands and reads (both modes)

| Tool | Stock | Brunch | Notes |
| --- | --- | --- | --- |
| `applyAutoLayout` | yes | yes, as its own browser client tool | Brunch records `layoutRecord` (pre/post hashes, position-only effects); `compiler-feedback.integration.ts`, website `mutation-record.test.ts` |
| `getLatestNetDefinition` | yes | yes | Brunch attaches the verified `observation` sidecar every batch must cite |
| `getNetCompilationErrors` | yes | yes | pending-not-clean in both modes |
| `readPetrinautDoc` | yes | yes | — |
| `setNetTitle` | yes | no | not mounted in Brunch |

## What the model sees when it sends an unadmitted operation

The batch is refused as a whole before anything is applied. The refusal names the offending position (`operations[N].type`) and spells out every admitted operation name; the model's own input tells it which name it used. Flue delivers this as a tool `output-error`, so the model gets the text and the user sees the error state in the panel. Verified by `test/mutate-petrinet.test.ts` (`admits edits to existing parts by ID, but not canvas positions or subnet targets`) and, end to end for a refused browser mutation, by `apps/brunch-agent/test/mutation-records.integration.ts`.

An admitted operation that fails at execution (unknown ID, duplicate identity, a type the place cannot take) stops the batch at that position: the failed outcome carries the thrown message, earlier operations stay applied and are reported so, later ones are reported `unattempted`. The batch is not a transaction and does not claim to be.
