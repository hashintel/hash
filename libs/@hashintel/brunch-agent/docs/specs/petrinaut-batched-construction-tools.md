# Batched Petrinaut construction tools (`pn_read` / `pn_edit`)

Status: **candidate design input for Mission 9, not a selected mechanism**. Drafted 2026-09-02 from a code survey of `@hashintel/petrinaut-core`, `@hashintel/petrinaut`, `@hashintel/brunch-agent/packages/plugin-sdcpn`, `@apps/brunch-agent`, and `@flue/runtime@2.0.3`. Live authority remains [`MISSION.md`](../../MISSION.md); [Mission 9 — traceable projection](../mission-drafts/9-traceable-projection.md) owns the broad provider-schema, mutation-sequence, and partial-failure boundaries this proposal addresses. Mission 6 may exercise only the least meaningful browser mutation needed for its prepared-fixture viability tracer; Mission 9 must repair the broader known schema carrier before deciding whether a bounded atomic batch is the least sufficient construction mechanism. Nothing here is evidence that the design works or authority to implement `pn_read` or `pn_edit`.

## Problem

The stock Petrinaut assistant constructs a net one mutation per tool call, across 41 mutation tools plus commands and read tools (`mutationActionInputSchemas` in `petrinaut-core/src/action-schemas.ts`). Brunch's `plugin-sdcpn` mounts a six-tool subset of that surface for construct-only conversations (`getLatestNetDefinition`, `addType`, `addParameter`, `addPlace`, `addTransition`, `addArc`) and executes the calls client-side through Petrinaut's canonical callbacks.

The proposal under consideration is to replace that per-mutation surface, for the Brunch agent, with two tools:

- `pn_read` — return the current net (`{ title, definition, extensions }`).
- `pn_edit` — accept an ordered array of one or more canonical mutation actions and apply them as one squashed change.

The intended gains are fewer model round trips, a coherent net emitted in one move (types → parameters → places → transitions → arcs), no half-built intermediate states, and a smaller tool list for the model to reason over.

This document records what the code actually affords, what the earlier failure actually was, the design a batch tool should take, and which probes to run first.

## Observations

Each observation names its evidence. Claims about the model's behaviour come from the Mission 3 record, not from new runs.

### O1. Petrinaut has no batch or transaction contract; the local JSON handle exposes a promising primitive

`Petrinaut.mutations` (`petrinaut-core/src/instance.ts`) is built by `createPetrinautActions(mutate, extensions)` (`actions.ts:415`). Every action parses its input against its own Zod schema and then calls the injected mutation function through `mutateWithExtensionGuards`. The instance's private mutation closure enforces effective readonly and disabled-extension behavior before reaching `handle.change`.

`createJsonDocHandle().change` (`handle/json-doc-handle/create-json-doc-handle.ts`) runs `produceWithPatches(current, draft => fn(draft))` and only assigns `current` after the callback succeeds. A throw propagates and leaves this handle's current document untouched. One successful state-changing outer call emits one change event and creates at most one history checkpoint when history is enabled.

That observation does **not** establish a general transaction contract. `PetrinautDocHandle.change` does not promise rollback on throw, transactionality, history, patch count, or synchronous publication, and a direct `instance.handle.change` call bypasses instance-level readonly and extension policy. A batch therefore needs a first-class core operation that reuses the instance's effective mutation authority, or it must be explicitly restricted to a handle whose transactional semantics are part of its contract. Intra-batch references are feasible because later steps can see earlier changes to the same draft, but caller-supplied IDs alone do not guarantee uniqueness or idempotency.

### O2. The failure Mission 3 recorded is a schema-carrier failure, not a granularity failure

`@flue/runtime@2.0.3` types tool input as `v.GenericSchema` (`dist/types-*.d.mts:79`). Its schema module checks for a Standard Schema marker and then **rejects any vendor other than `valibot`** (`dist/schema-*.mjs`: `schema["~standard"].vendor === "valibot"`, else `TypeError("[flue] Expected a Valibot schema.")`). The provider-visible JSON Schema is produced by `@valibot/to-json-schema` with `errorMode: "ignore"`, which silently drops constructs it cannot represent — including `rawTransform`.

