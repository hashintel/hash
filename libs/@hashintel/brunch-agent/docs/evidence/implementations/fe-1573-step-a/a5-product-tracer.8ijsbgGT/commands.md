# Commands and retained stores

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

Run from `/Users/lunelson/.herdr/worktrees/hash/m7-a5-explanation`. The exact starting base was `b5f320b90c753e2b1eeded5455e0f8d02e06584b`; the product milestone is `fb90244b230d32afaa6497e03a0aea47a187a0f9`. No command enables external provider egress. Cache misses stop; the local generator copy below was separately owner-authorized.

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
O=$(mktemp -d /tmp/m7-a5-replay.XXXXXXXX)
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 yarn install --immutable
```

Actual scratch root: `/tmp/m7-a5-explanation.ih0VgfEQ`. The verified guard ran before installation and all builds/probes. The initial JAR was missing, so no dependent build ran until the owner authorized reuse of `/Users/lunelson/.herdr/worktrees/hash/alpha/node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar`. A regular `cp` into the fresh ignored installation was preceded by a nonexistence check and source-hash check, and followed by source/destination SHA-256 and size verification. Both copies are 27,103,489 bytes, hash `9718ff7844e89462c75dcd9b20a35136f6db257bfe1b874db1e3002e99de4609`. This does not authorize fetching a missing replacement.

## Final affected portfolio

```sh
sandbox-exec -f "$E/deny-network.sb" env \
  YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true \
  HASH_OTLP_ENDPOINT='' VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat \
  yarn exec turbo run build test:unit lint:tsc lint:eslint \
  --filter=@hashintel/brunch-agent \
  --filter=@hashintel/brunch-agent-plugin-sdcpn \
  --filter=@hashintel/brunch-agent-binding-flue \
  --filter=@hashintel/brunch-agent-transport-aisdk \
  --filter=@apps/brunch-agent \
  --filter=@apps/petrinaut-website \
  --filter=@hashintel/petrinaut \
  --continue=always --force --concurrency=1
```

Final exit 0: 63/63 tasks, no cache hits, 1,598 tests. `logs/portfolio-final.log.gz` is the complete final result. Earlier full and bounded builds remain under their original `logs/{portfolio-*,build-*}.log.gz` names. `--continue=always` retains failures while allowing the complete portfolio to finish; it is not a success override. The app's existing serial Vitest file setting was unchanged.

## Product and native/accounting probes

```sh
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' \
  yarn workspace @apps/brunch-agent test:workpiece-evidence

sandbox-exec -f "$E/loopback-only.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 \
  M7_BROWSER_OUTPUT="$O/browser" yarn workspace @apps/brunch-agent test:reopened-why

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' \
  node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts

sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 \
  M7_NATIVE_OUTPUT="$O/native" yarn workspace @apps/brunch-agent test:native-schema
```

`test:reopened-why` is exactly `M7_A5=1 node --experimental-strip-types test/transition-records.integration.ts`: the existing real local Chrome entrypoint first runs its original A3 assertions, then the optional A5 continuation. It uses the installed Chrome executable, no browser download and the same ephemeral loopback listener. The source/locator probe creates its own fresh `mkdtemp` directory and prints its path. No probe imports saved history JSON into state or writes fabricated positive browser outcomes.

Final stores and observations:

- Browser: `/tmp/m7-a5-explanation.ih0VgfEQ/browser-locators-final`; 81 synthetic native requests; 14 why results; three new predeclared A5 incarnations plus the original A3 witness. Original SQLite files remain there, ignored/uncommitted. Only JSON/PNG/gzip observations are copied into this packet. Application-runtime stop/load and actual Chrome reload use these same original stores; there is no second OS-process or saved-JSON-import claim.
- Source/locator: `/var/folders/2c/ptn6jcrj61lck_yzfz_p3b5m0000gn/T/m7-a5-evidence-OJo7KJ`; 29 native synthetic responses; ten required model-facing assertion completions. Retained as `source-locators-final.json.gz`.
- Accounting after the complete build: `/var/folders/2c/ptn6jcrj61lck_yzfz_p3b5m0000gn/T/TEST-provider-accounting-uu9DZ7`; 13 passing outcomes. Only its report is retained, not its TEST ledger/database files and never the shared paid ledger.
- Native after the complete build: `/tmp/m7-a5-explanation.ih0VgfEQ/native-after-build`; 20 synthetic SDK responses, both entrypoints, zero intercepted network attempts. Retained under `native-final/`.

The final source and browser tests ran against the same product bytes rebuilt by the final portfolio; manifests identify the actual source/guidance/build bytes. Accounting and native controls were additionally rerun after the final build without concurrent writes to the build directory. Each listener/browser context is closed by its owning test; no unrelated process or store was cleared.

## Focused TDD and final hygiene

The retained red/green commands used the same deny profile and network flags:

```sh
yarn workspace @hashintel/brunch-agent exec vitest run test/workpiece-evidence.test.ts test/update-workpiece.test.ts
yarn workspace @hashintel/brunch-agent exec vitest run test/workpiece-locators.test.ts test/workpiece-evidence.test.ts test/update-workpiece.test.ts
yarn workspace @hashintel/brunch-agent-plugin-sdcpn exec vitest run test/declared-basis.test.ts
yarn workspace @hashintel/brunch-agent-plugin-sdcpn exec vitest run test/reconciliation.test.ts test/declared-basis.test.ts
yarn workspace @apps/brunch-agent exec vitest run test/reconciliation.test.ts test/chat-agent-compaction.test.ts test/workpiece-revisions.test.ts
yarn workspace @apps/petrinaut-website exec vitest run src/main/app/local-storage-demo/transition-record.test.ts
yarn workspace @apps/petrinaut-website exec vitest run src/main/app/local-storage-demo/brunch-workpiece-pane.test.tsx
```

These lines are the commands inside `sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT=''`; do not run them with external networking enabled. Literal intentional TS paths were formatted with the repository `oxfmt`, never a broad worktree fix. The one initial plugin run lacked built dependency artifacts and did not run tests; after the guarded prerequisite build, its missing-current-state assertion failed at the expected contract before implementation.

```sh
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @local/petrinaut-arch-docs lint:arch-docs
git diff --check
```

The authority cherry-pick and local signed commits used `commit-network.sb` with only the existing signing socket and its resolved filesystem path passed as profile parameters. No signing credential or environment dump was made. Commit hooks passed under that profile. Literal owned files were staged; no reset, rebase, amend, force operation or push occurred.

## Parent-owned serial insertions

Already applied by the owner in `78de886f8cfb040dcdf7f734f170b1e2f9b2b9d7`:

- Hermetic entries: `apps/brunch-agent/test/{workpiece-evidence.integration.ts,reopened-why.integration.ts,reconciliation.test.ts}` with their bounded synthetic/browser/read-only-fixture justifications.
- `test:workpiece-evidence`: `node --experimental-strip-types test/workpiece-evidence.integration.ts`.
- `test:reopened-why`: `M7_A5=1 node --experimental-strip-types test/transition-records.integration.ts`.

Owner logs are retained under `owner-inventory/`. No further script/inventory or dependency insertion is requested. Recovery integration and its subsequent A5 recheck remain required.
