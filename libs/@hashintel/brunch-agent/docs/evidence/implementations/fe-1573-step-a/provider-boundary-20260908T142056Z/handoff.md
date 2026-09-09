# Step A provider-boundary discriminator handoff

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Result and authority

**The installed Anthropic adapter has a supported, root-preserving path: per-tool `constrainedSampling: { type: "json_schema", strict: "require" }`.** With the unchanged `anthropic/claude-sonnet-4-6` catalogue entry, both provider entrypoints preserve the complete tested input schema at `onPayload`; synthetic SDK serialization preserves those same tool schemas. This is a **Pass for the tested local pre-HTTP conversion**, not Anthropic schema acceptance, constrained-generation fidelity, a structural production mount, or paid proof. The unchanged Flue tool declaration/conversion path does not expose or forward this setting. A scoped provider-context annotation or upstream Flue support is still an **owner-held schema-policy/wiring decision**; neither was installed here.

**Underlying usage remains observable below the unchanged admission decorator.** An eager `upstream.result()` observer records the native adapter's terminal usage independently of the decorator's refusal or iterator disposal. A completed mixed proposal reports 160 synthetic tokens / US$0.00057975 catalogue-estimated cost underneath, while the actual installed Agent failure handler and Flue usage normalizer produce zero downstream. Partial, missing and late cancellation outcomes are distinct. This is a **Pass for the synthetic capture discriminator, Partial for production accounting readiness**: no ledger integration, persistence/crash safety, live request correlation or billed-cost reconciliation was installed or proved.

Worktree: `/Users/lunelson/.herdr/worktrees/hash/m7-provider-boundary`; branch `ln/fe-1573-provider-boundary`; base `550abe7dc76110c1fe5de240821f477c50d8d645`. `MISSION.md` is unchanged and the sole execution authority. Step B was not executed. No provider/model identity, dependency version, production mounting, canonical schema, admission policy or shared ledger changed. Zero network requests, paid calls and spend. The existing ledger remains **5 calls / US$0.09113535**, no outstanding reservation.

## Schema observations

`root-schema.test.ts` reads the real canonical `petrinautAiTools.addArc.inputSchema.toJSONSchema()`, runs the existing structural carrier and the installed Flue converter, and asserts exact equality apart from Flue's existing removal of the root `$schema` dialect. No Petrinaut fields are copied. It additionally exports a native Valibot recursive string/array fixture inside a closed described root object. That separate synthetic fixture supplies the `$defs`/recursive-reference discriminator: canonical `addArc` itself has no `$defs`. It does not admit transitions or extend the mechanical carrier's reference vocabulary.

| Installed path | Observed schema delta |
| --- | --- |
| Canonical `addArc` → carrier → Flue | Only root `$schema: "https://json-schema.org/draft/2020-12/schema"` is removed. Root `additionalProperties: false`, description, properties, nonempty `required`, nested `oneOf`, typed constants and numeric bound are exactly retained. |
| Pi `stream` / `streamSimple`, setting omitted or `false` | Root reconstructed as `{ type: "object", properties, required }`. Root `additionalProperties: false` and root description disappear. On the recursive fixture, root `$defs` disappears while the property `$ref` survives and dangles. Nested constraints under properties remain unchanged. The separate tool-level description is retained; it is not proof that the root description survives. |
| Pi `stream` / `streamSimple`, `strict: "prefer"` or `"require"` | Tool receives `strict: true`; complete `input_schema` is deep-equal to the actual Flue output for both fixtures. Root strictness/description and recursive `$defs` survive; every local `$ref` resolves, including the self-reference inside `$defs`. No canonical post-validation or schema rewrite supplies this equality. |
| Actual nested SDK serialization, legacy versus `require` | Two injected synthetic fetch functions inspect the serialized JSON request body and return local HTTP-400-shaped responses. Serialized `tools` equal `onPayload.tools`; the SDK neither repairs the legacy loss nor removes the strict-path root fields. No socket or real fetch is invoked. |

