# Local recovery — stopped at missing local build artifact

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Status and bounded decision

**Blocked before TDD or implementation.** Exact starting HEAD: `b5f320b90c753e2b1eeded5455e0f8d02e06584b`; branch `ln/fe-1573-local-recovery`; worktree `/Users/lunelson/.herdr/worktrees/hash/m7-local-recovery`. The initial worktree was clean. The full current Mission and applicable AGENTS instructions were read. Both authorized recovery fixes remain unimplemented; neither existing failure is claimed repaired. No production, test, dependency patch, package-manager, inventory, Mission or ledger source changed. This packet is the only intentional write set.

The first guarded forced prerequisite build reached `@local/hash-graph-client:codegen`, which lacked `node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar`. Its downloader attempted Maven acquisition and failed with `getaddrinfo ENOTFOUND repo1.maven.org`; Java then reported `Unable to access jarfile`. Result: **exit 1, 25/26 reached tasks successful, zero cache hits**. The application prerequisite build did not complete. The mission's “Missing local artifacts stop work” condition applies. No unguarded retry, alternate codegen, manual node_modules edit or external acquisition was performed.

**Smallest LOCAL prerequisite for re-entry:** make the already-local exact OpenAPI Generator artifact available to this worktree through an owner-approved local installation/cache route that does not edit shared/hardlinked node_modules manually. The previous native-delivery packet pins version **6.6.0**, **27,103,489 bytes**, SHA-256 **`9718ff7844e89462c75dcd9b20a35136f6db257bfe1b874db1e3002e99de4609`**. Its presence elsewhere has not been verified here; the prior artifact manifest is a reference, not a current cache-availability claim. No permission to download, bypass codegen, change its configuration or cross an owned production seam is inferred. After the owner resolves this prerequisite, reverify network denial and rerun the real prerequisite build before red probes.

## Exact execution

Commands ran from the repository root. `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery`; fresh output was allocated with `mktemp -d "$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/local-recovery-XXXXXXXX"`, yielding this packet.

| Command | Result and retained log |
| --- | --- |
| `node "$E/verify-network-guard.mjs"` | Exit 0 before installation/build. All three profiles passed Java and Node descendant controls; `network-guard.log.gz`. |
| `sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 yarn install --immutable` | Exit 0 from local package cache, no tracked dependency changes; `install-base.log.gz`. This does not provide the missing generator JAR. |
| `sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build --filter=@apps/brunch-agent --force --concurrency=1` | Exit 1 at the missing generator; complete lossless `build-base.log.gz`. Work stopped. |
| `test -f node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar` | Exit 1 after the failure. |

The shell wrapper reported the build's status explicitly; the retained task log and table record the inner command's exit 1, not a successful build. No red/green recovery probes, native/accounting/browser regressions, full affected portfolio or architecture/format suite ran. There are no safety results to promote and no new script/inventory insertions to return. Read-only identity collection and evidence packaging followed the stop; these are not application verification.

## Enforcement and evidence labels

**Network-control diagnostics:** shell → Java/Node direct external TEST-NET sockets returned EPERM under all profiles; deny/commit profiles also denied loopback, and the browser profile reached only the diagnostic local listener. The build ran under deny-network with the existing narrow tsx filesystem IPC exception. Its failed downloader/DNS attempt is retained explicitly, not described as an offline cache hit. There is no logged successful download. The demonstrated boundary is inherited direct-socket denial, not an exhaustive audit of privileged service delegation or packet-level DNS behavior.

**Synthetic/native/browser scope:** no application/provider probe or real browser witness was run in this chunk. Application/provider paid calls and reservations are zero. The guard's small Java/Node listener test is synthetic network-enforcement evidence, not a browser or provider oracle. Prior native/browser/accounting and recovery packets remain immutable historical evidence, not new passes. No credentials or environment values were dumped. No DB/WAL/SHM artifacts were created or imported by a recovery probe.

## Source investigation before the stop

Consumed the requested A4 producer diagnostics/handoff, parent integration and compressed cold review, combined integration and compressed audit, native-delivery installation/handoff/network incident and accounting handoff. Inspected all three maintained patches and the actual installed patched Flue 2.0.3 runtime after immutable installation, including core's current `createUpdateWorkpieceTool`, hook-state buffer, canonical writer/store, live outcome/result handling, durable reexecution, repaired-result handling and overflow recovery callers. The installed paths and hashes are retained in `identities.json`.

Observed source ordering agrees with the retained failures: live `tool_execution_end` appends `tool_outcome` without draining buffered hook state; `turn_end` drains it later alongside result commitment. Durable reexecution buffers the real setter's write, but `appendRepairedToolResultBatch` appends resolved outcomes then the repaired result commit without that drain. Calls with already-recorded outcomes are skipped. `runModelTurnWithRecovery` can select `continueRebuilt` after overflow compaction with no restart callback, falling through to Pi continuation from the retained assistant tail. These are source observations, not newly reproduced safety outcomes or an implemented remedy.

Any eventual correction still owes the requested TDD matrix and production-entrypoint proofs: plain/observe, before/after outcome, interrupted repair and independent synchronous direct-boundary kill, exact Markdown/hash/state/pointer, distinct IDs and next ordinal 2; successful-stop silent overflow versus other provider errors, retained sources, no completed mutation reissue, valid continuation and active cancellation. Forward crash consistency must remain distinct from already-inconsistent legacy stores; no retrospective state repair is earned here. No lifecycle, termination or storage-policy decision has been changed.

## Return

This is a blocked evidence milestone, not completion of the implementation chunk. Original evidence and all protected sources/ledgers match the requested base; `identities.json` contains current hashes and base-equality checks. Logs are retained losslessly with compressed and uncompressed identities in `manifest.json`. No push. Re-entry needs only the local artifact prerequisite above, not an upstream detour or expansion of the mission.
