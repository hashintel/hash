# Local recovery integration and corrected safety verification

## Review and integration

Reviewed and integrated the blocked-prerequisite record `b78a30c4be`, red safety oracles `a521cfd109`, runtime repair `a5daa71373`, first handoff `46aa1908f6`, requested oracle correction `6c6dcac5c9`, and new correction evidence `1907e55fcf`. Alpha mappings: `d04c26b700`, `b5a0218f01`, `6eed6fd542`, `abb4bf02ed`, `94471fb26a`, and **`cfb50552c4`**. No protected parent authority, A5 source, accounting code or prior evidence was replaced.

The parent reviewed the three runtime changes and prospective same-batch/state/continuation assertions, verified all 728 initial and 757 correction artifact hashes plus installed/source/build/protected pins, and independently replayed the pre-integration recovery controls. A separate cold review found no concrete runtime blocker but demonstrated one oracle deficiency: the completed overflow-triggering response could be omitted from history observations without failing the first test/audit. That was not observed product data loss.

The requested correction now pins the actual completed assistant response and its settlement independently of public history, at the real post-append completion boundary using read-only canonical records. It requires exact identity/content/uniqueness/settlement through compaction or Stop, next actual input, process reopen and continued input. Explicit-error retries preserve their actual first-step public identity separately from the successful retry's canonical identity. The parent reran 36 targeted/architecture tests and the original omission hook; positives passed and omission failed at the intended pinned-response assertion. The independent re-review also confirmed silent/cancelled/explicit positives and rejected original/coordinated response and settlement omissions. Both cold reports are retained here; the worker's 50-mutant packet remains in `local-recovery-review-KWim2OUc`.

## Alpha verification

Tested HEAD: **`cfb50552c4`**. The actual maintained Flue patch was installed with guarded `yarn install --immutable`; no ad-hoc installed JavaScript edits or dependency upgrade. Guarded Java/Node descendant tests passed before execution. `deny-network.sb` allows only required filesystem IPC, and `loopback-only.sb` was used only for the actual Chrome/safety run. Offline package-manager flags were supplemental; no unguarded fallback occurred. The original missing-JAR and earlier acquisition incidents remain disclosed in their own immutable packets.

With `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery` and fresh output root `/tmp/m7-recovery-alpha.zwvi3L`, the commands were:

```sh
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 yarn install --immutable
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
sandbox-exec -f "$E/loopback-only.sb" bash apps/brunch-agent/test/history-retention-diagnostics.sh /tmp/m7-recovery-alpha.zwvi3L all
sandbox-exec -f "$E/deny-network.sb" env HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
sandbox-exec -f "$E/deny-network.sb" node "$E/installed-runtime.mjs" /tmp/m7-recovery-alpha.zwvi3L/native-runtime
sandbox-exec -f "$E/deny-network.sb" env M7_NATIVE_OUTPUT=/tmp/m7-recovery-alpha.zwvi3L/native-mounted YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent test:native-schema
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @local/petrinaut-arch-docs lint:arch-docs
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
```

**63/63 uncached tasks; 1,578 tests passed** (core 107, plugin 69, binding 20, transport 44, app 267, Petrinaut 692, website 379). All selected builds/typechecks/lints pass. Architecture and root formatting pass. Source checks pass; generated unified-patch context whitespace is retained as patch syntax rather than reformatted or hidden by repository-wide settings.

**The actual alpha safety packet `a4-safety-qD4EX55w` passes 11/11 with no failures:** seven normal/fault/repaired crash cases, silent overflow, explicit-error overflow, cancelled compaction and actual browser/threshold/reopen. All final crash recoveries are uninstrumented; matching state/outcome must already share the durable batch before replacement boot, and recovered state/outcomes/results remain consistent. Exact current Markdown/hash/pointer is preserved and distinct next revisions advance to ordinal 2. Deliberate creation/intermediate SIGKILL exits are not failed tests; every final safety assertion must pass.

Successful-stop overflow retains its already-completed response after compaction rather than retrying an assistant tail. Exact response identity/content and completed settlement now survive the tested checkpoints. Explicit error retains its valid retry; active summarizer cancellation does not erase the completed response or publish the cancelled summary. The next actual input and process reopen continue without invented user messages or completed tool reissue.

Native runtime: **19 observations / 26 synthetic SDK responses**; built native schema mount: **20 synthetic SDK responses**; accounting: **13 outcomes**. All pass on the installed recovery patch. The real local Chrome witness still produces actual canonical effects and correlated continuation, with Boolean/unknown-citation, duplicate/reload and contradictory-result controls. Threshold/reopen uses that original store and preserves its public sources/current revision. No positive browser result or canonical state was imported from saved JSON.

## Scope earned and remaining limits

Accepted integration scope is forward consistency for the reached local revision outcome/repair windows and the named successful-stop, explicit-error and post-response cancellation paths. The old missing-state and assistant-tail failures are no longer current failures for this tested scope. The evidence does not repair already-inconsistent legacy stores, establish arbitrary parallel-writer isolation, external-effect rollback, power-loss/remote durability, universal partial/provider-error recovery or new Voice/microphone guarantees.

A5 remains in its separate implementation worktree and must be rechecked on this repaired runtime when integrated. These results are not A5 explanation/utility acceptance, genuine Vestera evidence, real-provider schema acceptance, invoice fidelity, full participant paid-driver readiness or Step A/Step B acceptance. Shared paid ledgers remain five calls / US$0.09113535 with no outstanding reservation; no paid application/provider request was made by this integration.

`manifest.json` pins retained evidence, source/build bytes and installed runtime identities. Repeated full provider contexts/instrumented runtime copies already preserved in the worker packet were not duplicated here; actual result/history/independent completion pins, read-only batch observations, traces and boundary logs are retained. DB/WAL/SHM files remain only in their original ignored stores, never portable import authority. Nothing pushed by this integration work.