The eight conversion cases deliberately throw in `onPayload` before fetch; the two serialization cases proceed only to a supplied in-memory fetch stub. Global fetch is a throwing guard. `root-schema.json` retains selected input schemas and captured payloads, not credentials, request headers or raw scratch logs. Its `forbiddenFetchCalls` is zero; two **synthetic fetch invocations** are separately labelled. The native recursive fixture also accepts nested strings/arrays and rejects a nested number locally, but its provider acceptance is untested.

One additional observed reference mechanic is retained rather than normalized away: separate exports of the lazy fixture allocated `#/$defs/0` and `#/$defs/1`. The initial assumption that independent native exports must use identical labels failed twice, including with matched `errorMode: "ignore"`. The probe now feeds and compares the **actual Flue export** through the provider, preserving its identities; `standaloneRecursiveSchema` retains the other export. No reference-renaming equivalence policy was adopted. The original carrier still fails closed for unsupported `$defs`/`$ref` vocabulary.

### Supported surface and exact gap

- Pi AI 0.83.0 `README.md`, **Constrained Sampling for Tools** and **Debugging Provider Payloads**, documents `Tool.constrainedSampling`, `prefer` versus `require`, and `onPayload`. `dist/api/constrained-sampling.js:51–63` returns strict mode when supported; `require` throws when unsupported whereas `prefer` may silently fall back. This probe does not change the model/compat flags to manufacture support.
- The selected installed model has `compat.supportsStrictTools: true`. `dist/api/anthropic-messages.js:995–1022` is the exercised conversion: only the strict branch spreads the supplied root schema, then overlays `type`, `properties`, and `required`. Exactness here is for the tested object roots with nonempty `required`, not every possible JSON Schema root.
- `dist/api/anthropic-messages.js:363–375` invokes `onPayload` after `buildParams`, before `client.messages.create`. The actual nested SDK 0.91.1 `resources/messages/messages.mjs:15–38` forwards the body, and `internal/request-options.mjs` JSON-serializes it. The serialization probe exercises that path rather than relying solely on this source read.
- Flue 2.0.3 `dist/schema-DIDpvZZa.mjs:24–32` exports Valibot using fixed `errorMode: "ignore"`, strips root dialect and caches the result. `dist/conversation-stream-store-CXwRWonS.mjs:3318–3336` constructs custom tools with name/label/description/parameters/execute; it does **not** forward constrained sampling. `ToolDefinition` in `dist/types-CVx9SjIx.d.mts:152–177` and `UseModelOptions` in `dist/index.d.mts:612–621` expose no such option. Merely adding an unrecognized field to a Flue tool is not a supported fix.
- Current `packages/plugin-sdcpn/src/tools/petrinaut-construction.ts` still selects the structural carrier only for `addType`; `addArc` remains loose. Applying strict mode to the existing loose arc schema would **not** provide canonical root carriage. The owner must retain A1's normalization-before-structural-carrier composition when joining the structural arc.

### Smallest owner options, not applied changes

1. **Approve scoped per-tool `strict: "require"` annotation at the supported provider registration boundary**, only for the joined structural root-arc contract after its actual provider context is checked. Preserve `parameters` wholesale; add only Pi's supported tool metadata before delegating to the same native provider. Keep admission outside this wrapper and preserve its ChatAgent scope and both entrypoints. This needs no new converter, hand-copied schema, model change or dependency version. It does introduce constrained sampling policy, so it is not silently authorized by this probe. `require` is preferable to `prefer` for fail-closed fidelity because unsupported catalogue capability must not restore the observed lossy fallback.
2. **Request upstream Flue per-tool constrained-sampling passthrough**, preserving the same canonical carrier and native provider. This avoids app-owned tool annotation but needs an upstream/dependency intervention and later verification, outside this lane. If constrained sampling itself is unacceptable, the distinct upstream alternative is to preserve the full root in Pi's non-strict converter; no such installed non-strict path was found or invented.

Whichever branch Lu selects, provider-side acceptance of this exact `oneOf`/bound/optional-property schema remains unproved. Do not weaken the canonical contract to satisfy a hypothetical provider restriction. Empty-required policy, transitions and scenarios remain out of scope. A root-preserving adapter does not solve per-tool canonical reference export or scenario default semantics.