`plugin-sdcpn/src/tools/petrinaut-construction.ts` therefore wraps each canonical Zod schema in `v.pipe(v.looseObject({}), v.rawTransform(zodParse))` and pastes the Zod-generated JSON Schema into the tool *description*. Measured output of that carrier:

```json
{"type":"object","properties":{},"required":[]}
```

The provider receives no machine-enforced parameter shape; the model sees the canonical JSON Schema only as unstructured descriptive text. The paid Mission 3 run (`docs/evidence/implementations/fe-1525-headless-runbook-pn.md`) encoded `addType.elements` as a string nine times, was correctly rejected nine times by the runtime Zod parse, never corrected, and produced an empty net. `docs/mission-drafts/9-traceable-projection.md` records the accepted broader next move: Flue support for Standard Schema or supplied JSON Schema, or a mechanical shape-preserving conversion; extending the opaque carrier or hand-copying Petrinaut fields into Valibot stays rejected.

Consequence for this proposal: `pn_edit`'s payload — an array of a discriminated union of nested objects — is strictly harder to carry than `addType` was. Through the current carrier it would fail identically, and every action in the batch would fail together. **Batching does not address the recorded blocker; it inherits it.**

### O3. A mechanically derived batch schema is compact for a subset and unusable at full parity

A local measurement with the installed Zod 4 and `z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })` produced the following provisional values. They are not yet a reproducible artifact and will drift with the selected action set, descriptions, and Zod output; any implementation decision must check in the exact subset manifest, keyword inventory, and deterministic measurement:

| Envelope | Bytes | ≈ tokens |
| --- | --- | --- |
| `{ actions: Array<oneOf[5 current construction actions]> }` | 18,293 | ~4,600 |
| `oneOf[all 41 mutation actions]` | 112,466 | ~28,000 |

The five-action envelope preserves every nested shape (`elements` is an array of objects with `elementId`/`name`/`type`; `inputArcs` carries the `endpoint` discriminated union) and every `.meta({ description })` string, because Zod's JSON Schema emitter carries descriptions and structural constraints while dropping runtime-only refinements (`.check`, `.superRefine`). That split is exactly what a provider needs: shape and guidance in the schema, semantic validation at runtime.

Full parity is ~28k tokens per turn and a 41-branch `oneOf`; `MISSION.next.md` already rejects broad 46-tool parity. A batch tool must be a subset.

### O4. The existing read contract should be reused, but `pn_read` is not already a production tool

`getLatestNetDefinition` returns `{ title, definition, extensions }` (`petrinaut-core/src/ai.ts`; host execution in the stock panel and headless harness). No new read shape is warranted. Current Brunch production client-tool routing does not execute this construction tool, and renaming it to `pn_read` would require an explicit panel/client dispatch alias. Retain the canonical name unless a model-facing naming probe earns the alias. A compact projection (names and IDs only) is a possible later economy, not a present requirement.

### O5. Per-mutation tooling carries UX that a batch does not

The stock panel (`petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`) renders one tool card per call (`tool-summaries.ts`), waits for a diagnostics refresh per mutation, gates some commands behind interactive widgets, and yields one undo step per call. None of this matters for a headless or off-canvas construction conversation. For the live door (Petrinaut panel → `useChat`/`onToolCall` → Flue `ChatAgent`), a batch tool needs a panel-side handler and a summary renderer; that is host work, not plugin work.

### O6. Feedback granularity is the real trade-off, not call count

Per-action tools give the model a correction opportunity after every call. A batch commits the model to a large structure before any feedback, and one bad arc weight rejects thirty otherwise-valid actions. Mission 3's model repeated the same malformed call nine times without correcting when the feedback was a bare `expected array, received string` and the schema gave it nothing to correct against. The lesson is that **feedback precision and schema fidelity dominate round-trip count**. A batch tool is only an improvement if its error output pinpoints the failing action and path, and if its schema is visible to the provider.

