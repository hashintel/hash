# A5 original-store process restart and compaction proof

## Result and exact scope

**Pass for newly produced synthetic A5 records through three distinct server OS processes and two real threshold compactions.** The final, reviewed packet is `reviewed/`, from `/tmp/m7-a5-retention-reviewed`. The earlier directory named `final/` is the pre-review instrument, not the final claim. No production behavior, runtime patch, dependency, shared browser/history entrypoint, accounting/admission, guidance, Mission or ledger changed.

Assigned worktree: `/Users/lunelson/.herdr/worktrees/hash/m7-a5-durability`; branch: `ln/fe-1573-a5-durability`; exact base: `c41aeb54ca83d3aeb6f6678c9e2d318d120b5e33`. Test/runner/audit commit: **`2b55b7fc1c`**. Independent-review oracle correction: **`c6c3d3fb63`**. The reviewed runner recorded HEAD `2b55b7fc1c` while the correction was in the worktree; its exact file hashes were verified unchanged after committing `c6c3d3fb63`, rather than regenerating the run's pins. This following evidence commit retains the observations and handoff. Nothing pushed.

| Process | Actual observed boundary | Result |
| --- | --- | --- |
| **23722 — create** | Built ChatAgent + actual built website, one ephemeral loopback HTTP listener, native Anthropic SDK preparation/serialization with 13 in-memory synthetic responses, actual local Chrome and its original persistent profile | Product-obtained source ID and candidate/settled spans; three successful revisions; two overlapping relations carried; one actual root-arc mutation; independently verified browser observations/effects; one live model-facing why result; pane/DOM equality and screenshot |
| **24448 — fold** | A new Node OS process loads the same original SQLite store through the built ownership-guarded ChatAgent mount; no browser or listener | Exact initial public history equality before any provider call; actual `brunch_workpiece` and `brunch_why` before folding; 43 faux-provider calls including two real runtime summaries; threshold folds **126 → 3** and **29 → 3** context messages; actual history-backed product query after the first fold; second fold removes that query's answers before final reopen |
| **24452 — reopen** | A third Node OS process loads the same original store after compaction | Exact public history equality with fold-process exit; five faux-provider calls; actual current-workpiece query, as-of why, old-observation-ID as-of why and unknown-observation refusal; original source entry and prior query results absent from the first model request |

The original store is **`/tmp/m7-a5-retention-reviewed/original/conversation.db`** throughout. The runner starts each phase with a separate, awaited Node command, not a worker thread, runtime reload or invented PID label. Each phase records actual `process.pid`, parent PID, executable, Node version, argv, working directory, start-time observation and store path. Built `application.fetch` serves the same product mount in the two non-listening replacement processes. No conversation JSON, tool outcome, DB or browser profile is restored into application state. The original Chrome profile remains at `.../original/chrome-profile`; it is not copied into this packet or reused to imply a fresh observation after restart.

**61 synthetic model invocations, zero paid calls:** 13 native-SDK seed responses and 48 direct-faux replacement-process responses, including two summarizer calls. The replacement lane uses the existing Flue faux-provider route so token estimates can trigger the actual threshold policy; it does not claim native SDK/provider serialization for those 48 calls. The complete instrument is synthetic. There are **10 actual model-facing why results**: seven partially-supported answers and three unknown-observation refusals. A valid linkage remains partial, not semantic support or utility acceptance.

## What the actual tools prove

The source ID is `entry_direct_c3ViX2lrXzlkOTA4YTc1MGNmODRkYjUwNWI1MGU1Zjc3ZTU0ZTE1`. It originates in a TEST-authored true-user submission, discovered by `brunch_workpiece`, not by private successful-path lookup. The product returns the immutable UTF-16 span **[28, 100)** for “When final inspection starts, reserve one available crew until sign-off.” Candidate lookup creates no revision; construction consumes the later settled lookup.

`retention-revision-1` declares two relations at that same span: elicited support referencing the authorized user ID, and a separately declared formalism constraint with no invented user source. `retention-revision-2` appends unrelated context with evidence omitted from its raw input. Its durable result retains **both** validated overlapping relations, in order, and advances ordinal to 2. This carried revision governs the actual `retention-arc` browser mutation. Its SHA-256 is **`56d557dfa86644eb7dd373ac7ce35326aeee334031c1e08782f08f81ad02e0dc`**. Revision 3 appends later unrelated context, carries both relations again, and becomes the sole current state; it never retroactively supplies the mutation's basis.

The reopened answers retain exact current state, governing revision/hash/superseded status, span/text, relation kinds/source IDs/source text, operation-level rationale, recorded change/effects and bound document/incarnation. The governing citation is resolved from the successful historical revision **before** the actual mutation. Both the model-facing tool results and the actual subsequent model context containing those structured results are asserted. Direct resolver calls are not this test's primary oracle.

All six protected completed calls remain exact and unique: three revisions, two original browser reads and one mutation. Public message identities/content and completed settlements remain unchanged; browser result deliveries remain equal; hydration never offers the completed arc as pending. Replacement processes issue only new workpiece/why queries and scripted prose, with exact accounting for newly submitted user bodies; no recovery-invented user input or completed browser/revision reissue is admitted.

