# Independent bounded runtime diagnostics

These diagnostics followed the successful new-record threshold/reopen result. They use the real built ChatAgent mount, disposable original SQLite stores and a synthetic provider. They do not change maintained dependencies, product storage, canonical history, core revision policy or tool termination. Final observations and assertions are in `a4-replay-TZu8fGk9/audit.json`; exact commands and process exits are in its `commands.log`. Diagnostic subprocesses are deliberately killed with **SIGKILL**, not application stop or client abort. No external process is targeted.

## Instrument identity and bound

`history-retention-runtime-hook.ts` uses Node's synchronous module loader to instrument only the installed Flue `conversation-stream-store-CXwRWonS.mjs` **in the diagnostic process**. It asserts unique exact source matches and applies two substitutions: wrap `appendCanonical`'s existing writer promise with before/after observation and selected SIGKILL; observe `continueRebuilt` immediately before its original branch. No return values, validation, recovery algorithm or record data are changed. Each process retains original/instrumented SHA-256, exact instrumented source and a lossless boundary trace. The installed runtime is untouched; hashes are in `source-build-manifest.json` and per-run instrumentation files.

The fault after append is after `conversationWriter.append(...)` resolves, not after a fake tool fixture. A separate **read-only** SQLite acquisition before replacement application boot confirms the durable batch is present and which records are absent. Raw SQLite batches are diagnostic observations of the actual store, never a second ledger or source from which history is restored. Public SDK history and actual plugin current-state signals remain the product-facing recovery oracle. The next actual core update tests the recovered display ordinal.

## A. Overflow continuation — Fail, localized; source history retained

Final directory: `a4-replay-TZu8fGk9/overflow-*`. This runs the retained existing-tool oversized-input instrument, with observation only. It again reports successful overflow compaction **20 → 3**, then fails `Cannot continue from message role: assistant`. The trace reaches **`continueRebuilt` with `restartPresent:false` and message roles `[user,user,assistant]`**. The retained final assistant is the completed synthetic filler acknowledgement, not a tool result or pending user input. No provider callback is entered for the failed retry.

Causal source chain, installed Flue 2.0.3:

1. `runModelTurnWithRecovery` recognizes the completed faux response as context overflow, rebuilds canonical context, and successfully runs overflow compaction.
2. It selects `continueRebuilt`; this route has no `options.restart` callback.
3. `continueRebuilt` therefore calls `this.agentLoop.continue()` even though the rebuilt tail is an assistant.
4. Pi Agent Core 0.83.0 `dist/agent.js` rejects an assistant-tail continuation when there is no queued steering/follow-up; `agent-loop.js` has the same explicit last-role precondition. The recorded stack reaches this refusal before another model request.

The observation falsifies a missing-summary/faux-queue explanation for this retained silent-overflow case. It does **not** prove real-provider explicit-overflow-error behavior. All ten original public records retain exact IDs/content after the failure; `history-retention-audit.py` checks their equality independently. Archive/source-loss repair is not triggered.

**Smallest LOCAL owner decision:** decide whether to authorize a bounded local overflow-continuation correction at the Flue recovery entrypoint, or explicitly block/limit launches capable of reaching this path. A correction must choose a valid continuation/restart from the retained canonical boundary without inventing a user message, deleting public history, reissuing completed mutations or changing Voice/Stop semantics. Keep this failing instrument and distinguish successful-stop silent overflow from explicit provider errors. This packet supplies no repair candidate and opens no upstream work.

## B. Revision outcome/state append window — reproduced consistency Fail

The previously unexercised concern is now reached at the actual boundary. The finding is scoped to this installed runtime and core tool through the built route; it is not a general crash-safety verdict.

