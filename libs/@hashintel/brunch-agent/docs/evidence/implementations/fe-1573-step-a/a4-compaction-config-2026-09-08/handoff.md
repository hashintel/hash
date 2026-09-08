# A4 compaction configuration seam

Owner-requested integration seam, 2026-09-08. This unblocks configuring A4's low-retention probe; it does not claim compaction survival or reopen correctness. No paid calls, new agent/mount, database/history mechanism, prompt/tool/state changes or termination changes.

## Contract

Core exports `useBrunchAgent(model: string, compaction?: CompactionConfig): string` through its existing `./flue` entry. `CompactionConfig` is imported from Flue's public API, not redeclared. The existing single `useModel` call receives `{ compaction }` when supplied and no options override when omitted. No new state or tool is added by this commit.

The production ChatAgent reads `BRUNCH_TEST_KEEP_RECENT_TOKENS` from the runtime environment when its module loads. Set it **before loading the built application**, and reload/restart to change it. Build-time substitution is not required.

- Unset: no compaction override, including in production; existing model/defaults remain unchanged.
- Set: accepted only when `NODE_ENV` is unset, `development`, or `test`. Production and every other explicit mode reject it before agent rendering.
- Value: ASCII decimal digits after trimming surrounding whitespace, representing a non-negative safe integer (`0` through `Number.MAX_SAFE_INTEGER`). `256` becomes `{ keepRecentTokens: 256 }`. Zero follows Flue's own non-negative token-count contract.
- Empty, whitespace-only, negative, signed, fractional, exponent, hexadecimal, non-finite or unsafe values are rejected. No silent default on malformed input.
- The environment seam exposes only `keepRecentTokens`; it does not change reserve tokens, compaction model, thinking level or tools. Flue still owns threshold calculation, actual compaction and submission-scoped tuning semantics.

Example for A4's own faux-provider driver:

```sh
NODE_ENV=test BRUNCH_TEST_KEEP_RECENT_TOKENS=256 <A4 built-application probe command>
```

A4 must still observe actual compaction events and before/after public history through the built mounted production ChatAgent and independently prove retained-store reopen. A4 may use faux-provider model metadata for its context-window trigger. This seam does not fabricate those observations.

## Ownership and application

The integration owner made only the additive signature/forwarding edit to core `src/flue.ts`, plus app configuration and focused tests. A2 was notified through its existing session to preserve this signature in its independently developing revision/state changes. Its worktree was not modified, and its uncommitted revision implementation was not imported. Preserve both sides if integrating produces a conflict; neither wholesale file replacement nor a reset is appropriate.

Apply the accompanying commit to A4's branch, then rebuild the affected workspaces. The commit also registers two hermetic hook/composition tests in the existing explicit substrate-import test inventory. If A2/A4 have added their own inventory entries, retain all justified entries rather than picking one version of the map.

## Verification

Root command: `yarn exec turbo run build lint:tsc lint:eslint test:unit --filter=@hashintel/brunch-agent --filter=@apps/brunch-agent` — 39 tasks passed, core 95 tests and app 177 tests. App lint retains 14 warnings in untouched files, zero errors. Focused tests establish default/no-override behavior, typed single-hook forwarding, valid/invalid environment parsing, app-to-core wiring and production refusal. Initial runs exposed missing mock type parameters and the exact substrate-import inventory additions; both were corrected without weakening the architecture gate.

The existing unpaid `schema-carrier-probe.ts` exercised the built mounted ChatAgent with `NODE_ENV=test BRUNCH_TEST_KEEP_RECENT_TOKENS=256` and passed, preserving nested mutation and correlated continuation. The same built entry with an invalid value rejected with the configuration error; `NODE_ENV=production` with `256` rejected with the local/test-only error. These smokes used a faux provider and establish configuration acceptance/refusal, not that compaction occurred. See adjacent retained command output.
