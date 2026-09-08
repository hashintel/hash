# Mission 7 A2 — partial handoff

**Partial. Stop at the demonstrated mixed-batch feasibility gate.** The built production ChatAgent settles a server-side workpiece revision and preserves its call identity in public history. The installed runtime does **not** make a mixed non-terminating/server and terminating/browser batch safe: it admits the browser mutation and continues the model before any client result. Do not integrate this as a safe construction protocol or mark A2 complete.

## Branch, commits and scope

- Base/ancestry: `c4f5a54b355f25b2588a1a23659fdc996d14986a`, verified with `git merge-base --is-ancestor`; starting worktree was clean.
- Worktree: `/Users/lunelson/.herdr/worktrees/hash/bravo`; branch: `ln/fe-1573-a2`.
- Implementation/tests: **`02062b00ad89a86e0710b9add4c6ac25863b277e`**. The follow-on evidence commit contains this directory; obtain its exact identity with `git log -1 --format=%H -- <this-directory>` or the dispatch return.
- Exactly six implementation/test files changed: `packages/core/src/flue.ts`, `packages/core/src/workpiece.ts`, `packages/core/src/update-workpiece.ts`, `packages/core/test/update-workpiece.test.ts`, repository-root `apps/brunch-agent/test/workpiece-revisions.integration.ts`, and `apps/brunch-agent/test/workpiece-revisions.test.ts`.
- `MISSION.md`, app ChatAgent, plugin mounting, website, shared helpers/configuration, shared paid ledgers and all sibling worktrees were unchanged. No new dependency, issue, PR, push, restack, merge or history rewrite. `yarn install --immutable` restored already-declared dependencies missing in this fresh worktree; it changed no tracked dependency file.
- **Zero paid calls / US$0.** All model steps used `fauxProvider`; a Sonnet model identifier in faux metadata is not real-provider evidence or a spending reservation.

## Earned revision API

Canonical owners, not duplicated DTOs:

| Consumer contract | Owner |
| --- | --- |
| `createUpdateWorkpieceTool`, `updateWorkpieceInputSchema`, `workpieceMarkdownByteCeiling` | `@hashintel/brunch-agent/flue` |
| `WorkpieceRevision`, `workpieceRevisionStateKey` | `@hashintel/brunch-agent/workpiece` |
| Captured setter and call context | Installed `@flue/runtime` `StateSetter` and inferred `defineTool` run context |
| Optional stored evidence value | Existing core `JsonValue`; no new relation model |
| History and dynamic tool parts | Installed `@flue/sdk` `FlueConversationSnapshot`; integration test infers its own result from the probe, not a copied SDK shape |

`update_workpiece { markdown, evidence? }` is declared `durable: true`, returns `terminate: false`, and returns `{ revisionId, sha256, ordinal }`. `revisionId` is the actual `ToolContext.toolCallId`. The state value at `brunch.workpiece.current.v1` contains that pointer **and the full exact Markdown**, with optional unverified JSON evidence. Ordinal starts at 1, reads the latest buffered state via updater form, and is display-only. Reinvoking the same current call does not advance its ordinal; crash replay breadth is not proved.

Markdown must contain a non-whitespace character and fit **262,144 UTF-8 bytes**. It must be well-formed Unicode; lone surrogates visibly fail rather than being replaced before hashing. SHA-256 uses exact UTF-8 bytes and lowercase hex; there is no trimming, newline normalization, BOM removal or Unicode normalization. Whitespace, CRLF and non-ASCII content are pinned. Optional `evidence` has no authorized-source meaning: the wire schema accepts an optional value and the run refuses non-JSON content before state writes. It does not implement `{ locator, messageIds, kind }` interpretation, passage continuity, inheritance or A5's authorization/relevance join.

The existing `useBrunchAgent` captures one `usePersistentState` setter at render and invokes it only from the tool's `run`. Its prompt return and existing consumers are unchanged. No hook is called inside a callback, and no changing state is interpolated into invariant instructions. The current state is not yet exposed to the product pane or plugin: those joins remain blocked/owner-controlled.

## Exact prospective oracles