| Final case | Durable append sequence and actual interruption | Recovered result/current state | Next actual revision |
| --- | --- | --- | --- |
| `crash-observe-M70npEl4` | No kill. Batch seq 7 is `tool_outcome`; seq 8 contains **both** `state_write` and `tool_results_committed`; seq 15 settles submission. | Exact successful revision 1 plus full Markdown/pointer. | Ordinal **2** — normal control Pass. |
| `crash-after-outcome-7OoVEVqj` | Kill after seq 7 `tool_outcome` returns, before the normal state/result batch. Pre-boot store has the successful outcome but no state write or committed result batch. | Unmodified recovery preserves the successful pointer, appends a repaired result commit at seq 8 and completes the submission. **No revision state write** exists; plugin reports `currentWorkpiece:null`. | Ordinal **1**, despite the retained successful revision 1 — consistency **Fail**. |
| `crash-before-outcome-v9IOrPuC` | Kill just before the first outcome append, after tool execution. Replacement runs unresolved durable-tool recovery without another kill. | Recovery reexecutes the real core tool, writes outcome seq 7 and repaired commit seq 8. State is flushed only later, separately at seq 14; submission completes at seq 21. | Ordinal **2** — uninterrupted unresolved-recovery control Pass, not atomicity proof. |
| `crash-repair-o4D26AAx` | First kill before outcome; second kill after the replacement appends repaired `tool_results_committed` seq 8, before a later normal flush. Both kills have exact boundary markers. | Next unmodified replacement retains the successful outcome/result but has **no revision state write**; plugin reports null. | Ordinal **1** — interrupted-recovery consistency **Fail**. |

The original actual tool ID is `a4-crash-revision`; Markdown is `# A4 synthetic revision\n\nCrash-boundary diagnostic, not elicited testimony. Preserve exact source.\n`; SHA-256 is `4e5cb11efbe5edf8389866dec235df93ecba1e1f5abe7fe6f6f07dba1dc7c7e7`. The next tool ID is `a4-next-revision`. Full inputs, successful outputs, public IDs, submission attempts, current-workpiece signals and raw append sequence are retained per case. Faults do not lose the raw Markdown in the historical tool input; they lose the corresponding **current-state settlement**, while recovery still presents a successful result. This is different from model-context folding or missing public history.

The source ordering matches the observation: normal `tool_execution_end` appends an outcome without draining hook state; normal `turn_end` later drains state with `tool_results_committed`. `resumeDurableToolCalls` skips a call with an existing outcome. `appendRepairedToolResultBatch` preserves that outcome and commits results without draining hook state. For an unresolved call, the real setter runs during reexecution, but repair still commits results before that buffered state is flushed. No reconstruction from historical Markdown repairs the two interrupted cases.

**Smallest LOCAL owner decision:** decide whether to authorize a narrowly scoped atomic settlement/recovery correction at the local Flue boundary, preserving core's one render-captured state setter and public call/result identity, or retain an explicit no-crash-safe-revision limit and block consumers that require it. A successful revision must not recover with a missing current-state write; ordinary and recovered state/result settlement both need the same invariant. Do not wrap the buffered setter in a separately memoized `step.do`, add an application ledger, replay historical JSON into state, change termination or start upstream/storage repair. This lane implements none of those remedies.

## Limits and retained failed instruments

All final fault cases use exact final diagnostic sources and a copied/instrumented runtime only to expose ordering. The replacement process in the failure cases uses unmodified behavior (the after-outcome replacement additionally has observe-only append instrumentation). The read-only audit asserts fault reachability, durable absence/presence, public success, current-state consistency and the next ordinal; its success means **the diagnostic evidence discriminates**, not that crash safety passed.

Earlier sibling directories are retained development observations: one unresolved-recovery control exhausted its too-short faux reply queue; its corrected bounded six-reply control passes and exposes the delayed state flush. The first crash probes already reproduced both failures before that control refinement. The first hook was `.mjs` and failed type-aware lint for untyped parameters; the final typed `.ts` hook passes. These are not product failures. The first Yarn-launched SIGKILL cases returned Yarn exit 129; the final direct Node runner records actual shell exit **137** and matching SIGKILL boundary markers.

No paid/provider call, generic durability campaign, browser crash atomicity, host-loss recovery, A5 why, genuine interview, Step A acceptance or Step B execution is claimed. Repeat both diagnostic families on the combined native-patched runtime before its integration verdict; a native schema fix does not inherently fix either failure.
