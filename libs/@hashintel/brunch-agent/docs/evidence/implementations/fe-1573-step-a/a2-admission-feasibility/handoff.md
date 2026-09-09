# Mission 7 A2 admission feasibility — owner decision handoff

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Verdict

**Lu selected the bounded buffered-rejection route after reviewing this handoff's decision prompt. Dependent implementation awaits the integration owner's authority amendment and production registration; it is not blocked on lack of any supported capability.** The built mount still violates both admission obligations. A supported custom-provider experiment can reject whole mixed proposals before they enter Flue's client stream, but it buffers output and fails the submission. This alternative is not silently installed as product policy, and no settled-citation join has been implemented.

| Obligation | Current production | New evidence |
| --- | --- | --- |
| Revision/construction exclusion, with explicit settled revision consumption | **Fail / incomplete.** The ordinary mixed-batch safety test stays red and unchanged. Canonical `addType` still has no joined settled-basis envelope. | Buffered rejection refuses all tested mixed revision/browser permutations, including after an older revision has settled, without tool-input publication or state replacement. This demonstrates a candidate admission boundary, **not explicit citation enforcement**. |
| Marker/client-result barrier without any revision call | **Fail.** Marker + `addType`, in either order, makes 2 provider calls before a client result. | Buffered rejection fails that entire proposal after 1 provider call, admitting no mutation. A separate admitted browser call waits, receives its correlated result, and resumes the same conversation. **The owner selected this rejection policy below; authority promotion and implementation remain outstanding.** |

No paid calls or reservations; **US$0**. Shared usage remains the owner's 5 calls / US$0.09113535; ledger unchanged. No actual-browser, genuine Vestera, full A2 durability, Step A acceptance or Step B claim.

## Branch, commits and write set

- Worktree `/Users/lunelson/.herdr/worktrees/hash/m7-admission`, branch `ln/fe-1573-admission-feasibility`; inspected clean at `e1b2989738adbdfabb3b5514ea107fc9de6ad4eb` before editing.
- Source/test commit: **`c45c1a67c8f414ce004980b364321fd7fa4b2555` — Probe production admission controls with a faux provider**. Evidence commit **`5b9c4fbb7c76f3fc9923c5c16b6c0bcef6acc307`** contains the investigation packet; **`f3b7ad080938ef0ebc31df5719db0814c9ec9e97`** refreshes its hashes after commit-time JSON formatting. A subsequent evidence-only commit records Lu's route selection; its ID is provided in the relay message.
- `apps/brunch-agent/test/admission-controls.integration.ts`: controlled public observer/interceptor/provider experiments on the existing built production mount, disposable stores, full event/wire/request capture and canonical headless execution. It is not a production import or registration.
- `apps/brunch-agent/test/admission-controls.test.ts`: four normal-discovery capability discriminators and positive controls. They do not replace, skip, invert or modify the original red safety assertion.
- `apps/brunch-agent/test/architecture/boundaries.integration.ts`: one exact hermetic-inventory entry for the new runtime-using instrument. Exact set equality and existing assertions remain unchanged.
- This fresh evidence directory contains `candidate-controls.md`, retained artifacts, verification logs, read-only `summarize.py`, and manifests. **`changed-files.txt` enumerates every exact committed path and is the complete write-set inventory.**
- Per Lu's follow-up instruction, copied main-worktree `.env.local` to this worktree without displaying it. It is ignored and uncommitted. `yarn install --immutable` supplied missing dependencies without changing tracked dependency files. No source under `node_modules` was patched.
- No edits to `MISSION.md`, planning/navigation, plugin `src/flue.ts`, ChatAgent, website registration, transport/host production code, the basis join, shared ledgers or sibling worktrees. No push or history rewrite.

## Smallest reproducer and new observations

Original red oracle, after building from the current sources:

```sh
yarn exec turbo run build --filter=@apps/brunch-agent
A2_OUTPUT_DIRECTORY="$PWD/<fresh-output-directory>" yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/workpiece-revisions.test.ts
```

Observed **2 pass / 1 fail**, at `mixed workpiece and browser tool batch does not apply a mutation`; `baseline.log` and `baseline/observations.json` retain that reproduction. The original instrument and assertions are byte-for-byte unchanged.

New control run, choose a **fresh directory per run** (never reuse a retained SQLite):

