# Mission 7 A3 — partial handoff

**Partial: implementation candidate and component/handle proof, not A3 completion.** The optional synchronous host seam, narrow root-arc effect accounting, record integrity checks and local duplicate handling are implemented and verified. The website does not yet mount the recorder or carry its records through the production client-result signal. No real browser witness was performed, and the exact production/browser integration oracle remains blocked. No Step A acceptance or Step B authority is claimed.

## 1. Commits, authority and actual write set

Implementation/tests: **`0ff1f8f0e4740ec4b6b1e4821b0b8c51d16cd961` — Add synchronous mutation observation and verifiable arc records**. The following evidence commit contains this directory; its ID is returned with this handoff rather than attempting to embed a commit's own hash in its content.

Started clean on `ln/fe-1573-a3` in `/Users/lunelson/.herdr/worktrees/hash/charlie`, exactly at `c4f5a54b355f25b2588a1a23659fdc996d14986a`; ancestry was verified. Read the complete inherited mission and applicable package instructions. Consumed authority clarification `c265134393c6a8ecf131342482cd77ae0ceaa3a6` by source inspection and Lu's dispatch, without changing this branch's inherited `MISSION.md`. No sibling merge/cherry-pick, branch rewrite, push, issue, PR or new mission. All known integration-owned production files and paid ledgers are unchanged.

Repository-root paths actually changed by the implementation commit:

| Paths | Rationale |
| --- | --- |
| `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/transition-record.ts`; `test/transition-record.test.ts` under that package | Formalism-owned root `addArc` request, observation/effect/attempt semantics, complete diff checking, outcome verification and conflict reconciliation. No operation catalogue expansion. |
| `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/index.ts` | Exports consumed by the website adapter; no `./flue` changes. |
| `apps/petrinaut-website/src/main/app/local-storage-demo/transition-record.ts`; adjacent `transition-record.test.ts` | Bound synchronous handle observation, request/base checks, local replay guard, verified-delivery admission and detached record snapshots. No production registration. |
| `apps/petrinaut-website/package.json`; root `yarn.lock` | One already-existing workspace dependency on the plugin; both paths were explicitly approved before the coordination-policy clarification was consumed. No new third-party dependency or version change. |
| `apps/petrinaut-website/docs/task-dependencies.json` | The commit hook regenerated and staged the dependency/task mirror from that package change. Inspected afterward: precisely eight additive plugin dependency/build edges, no unrelated changes. |
| `libs/@hashintel/petrinaut/src/ui/petrinaut.tsx` | Optional public `PetrinautAiAssistant.executeMutation` property. This additional public-type path was explicitly approved after demonstrating the missing seam. |
| `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`; adjacent `ai-assistant-panel.test.tsx` | Pass the actual tool-call ID and host executor at the existing canonical mutation call site; test matching output insertion/continuation and exactly-once execution under StrictMode. No changes to scheduling, cancellation, Voice, generation or conversation ownership. |
| `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/apply-petrinaut-ai-mutation.ts`; adjacent `apply-petrinaut-ai-mutation.test.ts`; `types.ts` | Retain the stock helper, guard the optional synchronous callback's lifetime/one execution, and project canonical tool input/output types. |
| `.changeset/brunch-a3-browser-observation.md`; `libs/@hashintel/petrinaut/docs/ai-assistant.md` | Published-package patch note and user-facing explanation of optional host observation/refusal. No new visual surface or screenshot update claimed. |

All other new files are evidence under this unique directory. `verification-manifest.json` pins every implementation path/content hash and test totals. No production headless client file changed: browser-earned parity has not yet been established.

### Demonstrated need for the host seam

The website owns the live handle, but its subscription emits only committed changes with no tool-call identity; it cannot identify no-op/rejected attempts. The existing mutation helper observes equality synchronously but has neither a call ID nor a host-facing execution hook. Transport chunk arrival precedes the panel's deferred execution. Using any of these as a pre-apply observation would either omit attempts or correlate by timing rather than the actual execution boundary. The optional hook addresses precisely that gap and remains Brunch-free.

## 2. Observation boundary, outcomes and accounting

The panel calls the optional host executor only after ready-state admission, read-only checking and canonical mutation input validation. Its `execute()` closure invokes the unchanged canonical helper once and expires on return/throw. A host cannot defer that closure into a later generation. Reads, title changes, asynchronous commands, read-only refusals and schema-parse errors are outside this hook; the panel's existing matching-call error/refusal handling remains in force. This is a narrow canonical-mutation seam, not a claim that every possible invalid input already gets an A3 record.

