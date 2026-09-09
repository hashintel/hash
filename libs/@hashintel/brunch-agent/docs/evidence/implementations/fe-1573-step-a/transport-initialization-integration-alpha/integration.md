# Optional transport initialization — integrated checkpoint

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Scope

Reviewed and integrated worker checkpoint `cb5482aae6b5544eb6f7ee8d4ecf47c8dd2df8fa` as alpha `d606c98050a0f8c6bce7204885e40d8472e8ea27`. This adds the already-authorized SDK-owned opaque `initialData` option and its website bridge forwarding. Configured user submissions, including same-message retries, carry the same value; default sends omit the field; client-result signals never carry it. The public SDK owns the type. No initialization flag, wrapper client, new route/store or binding reinterpretation was added.

The semantic diff's apparent deleted website test is parameterization of the existing test into configured/unconfigured cases, with its prior lifecycle/admission assertions preserved. The transport package is private; this checkpoint does not change published Petrinaut APIs or visible UI behavior. The source-read operation footprint table is retained in [construction-readiness/checkpoint.md](../construction-readiness/checkpoint.md); it grants no new operation class.

The construction callsite, sequential native weight/effect/why path and browser-admission catalogue correction remain separate unintegrated work. In particular, this checkpoint does not prove new-mode first-user initialization merely because the transport can forward it. Retained conversation binding still requires its original authoritative identity; later ignored initial data is not rebinding.

## Fresh verification

All commands used verified native-local-delivery process-tree profiles. Java and Node descendant controls passed again. No install/codegen/provider networking was enabled; the existing authorized generator JAR was already present.

| Boundary | Result |
| --- | --- |
| Forced serial combined build/unit/type/lint portfolio | **63/63 successful tasks, zero cached, 1,629 tests**, exit 0 |
| Transport unit suite | 45 passed |
| Core / plugin / Flue binding unit suites | 128 / 73 / 20 passed |
| Petrinaut / app / website unit suites | 692 / 287 / 384 passed |
| Existing actual-Chrome A5 regression | **81 synthetic SDK requests / 14 why results**, declared/absent/temporal cohorts, zero cohort browser errors or blocked-origin attempts |
| Existing built accounting discriminator | **13 outcomes**, six synthetic starts/dispatches, exit 0 |
| Source/build/runtime artifact pins | 1,046 files retained in `instrument.json.gz` |
| Shared real ledgers | Unchanged, **5 calls / US$0.09113535**, no active reservation |

The A5 run retains actual source/evidence/basis/browser-record/why/reconciliation controls and runtime/browser reopen on the original stores. Its restart is **same-process**; the separately integrated [three-process proof](../a5-process-retention-integration-alpha/integration.md) is a different instrument and was not rerun for this optional/default-omitted forwarding change. Expected conflicting-result and accounting-refusal errors are preserved in logs, not hidden as noise.

The thirteen existing accounting outcomes are regressions, **not closure of the new missing-terminal-usage readiness blocker**. That independent counterexample and required raw attestation remain [open for correction/re-review](../real-provider-a5-review-alpha/decision.md); this green portfolio grants no paid allocation or egress.

## Exact commands

Run from the repository root after `node "$E/verify-network-guard.mjs"`, where `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery`:

```sh
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
```

The product commands ran from `apps/brunch-agent`, using the corresponding absolute/relative profile paths and fresh output `/tmp/m7-transport-checkpoint.yXAwOr/a5-browser`:

```sh
sandbox-exec -f ../../libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/loopback-only.sb env M7_A5=1 M7_BROWSER_OUTPUT=/tmp/m7-transport-checkpoint.yXAwOr/a5-browser HASH_OTLP_ENDPOINT='' node --experimental-strip-types test/transition-records.integration.ts
sandbox-exec -f ../../libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/deny-network.sb env HASH_OTLP_ENDPOINT='' node --experimental-strip-types test/provider-accounting.integration.ts
```

Do not rerun into the existing output directory. All owned runtime/browser/listener processes exited; the temporary test pane was closed. The accounting fixture stayed at `/var/folders/2c/ptn6jcrj61lck_yzfz_p3b5m0000gn/T/TEST-provider-accounting-gSEtSO`, separate from real authority.

`artifact-manifest.json` hashes 59 retained artifacts: exact logs/exit codes, complete JSON browser observations/history/records/why results, raw synthetic request captures and two screenshots. Newly packed files preserve their original source hash/bytes; already-compressed native captures are copied byte-for-byte. Remaining local screenshots, live SQLite stores and profiles stay at the original temporary location; no saved projection was imported as state. `instrument.json.gz` pins changed source and actual built/runtime files at the verified commit.

No new provider compatibility, genuine Vestera construction, useful ordinary/per-class explanation coverage, broader operation admission or Step A/B acceptance is claimed. Nothing was pushed.
