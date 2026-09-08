# Commands and retained attempts

Working directory for Yarn commands: repository root `/Users/lunelson/.herdr/worktrees/hash/m7-record-retention`. `E` below was this packet's absolute path. The final replay's `a4-replay-TZu8fGk9/commands.log` is the authoritative exact expanded command/exit list; it runs Node from `apps/brunch-agent`. Logs/sources ending in `.gz` are losslessly compressed after execution. No environment dump was taken.

```sh
E="$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a4-new-records-SdzNNS6W"
YARN_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 COREPACK_ENABLE_NETWORK=0 yarn install --immutable
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --concurrency=1
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
```

All exit 0, retained in `install.log`, `build.log`, `website-build.log`. The same configured website command ran again after the forced portfolio as `final-website-build.log`, exit 0. Build logs and final byte manifest are not interchangeable: the latter pins **only** the final proving artifacts. Offline install made no tracked package-manager change.

## Pre-final browser/threshold instrument development

For each `B` below, the unchanged browser command was:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 OTEL_SDK_DISABLED=true M7_BROWSER_OUTPUT="$E/$B" yarn workspace @apps/brunch-agent test:browser-tracer
A4_OUTPUT_DIRECTORY="$E/$B" YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention-new-records.integration.ts
```

| B / logs | Browser | Retention |
| --- | --- | --- |
| `browser`; `browser.log`, `fold.log` | Pass | Instrument failure: `structuredClone` cannot copy executable tool functions. Context capture switched to JSON materialization, as in the existing A4 probe. No public-source-loss inference. |
| `browser-repeat`; `browser-repeat.log`, `fold-repeat.log` | Pass | Five padding turns stopped at 47,320 reported faux tokens, below 48,000 threshold. Increased bounded cap to nine; no runtime defect claimed. |
| `browser-final`; `browser-final.log`, `fold-final.log` | Pass | Pass, threshold 44 → 3. |

Then `A4_OUTPUT_DIRECTORY="$E/browser-final" A4_PHASE=reopen YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention-new-records.integration.ts` passed, retained as `reopen-final.log`.

## Pre-final fault localization

Each directory was freshly created with `mktemp -d "$E/<prefix>-XXXXXXXX"`. Initial hook extension was `.mjs`; it later became typed `.ts` without changing the append/continuation instrumentation. `create.log` and `recover.log` live inside each directory. Yarn translates these initial SIGKILL processes to exit 129; final direct-Node execution records 137 instead.

```sh
A4_DIAGNOSTIC_DIRECTORY="$D" A4_FAULT="$FAULT" yarn workspace @apps/brunch-agent exec node --experimental-strip-types --import ./test/history-retention-runtime-hook.mjs test/history-retention-crash.integration.ts
A4_DIAGNOSTIC_DIRECTORY="$D" A4_PHASE=recover yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention-crash.integration.ts
```

| Directory | Fault / recovery sequence | Outcome |
| --- | --- | --- |
| `crash-outcome-1Y8QbA6o` | `after-outcome`, then uninstrumented recover | 129 / 0; successful pointer but missing current state; next ordinal 1. |
| `crash-control-9yCSxRP8` | `observe`, then uninstrumented recover | 0 / 0; normal next ordinal 2. |
| `crash-repair-uLbSg8Bg` | `before-outcome`; recovery with `A4_FAULT=after-repair` and the same `--import`; then uninstrumented recover | 129 / 129 / 0; missing current state, next ordinal 1. |
| `crash-unresolved-control-0vpC4w99` | `before-outcome`; recovery with `A4_FAULT=observe` and same `--import` | 129 / 1; diagnostic's one-reply faux queue exhausted. Retained failed control, not a runtime consistency verdict. |
| `crash-unresolved-repeat-DHuEkCAw` | Same sequence, `.ts` hook and bounded six-reply recovery queue | 129 / 0; delayed state flush observed, next ordinal 2. |

Initial observed overflow directory `overflow-0fFkrRfG` used:

```sh
A4_DIAGNOSTIC_DIRECTORY="$D" A4_OUTPUT_DIRECTORY="$D" A4_OVERFLOW_PROBE=1 yarn workspace @apps/brunch-agent exec node --experimental-strip-types --import ./test/history-retention-runtime-hook.mjs test/history-retention.integration.ts
```

Exit 1; successful 20 → 3 compaction followed by the assistant-tail refusal, with no source loss.

## Final proving run and regression checks

```sh
bash apps/brunch-agent/test/history-retention-diagnostics.sh "$E"
python3 apps/brunch-agent/test/history-retention-audit.py "$E/a4-replay-TZu8fGk9"
yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/history-retention.test.ts
yarn workspace @apps/brunch-agent lint:tsc
yarn workspace @apps/brunch-agent lint:eslint
git diff --check
```

All exit 0. Logs: `final-replay.log`, `final-audit.log`, `final-wrapper.log`, `final-typecheck-2.log`, `final-lint-2.log`. The final shell was subsequently updated to invoke the separately proven audit itself. Diagnostic execution completion is **not** a runtime safety pass: it expects the reproduced overflow/consistency failures and checks their observations.

The full 63-task forced serial command and exact failure are in `handoff.md` / `verification.log`: exit 1 only for the two parent-owned hermetic inventory insertions. Earlier focused checks: `new-record-typecheck.log` and `new-record-lint.log` pass; `diagnostic-typecheck.log` passes while `diagnostic-lint.log` captures the initially untyped `.mjs` hook lint failure. `final-typecheck.log`, `final-lint.log` and their final `-2` repetitions pass after typing the hook. Root `oxfmt` ran only on owned changed TS files. No shared package/config/inventory was edited to manufacture green verification.