The adapter snapshots `handle.doc()` independently just before execution and immediately after return/throw. SHA-256 is lowercase hex of UTF-8 `JSON.stringify(definition)`, matching the inherited definition-hash byte convention; it is not the request's hash and does not use the object-key-sorted equality helper. No await occurs in that interval. On a missing post state, it records `unknown` without a post hash. A previously obtained post observation is not erased merely because a later derivation fails. See `browser-witness.md` for atomicity limits: synchronous local JSON handle only, not a cross-tab/remote transaction or a reentrancy lock.

The plugin computes the complete canonical JSON diff, with snapshot-relative JSON pointers and full changed subtree values. Changed paths at the requested arc are partitioned into created/updated/deleted; every other changed path remains in the disjoint `derived` residual set, explicitly unmapped and without inherited basis. Only the exact new requested root arc with no residual effects earns `applied`. A wrong weight, an existing-arc update, unexpected sanitizer change or partial failure is not credited. This does not implement a generalized mutation/effect portfolio or useful basis for derived effects.

`canonical-pre.handle.json`, `canonical-post.handle.json` and `transition-records.handle.json` retain actual **canonical-handle-only** evidence. Reproduce from repository root with:

```sh
node --experimental-strip-types libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a3-20260908T092946Z/capture-handle-evidence.mjs
```

The test-authored fixture request has an independently supplied base captured before invoking the recorder. The adapter performs its own read. Observed result: one real core `addArc` execution, one added `/transitions/0/inputArcs/1` subtree, unchanged remaining canonical content, and two identical deliveries retained with aggregate outcome `applied`. These files are neither browser snapshots nor a replacement for required browser `transition-records.json`.

An identical delivery reuses the recorded result without executing twice. A valid conflicting outcome is retained alongside the first and makes the aggregate outcome sticky `unknown`; later execution is refused. Receiving verification checks detached content/hashes/effects, canonical input/file validity and outcome consistency; adapter delivery admission also checks the issued request and its captured binding. Integrity verification is not browser authentication. Failed/no-op/stale/unknown records must never be consumed as causal changes. See `review.md` for the independently identified counterexamples and their tested corrections.

## 3. Oracles and gates

The exact four website assertion names from `MISSION.md` are preserved. No prospective oracle was renamed or replaced by a skipped/expected-failure pass.

| A3 oracle | Status | Evidence and limit |
| --- | --- | --- |
| “observes the pre-apply hash independently of the request” | **Pass at handle boundary; browser blocked** | Website `transition-record.test.ts`; wrong requested hash and actual hand edit after request preparation both refuse execution and retain the independently observed state. |
| “derives disjoint created, updated, deleted, derived sets from pre and post definitions” | **Pass at handle/unit boundary; browser blocked** | Website exact assertion plus plugin tests of mapped updates and unmapped deletion/code changes; all diff content accounted for. Only the actual new root arc earns applied. |
| “refuses a record whose effects do not account for the diff” | **Pass** | Website exact assertion and plugin missing/duplicated accounting tests; verifier recomputes full diff and both observed hashes. |
| “marks conflicting duplicate browser outcomes unknown and retains both deliveries” | **Pass as adapter delivery test; real browser blocked** | Website exact assertion; aggregate becomes unknown, both deliveries survive, subsequent run refuses, executor called once. |
| “correlates the real browser transition record and resumes without reapplying” | **Blocked** | No `apps/brunch-agent/test/transition-records.integration.ts` or wrapper was added as a weaker substitute. Joined registration, issued base/incarnation envelope, record carriage and actual browser are required. |
| Required browser record, canonical browser pre/post and inspected screenshots | **Blocked** | `browser-witness.md` records non-performance, not invented observations; handle artifacts are separately labelled. |
| Conditional stock-safe host extension | **Pass at component boundary** | Helper tests cover exactly-once, synchronous lifetime, refusal and throw; panel StrictMode test observes state before/after, then the matching canonical output and one continuation. All stock/default panel tests pass. |

