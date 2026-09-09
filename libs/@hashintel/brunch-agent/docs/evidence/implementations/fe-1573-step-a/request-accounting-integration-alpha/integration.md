# Request-accounting integration on alpha

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

Reviewed and integrated `400023cf898e2d169e8af0bf597e2c0274b6c65a`, `32a36976bca6d2a98cf44e6d4ab5afe266ca4c33` and `7965e9d07e` as `dfe15f60db`, `f25e0130d8` and `e060478e77`. The parent added both reviewed accounting test entrypoints to the hermetic inventory without weakening its exact-set assertion. The worker's reported sole portfolio failure was that missing owner insertion, not a skipped test.

## Review

The integration review traced actual app registration, runtime identity propagation, reserve-before-native and dispatch-before-fetch persistence, both native entrypoints, partial/terminal/cancelled ordering, journal failure, cost validation, and no-opt-in/no-filesystem behavior. All worker protected/source hashes matched. The two earlier review blockers are addressed: `journalPending` durably blocks reread/restart after a journal append failure, and terminal cost components must match the native catalogue estimator before releasing a reservation. The parent reran those focused tests and the full built-route oracle under process-level network denial.

Accepted as scoped accounting readiness, not paid authorization: one serialized writer against the existing JSON authority and Markdown attempt journal; completed usage can settle independently of admission rejection; partial/unknown/late cancellation stays blocking; persisted unresolved attempts survive process restart. Catalogue estimates are not invoices. The patch does not account for a separate persona/evaluator process or supply the eventual combined paid driver's operation-rejection budget. No restrictive journal-permissions, concurrent-writer, distributed, arbitrary power-loss or universal transport guarantee is claimed.

## Verification

All commands below ran under `sandbox-exec -f /tmp/m7-a4-review.06FVwp/deny-network.sb`, with `YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0` on Yarn invocations and `HASH_OTLP_ENDPOINT=''` on the model/SDK probes. The copied profile is retained here; its Java/child-Node external and loopback refusal plus required filesystem IPC positive control are recorded in the preceding A4 integration packet. No IP socket allowance was granted.

Before integration, from the clean accounting worktree at `7965e9d07e`:

```sh
yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/workpiece-revisions.test.ts test/provider-accounting.test.ts test/provider-admission.test.ts test/provider-registration.test.ts
node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
```

**34/34 focused tests and 13 built-route outcomes passed.** The protected ordinary mixed-batch oracle remained unchanged. The integration owner then repeated the app checks and built oracle on alpha with the inventory entries present:

```sh
yarn workspace @apps/brunch-agent build
yarn workspace @apps/brunch-agent test:unit
yarn workspace @apps/brunch-agent lint:tsc
yarn workspace @apps/brunch-agent lint:eslint
node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
```

**All passed: 34 app test files / 223 tests, plus the 13 explicit built-route outcomes.** The built synthetic instrument observes six main-process provider starts and six local synthetic dispatches; no real provider request. Its fresh fixture output is retained losslessly in `fixture-results.json.gz`. Disabled/restart child processes retain their separate labels and scopes. The actual shared paid ledger remains five calls / US$0.09113535 with zero outstanding reservation; only disposable TEST ledgers are written by these probes.

One parent verification mistake is retained: invoking `yarn workspace @apps/brunch-agent exec vite build` built only the server and removed previous client artifacts, causing three asset tests to fail. The actual package `build` script also builds `vite.client.config.ts`; running that complete script restored the artifacts and all 223 tests passed unchanged. Both attempts are retained, not attributed to accounting behavior. No selected test was skipped or modified to pass.

This increment intentionally uses the current unpatched native dependencies. The next combined native-delivery integration must repeat accounting and protected lifecycle tests; the separate worker's full portfolio is not promoted to a combined-runtime claim. Alpha's full seven-package portfolio had passed immediately before this app-only change, as recorded in A4 integration; this packet claims the affected app checks and explicit accounting oracle above, not another full portfolio.

## Limits and next join

No accounting changes were requested after this integration review. Keep the instrument opt-in, retain unknown spend and pending journals as stops, serialize the one existing ledger's writer, and preserve raw identity/usage privacy. Paid execution still requires an owner reservation, complete instrument pin, native product verification, remaining scenario admission and explicit combined-driver accounting. Neither a fixture ledger nor these green tests allocates money or calls.

No shared paid rows, ledger totals, provider/model identity, admission policy or A4 diagnostics changed. No upstream work, A5 or Step B was performed. All retained logs/fixture observations are pinned by `manifest.json`; DB/WAL/SHM artifacts remain local, not imported evidence stores. Nothing pushed by this integration work.