## Design

### Placement

Ownership splits at the semantic boundaries:

- **`@hashintel/petrinaut-core`:** canonical subset-derived batch schemas; a first-class transactional dispatcher if the handle/instance contracts can support it; effective readonly and extension policy; rollback and per-step applied/no-op/failure semantics. This belongs on `Petrinaut` rather than in an AI helper that reaches through `instance.handle`.
- **SDCPN plugin:** the bounded Brunch construction subset, model-facing tool semantics, and construct-only mounting.
- **Brunch binding/app:** Flue schema carriage, production client-tool classification and suspension/resume, panel execution, summaries, and provider-versus-canonical error presentation.
- **Mission 6 projection operation:** base/current revision, operation identity and duplicate delivery, stable generated IDs, derivation commitment after confirmed state, and semantic correspondence with the selected workpiece region.

This keeps canonical field shapes and generic mutation behavior in Petrinaut without moving Brunch provenance or Flue contracts into the published core library.

### Schema

```ts
// petrinaut-core/src/ai.ts (sketch)
const batchStep = <Name extends MutationActionName>(name: Name) =>
  z.strictObject({
    action: z.literal(name),
    input: mutationActionInputSchemas[name],
  });

export const createMutationBatchSchema = <Names extends readonly MutationActionName[]>(names: Names) =>
  z.strictObject({
    actions: z
      .array(z.discriminatedUnion("action", names.map(batchStep) as never))
      .min(1)
      .meta({ description: "Ordered mutations submitted to one transactional dispatcher. IDs are caller-supplied; later steps may reference IDs introduced by earlier steps in the same batch." }),
  });
```

The `{ action, input }` envelope is preferred over `.extend({ action })` because several action schemas are `ZodPipe`s (`parameterSchema.superRefine`) that do not extend cleanly, and because the envelope keeps the canonical input schema byte-identical to the per-tool one.

The caller chooses the `names` subset. The initial Brunch subset is the current five construction actions; `update*`/`remove*` pairs and `addScenario`/`addMetric` enter only when a named consumer (Mission 6's region, Mission 9's optimisation handoff) makes them load-bearing.

### Transactional dispatcher

The earlier `applyMutationBatch(instance.handle.change(...))` sketch is rejected: its recorded failure return was unreachable after rethrow, it bypassed instance readonly and extension policy, and the general handle interface does not guarantee rollback. The candidate core contract is instead a first-class operation created beside `mutations` inside `createPetrinaut`, where it can reuse the same effective mutation authority.

A viable contract must:

1. parse the outer envelope against the exact selected subset rather than trusting TypeScript or an arbitrary action key;
2. distinguish provider/Flue structural rejection from canonical per-step rejection;
3. execute steps in order inside one explicitly transactional mutation boundary;
4. abort on the first failure and return its `{ index, action, path, message }` after rollback;
5. preserve effective readonly and disabled-extension behavior exactly;
6. report a per-step outcome or enforce postconditions so silent canonical no-ops cannot masquerade as applied changes; and
7. return confirmed resulting state only after the underlying handle publishes the transaction.

If the existing handle abstraction cannot support that contract generally, restrict the first implementation to a named transactional handle or strengthen the handle capability contract. Do not infer atomicity from `change` alone.

### Required semantics

