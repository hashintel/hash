# Review correction: preserve the overflow-triggering completed response

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Scope and disposition

**The demonstrated oracle blind spot is corrected; no product loss or runtime blocker was demonstrated.** Review base: `46aa1908f65a05d48a1f22e239debb0182a7c68e`, branch `ln/fe-1573-local-recovery`, same assigned worktree. Test correction: **`6c6dcac5c9`**. This following evidence commit retains explicitly new observations. Core, Flue/native/Pi patches, lockfile, package manifests, production behavior and built product bytes are unchanged. No rebuild, install, upstream request, paid call, new service or production history store was needed or performed. The wider alpha delegation supplies no authority to this chunk.

The parent's independent replay and cold-review finding are supplied review evidence. This worker independently reproduced the exact supplied history filter against the previous oracle: fresh create **exit 0** and process reopen **exit 0** despite omission of `A4 filler acknowledged.`. See `blindspot-before-*`. This establishes a test deficiency: the old pre-filler baseline did not cover the response that triggered silent overflow. It does not establish product loss. The supplied hook is preserved byte-for-byte as `omit-response-hook.mjs.before.gz`; supplied files under `/tmp/m7-cold-review-WUypHTI7` were not edited.

All earlier raw packets, verdicts, manifests and the missing-JAR evidence commit remain immutable. In particular, the previous `local-recovery-wnhhyezf/a4-safety-N6GqzEeW` result is not regenerated or retroactively strengthened. Its successful runtime findings remain bounded by the now-disclosed missing-response oracle gap. The new result below closes that specific gap prospectively.

## Independent completion source, not a post-loss baseline

`history-retention.integration.ts` now watches the actual Flue agent-purpose `turn` observation for the intended successful assistant text. The installed source emits that observation only **after awaiting the real `assistant_message_completed` canonical append**, before entering compaction. At this synchronous boundary the test opens its actual SQLite store **read-only**, locates the turn's real start, text-delta/text-completion and message-completion records, checks their correlations/order, exact text and `stopReason: stop`, and writes an immutable observation pin. Nothing is inserted into canonical history, and saved data is never imported into state.

`completed-response.json` therefore anchors the actual canonical message ID, turn ID, submission/conversation identity, completed text blocks and the live completion event independently of `client.history()`. It is not populated from a history read after compaction and cannot silently rebaseline a filtered response. The pin must exist exactly once; the silent and cancellation audits verify its event precedes the first compaction event. Missing completion also fails rather than allowing an empty baseline.

After the actual submission settles, the test independently reads its matching canonical `submission_settled` record, requires `completed`, and retains it with the actual SDK receipt in `completed-response-settlement.json`. Every checked public snapshot must contain the pinned response **exactly once**, with exact ID, role/purpose/display, turn/submission identity, text and completed part state. The response's own public completed settlement must also occur exactly once with the correct `answeredBySubmissionId`. Replacement identity, changed text, duplicates and missing/changed settlement cannot pass by preserving unrelated earlier messages.

The read-only Python audit independently derives the expected public response from those raw completion records and the observed event; it does not trust only the stored expected-message object. It compares immediate post-compaction/cancellation history, history after the next actual input, a fresh-process reopen and history after the reopened continuation. Saved JSON is an assertion source, never another application history store or import route.

### Explicit error is still an error

The synthetic explicit-overflow error precedes a successful retry. Flue's existing `mergeAssistantContinuation` appends same-submission assistant parts while preserving the **first** step's public `id` and `turnId`. The retry consequently has a different canonical successful-message ID than the combined public response ID. The first draft of this correction incorrectly assumed those IDs were identical in the explicit-error case and failed that control; `targeted.log.gz` and `explicit-identity-probe-*` retain the failure and raw observations. That is a corrected test mapping, not a runtime change or loss finding.

