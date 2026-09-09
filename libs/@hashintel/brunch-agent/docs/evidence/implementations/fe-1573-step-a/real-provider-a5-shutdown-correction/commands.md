# Shutdown correction command record

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

Run from `/Users/lunelson/.herdr/worktrees/hash/m7-provider-proving`. These commands describe retained execution, not permission to overwrite its outputs. Each probe/check has its stdout/stderr or combined log and exit status under the original root. No paid profile, final-freeze generator, provider/auth probe or real-ledger command was run.

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
R=/tmp/m7-shutdown-correction.KHbjED
node "$E/verify-network-guard.mjs" > "$R/network-guard.log" 2>&1

# Original owner, new discriminator: expected assertion red, after separate TEST rescue.
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/fault-red" > "$R/fault-red.stdout" 2> "$R/fault-red.stderr"
cp apps/brunch-agent/test/real-provider-a5-shutdown-hook.ts "$R/red-shutdown-hook.ts"
cp apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/red-shutdown-probe.ts"

# After the owning shutdown correction, distinct fresh runs retained unchanged.
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/fault-green-first" > "$R/fault-green-first.stdout" 2> "$R/fault-green-first.stderr"
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/fault-green" > "$R/fault-green.stdout" 2> "$R/fault-green.stderr"
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/fault-review" > "$R/fault-review.stdout" 2> "$R/fault-review.stderr"

# Existing actual sibling lifecycle and product dry path, unchanged executors.
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-browser.integration.ts "$R/lifecycle" > "$R/lifecycle.stdout" 2> "$R/lifecycle.stderr"
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry" > "$R/dry.stdout" 2> "$R/dry.stderr"
```

The orchestration entrypoints above import only process/filesystem/session identity helpers. They launch SDK/browser/endpoint-audit work in separate explicit loopback-only children. They must not be nested beneath a paid or deny-only parent. Test hooks preload only inside the owner’s minimal-environment loopback root; installed files are never edited. The actual launch/audit argument arrays and TEST rescue signal sequence are in the pinned integration source.

```sh
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/real-provider-a5-browser.test.ts > "$R/unit-22.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent test:unit > "$R/app-tests.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:tsc
# Retained types.log/.exit and types-final.log/.exit.
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:eslint
# Retained lint.log/.exit (one test-only optional-chain error), lint-final.log/.exit,
# and lint-review.log/.exit (zero errors).

sandbox-exec -f "$E/deny-network.sb" yarn exec oxfmt --write apps/brunch-agent/src/evaluations/real-provider-a5/browser-owner.ts apps/brunch-agent/test/real-provider-a5-shutdown-hook.ts apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts
# format.log/.exit; format-check.log/.exit retains the corresponding --check.
# format-final.log/.exit formats only the two new tests after adding call timestamps.
```

Source commit ran under the verified `commit-network.sb`, allowing only the existing signing socket, with `LEFTHOOK=0` after explicit formatting/type/lint/tests. No hook rewrote the just-tested source. No build or install was needed for the standalone owner change: the inherited106 app/website artifact hashes and563 installed Playwright component hashes still match the prior packet. The separately delivered capacity change is intentionally absent; final merged rebuilding is deferred to the parent after focused review.

```sh
O=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/real-provider-a5-shutdown-correction
sandbox-exec -f "$E/deny-network.sb" python3 "$O/retain-evidence.py" > "$O/retention-summary.txt" 2>&1
```

The retention command reads only the named current/parent proof artifacts, correction source and inherited non-ledger component pins. It does not read any real/cloned paid ledger or journal and never generates an activation manifest.