## Accounting observations and seam

`usage.test.ts` calls the real native Anthropic provider with supplied in-memory SSE responses, under the unchanged `withBufferedToolAdmission`. Its synthetic proposals name `update_workpiece` and `addArc`; none are mounted or executed. It exercises both provider entrypoints. A probe-local observer attaches to `result()` immediately below admission and snapshots cumulative usage (never adds partial snapshots). It returns the same upstream stream, with a single wrapped iterator for progress observation; there is no competing consumer and no second proposal/history store.

| Case | Underlying observation | Admission / accounting consequence |
| --- | --- | --- |
| Complete mixed proposal, both methods | Input 100, output 10, cache read 20, cache write 30, total 160; `cacheWrite1h: 5`, `reasoning: 3`; response id retained. Estimated cost US$0.00057975. | Both decorator surfaces refuse; zero events publish. Underlying result remains capturable once. The same rejected stream is fed to Flue's installed `Agent` dependency without another provider invocation; its failure handler emits zero usage, and actual Flue `fromProviderUsage` retains zero. |
| Abort after initial usage and tool events, before final usage | Native terminal `aborted`: input 100, output 1, cache read 20, cache write 30, total 151; US$0.00044475 estimate. | Upstream signal aborts and no events publish. These are received partial counts, **not final billed usage**. The synthetic transport honors the abort by erroring its local response body. |
| Abort after response headers, before usage | One synthetic request started, native terminal `aborted` with zero usage and no response id. | Zero does **not** establish a free request. Final cost remains unknown. This differs materially from pre-aborted admission. |
| Native completion approved, then cancelled before replay | Complete 160-token usage survives below admission. | Publication still refuses after cancellation; known completed usage does not disappear with the user-visible cancellation. |
| Signal-ignoring upstream | Admission returns cancellation promptly; no terminal result exists at that point. A deliberately delivered late synthetic result later provides 110 tokens / US$0.00045. | Mark unknown while unsettled; a late terminal observation can reconcile accounting but cannot reopen publication. If it never arrives, or the process dies, no complete usage can be inferred. |
| Already-aborted admission | Underlying provider start count zero. | This probe can positively distinguish not-started from started-with-zero/missing usage. |

`usage.json` retains only curated metadata, usage, downstream outcome and synthetic identifiers. It is not an additional authoritative ledger. Five in-memory fetch/SSE invocations occur across the native usage cases; the signal-ignoring case uses Pi's in-memory event stream. Global network guard attempts are zero. No real Anthropic SSE, invoice, headers or usage were acquired.

### Why ordinary Flue metering loses the refused request

The installed `@earendil-works/pi-agent-core/dist/agent.js:317–355` catches a throwing provider stream in `runWithLifecycle`; `handleRunFailure` creates a fresh assistant error with `EMPTY_USAGE`. This is the code exercised by the diagnostic Agent, not a reimplemented failure handler. Flue's `Session` subscribes to that Agent: `conversation-stream-store-CXwRWonS.mjs:2334–2382` commits the assistant completion's usage and aggregates it into response usage; `emitTurn` near line 2105 projects it through `fromProviderUsage`. Thus `turn.response.usage`, canonical assistant completion usage and response/operation rollups all describe the **decorator-visible failure**, not the withheld native response. An ordinary `observe(turn)` subscriber cannot reconstruct usage it never received.

`dispatch-nU3cIlT-.mjs:1048–1064` copies the public aggregate components, omitting Pi's extra `cacheWrite1h`/`reasoning` detail. Retain the original Pi usage object for accounting, not only that normalized projection. Neither cache-write duration nor reasoning is an additional token component to sum: they are subsets. Pi computes cost from the model catalogue in `dist/models.js:371–390`; the synthetic example includes the 1-hour cache rate at twice base input. These monetary fields are **catalogue estimates from reported counts**, not provider-reported invoice amounts.

### Exact prospective ledger join

The smallest demonstrated data seam is:

```text
existing shared reservation / per-request identity
  → same native provider's stream or streamSimple starts
  → attach one terminal-result usage observer BELOW admission
  → unchanged buffered admission either approves, refuses or cancels
  → reconcile that one existing shared ledger call/attempt row independently of admission
```

For an owner-approved paid instrument, use the existing `usage-ledger.json` call entries and `attempt-ledger.md`, not a new persistent usage system or canonical tool-history record. Required joining semantics:

- Reserve and retain an identifiable attempted-call row **before** invoking the underlying provider; preserve local preparation failure versus transport-started versus response-observed distinctions. The probe's in-memory rows begin after a stream object is returned; they are not a complete production reservation/failure implementation.
- Capture provider/model, token cap, reservation id and unique request ordinal alongside known conversation/submission/operation/turn ids. The supported Flue `instrument` model interceptor is the identity seam: `emitTurnRequestAndStream` at lines 1167–1182 calls `interceptExecution({ type: "model", turnId }, executionContext, ...)` around provider start, and `wrapProviderStream` at lines 983–998 re-enters it for iterator/result reads. Propagate the immutable ids through a scoped async context or an owner instrument; do not match calls by timing or `sessionId` alone. `executionContext()` at lines 3717–3725 provides session/conversation plus active operation/turn identity. The public interceptor contract in `docs/reference/events.md:623–659` supplies the available fields; absent ids must remain absent, not invented. **This correlation/persistence join is identified by source, not exercised against the built route here.**
- Attach `upstream.result()` once immediately, before handing the stream to admission. Persist its usage and optional response id independent of admission success; a request's terminal event and its `result()` are two views of one outcome, not two billable calls. Capture optional response/request ids from supported `onResponse` headers if the owner needs provider reconciliation; never retain credentials or full header sets.
- Keep accounting status separate from proposal admission: completed/rejected or completed/cancelled can have complete received usage; aborted/error/never-settled can have partial or unknown usage. Do not release the conservative reservation or continue paid work on an unknown amount merely because Flue emitted zero, a terminal error arrived, or cancellation was acknowledged. Any accepted fallback settlement of uncertain spend is an owner decision; Mission currently says uncertainty stops paid work.
- Preserve cancellation latency: waiting for an uncooperative terminal result must not hold admission/Stop open. Retain the unknown attempt for owner reconciliation and accept late accounting without executing late output. Process death can lose a live observer's result; neither Flue `observe()` nor this probe is durable. `observe()` contains subscriber failures and does not await writes, so it is not a durable preflight/reservation gate.
- Preserve request bounds and no silent retries. Pi's `provider-retry.js` defaults to zero and these probes explicitly set `maxRetries: 0`; its SDK request also sets zero. Flue has separate transient-model retry logic near lines 3990–4025. Any future retry is a separate underlying attempt needing reservation/counting even if it shares higher-level identity. No retry campaign or crash accounting was run here.

No production billing total was patched and no error message was changed to smuggle usage through the refusal. The owner can now select and implement this existing-ledger capture seam, then prove it through the built production registration before another paid reservation.

## Versions, verification and exact writes

Installed identities (also hashed in `identities.json`): Pi AI **0.83.0**, Pi Agent Core **0.83.0**, Flue **2.0.3**, Valibot **1.4.2**, Valibot JSON exporter **1.7.1**, Zod **4.4.3**, Node **v22.21.1**. Pi resolves its nested Anthropic SDK **0.91.1**; top-level SDK **0.74.0** is not the adapter SDK. `identities.mjs` hashes installed source and asserts protected source/ledger/lockfile byte equality against the base.

All commands below ran from the repository root. `E` denotes exactly `libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/provider-boundary-20260908T142056Z`. No raw scratch logs are checked in.