For this fixture, the pin retains the prior error records, requires their exact `stopReason: error` and `(request_too_large)` diagnostic, and separately pins the successful retry's `stop` record. The expected public response uses the independently observed first-step identity and both ordered parts (empty error-step text, then successful retry text). Neither the error response nor its canonical completion is relabelled successful. The explicit-error valid-user-tail retry control remains green.

### Cancellation and the next actual input

The active Stop still interrupts the running summarizer after the successful assistant stop already exists. At that moment the test requires cancellation delivery, no successful summary/retry, the retained response and its already-completed settlement. It now additionally submits the next **actual** user input, then performs process reopen and another actual continuation, checking the same pinned response/settlement at every point. The previously withheld scripted response is consumed only for that next real input. A later legitimate compaction after the next input is distinguished from the cancelled compaction using the retained `eventsAtStop`, not incorrectly counted as publication by the cancelled operation. No user message is invented by recovery and no completed tool is reissued.

## New verification and falsification

**Final source/build-pinned matrix: `a4-safety-hcORSYb8`, 10/10 controls pass.** This is the recovery-only matrix under total IP denial; no new browser witness or paid-provider result is claimed. Seven crash atomicity controls are unchanged and pass; silent overflow, explicit-error recovery and active-compaction Stop now carry the stronger completed-response oracle. The earlier new matrix `a4-safety-fXKlTUFj` also passes 10/10 and supplies the immutable input corpus for the copied-artifact falsifiers. The final rerun follows only type/lint cleanup, with exact source snapshots in each packet.

| Instrument | Actual result |
| --- | --- |
| Previous oracle + supplied reviewer history filter | Fresh silent-overflow create 0 / reopen 0, despite the response omission: blind spot reproduced. |
| Strengthened oracle + exact supplied reviewer filter | **Exit 1 at the pinned-response assertion in all four cases**: silent create, silent process reopen, cancelled-compaction create, cancelled-compaction process reopen. Unfiltered seeds for both reopened cases pass. `reviewer-filter-results.log.gz` and per-case logs/stores retain the outcomes. |
| Maintained history-only falsifier tests | Five synthetic observation faults: missing response, replacement ID, changed text, duplicate response, missing settlement. Every child must exit **1 for the expected completion assertion**; an unrelated boot error cannot satisfy the test. Together with four unmodified positive cases, `history-retention.test.ts` passes **9/9**. The new load-time hook only changes SDK history observations, not runtime code or store data. |
| Copied artifact falsification | `falsify-audit.py`, `audit-mutants/`: **50/50 mutants produce safety-audit exit 1**, never a safety pass. Missing/replaced/changed/duplicated response and altered settlement are tested for both silent and cancellation cases, at each of four checkpoints separately and at all checkpoints together. The latter reproduces the review's coordinated after/after-threshold/reopen omission rather than relying on unequal snapshots. All ten coordinated variants fail specifically at the independent response/settlement pin assertion (`coordinated-falsifier-verification.json.gz`). Pins and other source artifacts remain unchanged. |
| Targeted plus architecture | `targeted-architecture-verified.log.gz`: **36/36** — nine retention/falsifier cases and 27 architecture checks. No new substrate importer or shared inventory/script entry is required. |
| Type/lint | `tsc-verified.log.gz`, `lint-verified.log.gz`: exit 0. Existing 14 unrelated lint warnings remain. One initial narrowing error and three unnecessary-optional-chain lint errors are retained in preceding logs and corrected locally. |
| Network | `network-guard.log.gz`: all inherited Java/Node descendant deny/loopback controls pass before probes. Every application, test and falsifier command here runs under `deny-network.sb`; no browser-loopback allowance was needed. |
| Format/unchanged product | `format-verified.log.gz`: root formatting exit 0. Correction-only `git diff --check 46aa1908f65a05d48a1f22e239debb0182a7c68e HEAD` passes. `identities.json` verifies all 1,108 prior protected files, installed bytes, build files and 728 prior artifacts, plus unchanged patch/lock/Mission and exact final matrix source pins. The generated Yarn patch context is untouched. |