Final root command, run in this session's dedicated Herdr terminal after source edits were frozen:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --output-logs=errors-only
```

**54/54 tasks passed, 0 cache hits**, exit 0 (`verification-final.log`). Scoped suites: plugin **20 tests / 4 files**, app **152 / 25**, Petrinaut **692 / 84**, website **373 / 42**. This branch does not include A2, so these totals do not erase alpha's known failing mixed-batch oracle. Per-package final unit logs and the manifest retain the precise test discovery. Build, typecheck and lint all passed; existing non-blocking warnings remain in untouched code.

Protected regressions:

- Full Petrinaut panel/helper focused run: **64 passed**, including existing Stop-before-execution, canonical stopped-history skip, failure/matching-call error, StrictMode, old-conversation async result suppression, Voice ownership, and the new host observation test (`panel-tests.log`). The first fixture used a noncanonical spaced place name and was corrected; a later one-second assertion timeout was extended to cover the production diagnostics wrapper's existing one-second wait, without adding a latency claim.
- Website named `voice-browser-tools.integration.test.tsx`, `brunch-panel-transport.test.ts`, `local-storage-demo-app.test.tsx`: **27 passed** (`voice-regressions.log`). Real production components, controlled Flue/media events and jsdom; not a real browser/microphone witness and not a joined A3 record-payload witness.
- AI SDK transport/transcript suite: **42 passed** (`transport-regressions.log`), including causal latest-client-step collection, mixed server/browser steps and surviving folded Voice origins.
- `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`: **Pass**, 70 layers / 356 edges (`architecture-final.log`). No new architectural folder or edge into Brunch from Petrinaut.
- Touched TypeScript formatting, changed public Markdown/changeset formatting, `git diff --check`, staged semantic diff review and commit hooks: **Pass**. Logs are retained with terminal color escapes removed; no evidence text was rewritten into a success.

Early shell-tool root attempts failed at `tsx` Unix-socket creation (`listen EPERM`), cascading into missing generated dependency artifacts. A native terminal run of the same root task graph resolved that environment boundary and passed; no project source workaround was added. This session created and closed only pane `w12:p5`. No server, browser origin or database was launched/operated for an A3 witness; no other worker resource was stopped. Test/document/conversation/call IDs and evidence are A3-namespaced. No paid calls, shared-ledger writes or retired paid-runner use.

## 4. Minimal A5-facing API and limits

Canonical API owner: `@hashintel/brunch-agent-plugin-sdcpn` root exports `ArcMutationRequest`, `DefinitionObservation`, `ArcTransitionAttempt`, `ArcTransitionRecord`, `ArcEffects`, `deriveArcEffects`, `assertArcEffects`, `observedArcOutcome`, `verifyArcTransitionAttempt` and `reconcileArcTransitionAttempts`. `canonicalContent` is equality/correlation support, not the definition hash format. Inputs import the canonical Petrinaut tool contract; definitions import `SDCPN`; entities are not redeclared.

For A5: verify detached deliveries at the authorized receiving boundary, reconcile all verified attempts for the same call, and consult the **aggregate** outcome before attributing any effect. Snapshot JSON pointers are not durable entity IDs, epochs, passage locators or declared basis. Unknown/unmapped effects do not inherit request locators. No headless parity was earned or implemented, no general effect engine is offered, and no provider admission follows from these exports.

## 5. Integration dependencies and stopping point

`integration-owner.md` contains exact mount/executor API snippets, the named existing result/history seams and remaining owner-supplied values. They are proposals, not claimed applied patches. The integration owner must supply a real document incarnation and immutable issued-request lookup, mount the recorder on the existing website route, preserve canonical result identity and causal per-step ordering while carrying the record, and run the actual browser/correlated continuation oracle. The code must not be promoted by copying its requested hash from the pre observation or assigning an incarnation based on render timing.

During handoff Lu announced alpha **`b3ab2df3db`**, incorporating A2 through **`8c3083f8d5`**. Read its `a2-settlement-bravo/handoff.md` without importing siblings. Consumers must use canonical `WorkpieceRevision` from core `/workpiece` and `update_workpiece` from core `/flue`; optional JSON evidence remains unverified. A2 is still Partial: its mixed-batch safety oracle fails, so it supplies neither safe admission/basis nor an actual-browser guarantee. The A3 candidate does not repair or bypass that owner-held gate. No new paid call is authorized by availability of the revision API.

Accepted Mission 6b limitations remain explicit: direct spoken-user attribution after hydration is unsupported; locally withheld work after a settled tool-call step can reappear pending; no comparative latency claim exists. Existing Stop/Voice regressions are a baseline, not proof of the missing joined payload/browser path.

**Return to Lu/integration owner for the admission/basis/record join and actual browser witness.** Do not treat these passing isolated tests or handle snapshots as A3 done, a safe genuine tracer, Step A acceptance or Step B authority.
