# A4 new-record retention/recovery handoff

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Decision packet

Worktree `/Users/lunelson/.herdr/worktrees/hash/m7-record-retention`, branch `ln/fe-1573-new-record-retention`, exact base `113c8ada6f9a74d097bfbeb1b944db8c39223759`. Sole authority: unchanged `libs/@hashintel/brunch-agent/MISSION.md`, Step A A4 bounds. Implementation milestones: **`c53cae1b95`** (new-record retention probe) and **`1553038fae`** (bounded diagnostics/replay/audit). The following evidence commit retains this packet. No push.

**All findings are preliminary to the combined native-patched runtime.** Production, browser entrypoint, dependency/package-manager files, accounting and shared ledgers are unchanged. No paid application/provider call, upstream work, storage repair, synthetic canonical insertion, alternative store, genuine interview, A5 why success, general crash safety, Step A acceptance or Step B claim. **Post-review qualification:** the verification portfolio logged a transitive dependency-tool download of OpenAPI Generator 6.6.0; the original blanket no-external-request claim is withdrawn. See the acquisition disclosure below.

| Discriminator | Verdict | Evidence / owner consequence |
| --- | --- | --- |
| NEW actual revision/browser record production | **Pass, prepared synthetic-model scope** | Unchanged real Chrome/built website/ChatAgent entrypoint; actual canonical mutation and independent pre/post recorder. Final `a4-replay-TZu8fGk9/browser/observations.json`: eight synthetic requests, zero real provider calls, browser/listener errors or blocked-request attempts. |
| Threshold compaction of those new records | **Pass, preliminary** | **44 → 3** model messages; exact 20 pre-fold public records retained; controlled summary actually consumed; raw historical calls/sidecars leave model context. See `compaction-result.md`. |
| Current artifact after folding | **Pass** | Exact core revision 1 Markdown/hash/pointer, emitted by real plugin current-state signal; not the summary or restored projection. |
| Original retained-store process reopen / ownership | **Pass for local route** | Same original DB, exact 41-message snapshot, same identities, 401/403/403/404 negative controls, zero history provider calls and zero tool reissue. See `materialization-result.md`. |
| Mutation no-reapplication | **Pass at observed boundaries; Partial broader restart claim** | Actual browser duplicate/reload does not reapply before shutdown. Post-fold/process reopen hydrates no executable arc and reissues no tool. A second live browser after process restart is **not** exercised. |
| Full materialization / reopened why | **Partial / not exercised** | Retained-live-store branch earned for new synthetic records; no supported relocation attempted or required. A5/product why and genuine records remain later gates. |
| Retained overflow continuation | **Fail, localized** | Successful **20 → 3** overflow fold, then rebuilt assistant-tail continuation with no restart callback hits Pi refusal; original ten public records still equal. |
| Revision append-window crash consistency | **Fail, reproduced** | Kill after actual outcome append → successful recovered pointer, missing current state, next ordinal 1. Kill after recovered result commit reproduces it. Normal/uninterrupted recovery controls reach ordinal 2. See `diagnostics.md`. |
| Regression portfolio | **Partial pending parent-owned inventory insertion** | **62/63** forced serial tasks; **1,510 tests pass, one fails** solely because two new substrate entrypoints are not yet in the shared inventory. All selected builds/typechecks/lints pass. Exact parent insertion below. |

No public source was lost in either compaction test. The lossy model summary folds original wording/calls/sidecars out of current model context. Crash failures retain raw Markdown in historical tool input but omit its current-state settlement while recovering a successful result. Those are distinct defects and do not justify an archive or alternative storage design.

## Verification and reproducibility

Final run is **`a4-replay-TZu8fGk9`**, not the earlier development runs. Its `commands.log` retains each exact expanded command, exit and lossless log path. `source-build-manifest.json` pins production source/base, final instrument sources, exact Brunch and configured website build bytes, Node **v22.21.1**, Chrome version and installed Flue/runtime/SDK **2.0.3**, Pi AI/Agent Core **0.83.0**, Playwright **1.58.2**. Per-fault files pin original and instrumented runtime bytes. `artifact-manifest.json` pins retained evidence after lossless compression. DB/WAL/SHM files are excluded and ignored, not portable import authorities. Raw observation JSON, runtime source and logs are retained as `.json.gz`, `.mjs.gz` and `.log.gz` to preserve original bytes through repository formatting hooks; bare artifact names in this packet identify their uncompressed contents. The final `audit.json` and manifests remain directly readable. Inspection/decompression of evidence is not a conversation import route.