- **Atomic where claimed.** Canonical per-step failure leaves state unchanged only on a boundary whose rollback behavior is explicit and tested. Provider/Flue envelope rejection occurs before that boundary and is a distinct failure class.
- **Ordered.** Later steps observe earlier successful steps in the same draft.
- **Outcome-honest.** Success cannot mean merely “no exception”: canonical actions may intentionally no-op when extensions are disabled, IDs are absent, or arcs are duplicates. The result must identify applied/no-op outcomes or verify the requested postconditions.
- **Identity-explicit.** Caller-supplied IDs permit intra-batch references but do not enforce uniqueness, replay safety, or stable projection identity. Mission 6 owns those surrounding contracts.
- **First-failure precision.** Return `{ index, action, path, message }` for the first canonical failure; do not collect cascades after a rejected prerequisite step.
- **Change-count scoped to the handle.** The local JSON handle should emit one change event and at most one history checkpoint for a successful state-changing batch. Diagnostics refresh and other host behavior require separate panel evidence.
- **Read-after-write included.** On confirmed success, return the resulting definition so the model need not read after every edit. Measure before replacing it with a compact summary.

### Candidate tool surface for Brunch

- Read → reuse `getLatestNetDefinition` and its output shape. Treat `pn_read` as an unearned alias until a naming reason and production dispatch path exist.
- Batch edit → a bounded subset-derived schema mounted under the same construct-only gate as today's tools, executed client-side through the core transactional contract. `pn_edit` remains a candidate name and mechanism until the Mission 6 probes establish schema carriage, transaction/outcome semantics, and a real advantage over per-action tools.
- If Mission 6 selects batching, the per-action Brunch construction tools are replaced rather than co-mounted. Mission 7 may extend the selected subset only for mutation classes required by its accepted correction.

### What stays out

- No `mode: "best-effort"`. Atomic only, until observed strain.
- No compact read projection, no server-side diff/desired-state recomputation (`MISSION.next.md` calls full-net recomputation "fog").
- No Brunch-specific vocabulary or Flue types in `petrinaut-core`.
- No hand-written Valibot mirrors of Petrinaut schemas.

## Prerequisite: a shape-preserving provider schema

This is the gate for the whole proposal and for Mission 6's first repair item. Three routes, in order of preference:

1. **Upstream Flue accepts non-Valibot Standard Schema or a supplied JSON Schema.** Flue is external (`withastro/flue`). Its schema module already detects `~standard`; the vendor check is the only thing excluding Zod 4. This is the cleanest fix but is not in our control and has no delivery date.
2. **Mechanical JSON Schema → Valibot conversion, local to Brunch.** Zod's `toJSONSchema()` output for these schemas uses only structural constructs: `object` with `properties`/`required`/`additionalProperties: false`, `array` with `items`/`minItems`, `string`/`number`/`integer`/`boolean`, `enum`, `const`, `oneOf` (discriminated unions), `anyOf` with `null` (nullable), `minLength`, `minimum`/`exclusiveMinimum`, and `description`. A converter over that closed subset produces a Valibot schema whose `@valibot/to-json-schema` output preserves shape and descriptions. Runtime validation continues to delegate to Zod via `rawTransform`, which the provider never sees — the arrangement the existing carrier intended but could not deliver. Prefer a maintained package if one exists and covers the subset; otherwise write the converter and pin it with a test that round-trips every schema in the chosen subset and fails on any unhandled JSON Schema keyword (no silent drops — that is how the current carrier failed).
3. **Extend the opaque carrier.** Rejected in the Mission 3 evidence and again here.

## Recommended Mission 6 probe sequence

Run these in order so each failure has one interpretation.

### Probe 1 — single-action shape-preserving carrier

**Question.** Can Flue expose the exact canonical nested `addType.elements` shape that failed in Mission 3 as provider-enforced structure?

**Work.** Use the least supported shape-preserving route, mount one canonical nested action, and compare provider-visible JSON Schema with the canonical Zod output. Check in the exact Zod version, deterministic schema measurement, keyword inventory, positive/negative samples, and a fail-closed assertion for every unhandled keyword. Then run one budgeted real-model call with retained raw arguments and runtime result.

**Oracle.** Hermetic schema comparison plus the one authorized real-provider trace. Passing retires only the carrier blocker; it does not select batching or prove construction.

**Stop if** no supported mechanical path preserves the nested shape. Record the exact unsupported keyword or Flue boundary; do not widen the carrier or hand-copy fields.