```sh
A2_ADMISSION_CONTROL=provider-reject A2_OUTPUT_DIRECTORY="$PWD/<fresh-output-directory>" yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/admission-controls.integration.ts
```

Other control values: `baseline`, `observer-throw`, `tool-veto`. `controls-<mode>/run.log` records final runs, each exit 0: the observation instrument completed, not a production-safety verdict.

Each control runs 14 cases: 10 required mixed-order cases (both revision/browser orders, both marker/browser orders, all 6 three-tool permutations), a live browser + unmounted sibling case, and 3 positive controls. Every case first settles a real core revision through the mount. Across **56 cases**:

| Control | 11 mixed cases: pending mutation / canonical headless change | Provider requests before client result | Meaning |
| --- | --- | --- | --- |
| Baseline | Yes / yes | 2 | Existing failure reproduced across order permutations and an unmounted sibling. |
| Throwing observer | Yes / yes | 2 | Public observer errors are contained; not a veto. |
| Tool interceptor veto | No final pending mutation / no headless change | 2 | Late refusal, not admission: browser `tool-input` appears on the wire **before** the veto. |
| Buffered provider rejection | No attempted tool input or pending mutation / no headless change | 1, then failed submission | Whole-proposal exclusion before publication; no automatic repair/retry. Policy candidate only. |

All modes preserve ordinary seed settlement, noninteractive marker continuation and server-only revision + marker continuation. Their separate `addType` control makes 1 request before the client result, applies exactly one canonical type, sends its correlated result, then makes exactly 1 further request in the same conversation. The production history projector has the actual client output and no remaining executable input after resume; the canonical definition remains unchanged during continuation. This does not exercise duplicate delivery or an actual browser executor.

Artifacts per final control: `observations.json` (histories, receipts, failures, generated calls, pre/post definitions and client results); `timeline.json.gz` (lossless runtime/interceptor/wire callback arrays); `requests.json.gz` (actual faux-provider contexts/catalogues); `proposals.json.gz` (raw upstream final messages/events for the buffered candidate; empty for controls that do not buffer); `state-records.json` (read-only SQLite normal state/result batches); `run.log`. `summary.json` provides per-case results, current exact revision, errors and attempted wire chunks. These are synthetic, not provider-quality evidence. The local ignored databases are not exports or relocation proof.

`candidate-controls.md` records every material candidate, its public API, actual source consumer, relevant timing, falsifying observation or source-based exclusion, and the tested provider option's limits. A crucial advance beyond the prior source read: **Flue publishes individual `tool-input` chunks before the full provider response is finalized and before server tool interceptors run.** Simply exposing Pi's `beforeToolCall` would therefore still be too late for pre-publication admission.

## Owner decision and concrete production proposal

**Owner decision received:** Lu selected **“Authorize the bounded buffered-rejection route (Recommended)”** in response to: “May the integration owner adopt buffered, fail-closed rejection of mixed browser/server proposals, accepting delayed streaming and a failed invalid submission rather than automatic repair?” The choice's stated scope was the supported provider registration seam, with owner coordination of policy, cancellation/Voice checks and the settled-citation join. The prompt explicitly required the integration owner to record any accepted policy change before dependent implementation. This evidence records the selection; it does not substitute for the required authority-only `MISSION.md` amendment.

**Selected recommendation: that narrowly bounded option for the integration owner.** It uses a supported registration already exercised by the build, requires no dependency patch, preserves the server tools' definitions and can reject before the earliest tool-input publication. Lu has selected the route, but the authority amendment is still outstanding; do not begin protected edits against this evidence alone. Retain the raw-proposal audit limitation: a rejected proposal is not admitted into canonical tool history; a visible failure is recorded, and no parallel production ledger is proposed.

Concrete follow-on seam if approved: the owner registers a complete, scoped provider decorator at the existing application registration boundary (`apps/brunch-agent/src/app.ts`, or the existing owner-selected registration module), not a second route/agent/server. Reuse the actual provider and public `setProvider`; gate its full proposal before releasing tool-bearing output. The current test-only `stream()` refusal and broad controlled catalogue are not a shippable provider implementation. Preserve a single model declaration and unchanged compaction forwarding. Recheck cancellation/Voice streaming behavior under the new buffering policy before claiming it preserves that interaction path.

