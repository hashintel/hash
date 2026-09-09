# Final sibling freeze command record

All commands ran from `/Users/lunelson/.herdr/worktrees/hash/m7-provider-execution`, initially clean on `ln/fe-1573-provider-execution` at `f2b9bfd040ec989f06c7b72a8973f88aab3b42ca`. Original private output root: `/tmp/m7-sibling-freeze.cmMvyS` (created with `mktemp -d /tmp/m7-sibling-freeze.XXXXXX`). Each primary command's stdout/stderr and exit status are retained as `<name>.log` and `<name>.exit` under `observations/`. No failed build/install/probe was retried, no paid profile applied, and no network-enabled fallback used.

For the exact commands below:

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
R=/tmp/m7-sibling-freeze.cmMvyS
O="$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/real-provider-a5-final-sibling-preflight"
```

## Guard, local installation, prerequisite and build portfolio

```sh
node "$E/verify-network-guard.mjs" > "$R/network-guard.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 CARGO_NET_OFFLINE=true yarn install --immutable --immutable-cache > "$R/install.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" python3 libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/real-provider-a5-final-merged-preflight/copy-authorized-jar.py > "$R/authorized-jar-copy.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 CARGO_NET_OFFLINE=true VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/petrinaut-core --filter=@hashintel/petrinaut --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --continue=always --force --concurrency=1 > "$R/portfolio.log" 2>&1
sandbox-exec -f "$E/deny-network.sb" /bin/sh -c 'node --version; yarn --version; corepack --version; cargo --version; rustc --version; java --version; sw_vers' > "$R/toolchain-versions.log" 2>&1
```

The portfolio shell ran asynchronously only to allow read-only inspection while it completed; Turbo concurrency was exactly one. No browser/probe was started until its exit0. App server and client, website, core and dependencies were built from current source. No copied JavaScript/build artifacts. The prior evidence directory above supplies only the unchanged, specifically authorized exclusive-create JAR-copy command, not any historical launcher or manifest. Target absence, exact source/target size/hash, link counts and distinct inode identity are retained.

## Explicit native and separately guarded sibling boundaries

```sh
sandbox-exec -f "$E/deny-network.sb" env TMPDIR="$R" HASH_OTLP_ENDPOINT='' YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-terminal.integration.ts > "$R/terminal-25.log" 2>&1
env TMPDIR="$R" YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5/launch.ts dry "$R/dry5" > "$R/dry5.log" 2>&1
env TMPDIR="$R" YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-browser.integration.ts "$R/lifecycle" > "$R/lifecycle.log" 2>&1
env TMPDIR="$R" YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts "$R/shutdown" > "$R/shutdown.log" 2>&1
```

The last three are ordinary process/filesystem orchestration, not nested beneath deny-only or paid profiles. The unchanged implementations launch every SDK/app/browser/socket child under its own loopback-only root. Shutdown's saved-method TEST rescue is part of its existing negative oracle, never production success. All outputs were fresh. `pane-1.png` was visually inspected.

A subsequent inline Python audit under `deny-network.sb` read only this output root's `session.json`, `cleanup.json`, `browser-lifecycle.json`, `controller-claim.json`, lifecycle/fault results, test-cleanup observations and dry model/page artifacts. It checked all26 known PIDs with signal0 (all ESRCH), all10 known profiles and readiness paths absent, normal binding removed, positive close controls complete without rescue, negative kill controls incomplete before rescue and removed afterward, all five lifecycle zero-dispatch controls, and no random browser WebSocket capability pattern in 10 native/history/HTTP artifacts. It also checked all five native request model/output bounds. It emitted `resource-audit.json` and `resource-audit.log`; it neither opened a socket nor killed a process nor read/changed paid accounting. Independent endpoint checks remain those performed by the frozen guarded oracles.

## Single final preflight, after every pinned-file-changing command

```sh
git diff --exit-code
git diff --cached --exit-code
# O did not exist; its parent was created with mode0700.
sandbox-exec -f "$E/deny-network.sb" env BRUNCH_CHAT_MODEL=claude-sonnet-4-6 HASH_OTLP_ENDPOINT='' YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5.ts preflight "$O/final-freeze" > "$R/preflight.log" 2>&1
```

This was the only final-freeze generation. The existing credential resolver returned only availability; no key/source/environment dump, refresh, auth-validity, DNS, TLS or provider request. No later command installed, built, formatted or changed a pinned file.

The read-only post-preflight verifier ran via `sandbox-exec -f "$E/deny-network.sb" node --experimental-strip-types --input-type=module -`, with inline source (no new repository script). It:

1. Loaded `final-freeze/preflight.json`, invoked existing `verifyManifest(path, preflight.manifestSha256)` and required the exact code/base commit.
2. Deep-compared the entire frozen object to the existing `instrumentManifest()` return in memory, without writing another manifest.
3. Independently recursively enumerated all17 directory roots and13 explicit files from the current manifest source using `statSync`/`readdirSync`, compared exact sorted deduplicated paths, and re-hashed every file with SHA-256.
4. Checked actual canonical registry size46, sibling topology, exact Anthropic/Sonnet identity,4096 output tokens, US$7 hold and US$6.06144 catalogue bound; required server/app/client/website output presence. It did not resolve credentials again.
5. Emitted `final-verification.log`:3,916 pins,106 app/website build files,563 Playwright library files, fresh enumeration/catalogue equality and actual recorded availability true.

The independent enumeration roots were `node_modules/{playwright-core,playwright,@playwright/test}`, `apps/brunch-agent/{src,test,dist}`, `apps/petrinaut-website/{src,dist}`, `libs/@hashintel/brunch-agent/packages`, `libs/@hashintel/petrinaut-core/src`, `libs/@hashintel/petrinaut/src`, `node_modules/@earendil-works/{pi-ai,pi-agent-core}/dist`, `node_modules/@flue/{runtime,sdk}/dist`, `node_modules/@earendil-works/pi-ai/node_modules/@anthropic-ai/sdk`, and `.yarn/patches`. Explicit files were the actual Node/Chrome/sandbox-exec binaries, root package/lock/Yarn configuration, app and website package/Vite configurations, MISSION, and deny/loopback profiles. The paid profile and launcher/owner/session are included under app source.

An inline Python `protected-base-check` under denial compared every tracked path through `git diff --name-only <base>`, required exact HEAD, and byte-compared only the cloned usage/journal files against `git show <base>:<path>`, retaining their hashes rather than contents. It made no ALPHA ledger access or mutation.

## Retention and commit discipline

Original owned output files are retained losslessly: gzip for non-PNG regular files, exact PNG copies. `original-observation-pins.json` binds original absolute paths, size/hash/mode and retained path/hash. Original stores and private session metadata remain in place; copies are evidence, not restoration or state authority. All known live test resources were already gone. No unrelated PID or worktree cleanup occurred.

All retention/pin checks use filesystem-only Python under `deny-network.sb`; no formatter, rewriting hook or build follows the freeze. The evidence commit uses `commit-network.sb` with the existing local SSH signing socket and its canonical path, `LEFTHOOK=0`, and literal intentional evidence paths. This adds only the existing signing socket allowance, no IP egress. No push, history rewrite, new activation JSON or allocation is performed.