| Exact command | Result |
| --- | --- |
| `YARN_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 COREPACK_ENABLE_NETWORK=0 yarn install --immutable` | Exit 0, offline cache/link install; peer and disabled-script warnings, no dependency/lock changes. This worktree initially had no `node_modules`. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/petrinaut-core exec vite build` | Exit 0; local prerequisite artifact for canonical package imports. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/brunch-agent exec vite build` | Exit 0; local prerequisite for registration regression. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/brunch-agent-plugin-sdcpn exec vite build` | Exit 0; same. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/brunch-agent-transport-aisdk exec vite build` | Exit 0; same. These are direct package build executables, not a claimed full Turbo/app build. |
| `PROVIDER_BOUNDARY_REPORT=1 node --experimental-strip-types --test "$E/root-schema.test.ts" "$E/usage.test.ts"` | **19/19 pass**; regenerates curated reports. The two report-retention assertions are included in that count. Node emits its existing root-package module-type warning; no manifest change made to suppress it. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/provider-admission.test.ts test/provider-registration.test.ts` | **12/12 pass**: unchanged bounds, both entrypoints, cancellation/late-output, classification and real app registration scope regression. Registration's routing is mocked; no built mounted HTTP claim. |
| `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @hashintel/brunch-agent-plugin-sdcpn exec vitest run test/schema-carrier.test.ts test/carrier-feasibility.test.ts` | **42/42 pass**, unchanged carrier regressions; no new admission or disposition of the out-of-scope classes. |
| `node_modules/.bin/tsgo --project "$E/tsconfig.json"` | Exit 0. Narrow strict check includes both new TS probes and their imported production admission/carrier source. |
| `node_modules/.bin/oxlint --type-aware --type-check --tsconfig "$E/tsconfig.json" "$E/root-schema.test.ts" "$E/usage.test.ts" "$E/identities.mjs"` | Exit 0, zero warnings/errors. |
| `node "$E/identities.mjs"` | Exit 0; protected equality and package/source identities captured. |
| `node_modules/.bin/oxfmt --check "$E/root-schema.test.ts" "$E/usage.test.ts" "$E/identities.mjs" "$E/tsconfig.json" "$E/root-schema.json" "$E/usage.json" "$E/identities.json"`; `git diff --check` | Exit 0 after formatting intentional files only. |

Earlier runs are not hidden: the recursive export identity assumption failed as described above; initial strict typechecking exposed schema-library type differences and async control-flow narrowing in the probes, then passed after using the actual Flue output and accurate types. Initial lint required explicit `void` for Node test registration promises. The first registration regression run had 11 passes and one suite blocked by the missing local transport build; the unchanged test passed after that prerequisite was built. Initial identity capture hit Node's default subprocess buffer limit on `yarn.lock`; the script now sizes the buffer from the already-read file and passes. No unrelated test was weakened or skipped to obtain green results.

Exact intentional write set, all within this directory:

- `root-schema.test.ts`: canonical/Flue/native-provider schema and SDK serialization discriminator.
- `root-schema.json`: curated input/output schema observations, selected model and limits.
- `usage.test.ts`: native synthetic SSE, actual failure/normalization and cancellation accounting discriminators beneath unchanged admission.
- `usage.json`: curated metadata/usage observations; not a ledger or paid usage.
- `tsconfig.json`: narrow strict verification scope; no package/dependency manifest.
- `identities.mjs`, `identities.json`: reproducible version/source pins and protected-base equality.
- `handoff.md`: this result, commands, source seams, owner choices and limits.

No production, package, lockfile, policy, Mission, shared ledger, A3/browser, Voice, transport, or integration-owner source edits. Existing tests were run, not modified. No new architecture folder, published package behavior, user docs or changeset is implicated by an evidence-only directory.

## Next join enabled / stop

The owner-held settled-basis/root-arc browser join can consume a concrete **native provider capability and a minimal explicit policy choice**, rather than inventing a converter or blessing legacy root loss. It still needs its own structural mount, issued identity/base/incarnation, settled citation/basis and actual browser record/result continuation proof. No provider annotation should be mistaken for that join.

Before any paid work, Lu/the integration owner must select the constrained-sampling or upstream branch and implement/prove the existing-ledger reservation/correlation/terminal-capture seam with unknown-cancellation handling. Under the current unchanged production path, complete root fidelity and paid accounting readiness remain fail-closed. These synthetic observations do not authorize a paid call, accept Step A, establish genuine Vestera meaning or unlock Step B.
