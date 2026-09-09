# First A5 product path on the repaired runtime

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Review and integration

Tested alpha HEAD: **`3fe6e0b862`**. Integrated owner inventory/scripts `78de886f8c` as `993c67e8de`, product `fb90244b23` as `3c73ab6a45`, original evidence/logs `1fc101a5d8` / `3dfa79a0bf` as `95bd40e6c8` / `cd01f1f8ab`, conservation correction `5f49529c8c` as `1aeca793df`, and correction evidence/pin `543c351a7b` / `0987537b91` as `87f25a36b8` / `3fe6e0b862`. The duplicate worker authority cherry-pick `dad3fbd48b` was omitted; alpha retains its later authority and verified recovery state.

Two independent scoped reviews were performed without the producer's conclusions. The why/reconciliation review found no concrete blocker and ran 37 contract tests. The evidence review reproduced silent loss of overlapping unchanged relations through the mounted source/locator/settlement path. The builder corrected the shared carry loop: only explicit new declarations override old relations, not relations already carried into the result. Its five red failures became 27 passing focused tests, including revalidation and atomic-refusal controls. The parent reran those tests and the mounted path; the independent re-review also passed the unchanged original counterexample and nine additional order/override/ambiguity/revalidation controls. All three reports are retained here.

The parent checked all 348 original A5 artifacts and 19 correction artifacts, along with source/build/protected pins before replay. Historical observations were not regenerated. The correction is evidence conservation, not a changed passage-continuity policy. Parent pre-integration source/locator and complete Chrome replays passed independently of the later combined verification.

## Combined verification

All commands used verified process-tree denial from `native-local-delivery`: deny all IP for builds/in-process probes, and the explicitly loopback-only profile for Chrome. Java/Node descendant guard controls passed before execution. No unguarded fallback, external artifact acquisition or paid application/provider request occurred. Existing codegen artifacts were local; previous acquisition incidents remain separately disclosed.

With `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery` and fresh output root `/tmp/m7-a5-alpha.JMJnc3`:

```sh
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
sandbox-exec -f "$E/loopback-only.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 M7_BROWSER_OUTPUT=/tmp/m7-a5-alpha.JMJnc3/browser yarn workspace @apps/brunch-agent test:reopened-why
sandbox-exec -f "$E/loopback-only.sb" bash apps/brunch-agent/test/history-retention-diagnostics.sh /tmp/m7-a5-alpha.JMJnc3 all
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' yarn workspace @apps/brunch-agent test:workpiece-evidence
sandbox-exec -f "$E/deny-network.sb" env HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
sandbox-exec -f "$E/deny-network.sb" env M7_NATIVE_OUTPUT=/tmp/m7-a5-alpha.JMJnc3/native-mounted YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent test:native-schema
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @local/petrinaut-arch-docs lint:arch-docs
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
git diff --check
```

**All pass.** The portfolio completed **63/63 uncached tasks and 1,618 tests**: core 128, plugin 73, binding 20, transport 44, app 278, Petrinaut 692, website 383. All selected builds/typechecks/lints pass. Architecture and formatting checks pass; existing unrelated warnings remain visible in the logs.

| Real boundary | Combined observation |
| --- | --- |
| Model-obtainable evidence/locators | Ten required assertion completions, 29 synthetic native SDK requests. Positive source IDs and candidate/current spans come from the actual `brunch_workpiece` result; two overlapping relations survive omitted-evidence carry and runtime reopen. Invalid source/span, missing state, cancellation and drift controls remain intact. |
| Actual Chrome A5 | 81 synthetic SDK requests including the initial A3 witness; 14 actual model-facing why results across declared (9), absent (3) and temporal (2) cohorts. Actual browser effects, source/basis linkage, live read correlation, current workpiece/why pane, serialization-equivalent reopened answer, no-op/conflict controls and actual properties-UI hand-edit refusal pass. Cohort browser errors and blocked-origin attempts are empty. |
| A5 reopen | The same original stores are used after `application.stop()`/load plus actual Chrome reload. This is a runtime restart, **not a second OS process** or relocation/import witness. The limit is explicit in each cohort's observation. |
| Native carriage | Both actual SDK entrypoints pass with 20 synthetic responses, no strict-generation workaround or payload substitution. |
| Accounting | Thirteen outcomes pass; six main-process synthetic starts/dispatches. The actual shared paid ledger is unchanged. |
| Recovery and retained browser records | The separate fresh `a4-safety-wo9k4Ytg` packet passes **11/11**: seven exact crash cases, silent/explicit/cancelled overflow with independently pinned completed response, and original browser/threshold/process-reopen. No failures; deliberate SIGKILL exits remain labelled controls. |

The A5 browser path uses real native SDK serialization and the actual product route, but scripted model responses. The first product evidence/locator/why affordance is earned; real-model semantic fidelity, source relevance, template quality, useful explanation and genuine expert testimony are not inferred from it. Canonical positive browser results are observed, not fabricated or restored from saved JSON. Expected conflict-refusal stacks in logs are asserted controls.

## Decisions and remaining contract

The integration accepts the first synthetic A5 path and its conservative refusals. It preserves operation-level basis limits, revision-local continuity fallback, distinct raw hashes for the authorized full-definition serialization equivalence, and the distinction between current state and historical tool inputs. No current state is reconstructed to conceal an inconsistent legacy store. The fixed root-arc fixture still has one immutable original mutation base; broader construction and correction progression remain outside this witness.

Next work must move toward the genuine Mission 7 throughline: sufficient native construction/effect/base progression for the selected region, actual provider behavior under a pinned bounded instrument, and A5 query/source durability after true process restart and compaction. These are not permissions to invent support, weaken the ordinary explanation-coverage rubric, import a prepared pair as genuine history, add another ledger/projection engine, spend without a reservation or self-accept Step A/Step B. Lu's AFK delegation permits bounded evidence-backed decisions and paid runs inside the existing envelope; final utility and mission acceptance remain his gates.

Raw DB/WAL/SHM files remain in original ignored temporary locations. Retained JSON observations are evidence/equality oracles only. `manifest.json` pins the actual tested source/build files and retained output bytes. Nothing was pushed by this integration work. The shared paid ledger remains five calls / US$0.09113535, with no active reservation or new spend from these runs.