### Compaction and current-state precision

Both folds are actual runtime `reason: threshold` compactions with `keepRecentTokens=256`, model context window 64,000 and maximum output 16,000. No private compaction API or overflow substitute is used. The deliberately lossy summary omits quotations, source IDs, evidence relations and browser records. After the first fold, the product successfully retrieves history-backed answers. Those answers would legitimately put source material back into model context, so a **second real threshold fold** removes them before the third process queries.

**The precise absence claim is original true-user source entry and prior retrieved `brunch_workpiece`/`brunch_why` tool answers, not empty current state.** At the first folded query request, the test rejects the original source-message literal, every prior query call ID, every prior workpiece/why tool result, and the original mutation/revision calls. The core's intentionally retained authoritative current revision still appears in the normal `brunch.construction-context` signal, including its passage and evidence pointers. That is the one current-state authority, not retained testimony or a cached governing explanation. The harness never filters that signal to manufacture an empty context.

The current read tool's **latest-20 source discovery window** omits the early source after filler: 11 earlier eligible sources omitted at the post-fold query and 17 at third-process query. That is an explicitly reported window limitation. The original canonical source remains unchanged in public history and appears with its exact ID/content in the actual why answer. It is **not lost canonical history**, and this proof does not add general historical source browsing.

### Freshness and refusals

Only the actual Chrome seed earns `live-observed`, correlated to `retention-live-read`. In replacement processes, a query without an observation ID returns `as-of`; citing that old read also returns `as-of`, including `observationScope: as-of`. There is **no fresh-browser live query after server restart**, browser reconnect witness, intervening-history continuity claim or serialization-equivalence extension. Unknown observation IDs explicitly refuse and supply no governing explanation.

Other-principal and other-conversation headers on both the original history URL and actual submission route return 403 in each replacement process. The forbidden request asks for workpiece/why, but authorization refuses it before the model or tool can run; public history and provider count remain unchanged. This is an ownership refusal on the bound route, not cross-conversation browsing breadth.

## Independent completion and oracle review

The test adopts the strengthened A4 completion principle rather than taking an after-loss baseline. At each intended simple filler response's real agent-purpose `turn` event, **after canonical assistant completion append and before compaction**, it opens the original SQLite store read-only and retains correlated start/text/completion records. It independently pins **31 completed responses**. Every response already completed at a checkpoint must retain its exact ID, content, uniqueness and completed settlement: the immediate first-fold snapshot checks the pins then present; final refold and third-process snapshots check all 31. Canonical settlement records are independently checked as well. Nothing writes to SQLite through this instrumentation.

The companion Python audit is read-only observation adjudication, not an application importer or replacement main oracle. It independently checks canonical completion pins, sources, validated carried relations, recorded/governing outputs, process identities, threshold events, source-window and freshness claims. Its **10/10 in-memory copied-observation falsifiers** must reject for the intended reason: coordinated source omission, source change, overlapping relation loss, completed-response omission/duplication, completed-settlement omission, same PID, false live label, source entry retained in query context, and a source-redacted cached why answer retained in context. No original observation/store is changed by these controls.

A read-only independent reviewer found a real deficiency in the first instrument: it excluded exact source text and original mutation/revision calls but did not explicitly exclude a **source-redacted prior why result**. We reproduced that deficiency against commit `2b55b7fc1c`: the old audit accepted an in-memory request-context mutation containing such an answer. `logs/m7-a5-retention-review-blindspot.json.gz` retains the injected message, old audit hash and erroneous acceptance; this was an oracle gap, not observed product data loss.

Commit `c6c3d3fb63` adds prior-query-ID and tool-result exclusion plus the corresponding falsifier, without removing current state or changing production. The entire three-process/browser/two-fold path was rerun on a **new original store** (`reviewed/`). Independent re-review found the blocker discharged: the first reopened request contains summary plus current state, but no prior workpiece/why result; the new falsifier is rejected. The reviewer explicitly retained the current-state qualification and synthetic/root-arc/non-power-loss/provider/utility limits. See `review.md` for the exact scoped findings.

## Verification and retained failures

| Check | Result |
| --- | --- |
| Guarded immutable offline install | Pass, scripts and package-manager network disabled; no tracked dependency/lockfile change |
| Java/Node descendant network controls | Pass before commands and again in each frozen runner; builds/in-process phases deny all IP; only actual Chrome/listener phase permits loopback |
| Serial selected app/website build | **40/40 tasks**, 26 cached, with `VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat`; no generic forced portfolio claimed |
| New reviewed browser/process/compaction runner | **3/3 phases pass**, exact instrument unchanged across processes; 10/10 audit falsifiers reject |
| Focused app regressions | **54/54** across reconciliation/root-arc, revision nontermination, admission/Voice/active Stop, single-browser proposal, native schema carriage and existing retention/completion-fault tests |
| Focused core | **39/39** evidence conservation, revision settlement, locators and question marker |
| Focused website | **24/24** recorder, workpiece/why pane and panel transport |
| App typecheck/lint | Pass on reviewed source; 18 existing warnings, zero errors |
| Architecture inventory | **26 pass / 1 pending-parent failure**: exactly the two new TS substrate importers need reviewed insertion; no other architecture failure. Worker did not self-admit them |
| Shell/Python syntax and compressed-evidence audit | Pass; audit reads gzip directly without any application import |
| Source/build/protected boundaries | **1,377** runner-pinned files unchanged through all phases and after test commits; tracked diff from exact base contains only the four new test/runner/audit files before evidence |

