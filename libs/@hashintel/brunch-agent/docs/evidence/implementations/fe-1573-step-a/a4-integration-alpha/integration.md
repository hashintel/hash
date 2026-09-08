# A4 integration review: retained records and recovery diagnostics

## Integration outcome

Reviewed and integrated worker commits `c53cae1b95`, `1553038fae`, `cf424fc3af` and the requested disclosure correction `00c6fc766c` as `ea8fc38549`, `b16f64f2be`, `0fead4971c` and `207e7d41d9`. The integration owner added the two reviewed substrate entrypoints in `apps/brunch-agent/test/architecture/boundaries.integration.ts`; the exact-set assertion was not weakened. Intervening alpha changes, including `ae84a771e7`, were preserved.

Accepted scope: preliminary retention/reopen evidence for actual prepared synthetic-model revision/browser records, and bounded installed-runtime diagnostics. No product or dependency repair is included. These are not genuine-interview, A5 reopened-why, native-runtime, general crash-safety or Step A acceptance claims.

All 297 original artifact hashes and recorded decompressed hashes verified. Review found the original blanket no-external-request claim contradicted by the OpenAPI Generator 6.6.0 download in `verification.log.gz`; the worker corrected its handoff/commands/manifest without changing original observations. The acquisition is separate from the unchanged zero real application/provider calls. Its transport details were not captured. This packet does not retroactively label that build offline or network-isolated.

## Parent replay and integrated checks

The integration owner replayed new-record fold/reopen on the **original parent-created browser store** at `/tmp/m7-browser-integration.vJiHsf/browser-alpha`, using the unchanged worker probe and its built application. Both passed under inherited macOS deny-all networking. Saved history was only an equality oracle, never imported into state. Original public record equality, current Markdown/hash/ordinal, authorization refusals, and absence of executable/reissued mutation calls all held. A second browser after process restart remains unexercised; the earlier actual-browser duplicate/reload witness is distinct.

Commands from `m7-record-retention/apps/brunch-agent`, with `A4_PHASE=fold` and then `reopen`:

```sh
A4_OUTPUT_DIRECTORY=/tmp/m7-browser-integration.vJiHsf/browser-alpha A4_PHASE=fold sandbox-exec -p '(version 1)(allow default)(deny network*)' node --experimental-strip-types test/history-retention-new-records.integration.ts
A4_OUTPUT_DIRECTORY=/tmp/m7-browser-integration.vJiHsf/browser-alpha A4_PHASE=reopen sandbox-exec -p '(version 1)(allow default)(deny network*)' node --experimental-strip-types test/history-retention-new-records.integration.ts
```

The fixed integration inventory passed **27/27 tests**. The first full portfolio under deny-all networking completed 59/63 tasks: `tsx` could not open its filesystem IPC socket, so ds-components codegen/build failed and missing artifacts caused two downstream Petrinaut failures. This was a verification-environment failure, not a new product fix. No task or assertion was skipped. The second profile, `deny-network.sb`, permits only the exact temporary `tsx-<uid>/<pid>.pipe` Unix-socket path while continuing to deny IP connections/listeners. A shell-launched Java probe and child Node probe both observed `EPERM` for TEST-NET and loopback sockets; the required local IPC positive control passed. Guard configuration and logs are retained.

The unchanged selected portfolio was rerun from alpha under that profile:

```sh
sandbox-exec -f /tmp/m7-a4-review.06FVwp/deny-network.sb env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
```

**63/63 tasks passed, zero cache hits; 1,511 tests passed.** All selected builds, typechecks and lints passed. Both the failed deny-all attempt and the successful narrow-IPC retry are retained. Process-level enforcement is the egress control; package-manager environment flags alone are not. No IP-network allowance was needed for these builds or in-process replays. Browser-specific loopback allowances are a separate instrument.

## Crash claim adjudication

**Verdict: CONFIRMED for the narrow installed Flue 2.0.3/Pi 0.83.0 boundary.** A process kill after the actual `tool_outcome` append resolves but before current-state/result settlement can recover a successful revision result without its current revision state. The next distinct update then receives display ordinal 1 rather than 2. This is **not durable revision-ID reuse**; IDs remain distinct. Missing current-state settlement alongside successful recovery is the substantive inconsistency.

Reliance: deciding whether to authorize a bounded local settlement/recovery correction before claiming crash-consistent revision authority. No repair is selected or authorized by this evidence packet. The competing explanations were instrumentation-induced scheduling/state suppression, stale source/build, wrong store/identity, a stale rendered signal, or faux-response queue behavior.

The parent ran fresh normal and after-outcome stores under process-level denial; every recovery process omitted the diagnostic hook. Normal: create exit 0, successful revision 1, one matching state write, next ordinal 2. After-outcome: create exit 137 with matching boundary trace, successful recovered revision 1, zero matching state writes, next ordinal 1. Both retained the original revision id/hash and historical Markdown. Parent artifacts are under `parent-crash/`; the original pre-review claim record is retained as historical working evidence, superseded by this verdict.

A separate cold reviewer received the claim, source and raw artifacts but not the producer's handoff or hypotheses. Its complete report is retained losslessly in `cold-review.md.gz`. It independently checked artifact versus generator, attempted refutation, and ran five cases under network denial: plain and observe-only uninterrupted controls (state present, next ordinal 2); kill before outcome with uninterrupted recovery (state present, ordinal 2); kill after outcome (state missing, ordinal 1); and a separate **single synchronous SIGKILL immediately after the runtime's existing awaited outcome append**, without the producer's promise wrapper (state missing, ordinal 1). All recoveries were uninstrumented. The direct hook and raw result/history/store observations are retained under `cold-review/`. The parent used Node 22.21.1; the cold replay used Node 24.16.0 with the same pinned Flue runtime source hash.

The source chain agrees with those observations: ordinary execution appends outcome first; buffered hook state drains with a later result commit. Recovery skips durable calls that already have outcomes and repairs their result batch without recovering the missing state. The worker also reached interruption after a recovered result commit; the parent's independent replay focused on the primary outcome window, while the original packet retains the additional case. Natural crash frequency, power loss, browser crash atomicity and the future native-patched runtime remain unmeasured. The existing diagnostic deliberately passes when expected failures are observed; a remediation must add a safety assertion that goes red on missing state and green only on consistent recovery before claiming resolution.

## Overflow discriminator

The parent also reran the retained oversized faux instrument with observation-only runtime instrumentation and process-level denial. Exit 1; `continueRebuilt` was reached exactly once with `restartPresent:false` and roles `[user,user,assistant]`; the original runtime emitted `Cannot continue from message role: assistant`. All ten original public records remained equal by ID/content. Evidence is under `parent-overflow/`. This supports the narrow continuation-path diagnosis, not public-history loss or a verdict for every real-provider overflow shape.

## Remaining integration boundary

Repeat the affected record-retention and two runtime diagnostic families after native delivery/accounting integration. The native schema patches do not inherently repair either recovery failure. A bounded local correction, or explicit limitation that blocks dependent claims, remains an owner decision; no upstream detour, new store/ledger, historical-state reconstruction, termination change or safety-assertion weakening is authorized here. Final A4 still consumes genuine interview records and the A5 product why operation.

Raw SQLite DB/WAL/SHM files remain only in their original ignored temporary stores. Retained JSON dumps are read-only diagnostic observations, not portable import authorities. `manifest.json` pins the copied artifacts and their uncompressed bytes. No paid usage or shared-ledger totals changed, and nothing was pushed by this integration work.
