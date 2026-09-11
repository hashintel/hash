# Mutation capability matrix

What `mutate_petrinet` admits, how each admitted operation earns `applied`, where it is exercised, and what the model sees for anything else. This is the operation-coverage authority Mission 7c's proof floor points at; `MISSION.md` cites it rather than restating it.

The acceptance rule it serves:

> Any ordinary construction or correction request inside the declared capability envelope either succeeds through canonical Petrinaut operations or produces a clear unsupported-operation refusal. It must not crash, stall indefinitely, corrupt the net, silently omit requested meaning, leave hidden partial state, or claim success.

## Envelope

Brunch's default assistant constructs and corrects **root-net** operational-process models. The envelope is the root net's places, transitions, arcs, coloured types and their elements, parameters and differential equations. Canvas positions belong to layout (`applyAutoLayout`), not the batch. Scenarios, metrics, subnets and component instances are outside the envelope (scenarios and metrics pending the PM decision recorded in `MISSION.md`).

Three schemas must agree on the admitted set, and the tests below hold them in step:

| Layer | Home | Test |
| --- | --- | --- |
| Canonical batch (Petrinaut-owned) | `libs/@hashintel/petrinaut-core/src/selected-mutation-batch.ts` | `selected-mutation-batch.test.ts` |
| Model-facing carrier (plugin-owned, root-only, `basisId` per operation) | `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/mutate-petrinet.ts` | `test/mutate-petrinet.test.ts` |
| Browser executor (website-owned) | `apps/petrinaut-website/src/main/app/local-storage-demo/mutate-petrinet-tool.ts` | `mutate-petrinet-tool.test.ts` |

## How an operation earns `applied`

The executor reports `applied` only when the plugin's verifier agrees, against the independently observed pre and post definitions:

- **Predicted definition** — the plugin replays the canonical action on the pre observation and requires the post observation to match it exactly (`expectedNodeDefinition`). Used for every node, type, parameter, equation and `removeArc` operation.
- **Single field** — the effect set must be exactly one direct update to the named arc field with the requested value (`updateArcWeight`, `updateArcType`).
- **Single creation** — exactly one created arc equal to the requested arc (`addArc`).

Effects are partitioned into direct (the requested change) and derived (everything else Petrinaut changed as a consequence, e.g. arcs removed with a place, a place's `colorId` cleared with its type). Derived effects never inherit the operation's declared basis.

## Matrix

Canonical name = the Petrinaut action name; the carrier does not rename. "Exercised" names the test that runs the operation through the browser executor and verifies its record at the receiving boundary, plus the plugin test that derives its effects.

### Admitted

| Canonical operation | Class | Earns `applied` by | Exercised |
| --- | --- | --- | --- |
| `addPlace` | add node | predicted definition | host `executes created-ID dependencies…`; plugin `root-node.test.ts` |
| `addTransition` | add node | predicted definition | host `executes created-ID dependencies…`; plugin `root-node.test.ts` |
| `addArc` | add arc | single creation | host `executes created-ID dependencies…`; plugin `mutation-record.test.ts` |
| `addType` | add state | predicted definition | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` |
| `addTypeElement` | add state | predicted definition | host `edits existing parts by ID…`; plugin `root-state.test.ts` |
| `addParameter` | add state | predicted definition | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` |
| `addDifferentialEquation` | add state | predicted definition | host `adds a type, parameter, and differential equation`; plugin `root-state.test.ts` |
| `updatePlace` | edit node | predicted definition | host `edits existing parts by ID…`; plugin `root-node.test.ts` |
| `updateTransition` | edit node | predicted definition | host `edits existing parts by ID…`; plugin `root-node.test.ts` |
| `updateArcWeight` | edit arc | single field | host `edits existing parts by ID…`; plugin `root-arc.test.ts` |
| `updateArcType` | edit arc | single field | host `edits existing parts by ID…`; plugin `mutation-record.test.ts` |
| `updateType` | edit state | predicted definition | host `edits existing parts by ID…`; plugin `root-state.test.ts` |
| `updateTypeElement` | edit state | predicted definition | host `edits existing parts by ID…`; plugin `root-state.test.ts` |
| `updateParameter` | edit state | predicted definition | host `edits existing parts by ID…`; plugin `mutation-record.test.ts` |
| `updateDifferentialEquation` | edit state | predicted definition | host `applies invalid dynamics…`; plugin `mutation-record.test.ts` |
| `removePlace` | remove node | predicted definition | host `removes a place, its connected arcs, and a transition`; plugin `mutation-record.test.ts` |
| `removeTransition` | remove node | predicted definition | host `removes a place, its connected arcs, and a transition` |
| `removeArc` | remove arc | predicted definition | host `removes one arc without deleting its endpoints` |
| `removeType` | remove state | predicted definition | host `removes net-level state by ID…`; plugin `mutation-record.test.ts` |
| `removeTypeElement` | remove state | predicted definition | host `removes net-level state by ID…`; plugin `mutation-record.test.ts` |
| `removeParameter` | remove state | predicted definition | host `removes net-level state by ID…`; plugin `mutation-record.test.ts` |
| `removeDifferentialEquation` | remove state | predicted definition | host `removes net-level state by ID…` |

Dependency-invalidation: any edit or removal above that a code-bearing item referenced (a renamed parameter or type element, a re-coloured place, a removed arc or type) leaves that code dirty. The batch reports the structural change as `applied`; compiler cleanliness is a separate claim read through `getNetCompilationErrors` (`libs/@hashintel/petrinaut-core/src/lsp/lib/dependency-invalidation.test.ts`, `apps/brunch-agent/test/compiler-feedback.integration.ts`).

### Not admitted, and why

| Canonical operation | Reason |
| --- | --- |
| `updatePlacePosition`, `updateTransitionPosition`, `updateComponentInstancePosition`, `commitNodePositions` | Positions are layout's; `applyAutoLayout` is mounted separately and recorded as `layoutRecord`. |
| `updateArcPlace` | Re-pointing an arc changes identity; remove and add is the honest record. |
| `moveTypeElement` | Element order only matters to scenario rows, which are outside the envelope. |
| `addScenario`, `updateScenario`, `removeScenario`, `addMetric`, `updateMetric`, `removeMetric` | Outside the envelope pending PM confirmation (`MISSION.md`, owner decisions). |
| `addSubnet`, `updateSubnet`, `removeSubnet`, `addComponentInstance`, `updateComponentInstance`, `removeComponentInstance` | Nested construction is outside the root-net envelope; every admitted input schema omits `targetSubnetId`. |
| `deleteItemsByIds` | A mixed-kind deletion cannot carry one declared basis per operation. |

## What the model sees when it sends an unadmitted operation

The batch is refused as a whole before anything is applied. The refusal names the offending position (`operations[N].type`) and spells out every admitted operation name; the model's own input tells it which name it used. Flue delivers this as a tool `output-error`, so the model gets the text and the user sees the error state in the panel. Verified by `test/mutate-petrinet.test.ts` (`admits edits to existing parts by ID, but not canvas positions or subnet targets`) and, end to end for a refused browser mutation, by `apps/brunch-agent/test/mutation-records.integration.ts`.

An admitted operation that fails at execution (unknown ID, duplicate identity, a type the place cannot take) stops the batch at that position: the failed outcome carries the thrown message, earlier operations stay applied and are reported so, later ones are reported `unattempted`. The batch is not a transaction and does not claim to be.