`revision-protocol.json` preserves each assertion individually. The six required core assertions all pass in `packages/core/test/update-workpiece.test.ts`; two additional tests pin malformed Unicode and unverified/non-JSON evidence. The discoverable app wrapper actually executes `workpiece-revisions.integration.ts` as a child process using the existing `runNodeScript` helper and built-application loader.

| Prospective claim | Outcome and discriminator |
| --- | --- |
| Returns actual call id and Markdown SHA-256 | **Pass.** Unit test and `mounted-final/settled-history.json`: call `settled-revision`, SHA `f6a6e097317c3e5fbb7fdff1412fa54188495f66477f3115d1459792d98eaead`. |
| Persists Markdown with pointer | **Pass for normal settlement.** Unit test and read-only SQLite inspection in `state-records.json`; the complete state write shares a batch with `tool_results_committed`. Not a crash/compaction verdict. |
| Refuses empty and oversize Markdown | **Pass.** Exact named unit assertions, including whitespace-only and a multibyte over-ceiling input; invalid input does not overwrite prior state. |
| Non-terminating result | **Pass.** Explicit `terminate: false`; mounted route continues to a second faux model response. |
| Render-captured setter called from run | **Pass.** Unit hook pin plus the real built application's persisted state; second revision after application stop/reload receives ordinal 2. |
| Built agent settles revision over mounted route | **Pass.** Exact named wrapper test; full `settled-history.json` and `second-history.json`. |
| Public history preserves tool-call identity | **Pass.** Exact named wrapper test; `dynamic-tool.toolCallId` equals result `revisionId`, and history remains equal after application stop/reload. No relocation or compaction was attempted. |
| Mixed workpiece/browser batch does not apply mutation | **Fail at server admission.** Exact named test remains an ordinary failing test, not `.fails`, skipped or expected-pass characterization. Pending canonical `addType` is admitted and the real-headless executor changes the definition. Actual browser application/no-application is **unproved**, not silently substituted by this headless counterexample. |

### Observed mixed batches

Each of these produces **two provider calls before any client result**, a successfully validated `addType` with server output `{ awaiting: "client" }`, and one type addition when passed to the existing real-headless executor:

1. `brunch_mark_question + addType` (existing-marker control).
2. `update_workpiece + addType`.
3. `brunch_mark_question + update_workpiece + addType`.
4. `addType + update_workpiece + brunch_mark_question` (reversed order).

`mounted-final/observations.json` retains generated calls, public validated/executed tool results, pending mutation IDs, executor results and complete canonical before/after definitions. Per-case `*-history.json` retains full public snapshots, including the marker data. `contexts.json` retains actual faux-provider contexts/tool catalogs. These are synthetic test-authored probes, not a genuine elicitation run. The probe deliberately supplies **no client-result signal** before measuring server continuation. It does not prove reconciliation or causal settlement of browser effects.

Distinctions: generating `addType` is not validation; `{ awaiting: "client" }` proves successful server validation/defer, not browser execution; a completed Flue submission can still carry that pending browser work; only the independent headless pre/post definitions establish the headless mutation here. `actualBrowserApplied` is deliberately `null`, not inferred true or false.

Installed behavior wins: `pi-agent-core/dist/agent-loop.js:377–379` requires **every** finalized call to carry `terminate: true`; Flue recovery mirrors this in `dispatch-nU3cIlT-.mjs:1620–1641`. `ToolContext` has no sibling-call list. The public execution interceptor exposes individual tool identity but no pre-dispatch batch admission API. Neither source order nor the presence of one terminating tool is a settlement barrier. Core cannot withdraw the integration-owned plugin tools by changing its own revision tool. Do not remove the marker, make either server tool terminating, or use a prompt as the guard.

### Additional unresolved runtime premise

`durability-review.md` retains an independent source-review concern about a successful tool outcome being recorded before the state/batch commit and then skipped during recovery. This was **not crash-reproduced**; no runtime bug verdict or workaround is claimed. The minimal implementation uses buffered state, not a separate step checkpoint that could skip an uncommitted setter on replay. Full interrupted recovery remains unproved independently of the observed batching failure.

## Commands and results

All commands run from repository root unless prefixed with the workspace command. `verification-final.log` is the final aggregate check; earlier numbered logs retain setup/tooling failures, including missing lockfile-installed packages and the corrected attempt to structured-clone function-bearing provider context. They are not behavior evidence for the final code.

