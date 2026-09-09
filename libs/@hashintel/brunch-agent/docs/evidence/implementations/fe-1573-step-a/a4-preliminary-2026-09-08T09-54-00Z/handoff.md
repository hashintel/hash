# Mission 7 preliminary A4 handoff

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Decision-ready result

**Existing-tool preliminary pin delivered. Final A4, Step A acceptance and Step B remain pending.** Threshold compaction preserves every tested public source record; the same retained canonical store reopens through the production mount under the same local principal/conversation identity. A separate controlled overflow case folds successfully but fails continuation, and is retained as an executable failing pin. No archive hardening is earned yet. No supported relocation/import route was found; use the genuine retained-live-store route.

| Probe | Verdict | Evidence and selected branch |
| --- | --- | --- |
| Existing-tool threshold compaction | **Pass, preliminary only** | 256-token retained tail; actual 20 → 3 context fold; 10/10 pre-fold public messages unchanged; `compaction-result.md`, `threshold-repeat/` |
| Retained-store authorized history reopen | **Pass, preliminary only** | Different process, same store and identities, exact 14-message snapshot equality, no retrieval-time provider calls, successful UID-conditioned follow-up; `materialization-result.md`, `threshold-repeat/` |
| Export/relocation | **Unsupported/not attempted** | Installed public surface provides no canonical conversation import/relocation route; select retained-live-store success, not terminal failure |
| Controlled oversized-input continuation | **Fail, scoped runtime observation** | Two disposable runs fold 20 → 3 then fail `Cannot continue from message role: assistant`; `overflow-repeat/` and earlier `overflow/`; owner/upstream disposition needed, not an archive repair |
| Persistent A2 revisions, A3 transitions, final reopened why | **Pending** | Not in this tested production build; exact rechecks below. Availability of A2's separate artifacts is not a pass here. |

All model responses are faux, all user material is openly test-authored, both doc results are test-executor responses, and no actual browser/mutation/why operation is simulated into a stronger claim. Zero real-provider calls and US$0; no shared ledger or reservation was changed. No new issue, PR, push, restack, sibling merge, second service or storage mechanism.

## Commits, worktree and actual write set

- Worktree: `/Users/lunelson/.herdr/worktrees/hash/h-echo`; branch `ln/fe-1573-a4`; clean at dispatch.
- Required ancestor/base verified: `c4f5a54b355f25b2588a1a23659fdc996d14986a`.
- Owner compaction commit `f746bcd5ed6d60dfc24d5f1ae3147071b3de12b2` applied cleanly as **`835ca11b33`**. This is imported owner production configuration, not A4-authored source repair.
- Owner authority clarification `c265134393c6a8ecf131342482cd77ae0ceaa3a6` applied cleanly as **`4ef9d114d6`**. The inherited mission/integration-branch identity is preserved; no A4 mission was created.
- A4 tests/inventory: **`8493526924f43bcb3f29aea90aa306a2b74c2c28` — Pin public history across compaction and retained-store reopen**.
- This evidence packet is committed separately after the test commit; its commit ID is returned in the session handoff. Integrate the A4 test and evidence commits, not duplicate cherry-picks of the already-owned configuration/authority commits.

Authored changes, repository-root paths:

| Path | Reason |
| --- | --- |
| `apps/brunch-agent/test/history-retention.integration.ts` | Actual built mounted agent, finite faux provider, threshold/overflow probes, public IDs/parts/roles/results, safe shutdown and fresh-process reopen; writes diagnostic evidence only |
| `apps/brunch-agent/test/history-retention.test.ts` | Discoverable wrapper, sequential process ownership, prospective equality/survival assertions |
| `apps/brunch-agent/test/architecture/boundaries.integration.ts` | One reviewed hermetic entry for the new instrument; exact inventory equality preserved; explicitly approved by Lu and covered by the later policy clarification |
| `libs/@hashintel/brunch-agent/packages/binding-flue/test/history-reader.test.ts` | Two additional contract tests, existing tests preserved: role/purpose provenance; on-demand archive retention vs live peek and late-reader limits |
| `libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a4-preliminary-2026-09-08T09-54-00Z/` | This handoff, verdicts, exact raw observations and logs; DB files remain local/git-ignored |

