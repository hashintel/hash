# A2 buffered production admission — implementation handoff

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Result

**The authorized scoped buffered-rejection mechanism is implemented and exercised through the built production ChatAgent mount.** Both admission obligations pass under Lu's approved whole-proposal rejection policy. The original ordinary mixed-batch safety assertion is unchanged and now green.

| Obligation | Verdict and evidence |
| --- | --- |
| Revision/construction exclusion | **Pass for the authorized admission boundary.** All mixed revision/browser permutations fail before any proposed tool input is published or any sibling tool executes. An independently settled older revision remains unchanged. **Explicit settled id/hash citation validation is not implemented here** and remains the integration owner's separate join. |
| Marker/client-result barrier | **Pass under the authorized rejection policy.** Marker + mutation, in either order and without any revision call, is rejected as a whole after one faux-provider request. No browser call is admitted, so no result is owed for that rejected proposal. A separately admitted browser mutation makes no further provider request until its correlated client result arrives. |
| Cancellation and Voice | **Pass for the exercised production/runtime and Voice-consumer boundaries.** Active durable Stop aborts unfinished buffering and the upstream signal; late completion publishes no prose or tool input. Approved output reaches the real Voice selector/bridge with the exact question marker, without speaking workpiece/tool payloads. No microphone, audio-provider or actual-browser witness is claimed. |

**Zero paid calls / US$0.** No reservation or shared-ledger edit. This is not full A2 durability acceptance, genuine Vestera construction, Step A acceptance or Step B authorization.

## Commits and integration

- Authority-only `e3a24ee86521217d12759199b5e6057e5ea47414` was cherry-picked as **`9381a4e0f2`** before dependent implementation.
- Implementation: **`14e4c661bfcb296b5a0760e1583b70fa211e3e99` — Reject mixed ChatAgent proposals before publishing tools**.
- A following evidence-only commit contains this directory; its ID is in the final relay report.
- Branch remains `ln/fe-1573-admission-feasibility` in `/Users/lunelson/.herdr/worktrees/hash/m7-admission`. No sibling writes, push, reset, rebase or dependency patch.
- Integration prerequisite: implementation modifies tests introduced by **`c45c1a67c8`**. Merge this branch with its ancestry, or cherry-pick that prerequisite before `14e4c661bf` if alpha has not yet integrated the feasibility source. Alpha already owns the original authority amendment; its duplicate local cherry-pick need not be reapplied.

## Production mechanism

`apps/brunch-agent/src/app.ts` registers the decorated native Anthropic provider with public `setProvider`. A public execution interceptor carries only a Node `AsyncLocalStorage<boolean>` scope flag from the runtime's named ChatAgent submission; it is not an observer-derived proposal map or a persistent authority. Concurrent unrelated named agents and delegated tasks retain their original streaming behavior. The model declaration and compaction forwarding remain untouched.

`src/provider-admission.ts` decorates **both `stream` and `streamSimple`**. It consumes and checks a complete provider proposal before releasing output. Classification uses the plugin's canonical exported construction catalogue and documentation tool; unknown/unmounted siblings count as non-browser. It checks both final-response calls and streamed `toolcall_end` calls, because Flue publishes the latter. Any browser/non-browser mixture fails the whole submission with a fixed visible error, without automatic repair/retry or partial marker/revision execution.

Buffer budgets are **8 MiB of serialized retained data, 16,384 events and 120 seconds**. These bound this decorator's buffering, not total provider/SDK heap usage. Growing partial snapshots are not retained per event: approved replay uses the final message as the partial snapshot while preserving deltas, call ids, arguments, signatures, usage and terminal results. This avoids quadratic snapshot retention. Cancellation reaches the upstream signal; races also settle promptly if the upstream ignores cancellation, and neither late resolution nor cancellation between approval and replay releases stale output.

There is no second agent, route, server, revision registration, persistence store or production proposal ledger. Rejected proposals are not admitted canonical tool history; Flue records the failed submission and the production UI stream exposes an error rather than executable work.

## Exact changed paths and reasons

`changed-files.txt` is the complete literal path inventory, including this evidence packet. Implementation paths:

- `apps/brunch-agent/src/app.ts`: assigned production registration and execution scope.
- `apps/brunch-agent/src/provider-admission.ts`: bounded complete-proposal admission and cancellation, using public provider/stream APIs.
- `apps/brunch-agent/package.json`: move the already-installed `@earendil-works/pi-ai@0.83.0` from development to production dependencies; no version change.
- `apps/brunch-agent/src/evaluations/install-faux-provider.ts`: evaluation-only Node module-factory substitution. Tests replace the underlying Anthropic factory, **not the admission decorator**, so the built app executes its real registration. Never imported into the application bundle.
- `apps/brunch-agent/src/evaluations/runbook/schema-carrier-probe.ts`: adapt the existing explicitly unpaid replay's provider setup to that factory substitution; canonical inputs/assertions and retired-paid guard unchanged.
- `apps/brunch-agent/test/{history-retention,petrinaut-chat,prepared-workpiece,runbook-headless}.integration.ts` and `test/runbook-elicitation-faux-provider.ts`: same provider-setup migration, preserving their test semantics.
- `apps/brunch-agent/test/workpiece-revisions.integration.ts`: same setup migration; capture the now-expected failed mixed submission so its unchanged wrapper can inspect actual no-mutation behavior. The proposal fixtures and `workpiece-revisions.test.ts` assertions are unchanged.
- `apps/brunch-agent/test/admission-controls.integration.ts` and `admission-controls.test.ts`: replace the obsolete test-only feasibility guard with registered-production rejection, wire/UI-error, normal settlement, correlated-result and active-Stop checks. The old diagnostic implementation/evidence remains pinned in its original commits/directory.
- `apps/brunch-agent/test/provider-admission.test.ts`: 11 provider-contract tests for both methods, exact accepted values, event/byte/time bounds, cancellation, late output and streamed/final call classification.
- `apps/brunch-agent/test/provider-registration.test.ts`: the actual app registration's scope isolation and retained provider metadata, with registration/routing mocked rather than another production agent.
- `apps/brunch-agent/test/admission-voice-evidence.ts`: canonical serialized Voice-facing probe output shared with the website test, without importing the entire Node probe into website typechecking.
- `apps/brunch-agent/test/architecture/boundaries.integration.ts`: exact hermetic inventory entries/descriptions for the new tests; equality and existing assertions preserved.
- `apps/petrinaut-website/src/main/app/voice-interview/buffered-admission.integration.test.ts`: run the built mounted probe and feed its actual output to the production speech selector/bridge; audio is a test sink. All actual tool parts remain in the fixture so the oracle cannot pass by pre-filtering payloads.
- `apps/petrinaut-website/turbo.json`: make that normal-discovery test depend on `@apps/brunch-agent#build`.
- `apps/petrinaut-website/package.json` and `yarn.lock`: the website's Node-based test gets the already-used `@types/node@22.18.13` development dependency. No new runtime version or package is introduced.

No production changes to ChatAgent, plugin mounting, core marker/revision tools, website transport/browser host, settled citations or basis joins. No manual mission/planning/navigation changes beyond the requested authority cherry-pick. No published Petrinaut code or user-facing UI changed, so no changeset was added.

## Mounted evidence

`mounted/observations.json` contains **14 proposal cases and two buffering lifecycle cases**, with generated calls, public histories, receipts/errors, canonical headless pre/post definitions, results, projections and SDK wire chunks. `mounted/timeline.json.gz` and `mounted/requests.json.gz` retain the raw synthetic runtime/wire sequence and underlying faux-provider contexts. `original-oracle/` retains a separate final execution of the original instrument, including completed stop/reload settlement. Compressed files are lossless.

The 14 cases comprise both marker/browser orders, both revision/browser orders, all six three-tool permutations, browser + unknown/unmounted sibling, and three positive controls. Each first settles an older revision through the actual tool. All **11 mixed cases** make exactly **one** attempted provider request, publish **zero attempted tool-input/output chunks**, partially execute **no sibling**, leave the previous revision intact, and produce a visible failed submission/UI error. Their headless definitions remain unchanged.