Dependency installation and builds passed with package-manager offline environment flags set; those flags did **not** enforce process-tree network denial. The forced serial regression command was:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
```

**Post-review acquisition disclosure (original run, not a rerun):** under the exact command above, transitive task `@local/hash-graph-client:codegen` logged `Download 6.6.0 ...` and `Downloaded 6.6.0` at decompressed `verification.log.gz` lines 1974–1975. The subsequent Java warning at line 1977 names `node_modules/@openapitools/openapi-generator-cli/versions/6.6.0.jar`. This is a dependency-tool acquisition event involving OpenAPI Generator **6.6.0**, not evidence of an offline cache hit. The log captures the task, requested version, reported completion and local JAR path; it does **not** capture the actual download URL/host, protocol, redirects/proxy route, response/status, transferred bytes or process-tree network trace. The whole campaign therefore cannot be claimed to have made zero external requests. The original compressed log and its compressed/decompressed hashes remain unchanged.

Application/provider calls and dependency-tool activity are separate: the synthetic-provider instruments still make zero real application/provider calls and incur zero provider spend. Runtime probes reject external fetches and the browser witness allows only its test origin, with zero recorded blocked-request attempts. Those are application/browser-level controls and observations, **not** verified process-tree egress denial or a campaign-wide network audit. The parent's separately reported deny-network fold/reopen replay is independent integration evidence; it is not incorporated into or used to relabel this original run.

Core 107, plugin 65, binding 20, transport 44, Petrinaut 692 and website 379 tests pass. App: 203 pass, one expected **unresolved integration requirement** fails: `test/architecture/boundaries.test.ts` → `the substrate is imported by exactly the reviewed entry points`, actual importers 26 versus inventory 24. This is not skipped, weakened or self-approved. The two added entries are the only assertion diff. Final focused existing-tool threshold/reopen wrapper passes separately; final app typecheck/lint passes. Earlier hook lint failure and all probe development failures remain in the packet. `verification.log` is lossless; do not call this an all-green suite.

After that portfolio, the website was rebuilt with its actual `/agents/chat` endpoint and the complete final browser/threshold/reopen/fault/overflow replay passed its **diagnostic** assertions, including expected runtime failures. The read-only audit independently confirms record equality, context folding, authorization, exact fault boundaries, missing state versus successful outcomes and next ordinals. The final shell script subsequently gained only the already-executed audit invocation; no probe semantics changed. No paid provider or mock-agent replacement is hidden behind a green unit fixture.

**Future reproduction prerequisite:** verify effective process-tree network denial, including child tools, before running commands. Yarn/Corepack/Cargo offline flags alone are insufficient. Builds and non-browser probes can deny all network; the browser witness requires an explicitly scoped loopback allowance for its owned listener/Chrome traffic while denying other network access. If denial cannot be verified, stop rather than run the commands below. These commands preserve the original task selection; by themselves they do not implement that isolation. This wording correction authorizes no rerun or further external access.

From this worktree, only after that prerequisite and an appropriately isolated dependency installation:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --concurrency=1
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn workspace @apps/petrinaut-website build
bash apps/brunch-agent/test/history-retention-diagnostics.sh
```

The script makes a fresh `mkdtemp` packet under Step A evidence, runs the unchanged browser entrypoint, then sequential processes on that original store, then independent fresh fault/overflow stores. It creates no production service and restores no local-storage JSON; the existing witness owns/cleans its ephemeral loopback listener and Chrome context. Fault cases deliberately use SIGKILL; no browser/listener exists in those processes. Stores remain local for authorized retained-store inspection. The script exits zero only when expected process outcomes and the read-only diagnostic audit agree, **not** when crash/overflow safety passes. Commands and failed observations prior to the final replay are enumerated in `commands.md`.

## Exact parent-owned integration insertions

Do not edit the shared inventory in this lane. In `apps/brunch-agent/test/architecture/boundaries.integration.ts`, insert these two entries into `SUBSTRATE_INTEGRATION_ENTRY_POINTS`:

```ts
"apps/brunch-agent/test/history-retention-new-records.integration.ts":
  "Reopens only the original disposable store freshly created by the unchanged real-browser witness, uses a faux-only provider through the built production mount, observes actual threshold compaction, and compares authorized public history/current revision after sequential process restart; no provider key, listening socket, canonical-record insertion or projection import. Faux-only provider and external-fetch rejection are application-level controls; the runner must verify process-tree network denial.",
"apps/brunch-agent/test/history-retention-crash.integration.ts":
  "Boots the built ChatAgent with a faux-only provider in a fresh disposable SQLite store; optional isolated load-time runtime instrumentation kills only its own process at actual append boundaries, then sequential replacement processes inspect public history, current revision and read-only diagnostic SQLite batches; no provider key, listener, canonical-record insertion, maintained dependency patch or storage repair. Faux-only provider and external-fetch rejection are application-level controls; the runner must verify process-tree network denial.",
```

Optional parent package script in `apps/brunch-agent/package.json` (explicit Chrome/fault diagnostic, **not** ordinary unit-test discovery): `"test:history-retention-diagnostics": "bash test/history-retention-diagnostics.sh"`. No package script is necessary to reproduce the supplied shell command. The hook itself imports only Node facilities; the Python audit only reads emitted observations, so neither creates another substrate-inventory importer.

## Next owner actions

1. Review/insert the two hermetic inventory entries serially, integrate owned test/evidence commits, and rerun the exact-set assertion plus affected portfolio. No dependency/package files are part of this lane.
2. Repeat the unchanged actual browser production, new-record threshold, original-store authorized reopen and exact input/envelope/sidecar checks **after native delivery/accounting integration**. Keep model-context loss and public-source retention separate. Repeat the two runtime diagnostic families on that combined build; do not presume native schema patches resolve them.
3. Make the two smallest **LOCAL** decisions in `diagnostics.md`: authorize bounded Flue overflow-continuation and atomic revision/result recovery corrections, or explicitly retain limitations/block dependent claims. No upstream or storage-policy detour is selected by this evidence.
4. Join A5's authorized true-user evidence, passage policy, product lookup/interpretation and live reconciliation before a reopened-why claim. Final A4 consumes the genuine interview records and that product operation. This packet does not accept Step A or unlock Step B.

Protected question-marker/non-terminating revision, causal per-step client results, Voice prose eligibility, active Stop and generation ownership are unchanged. The regression portfolio preserves their tested boundaries; this lane adds no microphone witness, spoken-user hydration attribution, durable post-settlement withholding or latency claim.
