# Native schema boundary repair — detailed evidence

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

Concise relay: [handoff.md](handoff.md).

## Outcome and remaining decision

**Pass for the bounded native-carriage/validation candidate over copied installed packages.** Canonical Zod input schemas now cross public Flue `defineTool`/`useTool`, the real runtime, Pi Anthropic preparation and SDK serialization without a Valibot round trip or strict-generation annotation. Native defaults, recursive values, executable refinements, explicit normalization and parsed output types survive the tested path.

**Three dependency targets are necessary, not two:** `@flue/runtime`, `@earendil-works/pi-ai`, and `@earendil-works/pi-agent-core`. The first two repairs alone preserve schemas but still let raw `addArc.weight: true` execute as `1`: Pi Agent Core applies generic JSON-Schema coercion before Flue can validate. The retained `two-boundary` instrument falsifies that candidate. The final candidate gives a native tool an explicit authoritative validation callback before Pi's `beforeToolCall` hook. It is not a skip-validation flag, raw-argument map or duplicate parser. The owner explicitly authorized this additional isolated consumer repair after the boolean discriminator exposed it.

**The next owner choice is dependency delivery:** obtain upstream releases for these three narrow repairs, or authorize bounded maintained patches against pinned packages plus explicit Standard Schema type-dependency wiring. No more custom converter construction is needed to decide this. Neither delivery path has been applied; upstream source builds, the product native mount and real-provider acceptance remain gates below.

Authority: owner commit `2aabffbd27fa3f01913f40ab4bc45074ba50971a`, cherry-picked as `6c599c87fc` on `ln/fe-1573-provider-boundary`, after clean status/history inspection. `MISSION.md` was not edited beyond that requested authority cherry-pick. Its native-schema policy supersedes the prior strict-mode recommendation. Product source/registration, canonical schemas, installed package files, lockfile, ledgers and earlier accounting evidence remain unchanged. **Zero external requests, paid calls or spend; no Step B work.**

## Reproducible evidence

