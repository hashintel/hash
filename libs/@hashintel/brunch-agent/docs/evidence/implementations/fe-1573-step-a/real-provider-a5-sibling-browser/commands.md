# Exact command record

Repository root: `/Users/lunelson/.herdr/worktrees/hash/m7-provider-proving`. Original output root: `/tmp/m7-sibling-adapter.WgFRSb`. No paid-profile invocation appears in this record. The `launch.ts` and browser integration entrypoints are process/filesystem-only orchestration; their owner/controller/audit children receive separate explicit guards. Wrapping orchestration in a paid or deny-only parent would reproduce the forbidden nesting rather than this topology.

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
R=/tmp/m7-sibling-adapter.WgFRSb
node "$E/verify-network-guard.mjs" > "$R/network-guard.log" 2>&1
```

The following workspace checks were run serially under the deny profile. Repeated logs preserve intermediate and final attempts rather than overwriting them:

```sh
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:tsc
# Captures: types-first, types-second, types-third, types-final, types-review (.log/.exit)
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:eslint
# Captures: lint-first, lint-second, lint-final, lint-review (.log/.exit)
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/real-provider-a5-browser.test.ts
# Capture: binding-tests-first.log/.exit (21 tests before old-activation control)
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent test:unit
# Captures: app-tests.log/.exit (336), app-tests-final.log/.exit (337)
```

Actual full build, not copied artifacts or partial server-only compilation:

```sh
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 CARGO_NET_OFFLINE=true VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn exec turbo run build --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --force --concurrency=1 > "$R/build.log" 2>&1
```

Actual driver invocations, each a distinct fresh output (first three fail before owner readiness; last two succeed):

```sh
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry-first"
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry-diagnostic"
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry-after-env"
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry-green-initial"
node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry-review"
# Each stdout/stderr/exit is retained beside its output directory.
```

Actual lifecycle oracle invocations:

```sh
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-browser.integration.ts "$R/lifecycle-first"
# Four controls before adding the real-launcher interrupt control.
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-browser.integration.ts "$R/lifecycle-five"
# Retained red: canonical /tmp alias in the final test's evidence read, after successful cleanup.
node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-browser.integration.ts "$R/lifecycle-green"
# Five controls pass, zero native dispatches.
```

Explicit unchanged native terminal/accounting probe:

```sh
sandbox-exec -f "$E/deny-network.sb" env TMPDIR="$R" HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-terminal.integration.ts > "$R/terminal-25.log" 2>&1
```

Minimal environment diagnostic (booleans/count only, no values or credential source):

```sh
/usr/bin/env -i PATH=/usr/bin:/bin HOME="$R" TMPDIR="$R" /usr/bin/sandbox-exec -f "$PWD/$E/loopback-only.sb" "$(command -v node)" --input-type=module -e 'const allowed=["PATH","HOME","TMPDIR"]; console.log(JSON.stringify({expectedOnly:Object.keys(process.env).every(key=>allowed.includes(key)),knownMacRuntimeAddition:Object.keys(process.env).filter(key=>!allowed.includes(key)).every(key=>key==="__CF_USER_TEXT_ENCODING"),additionalKeyCount:Object.keys(process.env).filter(key=>!allowed.includes(key)).length}));' > "$R/minimal-env-control.json" 2> "$R/minimal-env-control.stderr"
```

Source formatting used `sandbox-exec -f "$E/deny-network.sb" yarn exec oxfmt --write` on only the seven changed/new TypeScript paths in the write-set table. `format-first.log` covers all seven, `format-second.log` covers `browser-session.ts` and the browser integration test, and `format-third.log` covers the final binding test. No unrelated source or historical evidence was reformatted.

Source commit used the verified `commit-network.sb` with only the existing signing socket allowance and `LEFTHOOK=0`, after explicit formatting/type/lint/unit/build/browser checks. This prevents a rewriting hook from silently changing a just-tested component identity. No push or history rewrite occurred.

Evidence retention command, filesystem-only under denial:

```sh
O=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/real-provider-a5-sibling-browser
sandbox-exec -f "$E/deny-network.sb" python3 "$O/retain-review-evidence.py" > "$O/retention-summary.txt" 2>&1
```

No `preflight`, `instrumentManifest()` or full final-freeze generator was invoked during this adapter task. The negative old-activation unit control calls only the launcher's rejecting `real` argument parser beneath deny-network; it never reaches browser startup or paid-profile application.