Retained development attempts are not silently reclassified as final proof. `development-first/` and its logs preserve a test-observation `structuredClone` failure on executable provider-context functions; the observation copier changed to the existing JSON-projection approach, never state restoration. `development-second/` preserves a third-process assertion failure because a preceding successful why legitimately reintroduced source text; the second real fold was added, not the absence assertion weakened. `development-third/` is a passing pre-freeze precursor. `final/` is the first pinned, nine-falsifier packet before the independent cached-answer correction. All original stores/profile directories remain at their original `/tmp/m7-a5-retention-*` paths. No historical A5/A4 evidence was edited.

The actual final screenshot `reviewed/original/browser-why.png` was inspected: the existing editor shows its actual added input arc, current revision 3 and structured live why pane. DOM equals the actual tool output. It is a synthetic mechanical witness, not a human usability or utility adjudication.

### Local artifact disclosure

The missing OpenAPI Generator 6.6.0 JAR was regular-copied only after the guarded immutable link, from the specifically authorized alpha installation into this ignored installation. Source and destination both verify **27,103,489 bytes**, SHA-256 **`9718ff7844e89462c75dcd9b20a35136f6db257bfe1b874db1e3002e99de4609`**, distinct inodes and no symlink. `local-artifact-reuse.json` retains those checks. This reuses the previously acquired, incident-disclosed local artifact; it is not a claim that its original acquisition was offline. No other artifact acquisition, download, unguarded retry, paid reservation or external provider request occurred.

## Reproduce and parent insertion requests

From repository root, after the existing app/website are built under `native-local-delivery/deny-network.sb` with `VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat`:

```sh
bash apps/brunch-agent/test/reopened-why-retention.sh /tmp/a5-new-original-proof
```

The path must not exist. The runner verifies the process-tree guard, freezes source/build/runtime identities, uses loopback allowance only for actual creation, runs fold and reopen under total IP denial, then audits observations and checks the instrument stayed unchanged. It never removes or restores the original store. `reviewed/commands.log.gz` records the exact expanded phase commands. Existing targeted checks and logs are retained in `logs/`.

For archived read-only adjudication, without any DB/profile or application boot:

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
sandbox-exec -f "$E/deny-network.sb" python3 apps/brunch-agent/test/reopened-why-retention-audit.py libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a5-process-retention/reviewed/original
```

**Parent-owned insertion, not performed here:**

1. Add `"test:reopened-why-retention": "bash test/reopened-why-retention.sh"` to `apps/brunch-agent/package.json` if this focused opt-in runner is adopted. It requires the built website/app; it is not an ordinary network-free browserless unit test.
2. Review/admit `apps/brunch-agent/test/reopened-why-retention.integration.ts` in `test/architecture/boundaries.integration.ts`: built ownership-guarded ChatAgent, synthetic providers only, original-store separate-process queries/threshold folding, read-only canonical completion pins, no import or paid request; runner enforces process-tree denial.
3. Review/admit `apps/brunch-agent/test/reopened-why-retention-browser.ts` in that same inventory: one ephemeral loopback-only test listener serving the existing built product mount/website; actual isolated Chrome/profile and native in-memory SDK responses; no fabricated positive result, external egress, restored browser JSON or new production service.

Then rerun the architecture gate. No MISSION change, shared script edit or package insertion is included in this worker's commits.

## Remaining limits

This earns the current **synthetic root-arc A5 source/validated-evidence/why contract** on an original local store across normal server process exit/restart and real threshold compaction. It does not establish crash/power-loss durability, legacy-store repair, arbitrary writers, relocation, remote persistence, fresh-browser observation after restart, genuine Vestera testimony, source relevance, template quality, broader construction/classes/effects, real-provider fidelity, semantic usefulness, final A4 or Step A/Step B acceptance. The operation-level basis, revision-local passage policy, exact mutation-base rule, serialization-equivalence limit, marker/nontermination, causal client results, native validation, single-browser admission and narrowed Voice/Stop contracts are unchanged. Production fixes are not requested because no product defect was found in this chunk.

`artifact-manifest.json` pins losslessly retained JSON/log/image bytes; `reviewed/instrument.json.gz` pins the actual source/build/runtime instrument; `protected-boundaries.json` relates that instrument to the exact base and test commits. DB/WAL/SHM and Chrome profile bytes are deliberately absent from this portable packet. Saved observations are equality oracles and identity pointers, never import authority.
