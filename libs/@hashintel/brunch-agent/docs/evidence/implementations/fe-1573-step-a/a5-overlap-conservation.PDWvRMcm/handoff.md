# Preserve overlapping carried evidence — review correction

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Result

**The conservation blocker is fixed at the shared core root.** `settleWorkpieceEvidence` now keeps explicit new declarations separate from the accumulated result. Only explicit declarations participate in the existing overlap-override check; carrying an old relation cannot suppress another old relation. No deduplication, sorting, new passage identity, continuity expansion, schema or tool-surface change was introduced.

Base: `3dfa79a0bf8ea97b352b39468bfdd84fe5b26569`, branch `ln/fe-1573-evidence-why`, assigned worktree unchanged. Correction commit: **`5f49529c8ca78d4ff9dc149ea65e80a3015fcb06`**. The following evidence commit retains this new packet. The previous A5 evidence remains immutable; its overlapping-relation conservation claim was incomplete and is corrected by this witness, not reclassified as a continuity/relevance limitation.

## Exact write set

- `libs/@hashintel/brunch-agent/packages/core/src/update-workpiece.ts`: parse `declaredRelations`, initialize the separate `relations` accumulator from them, and use only `declaredRelations.some(...)` for override decisions. Existing carry eligibility and final validation remain unchanged.
- `libs/@hashintel/brunch-agent/packages/core/test/workpiece-evidence.test.ts`: same-span different kinds and partially overlapping unchanged spans in both orders; explicit-new-declaration override with an unrelated old relation preserved; both overlapping relations still refuse automatic carry after move/change/duplicate ambiguity.
- `libs/@hashintel/brunch-agent/packages/core/test/update-workpiece.test.ts`: atomic refusal when the second carried source is no longer authorized, a later explicit span is invalid, cancellation occurs, or current state drifts. The state-drift case preserves the concurrent state instead of overwriting or rolling it back.
- `apps/brunch-agent/test/workpiece-evidence.integration.ts`: settle and expect two same-span relations, then require both after omitted-evidence carry and actual runtime reopen. Additional outer assertions check the durable output and that raw carried input still omits evidence. Positive IDs/spans still come from actual `brunch_workpiece` results, not private successful-path calculations.
- This evidence directory only. No Mission, package/script/inventory, dependency/patch, ledger, why/reconciliation, browser or guidance edit.

## Red → green evidence

| Oracle | Red, before the production change | Green |
| --- | --- | --- |
| Focused core suites | **5 failed / 22 passed**: all four carry-order cases lose a relation; the invalid second carried source is silently skipped and a new state incorrectly settles | **27/27 pass**, including all four atomic-refusal cases and the unchanged edit/ambiguity controls |
| Strengthened mounted source integration | Fails after same-store reopen: expected two relations, actual only elicited at `[15,32)` | **10 required assertion completions / 29 synthetic native SDK responses**; initial, carried, recorded output and reopened current state all preserve both relations |
| Cold reviewer's original repro, unchanged | Fails with 9 instead of 10 completed assertions | **10/10 completions / 29 synthetic native SDK responses**, using the same unchanged repro source against the corrected build |
| Required affected portfolio | Not weakened or selectively skipped | **63/63 uncached tasks, 1,610 tests**; all builds, unit tests, types and lints pass |
| Formatting / whitespace / commit hooks | — | Repository format check, `git diff --check`, and guarded commit hooks pass |

The full portfolio counts are core 128, plugin 73, binding 20, transport 44, app 270, Petrinaut 692 and website 383. Existing warnings remain unchanged. The app's 11 why/reconciliation tests still pass; no new Chrome witness or runtime-recovery integration is claimed by this correction.

`reviewer-repro.mts.gz` and `reviewer-original-failure.json.gz` preserve the supplied cold repro and its original failure losslessly. `cold-repro-red.json.gz` and `mounted-red.json.gz` retain fresh pre-fix reproductions. `cold-repro-green.json.gz`, `mounted-green.json.gz` and `observations.json` retain new success. The mounted proof starts from a fresh original SQLite store, obtains the actual source ID and candidate/current locator through the product tool, settles elicited plus formalism-constraint relations at the same span, appends unrelated context with evidence omitted, and reopens through the same authorized product operation. It does not import saved JSON into state. Synthetic factory assertions are additionally checked outside the response factory, so a swallowed failed factory cannot yield a pass.

The mounted first revision is `evidence-revision`, display ordinal 1. The carried/reopened revision is `carried-revision`, ordinal 2. Both relation objects, their order, source IDs and locators are equal across those observations. The new raw update input contains only Markdown; the successful durable result contains both validated carried relations. This is conservation of existing declarations, not newly invented support.

## Commands and environment

The process-tree guard was reverified **before probes/builds**. No install was needed; local artifacts were already present. All application/test/build commands below ran under `native-local-delivery/deny-network.sb`, with no paid call or external provider egress. Original and new SQLite stores remain in their original temporary directories, never committed/imported.

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
node "$E/verify-network-guard.mjs"

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 \
  yarn workspace @hashintel/brunch-agent exec vitest run test/workpiece-evidence.test.ts test/update-workpiece.test.ts

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' \
  yarn workspace @apps/brunch-agent test:workpiece-evidence

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' \
  node --experimental-strip-types /tmp/a5-independent-core.USwLHi/overlap.integration.mts

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true \
  HASH_OTLP_ENDPOINT='' VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat \
  yarn exec turbo run build test:unit lint:tsc lint:eslint \
  --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn \
  --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk \
  --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut \
  --continue=always --force --concurrency=1

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
git diff --check
```

Scratch root: `/tmp/m7-a5-overlap.gap8tI6J`. Strengthened mounted red/green stores: `/var/folders/2c/ptn6jcrj61lck_yzfz_p3b5m0000gn/T/m7-a5-evidence-FjMs63` and `.../m7-a5-evidence-r1jBJ0`. Cold repro red/green stores: `.../m7-a5-evidence-lHED7Z` and `.../m7-a5-evidence-R3gnTL`. Both green mounted runs occurred after the complete build, with no concurrent build writes. Command logs are retained under `command-logs/`; exact source/build/guidance/artifact hashes and protected-path checks are in `manifest.json`.

## Scope and integration dependency

This enforces the existing conservation requirement. Every surviving carried relation still goes through the existing final span/kind/source validation before the one state write; invalid later relations, cancellation and state drift do not partially settle. The explicit-new-declaration overlap policy, move/change/duplicate-ambiguity refusals, role authorization, native schema policy, no-op/effect/why semantics, Voice exclusions and stock behavior are unchanged.

There are no new dependencies, scripts or hermetic entries to integrate. No paid request, ledger write, push or agent-generated acceptance occurred. Relevance, template completeness, real-model fidelity and utility remain unassessed. **The combined runtime-recovery recheck remains parent integration work**, as before; this correction does not claim to perform or replace it.