The independently admitted `addType` case makes one request before the result, changes the canonical headless definition once, receives one correlated result in the same conversation, then makes exactly one continuation request. Its result projection contains actual output and no remaining executable input. The result's labelled Voice call origin survives projection. This is headless execution and result-consumer proof, not actual-browser application or duplicate-delivery breadth.

The unfinished-provider probes emit ordinary prose and tool-call events upstream while withholding completion. The mounted history remains free of those assistant parts. Approval subsequently preserves ordinary prose and the marker; durable Stop instead settles as `aborted`, aborts the upstream, and suppresses deliberately delivered late completion. The website's real speech selector and bridge consume these snapshots: silence before approval, exact question replay afterward, no speech from tool payloads or rejected/stopped material, and no duplicate speech on an unchanged update.

`inspect-state.py` uses read-only SQLite plus the canonical exported state key. `state-records.json` and `summary.json` verify the exact Markdown SHA-256, ordinary state/result co-commit, preserved old revisions after rejection, the valid replacement, and no revision state written by the cancelled proposal. This is diagnostic storage inspection, not a product state API or crash oracle.

## Verification

Final run in a terminal pane using **Node v22.21.1**:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=4
```

**Exit 0; 63/63 tasks successful, zero cache hits; 1,449 tests passed.** Core 103; plugin 20; binding 20; transport 42; app 197; Petrinaut 692; website 375. All selected builds, typechecks and lints passed. Existing non-blocking warnings are retained in `verification.log`; no new warning/error was waived.

Additional final checks:

```sh
yarn workspace @local/petrinaut-arch-docs lint:arch-docs
A2_OUTPUT_DIRECTORY="$PWD/<fresh-directory>" yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/admission-controls.integration.ts
A2_OUTPUT_DIRECTORY="$PWD/<another-fresh-directory>" yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/workpiece-revisions.test.ts
```

All exit 0. Architecture: **70 layers / 356 edges**. Original oracle: **3/3 tests pass**. `toolchain.txt` and `source-manifest.json` pin the final source/build/runtime identity. Formatting, `git diff --check`, semantic staged-diff review and normal commit hooks passed.

Initial failures were retained rather than erased: the shell surface denied `tsx`'s Unix socket (`EPERM`), cascading into missing design-system/UI artifacts; the normal terminal run cleared that environmental problem without modifying those packages. One existing 5-second chat test timed out under the failed broad run and passed unchanged on focused rerun and the final bounded-concurrency sweep. New test lint/type errors were fixed (mock typing, cross-project Node/type imports and the Voice fixture's static-editor-type boundary), not skipped or converted to expected failures. The original safety test first reproduced red, then passed against registered production behavior.

## Remaining limits and next owner work

- **Explicit settled revision/hash citations and supersession refusal remain unjoined.** The integration owner can now implement that join, plugin mounting and issued browser/basis binding against an exercised admission boundary. No second current-workpiece authority is supplied here.
- Invalid multi-browser batches, interrupted/recovered execution, crash durability and the separately known A4 overflow-continuation failure remain unproved/unrepaired. Green checks here are not universal admission or recovery acceptance.
- The 120-second/size/event budgets are deliberate visible-refusal bounds, not provider performance measurements. No paid/native-provider elicitation, microphone, audible output or actual-browser witness ran.
- The ordinary Flue error turn reports zero usage for a decorator refusal (observed in the faux trace). Do not interpret that as a free real request: before a paid instrument is authorized, pin underlying-provider usage/reservation accounting for rejected/cancelled requests. This assignment made no paid call and changed no accounting authority.
- Future faux/metering adapters must remain **below** production admission; replacing Flue's provider with an unwrapped one after app registration would bypass the guard. The included unpaid replay/setup adapters use the real registration path.
- Preserve the accepted Mission 6b limitations: direct-user Voice hydration attribution, durable withholding after an already-settled tool step and comparative latency are not newly established. Existing protected Voice/Stop/catalogue/causal-result/compaction tests passed.
- The integration owner should synchronize mission status after reviewing/merging this implementation. No further production seam change is requested from this worker before that join, and no Step A acceptance or Step B authorization is implied.