Then the owner coordinates the already-required core-current-revision exposure and plugin/ChatAgent basis join using the **one existing** `WorkpieceRevision` authority: validate explicit id/hash against a settled revision, refuse unknown/superseded citations per mission policy, and strip basis only at canonical execution. No second state registration or provider-owned “latest revision” cache. This probe does not specify a competing return type or duplicate that join.

If buffering or failed-submission behavior is unacceptable, the smallest alternative is an **owner-authorized runtime capability intervention**: add pre-publication whole-batch admission, with durable/recovery-compatible refusal, plus a continuation decision that accounts for outstanding client results independently of unanimous tool termination. Preserve marker/revision semantics. A termination `every → some` patch alone is not sufficient; a tool-run-only veto is also too late. No particular release or upstream patch has been claimed to exist or installed.

Until the integration owner promotes the selected route into mission authority and implements/verifies it, do not mount the diagnostic control as-is, weaken the original oracle, add prompt-only sequencing, or proceed to the provenance/browser join on the assumption that admission is fixed.

## Verification and remaining uncertainty

From repository root:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --continue=always --force
```

`verification.log`: **exit 1, 47/48 tasks successful, zero cache hits**. All selected builds, typechecks and lints pass. Tests: core **103**, plugin **20**, binding **20**, transport **42**, app **184 pass / 1 fail**; total **369 pass / 1 fail**. The only remaining failure is the unchanged production mixed-batch oracle. App has 14 existing lint warnings; binding and transport have 2 each, core/plugin zero. `verification-initial.log` retains a resolved new lint failure in the diagnostic assertion (nested `expect.objectContaining` inferred `any`); the final assertion uses `toMatchObject` and passes. Early probe-authoring checks also caught a type-only class export and a mistaken `dynamic-tool` expectation for the AI SDK's `tool-*` projection; both were corrected, not waived.

The full sweep preceded the final additive `onEvent` wire capture in the test instrument. After that addition, these checks ran on the committed source:

```sh
yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/admission-controls.test.ts test/architecture/boundaries.test.ts
yarn workspace @apps/brunch-agent lint:tsc
yarn workspace @apps/brunch-agent lint:eslint
yarn exec oxfmt --check apps/brunch-agent/test/admission-controls.integration.ts apps/brunch-agent/test/admission-controls.test.ts apps/brunch-agent/test/architecture/boundaries.integration.ts
git diff --cached --check
```

Results: **31/31 focused tests** (4 candidate checks + 27 architecture checks), typecheck pass, lint pass with the same 14 warnings, format pass on 3 files, whitespace check pass. `sem diff --staged` reviewed only the two added test modules and the exact inventory entry. Final explicit retained control runs use the same fresh production build and final source commit; each completed successfully.

The SQLite summary command consumes the canonical key export, validates exact UTF-8 SHA-256, inspects state/result co-commit, checks which revision survived each attempt, and verifies zero attempted wire tool chunks for buffered mixed refusals:

```sh
key=$(yarn workspace @apps/brunch-agent exec node --input-type=module -e 'import {workpieceRevisionStateKey} from "@hashintel/brunch-agent/workpiece"; console.log(workpieceRevisionStateKey)')
python3 libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a2-admission-feasibility/summarize.py libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a2-admission-feasibility "$key"
```

**56 cases inspected successfully.** This requires the local disposable databases; retained state extracts permit artifact inspection elsewhere but are not a supported import route. The final hash audit caught commit-time JSON formatting changing artifact bytes; all four committed control observation payloads were compared with their original stdout and are equal as JSON values. The follow-up manifest pins the formatted committed representation, while compressed raw requests/events/proposals remain byte-identical.

No production or UI code changed, so the narrower core/plugin/binding/transport/app regression portfolio was used; no new full website/Petrinaut UI run or browser witness is claimed. Existing protected marker, model/compaction forwarding, prepared fixture, scoped catalogue, matching-call errors, causal client-result and folded Voice-origin tests ran in those packages. The accepted Mission 6b active-Stop path and its three limitations remain unchanged, not newly re-proved under the unmounted candidate. Overflow continuation and interrupted-revision recovery were deliberately not re-investigated; their prior red/unproved status remains.

This work enables an informed admission-policy choice and a precise production join request. It does **not** authorize paid work, establish safe ordinary construction, settle basis/durability/why semantics, accept Step A, or open Step B.
