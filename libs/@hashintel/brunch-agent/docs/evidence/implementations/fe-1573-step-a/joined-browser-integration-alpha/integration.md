# Joined-browser integration on alpha

## Integration and review

Integration owner reviewed and cherry-picked the browser worker's implementation `1067dedee4a31a2b0935166eefcc5a961f00ec08` as `bd6f497fb2`, evidence `f458eab7ab51ea86d8afa3bb66877461bf2ed3ca` as `82cb3f71dd`, and requested policy clarification `978f33680cad3359ab3f43572d50e27f3f098236` as `d6ee1ff631`. The clarification changes only the handoff and its manifest entry: the witness uses the interim carrier; native input-schema carriage and production-converter retirement remain prerequisites for paid construction and schema-path acceptance. No protected behavior was relaxed and no production correction was required by the integration review.

The review traced settled revision exposure, historical citation resolution, validation-before-browser-publication, raw-history versus normalized execution input, incarnation/base binding, record/result verification and duplicate/conflict behavior across the committed core/plugin/app/transport/website paths. The primary witness script and rendered selector/result screenshots were inspected. All 116 committed evidence entries matched their recorded byte lengths and SHA-256 values; the worker's mission, original mounted mixed-batch test and paid ledger matched its base byte-for-byte. The attempted separate read-only reviewer was unavailable because this host rejects Dogsled children with overridden filesystem tools; this is an integration-owner review, not an independent cold review.

## Integrated verification

Commands ran on alpha after the implementation/evidence integration. The tested product source is `82cb3f71dd`; subsequent `d6ee1ff631` changes evidence wording only. Logs are retained losslessly beside this report. `manifest.json` pins the retained artifacts. The original scratch root was `/tmp/m7-browser-integration.vJiHsf`; its SQLite store is not checked in or claimed as a portable history export.

```sh
YARN_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 COREPACK_ENABLE_NETWORK=0 yarn install --immutable
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @local/petrinaut-arch-docs lint:arch-docs
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
git diff --check
```

All passed. The forced portfolio completed **63/63 tasks, zero cache hits, 1,511 tests** (core 107; plugin 65; binding 20; transport 44; app 204; Petrinaut 692; website 379). Architecture: 70 layers, 356 edges. Existing warnings remain visible in the logs. The integration run had no failing task or timeout; the worker's earlier concurrent timeout and subsequent passes remain in its separate packet.

The real-browser oracle was also rerun on alpha through the existing built app/website:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 M7_BROWSER_OUTPUT=/tmp/m7-browser-integration.vJiHsf/browser-alpha yarn workspace @apps/brunch-agent test:browser-tracer
```

**Pass:** real local Chrome, synthetic model, eight model requests, zero real provider calls/spend. The opt-in prepared route settled a workpiece, refused an unknown citation without browser work, executed the canonical live read and root arc, returned the recorded result and continued once. Same-key duplicate delivery and reload did not reapply; a contradictory distinct delivery failed before another model request. Its expected conflict error is printed by Flue and asserted by the oracle, not an unhandled test failure. The retained observations have zero browser errors, listener errors and blocked-request attempts. Actual canonical pre/post definitions, correlated histories/record and screenshots are under `browser-alpha/`.

## Accepted integration scope and remaining gates

This earns the narrow joined browser mechanics under the original synthetic instrument. It does not earn native-schema path acceptance, real-provider schema compatibility, genuine Vestera construction, useful basis or true-user evidence, A4 compaction/crash/reopened-why outcomes, A5 explanation/pane work, or Step A acceptance. The requested base stays fixed for this one mutation; broader sequential base advancement is not implemented. Supersession intent is covered by unit contracts, not a new browser correction witness. Voice/Stop regressions pass; no microphone/audio-provider or expanded durability claim follows.

All changed workspaces are private; no published Petrinaut implementation/API changed, so no changeset is required. The paid ledger is unchanged. Nothing was pushed by the integration owner. `MISSION.md` remains the sole execution authority and must be reconciled with the provider lane before the next delegation cycle.