### Probe 2 — first-class transactional batch contract

**Question.** Can Petrinaut core expose a bounded batch operation with explicit rollback, readonly/extensions parity, indexed failure, and honest no-op outcomes?

**Work.** Add the smallest subset-derived schema and first-class operation beside `mutations` inside `createPetrinaut`. Against each supported handle/capability combination, test ordered intra-batch references, successful resulting state, readonly refusal, disabled-extension parity with sequential mutations, duplicate/missing-ID and canonical no-op behavior, and rollback after a zero-weight arc at index 4. For `createJsonDocHandle`, assert one change event and at most one history checkpoint when enabled.

**Oracle.** Core tests comparing batch output with the equivalent canonical sequence and proving every advertised semantic. A test against only `createJsonDocHandle` supports only a JSON-handle-scoped contract.

**Stop if** the current handle contract cannot make rollback dependable. Narrow the supported handle or propose the smallest explicit capability; do not reach through `Petrinaut` to `handle.change`.

### Probe 3 — bounded batch through Flue and the production client path

**Question.** After Probe 1 and Probe 2 pass, does the five-action batch preserve its discriminator and nested shapes through Flue, produce actionable indexed feedback, and improve the selected construction path over canonical per-action tools?

**Work.** Carry the exact five-action subset through the proven schema route, classify provider-envelope and canonical per-step failures separately, wire production client-tool dispatch, and exercise one construct-only run. Compare schema cost, calls, latency, correction behavior, resulting state, and failure visibility with the per-action control. Do not use non-empty output alone as the verdict.

**Oracle.** Hermetic schema diff, production-path integration test, and an owner-authorized real-model comparison retained with the exact instrument and state artifacts.

**Stop if** batching obscures feedback, silently no-ops, cannot reject stale/duplicate delivery at the projection layer, or does not improve the selected case enough to justify the new core and host contracts. In that case Mission 6 retains per-action tools on the repaired carrier.

### Deferred

- Panel-side batch handler and summary card for the live door — only after Probes 1 and 2 succeed and Probe 3 reaches the production client path.
- `update*`/`remove*` and scenario/metric actions — when Mission 6's region or Mission 9's handoff names them.
- Compact read projection — when measured token cost of returning the full definition is the strain.

## Risks and open questions

- **Blind commit.** Even with a good schema, the model builds a large structure before any feedback. If real runs show repeated batch rejections for semantic (not shape) reasons, consider prompting the model to batch by layer (types and parameters first, then places, then transitions and arcs) before considering a non-atomic mode.
- **Schema size drift.** Petrinaut descriptions are long by design (they are the model's guidance). Adding actions to the subset grows the per-turn cost roughly linearly; re-measure with the `toJSONSchema` byte count on each subset change.
- **Transactional scope.** A JSON-handle proof does not establish rollback for every `PetrinautDocHandle`. Advertise only the handles/capabilities the core contract and tests cover.
- **Silent no-op.** Missing IDs, duplicate arcs, and disabled extensions can return without throwing. Require explicit outcomes or postconditions before a projection or derivation is marked successful.
- **Identity and replay.** Caller-supplied IDs are not uniqueness, stale-base, or idempotency enforcement. Mission 6 must bind batch execution to current state and duplicate-delivery policy.
- **Split validation.** Provider/Flue envelope errors occur before canonical indexed dispatch. Keep these failure classes visible rather than pretending one result shape covers both.
- **Sanitisation parity.** The batch must produce exactly the document the equivalent sequence of `instance.mutations.*` calls would produce under the same effective extensions. Cover this with disabled-extension cases.
- **Undo granularity in the stock editor.** If the stock assistant ever adopts the batch, one history checkpoint for a multi-action edit is a UX decision the Petrinaut owners should make, not a side effect.
- **Upstream Flue.** Worth an issue on `withastro/flue` proposing acceptance of any Standard Schema v1 vendor with a supplied JSON Schema; that removes the converter entirely if accepted. Do not wait on it.