Each copied-artifact variant changes only copied observation JSON. Its new audit and mutated snapshots are retained with original/mutated hashes and the unchanged completion-pin hash. Temporary audit input trees contain **no DB/WAL/SHM files**, boot no application and are removed only after their result is retained. `source-input-manifest.json.gz` and the complete original source packet make those inputs reconstructible for read-only adjudication. For archived audit reproduction, decompress observation files into a fresh scratch tree, excluding stores, or use the new safety runner's uncompressed outputs before evidence packaging. This is read-only artifact inspection, not an application import route. No original history or verdict was edited. A wrapper exit 0 means all deliberately falsified observations were rejected; it is not a green safety verdict for those mutants.

Final successful response IDs/settlements are in `a4-safety-hcORSYb8/audit.json.gz` and the respective independent pin files. The literal body remains `A4 filler acknowledged.`. For silent and cancellation cases, the canonical and public response IDs coincide; the explicit-error case preserves both separately. Current revision/ordinal/crash controls, public-source/no-invented-user/no-tool-reissue assertions, question data, correlated client results and Stop gates remain present.

## Exact command portfolio

From repository root, `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery`, `O=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/local-recovery-review-KWim2OUc`. Use a fresh output directory when reproducing; do not overwrite these packets.

```sh
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent exec vitest run test/history-retention.test.ts test/architecture/boundaries.test.ts
sandbox-exec -f "$E/deny-network.sb" bash apps/brunch-agent/test/history-retention-diagnostics.sh "$O" recovery
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent lint:tsc
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/brunch-agent lint:eslint
sandbox-exec -f "$E/deny-network.sb" python3 "$O/falsify-audit.py" "$O/a4-safety-fXKlTUFj" "$O/audit-mutants"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn lint:format
```

The original supplied live falsifier command, from `apps/brunch-agent`, was run on fresh directories with `A4_PHASE=create` and `reopen`, and for cancellation additionally `A4_OVERFLOW_CANCEL=1`:

```sh
sandbox-exec -f "$E/deny-network.sb" env A4_OUTPUT_DIRECTORY="$D" A4_OVERFLOW_PROBE=1 A4_PHASE="$PHASE" node --experimental-strip-types --import /tmp/m7-cold-review-WUypHTI7/omit-response-hook.mjs test/history-retention.integration.ts
```

Here `E` must be absolute from that working directory. Each reopened case first seeds its own original store using the identical command without `--import` and with `A4_PHASE=create`. The supplied hook's bytes are retained for reproduction if the reviewer's temporary path is unavailable. The maintained replacement/changed/duplicate/settlement falsifiers use `--import ./test/history-retention-history-fault.ts` with `A4_HISTORY_FAULT=missing|replaced|changed|duplicate|settlement`; the unit wrapper runs exactly this through `NODE_OPTIONS` and the unchanged `runNodeScript` helper.

The safety runner's per-packet `commands.log.gz` records exact expanded commands and all expected/actual exits. Deliberate crash exits remain 137; every unmodified final recovery must exit 0. All JSON/log/runtime observation files are retained losslessly as gzip to avoid formatting captured evidence. `manifest.json` pins compressed and uncompressed bytes. Original stores remain local and ignored, never committed/imported. Supplied prior JAR and native acquisition incidents are unchanged and no new acquisition occurred.

## Return and remaining limits

This is a bounded test/evidence correction, not another runtime fix. It closes the demonstrated completed-response preservation blind spot and makes the review's coordinated omission fail. It does not extend the original runtime repair's claims to legacy inconsistent stores, arbitrary parallel state writers, power loss, universal provider errors, genuine testimony, browser-after-process-restart, A5 why/pane, paid readiness, Step A acceptance or Step B. Prior full-portfolio/native/accounting/browser evidence remains prior evidence with unchanged product/build identities, not a newly rerun portfolio. No shared package script, hermetic inventory, Mission or ledger insertion is requested.
