# Combined native-schema, accounting and A4 integration

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Reviewed and integrated state

Tested alpha HEAD: **`5686b0224c`**. Native worker commits `6eae999b8f`, `fa0537fed6` and `10a37e753d` were reviewed and integrated as `d6efc4e034`, `f77a065541` and `5686b0224c`, respectively. Accounting and A4 had already been reviewed/integrated, including their requested corrections and the independent cold crash review. The rebase and intervening CORS/deploy/browser-test lint changes were preserved. A stale sequencer from the parent's failed pre-rebase native cherry-pick was inspected, matched to those exact three unapplied commits, and cleared with `--quit` without changing HEAD before the successful new cherry-pick.

Native review covered the three patch payloads, actual package-manager/type resolution, canonical `safeExtend` basis composition, production-converter retirement, parsed-data validation ownership, explicit numeric-string normalization, both SDK entrypoints and the synchronous built-in preparation correction. The parent verified the worker's 96 retained artifact entries and all installed/protected/source/build pins, replayed the installed runtime/mounted probes before integration, and inspected the native Boolean refusal screenshot. The maintained Flue patch's `async () => prepare(...)` correction preserves synchronous built-in tools under the existing abort helper; original regression tests exposed and then checked it. No strict-generation workaround, private application dependency import, broader catalogue admission or upstream work was added.

## Combined verification

All execution below used the retained native-delivery sandbox profiles. `verify-network-guard.mjs` demonstrated shell → Java/Node descendant `EPERM` for external TEST-NET sockets; deny profiles also deny loopback, while the browser profile permits loopback. Only the documented filesystem IPC exceptions are allowed. Offline package-manager flags are supplemental, not the egress guarantee. Prior worker OpenAPI Generator downloads remain disclosed in their original packets; this combined run does not relabel them or claim those earlier campaigns were network-isolated.

Commands from repository root, with `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery` and fresh output root `/tmp/m7-combined-integration.ngyF7V`:

```sh
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 yarn install --immutable
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
sandbox-exec -f "$E/deny-network.sb" env HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
sandbox-exec -f "$E/deny-network.sb" node "$E/installed-runtime.mjs" /tmp/m7-combined-integration.ngyF7V/native-runtime
sandbox-exec -f "$E/deny-network.sb" env M7_NATIVE_OUTPUT=/tmp/m7-combined-integration.ngyF7V/native-mounted YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent test:native-schema
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
sandbox-exec -f "$E/loopback-only.sb" bash apps/brunch-agent/test/history-retention-diagnostics.sh /tmp/m7-combined-integration.ngyF7V
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @local/petrinaut-arch-docs lint:arch-docs
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn exec tsgo --project libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-schema-20260908T150034Z/tsconfig.json
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn why @standard-schema/spec
git diff --check
```

The historical type fixture was compiled only; its original version/source pins and generated evidence were not rewritten. Fresh installed-runtime output is distinct from the old copied-package experiment.

| Oracle | Combined result |
| --- | --- |
| Immutable install/public types | Pass; installed hashes match the native worker's delivered patches, and exact Standard Schema dependency resolution is retained. |
| Forced package portfolio | **63/63 tasks, zero cache hits; 1,570 tests**: core 107, plugin 69, binding 20, transport 44, app 259, Petrinaut 692, website 379. The app count includes rebased CORS tests. All selected builds/typechecks/lints pass. |
| Native installed runtime | **19 named runtime/method observations**, 26 synthetic SDK responses, zero intercepted external-network attempts; native defaults, recursion, refinements, normalization, parsed-once data, hooks/cancellation, unchanged generic/Valibot controls and admission refusal pass. |
| Built native schema mount | Both provider entrypoints pass, 20 synthetic SDK responses; native root/addType schemas survive actual preparation/serialization, invalid raw input refuses and successful calls await the client. |
| Built accounting | **13 outcomes pass** on the patched runtime: reservation/identity, rejection-independent usage, cancellation uncertainty, restart and disabled-scope controls. Six main-process synthetic dispatches, no real provider call. |
| Native browser | **Pass**, real local Chrome, ten synthetic native SDK responses. Boolean and unknown-citation controls produce no browser result/effect; native root schema survives without strict generation; live read → normalized arc → verified record → one continuation passes. Duplicate/reload do not reapply and conflicting delivery does not continue. No browser/listener errors or origin-level blocked attempts. |
| New-record threshold/reopen | **Pass, preliminary**: 46 → 3 model messages, all 23 original public records unchanged, exact current revision retained, original-store authorization/reopen and no tool reissue. Still no second live browser after the retention process restart or A5 reopened-why claim. |
| Revision recovery | **Fail still present**: normal and uninterrupted before-outcome recovery controls retain one state write and next ordinal 2; after-outcome and interrupted-repair cases retain a successful result without its state write and next ordinal 1. Stable revision IDs are not reused. |
| Overflow continuation | **Fail still present**: rebuilt assistant-tail continuation fails while original public source records remain retained. No archive/source-loss repair is implied. |
| Architecture/format | Pass: 70 layers / 356 edges; formatting and whitespace checks pass. Existing unrelated warnings remain in logs. |

The A4 diagnostic shell exits zero because its expected failure observations and independent audit agree; that is not a recovery-safety pass. Its deliberate SIGKILL exits are labelled in the command log. Retained A4 output is under `a4-replay-sC4YecLN/`; the actual browser record is not supplied by the test runner or imported JSON. Saved history is only an equality oracle.

## Findings and next boundary

The maintained native input/validation path is now integrated and checked together with accounting and actual prepared browser records. This closes the local carrier/mechanics join, not real-provider schema acceptance, invoice fidelity, persona-wide accounting, broader scenario admission, genuine Vestera meaning, useful explanatory basis, A5 interaction or Step A acceptance. The root browser still deliberately uses one immutable original base, not a general sequential-mutation protocol. The single-writer accounting instrument's unresolved/journal-pending states remain paid-work stops.

Both A4 recovery failures persist on the combined patched runtime. After these results, Lu authorized a bounded local Flue recovery chunk for atomic revision settlement/recovery and valid overflow continuation, in parallel with A5. The separately committed Mission reconciliation owns that new execution authority; this evidence does not implement either remedy. Repairs must preserve existing store/history, stable call identity, nonterminating revision, causal browser results and Voice/Stop, and must make prospective safety assertions pass rather than weaken the existing discriminators. No upstream work or new storage system is implied.

Logs and observations are retained losslessly; SQLite DB/WAL/SHM files remain only in original ignored temporary stores, never portable import authority. `manifest.json` pins the evidence plus actual source/build/installed bytes. Shared paid ledgers remain five calls / US$0.09113535 with no outstanding reservation. No paid application/provider call or Step B work occurred, and nothing was pushed by this integration work.
