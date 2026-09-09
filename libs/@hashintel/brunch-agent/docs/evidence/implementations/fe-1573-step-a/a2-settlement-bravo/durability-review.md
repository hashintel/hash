# Durability premise — unresolved crash window

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

A read-only independent source review raised a crash-window concern. This is **unresolved, not a reproduced runtime bug**. No fault injection was performed, and no repair is implemented past the mixed-batch stop. The normal-settlement and application stop/reload pins remain valid but must not be promoted to crash-safe durability.

## Claim record

- Claim: process loss after the successful `tool_outcome` append but before the `state_write`/`tool_results_committed` append can leave a recovered successful revision pointer without current revision state.
- Relied on by: any claim that `durable: true` alone earns crash-safe current-workpiece persistence.
- Competing explanation: recovery might reconstruct or commit the missing state through another checkpoint/materialization path; normal completion is insufficient to discriminate these explanations.
- Primary evidence: installed `@flue/runtime@2.0.3` source listed below, inspected both by the reviewer and this session.
- Required discriminator: fault-inject process loss at that actual SQLite append boundary in the built ChatAgent, restart its isolated database, and compare the recovered public tool result with persisted Markdown/pointer and the next update's ordinal. Separately interrupt an unresolved durable-tool recovery before any subsequent normal flush.
- Discriminating observation: **none; not run**. The existing mounted pin stops/reloads only after complete settlement.
- Remaining uncertainty: reachability and recovery outcome of those exact crash windows on the production route.

## Source observations

Paths below are under `node_modules/@flue/runtime/dist/` and are hashed in `source-manifest.json`.

- `use-persistent-state-DUUiJyWP.mjs:26–69`: the captured setter is expressly callable outside render; updater form synchronously reads the current buffer overlay. This supports the tool's ordinal assignment and render/run split.
- `conversation-stream-store-CXwRWonS.mjs:2397–2425`: `tool_execution_end` appends `tool_outcome` without draining hook state.
- Same file, `2465–2472`: normal `turn_end` drains state and appends `tool_results_committed` together. `state-records.json` independently observes this normal SQLite batch.
- Same file, `2618–2626`: durable-tool repair skips calls already present in `conversation.toolOutcomes`.
- Same file, `2764–2811`: repair preserves those outcome records and appends a repaired result batch; this method does not visibly drain hook state.
- Same file, `3243–3265`: `step.do` memoizes its returned value independently. Replaying a completed step skips its callback. Wrapping a buffered state write in a separately committed step is therefore not evidence that the state and result share a checkpoint.

## Disposition

Retain the minimal `durable: true` server tool using the required render-captured setter, and state its demonstrated boundary precisely: ordinary settlement commits exact Markdown and pointer together; public history survives application stop/reload; a later update reads ordinal 1 and writes ordinal 2. Do not advertise interrupted recovery as proved. Do not add a second store, reconstruct state from unvalidated history, patch installed runtime files, or change termination as a speculative fix. The integration owner receives this unresolved premise separately from the **observed** mixed-batch failure.