All files are in this new directory. Prerequisites are the pinned installed packages and existing local `@hashintel/petrinaut-core` / `@hashintel/brunch-agent` build artifacts, inherited from the previous lane and additionally hashed here. A fresh matching workspace can prepare those local exports with `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/petrinaut-core exec vite build` and the equivalent `@hashintel/brunch-agent` command; these are not Flue/Pi source builds. Missing dependencies must be supplied offline or surfaced, not silently downloaded. Run from the repository root:

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-schema-20260908T150034Z
node "$E/reproduce.mjs" baseline
node "$E/reproduce.mjs" flue-only
node "$E/reproduce.mjs" two-boundary
node "$E/reproduce.mjs" candidate
node "$E/safety-gate.mjs" candidate
node "$E/pi-source-diff.mjs"
```

`reproduce.mjs` verifies `installed-inputs.json`, creates a `mkdtemp` directory inside this worktree, **copies rather than hardlinks** the three packages, applies unique exact-match edits only to those copies, executes the real copied runtime and type declarations, re-verifies installed/protected inputs and removes its own scratch directory. It opens no server or socket. The probe blocks global fetch, HTTP(S) request APIs and socket connect; provider fetch is an explicitly injected in-memory SDK/SSE stub. History is read through the actual Hono agent router's in-process `fetch(Request)` method, not an external `.invalid` host request.

- `candidate-edits.json`: exact staged candidate edits; entries marked `ownership` add the third consumer contract and its Flue join. `candidate.patch` is the complete generated zero-context review diff against installed files, not an applied maintained patch. Zero context avoids treating unified-diff context prefixes as repository trailing/indent whitespace; the executable reproducer still checks exact original text and hashes.
- `baseline.json`, `flue-only.json`, `two-boundary.json`, `candidate.json`: curated observations, original raw call/history snapshots, native parser outputs, hook/interceptor observations, request-schema hashes and verdicts. Fresh runtime identifiers/durations vary on reproduction; schema hashes and assertions are deterministic. These are synthetic diagnostic records, not lineage or budget records.
- `native-input-schemas.json`: full native input exports, retained once rather than repeating schemas in every request observation.
- `type-contract.ts` / `tsconfig.json`: strict consumer typing against the copied declarations, including negative type controls.
- `installed-inputs.json` / `pin-inputs.mjs`: version/source/protected-file pins. Normal reproduction checks the committed pins; do not regenerate them to accept a different installation. The pin-generation command was used to pin this installation while developing the instrument; no installed versions changed.
- `pi-source-candidate.patch` / `pi-source-diff.mjs`: equivalent Pi TypeScript edits recovered from verified installed source maps. They are a source-review companion, **not an upstream source-build result**.
- `safety-gate.mjs`: a separate claim gate. Expected-negative reproduction is not mistaken for repair success: this gate fails on baseline/partial candidates and passes only on the complete candidate.

The oracle uses ordinary `start({ agents, providers, env: {} })`, `init`, `dispatch`, `read`, `useTool` and the history router. Its diagnostic agent is not a new product agent or catalogue admission. Public Pi hook setters are installed diagnostically on actual Flue-owned Agent instances to observe/block calls; the original agent-loop methods still do all preparation and execution. Private Session access is confined to collecting actual instances and separately exercising the existing durable re-execution method. No replacement serializer, copied runtime simulation or synthetic `execute` stand-in supplies the main result.

## Before/after discriminators

| Instrument | Public Zod tool declaration | Serialized native schema | Raw boolean weight | Claim gate |
| --- | --- | --- | --- | --- |
| Installed baseline | Fails with `[flue] defineTool() input must be a Valibot schema.` | Loses root fields; recursive refs dangle; invents empty `required` | Native runtime mount unavailable | Fail |
| Flue native support only | Pass | Pi still loses root fields | **Runs as `1`** | Fail |
| Flue + Pi Anthropic preservation | Pass | Exact | **Runs as `1`** | Fail |
| Complete candidate, including Pi Agent Core ownership | Pass | Exact | Canonical refusal, **zero runs** | Pass |

Every schema capture checks both `stream` and `streamSimple`, with constrained sampling omitted and explicitly `false`. **No tool has `strict: true`.** The real SDK serializes the prepared request; the supplied local fetch captures the serialized body. Captured `tools` must equal `onPayload.tools`, and every candidate input schema must deep-equal its native input export. There is no post-hoc payload replacement.

### Native projection and executable authority

- For all five schema diagnostics, `z.toJSONSchema(schema, { io: "input" })` equals native Standard JSON Schema input export with `target: "draft-2020-12"`; output export equals native Standard output export too.
- For `addArc`, native input and output exports are equal. Root `$schema`, description, `additionalProperties: false`, properties, requiredness, nested `oneOf`, typed constants and bounds survive preparation and serialization.
- For `addScenario`, input `required` is exactly `[id, name, scenarioParameters, initialState]`; output additionally requires `parameterOverrides`. The candidate carries input optionality unchanged. Omission in a real scripted tool call reaches `run` as canonical `parameterOverrides: {}`. No output schema masquerades as input.
- Canonical `addTransition` and `updateTransition` exports retain root `$defs`; every local reference resolves, including recursion. A real runtime `updateTransition` diagnostic validates a nested metadata value containing an array, boolean, null and nested number without changing it. No transition is admitted to product construction.
- Canonical empty `getLatestNetDefinition` input preserves **absent** `required`; Pi no longer invents `required: []`. Existing Valibot exports retain their existing representation. No missing/empty equivalence policy is needed for the native path.
- `addArc` exactly-one `placeId`/`endpoint` and output-arc `type` checks remain executable Zod checks, absent from the representable projection. Both invalid controls fail `safeParse` before the experiment and produce matching-call runtime errors with zero runs under the candidate. JSON-Schema completeness is not claimed.
- Exporting a native scalar root, an unrepresentable date property, or a validator lacking a native JSON input exporter fails closed before provider dispatch. Zod output schemas remain rejected: core-owned Valibot output/result/initial-data contracts were not migrated.

## Why the third seam is necessary and how it is repaired

Installed Pi Agent Core `prepareToolCall` calls `prepareArguments`, then unconditionally calls Pi AI `validateToolArguments`. That function clones the arguments and invokes `Value.Convert` / `coerceWithJsonSchema`; `weight: true` becomes `1` before Flue's canonical validator. Canonical validation afterward cannot recover the original meaning. The two-boundary test retains the original raw history (`true`) alongside the incorrectly executed data (`1`).

A delegation/skip flag would also be insufficient: `beforeToolCall` runs before `execute` and promises validated arguments. Handing it raw input while leaving that guarantee intact would be another hidden contract change. The final candidate instead adds **`AgentTool.validateArguments(args, { toolCallId, signal })`**, returning parsed data or throwing. It replaces generic validation only on tools that explicitly supply it. Native Flue tools supply that callback; ordinary Pi/Valibot tools keep the original generic path.

The tested ordering is:

```text
original tool call/history remains raw
  → cloned input → optional explicit prepareArguments normalization
  → native Flue validation callback → Zod parsed output (once)
  → abort guard → beforeToolCall(parsed output, original raw toolCall)
  → Flue tool interceptor/context → run(parsed output)
  → output validation/result/terminate → afterToolCall(parsed output)