```sh
yarn exec turbo run build lint:tsc lint:eslint test:unit --filter=@hashintel/brunch-agent --filter=@apps/brunch-agent --continue=always
```

**38/39 tasks successful (33 cached); exit 1 intentionally retained, not all green.** Core: **101 passing tests**, including **8 new revision tests**; typecheck/build/lint pass, zero core lint warnings/errors. App: **153 pass / 2 fail**, including **2 passing new mounted assertions and the new failing safety assertion**. The other failure is the protected architecture inventory missing the two newly authorized test entrypoints, with an exact proposed patch below. App typecheck/build/lint pass, 14 warnings in unchanged files and zero lint errors. The inherited prepared-workpiece, schema-carrier and mounted client-tool tests ran and passed; unchanged totals are regression evidence, not new A2 proof.

Explicit mounted evidence run (no listener, same existing route through `application.fetch`):

```sh
A2_OUTPUT_DIRECTORY="$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a2-settlement-bravo/mounted-final" yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/workpiece-revisions.integration.ts
```

Exit 0 means the **observation instrument ran**, not that its safety oracle passed. The wrapper in the root unit suite evaluates and fails that oracle. `mounted-final.log` and `mounted-final/` retain the observations. When rerunning, choose a new output directory; do not reuse this retained database. No network server was started and no occupied port was claimed; the built non-listening application used an isolated SQLite and UUID conversation/document identities. Local OTLP connection failures in the log do not imply hosted telemetry was configured or repaired.

```sh
python3 libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a2-settlement-bravo/inspect-state.py libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a2-settlement-bravo/mounted-final

yarn exec turbo run test:unit --filter=@hashintel/brunch-agent-transport-aisdk
```

Read-only SQLite inspection exits 0 and produces `state-records.json`; this diagnostic is not a new product history API. Transport regressions: **42 passed**, including causal most-recent-step client results, mixed server/browser step handling and retained Voice origins. `transport-regressions.log` retains the command output. No microphone, UI, active Stop browser witness, real-provider call, full Local CI or Step A acceptance was run. Existing accepted narrowed Voice/Stop limitations remain limitations.

`source-manifest.json` pins source, invariant guidance, runtime source and built app hashes. `git diff --check` and formatting of the six intentional TypeScript files passed.

## Protected semantics and permitted deltas

- Core `brunch_mark_question`, its schema/data identity, exact prose replay rule and non-interactive behavior are unchanged; it remains mounted with the revision tool, including the mixed probes.
- Prepared tagged dispatch selection, source authorship, revision-zero handling and legacy fenced-workpiece recovery remain byte-for-byte unchanged apart from adding the new type/key declarations to `workpiece.ts`. The existing prepared/model integration test still passes. No prepared material is relabelled as elicited evidence.
- Core SYSTEM and elicitation skill are unchanged. No dose, acquisition policy, operational vocabulary, domain-neutrality, uncertainty, authorship or no-invention teaching changed. The revision tool description is necessary protocol teaching, explicitly **not** an enforcement mechanism.
- Client-tool catalog/classification, transport, causal result collection, browser execution/continuation lifetime, Voice speech selection and Stop code are untouched. New revision output is a server tool result, not ordinary assistant prose. Browser rendering and speech coexistence with the new revision protocol are not newly witnessed.
- Delta: core mounts one server revision tool and stores its full current artifact with the pointer; the existing `./flue` runtime boundary and `./workpiece` browser-safe owner remain intact. No second route, agent, ledger, store or framework was introduced.
- The model-produced fenced authority has **not** been retired. The current plugin still teaches it, and the app/pane still recover it. This is an explicit incomplete integration boundary, not permission to run two model-produced authorities. No prompt rewrite was attempted after the safety gate failed.

## Integration-owner patches and decision

### Mechanical test inventory patch (proposed, not applied)

In repository-root `apps/brunch-agent/test/architecture/boundaries.integration.ts`, add these two entries to the existing `SUBSTRATE_INTEGRATION_ENTRY_POINTS` object; retain exact set equality and every other reviewed entry:

```ts
"libs/@hashintel/brunch-agent/packages/core/test/update-workpiece.test.ts":
  "Invokes the core revision tool with a mocked render-captured persistent-state setter and Flue hook declarations; no runtime boot, provider key, socket or model call.",
"apps/brunch-agent/test/workpiece-revisions.integration.ts":
  "Boots the existing built ChatAgent with a faux provider over the mounted application.fetch route, reads public history, reloads an isolated SQLite application and retains mixed-batch canonical headless observations; no provider key, listener or network model call.",
```

No production importer exception is needed: all core runtime imports remain in `src/flue.ts`.

### Compaction seam coordination

Alpha owns the separately authorized additive `useBrunchAgent(model: string, compaction?: CompactionConfig)` and its existing single `useModel(model, compaction === undefined ? undefined : { compaction })`, plus app-only `BRUNCH_TEST_KEEP_RECENT_TOKENS` validation. This branch neither implements nor imports that commit. Preserve the additive signature/forwarding when combining `flue.ts`, together with this branch's single persistent-state hook and unchanged marker. No sibling commit was merged here.

### Safety/provenance join requirements — blocked, not fabricated patches

1. The integration owner must choose and demonstrate an enforceable **mutually exclusive revision/construction admission protocol** across core mounting, plugin mounting and ChatAgent. Keep the marker server-side/non-interactive. Keep `update_workpiece` non-terminating. A check against a render-captured revision can refuse a new sibling id but **does not** forbid an update plus a mutation citing an older revision in the same batch; that shortcut does not satisfy the accepted no-mixed rule. If a runtime capability or interaction-policy amendment is needed, return that choice to Lu before implementation.
2. Expose the one existing render's current `WorkpieceRevision | null` to plugin/app consumers through a paired integration-owned composition change, without registering a second `usePersistentState` with the same key. A changing prompt is not the current-workpiece channel. Preserve existing `useBrunchAgent` consumers and alpha's compaction argument when selecting that API. No new state-access DTO is needed: use the core owner type.
3. Plugin/basis join consumes explicit `revisionId` and `sha256` only after settled results, refuses unknown/superseded citations under the accepted policy, validates template conformance, retains basis in canonical history and strips it before Petrinaut canonical execution. Never infer settlement from sibling order, a pending-client sentinel or a display ordinal. This branch does not supply a basis schema or claim authorized evidence.
4. Only after the guard is enforceable, replace the actual fenced-emission instruction in `packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md` (the paragraph beginning “Whenever the workpiece changes substantially”) with full-document `update_workpiece` settlement, preserving its useful-stretch cadence, before-construction/delivery obligations and non-delta requirement. The prepared-mode prose in plugin `flue.ts` and app/website selected-workpiece consumers require a coordinated, explicitly labelled legacy/prepared migration. Core SYSTEM contains no fenced-emission instruction to remove, so rewriting its elicitation policy would not repair this seam.
5. App/A5 validates optional evidence against authorized true-user public messages in the bound conversation and supplies current Markdown to the pane/reopened query. Existing `recoverRunbookWorkpiece` still selects legacy fenced revisions; do not interpret it as reading this new persistent state. No exact-line, evidence-inheritance, basis-quality or genuine reopened-why claim follows from the current artifacts.

## What successors may consume

- **A3:** actual revision call IDs/hash/pointer shape and public tool records, plus the mixed-batch red cases. No safe mutation authorization, basis join or browser-effect guarantee is delivered.
- **A4:** canonical public revision inputs/results, isolated persisted Markdown/pointer records, application stop/reload history, owner types and the alpha compaction-seam merge note. Repeat compaction/materialization on these actual records after integration; the current pin proves neither folding survival nor genuine conversation reopen/relocation. SQLite inspection is diagnostic only. Retained `.db` files are local and git-ignored, not portable lineage exports.
- **A5:** canonical core revision type/key and explicit missing joins above. Unverified evidence carriage is not support and the old fenced selector is not the new authority. Product pane/query/citation integration and the safety gate must be resolved before claiming the throughline.

**No A2 completion, A5/A6 paid-work authorization, Step A acceptance or Step B authorization.** The smallest owner decision is how to enforce exclusive revision/construction batches without changing the protected termination and interaction semantics. The red test and normal-settlement pins stand independently of that decision.