No production source was authored by A4. No shared helper, transport, browser host, workpiece state, prompt, package dependency or plugin registration was changed. Test-path mapping is exactly the dispatch's `history-retention.integration.ts` plus `history-retention.test.ts`; no prospective assertion was renamed or relaxed. `reopened-why.integration.ts` was not edited.

## Verification and reproduction

Root toolchain restored with `yarn install --immutable`; no tracked dependency changes. Final full command, after the final test code:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@apps/brunch-agent --filter=@hashintel/brunch-agent-binding-flue --force
```

**39/39 tasks successful, zero cached.** App: 178 tests in 28 files; binding: 20 tests in 5 files. Typechecks/builds/lint pass. Existing app 14 and binding 2 warnings remain in untouched code; no new warnings/errors. Full output: `verification.log`. These green counts apply to the A4 branch with owner configuration, **not alpha after A2**; the parent's known mixed-batch failure is not hidden by them.

Explicit discovery check:

```sh
yarn workspace @apps/brunch-agent test:unit history-retention.test.ts
```

One test passed; `wrapper.log`. The wrapper actually executes both child phases against a newly generated disposable store and checks process exit plus the script's internal assertions. `sem diff --staged`, exact staged diff and `git diff --check` were inspected; no production delta was introduced. Code/authored Markdown pass whitespace checks; raw `verification.log`/`wrapper.log` retain terminal trailing spaces and blank lines rather than rewriting command evidence. `artifact-audit.json` additionally records mechanical equality checks of both retained repetitions and both overflow failures. Full Local CI/GitHub CI, paid/provider checks and browser witnesses were not run.

To retain a fresh full trace, run from repository root; never reuse a sibling or existing live DB:

```sh
A4_DIR=$(mktemp -d /tmp/brunch-a4-threshold-XXXXXX)
A4_OUTPUT_DIRECTORY="$A4_DIR" yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention.integration.ts
A4_OUTPUT_DIRECTORY="$A4_DIR" A4_PHASE=reopen yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention.integration.ts
```

Each phase sets `NODE_ENV=test`, faux-only model metadata, the owner-provided `BRUNCH_TEST_KEEP_RECENT_TOKENS=256`, and the absolute DB path before loading. Creation requires a fresh file; reopen requires the retained file. `send({ uid: null })` also refuses accidental reuse. Each successful script exits 0; only launch reopen after create exits. No listener is opened.

Executable failing overflow discriminator, using another fresh directory:

```sh
A4_OVERFLOW_DIR=$(mktemp -d /tmp/brunch-a4-overflow-XXXXXX)
A4_OUTPUT_DIRECTORY="$A4_OVERFLOW_DIR" A4_OVERFLOW_PROBE=1 yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention.integration.ts
```

Current exit: **1**, not a green expected-failure test. It retains final public history, runtime events, provider contexts and awaited shutdown despite the failed submission. `commands.log` records the primary commit-pinned create/reopen/overflow exits; `threshold-repeat/` and `overflow-repeat/` are the final instrument runs. `threshold/` and `overflow/` preserve the earlier same-outcome observations rather than erasing them. Initial harness-only setup mistakes (attempting to structured-clone callable provider tools; omitting the signal `tagName`) were corrected before the retained behavioral runs. The existing production client-result encoder was not changed.

## Public contracts A5 can consume

Use canonical library exports, not a new generalized history interface:

```ts
createFlueClient({ url, fetch?, headers?, token? }): FlueClient
client.history({ signal? }?): Promise<FlueConversationSnapshot>
client.send({ message, uid?, initialData?, signal? }): Promise<AgentSendResult>
client.read(admissionOrSubmissionId, options?): Promise<AgentReadResult>
```

`history()` is one unpaged materialized snapshot (`GET ?view=history`), not raw canonical ranges. Message IDs and offsets are opaque. The snapshot exposes `conversationId`, optional stream `incarnation`, ordered `messages` and `settlements`. Each message carries `id`, `role`, `purpose`, `display`, optional submission/turn/signal metadata and typed parts. A single assistant public message may contain several server model steps; neither adjacency nor public ordinal equals causal lineage.

The existing binding factory returns `peek(sessionId)` and `read(sessionId)`, both `Promise<FlueConversationSnapshot>`. Its required options are `resolveConversationUrl: (sessionId: string) => string`, `transport: typeof fetch`, and `archive: CaptureStore`. The host must resolve the actual mounted URL and supply authorized transport; the binding guesses neither mount nor principal. `peek` does not mutate/archive or restore older material; `read` refreshes the permitted session-log archive via a binding-private writer. A5 should not manufacture a new store merely to acquire history or reinterpret the legacy capture store as product provenance.

Authorization/identity requirements observed at the mount:

1. Use app `flueConversationIdFrom({ principalKey, conversationId })` and `agentOwnershipHeaders(identity)`; do not swap panel conversation, Flue public conversation, SDK instance UID or stream incarnation.
2. Reauthorize **every** request, including history and the future why operation. Local header ownership is not remotely verified human identity.
3. Retain the canonical store and stable `ChatAgent.agentName = "brunch-chat-agent"`. Close the previous runtime before reopening the same store. Production database mode is a separate Postgres contract, not proved here.
4. Pass the original `AgentSendResult.uid` on later writes to reject a replaced instance. It is distinct from `snapshot.incarnation`, which identifies the stream generation, and neither identifies the user's net/document.
5. Resolve true-user evidence only when both `role === "user"` and `purpose === "user"`. This test's user role records are still test-authored—not actual human/Voice provenance.
6. For client results, use the existing transport encoder. It supplies both signal `type` and `tagName: "client-tool-result"`, and one causal step's `{ toolCallId, toolName, output }[]`. In the direct SDK probe, omitting `tagName` left no tag in public history, so the existing public result projector could not recognize it; setting `type` alone is not enough for that consumer. Preserve full records, not just a UI fold or `{ awaiting: "client" }` sentinel.
7. A5 must add and enforce the real document/incarnation binding and authorized lookup operation through its owned production seams. History retrieval does not invent that binding or authorize a why answer.

## Conditional archive repair

**Not triggered: no lost source IDs.** Current archive unit behavior is not a promise that a subscription runs before compaction, that all history has ever been observed, or that latest-version quote resolution selects an immutable citation version. If actual A2/A3 records fail survival, retain the failing snapshots first and request a narrow integration-owned assignment for pre-loss acquisition and immutable lookup in the existing `binding-flue/src/history-reader.ts`, `archive-capability.ts`, `local-capture-store.ts` and core session-log contracts/tests as actually needed. That is a candidate repair boundary, not an approved implementation write set. Do not start it now or revive capture envelopes.

The overflow failure has no lost IDs and earns no archive repair. Its concrete owner request is to inspect the retained failing command and choose runtime/upstream disposition; do not change Brunch termination or hide the failure behind a synthetic success response.

## Executable recheck gates — actual A2/A3 records

**New information received before handoff:** alpha merge `b3ab2df3db` integrates A2 through `8c3083f8d5`, preserving the compaction seam. Its `a2-integration-alpha/integration.md` and `a2-settlement-bravo/handoff.md` were read through `git show` without opening any retained DB. Alpha reports 357 pass / one known mixed-batch safety failure; this is owner-supplied evidence, not an A4 rerun. A2 records are now available for the next recheck. They were not cherry-picked or claimed as tested in this packet. A3 records and A5's product operation are still untested here.

Run the following gates after the integration owner makes the corresponding record classes available. Preserve the same mounted production loader, faux-only provider, observed public IDs, independent store and prospective equality assertions; do not inject the siblings' JSON as canonical history.

- [ ] **Integrate safely on the owner-approved combined revision.** Preserve both compaction and revision changes to core `flue.ts`, and all A2/A4 inventory entries. Record the exact integrated HEAD/build hashes. Keep the ordinary red mixed-batch assertion red until production actually enforces the accepted rule; don't run construction as though the protocol were already safe.
- [ ] **Generate two real A2 settlements in one fresh conversation.** The delivered API is `update_workpiece { markdown, evidence? }`, result `{ revisionId, sha256, ordinal }`; owners are `@hashintel/brunch-agent/flue` and `@hashintel/brunch-agent/workpiece`. `WorkpieceRevision` at `brunch.workpiece.current.v1` carries pointer plus full Markdown and optional unverified JSON evidence. Do not redeclare the shape. Separate the tool turns and user sources; include a correction, non-adjacent true-user input, duplicate wording and an unrelated context record. Observe actual tool-call IDs; assert result `revisionId === toolCallId`, exact UTF-8 SHA-256, both old/new Markdown inputs and pointer results. Optional JSON evidence carriage is not yet authorized evidential meaning.
- [ ] **Generate actual A3 records at the browser boundary.** Use A3's real client-result/transition encoder, not manually authored transition JSON. Record the corresponding mutation input/basis, call ID, document/incarnation, requested base, independently observed pre-hash, post-hash when present, outcome and complete pre/post definitions. Include applied and failed/no-op attempts; preserve conflicting duplicate deliveries as unknown with both attempts if the integrated seam supports that required case. Do not call `{ applied: true }` an effect proof. No mixed revision/mutation batch is admitted as a safe shortcut.
- [ ] **Repeat threshold compaction over all those record classes.** Extend the scenario in `history-retention.integration.ts` using the integrated canonical exports; keep its pre/post full-message equality and result-correlation oracles. Cross the actual threshold, require a successful runtime compaction event and post-fold agent context, compare every recorded revision/mutation/result/evidence-source ID and part. Retain any lost/changed records without blessing. Recheck immutable old revision retrieval as well as current state/Markdown through the actual production state-consumer seam when exposed. If not exposed, mark that assertion blocked rather than using a private read as product proof.
- [ ] **Repeat retained-store process reopen.** Keep `history-retention.test.ts`'s sequential child phases, exact history identity/equality, zero retrieval-time provider calls, missing/foreign identity refusals and wrong-instance UID rejection. Add the actual document-incarnation mismatch refusal once the binding exists. Retain complete A2/A3 records and verify no mutation is reapplied on retrieval. Run the overflow failing command too and report its current outcome separately.
- [ ] **Final authorized product why gate.** Only after A5 supplies authorized lookup plus assistant interpretation, run `apps/brunch-agent/test/reopened-why.integration.ts` through its discoverable wrapper (or retain an explicit execution command). Reopen the genuine revision/mutation conversation; ask by an ordinary name/id through the real operation; check passage/revision/evidence standing and live document reconciliation. Exercise hand-edited, basis-absent, wrong-principal/conversation/document and stale/unknown cases. A deterministic resolver, history JSON, mock pane or the acknowledgement in this A4 test is not equivalent.

Commands for the first integrated recheck, retaining failures rather than weakening them:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@apps/brunch-agent --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-transport-aisdk --continue=always
NODE_ENV=test BRUNCH_TEST_KEEP_RECENT_TOKENS=256 yarn workspace @apps/brunch-agent test:unit workpiece-revisions.test.ts history-retention.test.ts
```

Add A3 browser/website checks for its actual affected package and execute the final why wrapper only when implemented. The second command does **not yet** test new-record compaction merely because both files run: the A4 scenario must first contain actual integrated revision/transition records as specified above. Preserve those separate prerequisites explicitly.

## Stop and limitations

Preliminary A4 can be integrated as useful mechanical evidence. It cannot close final A4, authorize a paid tracer, settle ordinary explanation utility, waive the A2 safety failure, or accept Step A/Step B. A1's paid synthetic carrier history is reference only and was never restored. No genuine Vestera conversation, browser effects or reopened why was produced here.

Mission 6b limits remain unchanged: snapshot hydration does not prove direct spoken-user provenance; locally withheld post-settlement work may return as pending on reopen; no comparative latency claim exists. Stop rather than add a sidecar, forge roles or withholding, mix principals, open a sibling store for writing, or infer a document incarnation from a Flue ID.