```

Flue's existing tool context construction is factored from parsing so live native execution can build facilities around the already-validated data without validating twice. A synthetic Zod transform increments a counter: **one parse**, with transformed data visible to `beforeToolCall`, `run` and `afterToolCall`. The Pi third generic `TArguments` preserves parsed-output typing when it differs from the provider input projection; Flue infers `run.data` from Standard Schema output types and `ToolInput` from input types.

The explicit Flue `prepareArguments` field forwards Pi's existing synchronous normalization seam and is also used on retained raw arguments in durable re-execution. The probe passes the actual `normalizePetrinautAiToolInput("addArc", args)` function. Raw provider/history weight remains `"2"`, while both native validation and execution see number `2`. The schema remains the canonical numeric input projection; no string alternative or inferred generic coercion is introduced.

### Lifecycle evidence

The complete candidate retains **19 named runtime/method observations**:

- Valid arc, scenario defaults, recursive native input, empty input, explicit normalization, transformed native output and async valid input run exactly once. Core-owned Valibot default/trim behavior is unchanged; the labelled Valibot generic-coercion control also retains its old behavior, demonstrating that this is not an all-tool migration.
- Boolean weight, both endpoint/type refinement controls and async invalid input never run. Original input and call ids remain in public history; `output-error` parts carry the corresponding call id and error text/path. These are ordinary Flue tool errors, so the scripted model can complete a subsequent turn; they are distinct from whole-proposal admission refusal.
- `beforeToolCall` sees parsed native output and can block execution. Failed native validation never reaches that hook or the Flue tool interceptor. Hook/interceptor data is not relabelled raw input.
- Active cancellation while native async validation is pending settles without a run. The blocked validator is then released to **succeed**, not fail; `lateValidationPassed: true` and zero late runs are asserted, with no stale `beforeToolCall`. Flue uses its existing abort-racing helper. A general user-supplied Pi callback still has a documented obligation to honor cancellation; the Flue implementation supplies that behavior.
- The valid arc diagnostic returns the actual core `AWAITING_CLIENT` marker with `terminate: true`. There is exactly one model request before the explicitly dispatched correlated `client-tool-result` signal, then one continuation request and no re-execution. This proves the existing terminate/result-signal mechanics under the repaired runtime, **not** a browser mutation, universal admission barrier for arbitrary later dispatches, or UI client-result reconciliation.
- The unchanged integrated admission decorator rejects a native-browser/Valibot-server mixture before either runs and before the attempted call id appears in history. Its 11 existing contract tests also pass against the copied packages, covering both methods, limits, cancellation and late publication.
- The real Session durable re-execution method is separately called on an actual runtime Session with labelled synthetic partial records. It preserves id/terminate and numeric-string normalization, and refuses boolean input. This is a method-level consumer regression, **not a crash/recovery witness**; no durable side-effect or lineage claim is made from these fixtures.

## Exact dependency surface

`candidate.patch` contains the executable/declaration/documentation deltas below. Paths are package-relative; hashes pin the original installed files.

| Package / exact affected files | Responsibility and consumed behavior |
| --- | --- |
| Flue `dist/schema-DIDpvZZa.mjs` | Add native Standard Schema + Standard JSON Schema detection, native input export/cache and Standard validation result/path projection. Keep existing Valibot converter/parser/object checks unchanged. |
| Flue `dist/tool-DZ5dxCl_.mjs` | Public declaration validation and explicit normalization field; async input parse; reusable context facilities; unchanged output envelope/Valibot validation and error classes. |
| Flue `dist/conversation-stream-store-CXwRWonS.mjs` | Native input export in resource digest and custom-tool assembly; authoritative callback on native tools only; parsed data into live execution; await/cancel preparation; native parsing/normalization in durable re-execution. Existing history/result/termination machinery remains in use. Source regions are `src/hooks/render.ts` and `src/session.ts`. |
| Flue `dist/types-CVx9SjIx.d.mts`, `dist/tool-NmMNtPCM.d.mts`, `dist/index.d.mts` | Native input/output type inference and explicit normalizer typing for both `defineTool` and inline `useTool`; Valibot output types unchanged. |
| Flue `package.json`, `docs/guide/tools.md`, `docs/reference/agent-api.md` | Declare installed `@standard-schema/spec@1.1.0` as the type-surface dependency; document native inputs, parsed data, failures, normalization and unchanged Valibot scope. The manifest edit exists **only in the copied candidate**. |
| Pi AI `dist/api/anthropic-messages.js`, `README.md` | Replace root reconstruction with supplied `tool.parameters`, independent of strict policy. Preserve dialect as supplied; no `required` fallback. |
| Pi Agent Core `dist/agent-loop.js`, `dist/types.d.ts`, `README.md` | Authoritative per-tool validation callback before hooks/execution, raw-input cloning and post-validation abort guard; parsed argument generic/docs. Default generic validation code remains unchanged. |

Inspected unchanged consumers include Flue output validation / `resolveToolRun`, result-tool export/parsing (`result-DfjetCf9.mjs`), instance initial-data validation (`dispatch-nU3cIlT-.mjs`), custom tool wrapping and termination/result persistence, and Pi's generic `validation.js`. Flue's public tool subpath re-exports the same definition/types. The installed runtime has exactly two `parseToolInput` call sites (live custom tools and durable re-execution); both are covered by the candidate. The installed runtime search found no additional standalone parse call site; direct user calls to a tool's plain `run` function are not magically validated.

### Build/delivery limits

This is proof over **executed installed JavaScript bundles and patched published declarations**. The consumer typecheck passed against those declarations, including defaulted input versus output, native transform output, callback arguments, inline tools, unchanged Valibot output typing and expected type errors. It is not a full source build of any dependency.

Pi source maps include the original TypeScript; `pi-source-candidate.patch` recovers the corresponding three source edits. The installed Flue package includes no original source tree or source maps, only bundle source-region labels and declarations. Upstream delivery therefore requires porting the tested Flue deltas to its actual source types (including asynchronous preparation signatures), rebuilding and running upstream suites. No source was downloaded and no upstream contribution was published.

A maintained-patch route can instead target the exact installed bundles/declarations exercised here, but the owner must explicitly wire the `@standard-schema/spec` type dependency through the chosen package manager and pin/reverify all three targets. Do not rely on this probe's ancestor dependency resolution, or assume editing a patched package manifest alone updates lockfile resolution. No `.yarn` patch, package extension, override, upgrade or fork is installed by this work.

## Verification and limits

Versions: **Flue 2.0.3; Pi AI 0.83.0; Pi Agent Core 0.83.0; Standard Schema spec 1.1.0; Zod 4.4.3; Valibot 1.4.2; Valibot JSON exporter 1.7.1; Pi's nested Anthropic SDK 0.91.1; Node v22.21.1.** Full original source/package hashes and protected-file hashes are in `installed-inputs.json`.

| Exact command | Result |
| --- | --- |
| `git cherry-pick 2aabffbd27fa3f01913f40ab4bc45074ba50971a` | Clean authority-only cherry-pick, `6c599c87fc`. |
| `node "$E/reproduce.mjs" baseline` | Exit 0 for expected-negative controls: Zod declaration rejected; all four payload-mode captures lose root contract. Four local stub invocations, zero external requests. |
| `node "$E/reproduce.mjs" flue-only` | Exit 0; declaration/runtime path works but schema preservation and boolean ownership fail. 24 local stub invocations. |
| `node "$E/reproduce.mjs" two-boundary` | Exit 0; exact serialized schemas, but boolean weight still runs as `1`. 24 local stub invocations. |
| `node "$E/reproduce.mjs" candidate` | Exit 0; 19 named runtime/method observations and all schema controls pass. 26 local stub invocations; zero external requests. Runs strict `tsgo --project <scratch>/tsconfig.json`, type-aware Oxlint on `type-contract.ts` (zero warnings/errors), and the unchanged copied admission test (11/11 pass). |
| `node "$E/safety-gate.mjs" baseline`; same with `flue-only` and `two-boundary` | Expected exit 1: respectively native declaration, serialized schema equality, and boolean-weight zero-run obligations remain red. |
| `node "$E/safety-gate.mjs" candidate` | Exit 0: native schema/validation ownership gate passes. |
| `node "$E/pi-source-diff.mjs"` | Exit 0; verified source-map extraction and source-review diff. No source build. |
| `node_modules/.bin/oxlint "$E/reproduce.mjs" "$E/probe.mjs" "$E/pin-inputs.mjs" "$E/pi-source-diff.mjs" "$E/safety-gate.mjs" "$E/type-contract.ts"` | Exit 0, zero warnings/errors after explicit `void` on the three negative type expressions. Root lint is syntactic; copied-declaration type-aware lint runs inside candidate reproduction. |
| `node_modules/.bin/oxfmt --check` on the six scripts/type fixture, two configuration files and six generated JSON files; `git diff --check` | Pass. Only intentional new files formatted. |

The expected mixed-proposal refusal is printed by Flue's existing error reporter; it is an asserted negative control, not an unhandled experiment failure. SQLite's experimental warning and the repository's existing module-type formatter warning are unchanged. Initial two-boundary success was correctly rejected on the boolean discriminator rather than blessed; the final cancellation control was strengthened to allow a late successful validator completion. Initial ordinary unified diffs triggered `git diff --check` on their context-prefix whitespace; regenerating zero-context review diffs preserved the candidate bytes and made the repository check meaningful. Earlier scratch output was not checked in; final curated profiles reproduce the corresponding negative/positive paths.

Unproved: real Anthropic acceptance of the native dialect/keywords/recursive schemas, constrained-generation behavior, upstream full-source builds/regression suites, actual ChatAgent/plugin native mounting, full crash recovery, browser effects/UI reconciliation, and final Mission schema acceptance. The native exporter still cannot encode arbitrary executable checks; canonical runtime validation remains mandatory. These schema diagnostics do not admit scenarios/transitions or expand the catalogue.

The previous [accounting handoff](../provider-boundary-20260908T142056Z/handoff.md) remains intact: below-admission terminal usage is observable, but cancellation may leave unknown spend and the existing ledger join is still required before paid work. This task adds no accounting implementation and edits neither ledger. Step A's remaining browser/native join and paid/provider gates stay owner-held; Step B remains forbidden.

## Intentional write set

Only this directory is added: `candidate-edits.json`, `candidate.patch`, `pi-source-candidate.patch`, `reproduce.mjs`, `probe.mjs`, `pi-source-diff.mjs`, `pin-inputs.mjs`, `installed-inputs.json`, `type-contract.ts`, `tsconfig.json`, `safety-gate.mjs`, `native-input-schemas.json`, the four profile reports (`baseline.json`, `flue-only.json`, `two-boundary.json`, `candidate.json`), this detailed report and `handoff.md`. The only other branch change is the requested authority-only cherry-pick. All temporary package copies were removed and shared installed/protected inputs reverified.
