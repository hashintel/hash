# Land the current Mission 7 checkpoint

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Disposition

**All current subagent work is accounted for and landed or explicitly retained.** No active implementation lane remains. This is a clean local checkpoint for Lu's reassessment, not Step A acceptance, a release, a push, or authority to start another campaign. The [lane audit](lane-dispositions.md), [health assessment](mission-health.md) and current `MISSION.md` distinguish implementation footing from the unproved genuine/utility outcome.

Departure ALPHA: `3a597f5b15`. Landing hold: `aa57208352`. Final product/test source: **`b522c0d73b`**. Subsequent landing documentation/evidence does not change that tested source. The inherited sibling/browser/provider instrument is not reactivated or promoted to a new paid freeze by these changes.

## Integration map

| Worker commit | ALPHA commit | Disposition |
| --- | --- | --- |
| `788a9dcc1e` | `a7c51d1511` | Parent-owned typed witness script and native/substrate inventory. |
| `3b98cb2872` | `8eff9c76f3` | Typed-state/schema/default/effect/why joins and actual browser witness. |
| `1031d34c1e` | `ed5bb700fb` | Original checkpoint, class limits, failed and passing evidence retained. |
| `8cf9690a40` | `0b77d16cbe` | Parent-owned captured-history aggregate regression inventory. |
| `87beb4c654` | `26412dae87` | Typed aggregate refusal and mounted/leaf controls. |
| `70bbe190e0` | `00d55ae24c` | Typed correction's original reds, new proof and scoped handoff. |
| Parent shared-root closure | `b522c0d73b` | Existing transition aggregates use the same refusal guard; actual root queries and immutable historical accounting fixture. |

All other current-round source/evidence was already integrated. Direct inspection confirmed the apparent duplicate inventory patch in the old real-provider branch was already present with identical semantics; old rebased ancestor commits were not replayed. The provider worker's resumed final handoff confirms the previously archived r2 outcome; it produced no additional provider call or implementation. See [its final handoff](m7-provider-execution-final-handoff.md) and [typed worker's final handoff](m7-typed-state-final-handoff.md).

## Review closure

The original independent typed review found a real aggregate attribution error despite a passing leaf/cell witness. Its report, failing script/results/exit and actual reachable history are retained losslessly under `typed-original-review/`, bound by `review-artifact-manifest.json`. The worker added conservative refusal, not a latest-child shortcut or a composition engine. Parent checked **56 evidence files (including decompressed hashes), 330 source/build pins and 11,354 unchanged runtime pins** against its frozen worktree before importing the final packet.

Parent review then reproduced the same defect on existing transition `inputArcs` and `outputArcs`: current nonempty arrays were assigned to `creation-step`, whose actual request created them empty. The actual retained Chrome history contains the later separate arc additions. The scalar predicate still correctly selects `creation-pause`. The [shared-boundary decision](shared-aggregate-decision.md) records why the typed-only allowlist was insufficient. The minimum fix removes that restriction for existing node kinds; it changes no mounting, canonical action, field schema, raw record or ledger semantics. Both aggregate classes now refuse, with origin and history retained, while their scalar/leaf controls stay correct.

This shared-root follow-up was authored and reviewed by the integration owner, with fresh product-function and actual mounted Chrome controls; it was not granted a new independent cold-review verdict. The prior independent review establishes the typed defect and reachable-input evidence. The optional independent health-review launch failed before receiving its task; it contributes no review credit.

## Fresh combined verification

All executions were unpaid. Existing process-tree denial passed before builds/probes; only actual Chrome/listener tests used the loopback profile. No install, download, provider/DNS/auth probe or shared-ledger write occurred during landing.

| Check | Result |
| --- | --- |
| Eight-package forced serial build/unit/type/lint | **66/66 uncached tasks; 3,282 tests**. Includes full app server/client and canonical core. |
| Focused aggregate/accounting/reconciliation | **40/40**; app lint zero errors. Existing warning backlog remains, not silently fixed. |
| Actual typed Chrome on combined product | **83 synthetic requests, 64 outside-counted callbacks, 12 records**: ten applied, one no-op, one stale. |
| Independent full raw typed effect audit | **37 created, five updated, zero deleted, seven derived**; complete pre/post reconstruction, no extra mutation from added queries. |
| Original independent typed discriminator on ALPHA | Passes exact aggregate, row and type refusal assertions; full explicit/derived leaf outputs and origin/history/reconciliation controls remain equal. |
| Parent node-aggregate discriminator | Original typed-only guard **exit1**; shared guard **exit0**. Current arc arrays refuse; scalar `lambdaCode` retains the actual correction. |
| Actual root Chrome with new aggregate controls | **52 synthetic requests, 38 outside-counted callbacks**; seven applied records plus existing no-op/stale controls. New arc-array and changed-entity refusals retain origins. Existing capacity/code correction, reopen and safety controls pass. |
| Legacy actual A5 Chrome | Pass; declared/absent/temporal cohorts retain **14 why results**, same original-store runtime/browser reopening and controls. Not a new distinct-process proof. |
| Built accounting | **13 outcomes**, six synthetic dispatches; no actual-ledger side effects. |
| Raw terminal/cache attestation | **25 controls, 34 synthetic HTTPS dispatches, zero paid calls**. |
| Source/patch hygiene | `git diff --check`; exact literal-path staging. No conflict, reset, rebase or push. |

The portfolio first passed 64/66 tasks. Parent's new test violated conditional-assertion lint and was rewritten to unconditional assertions. Separately, the old historical-five-call compatibility test read the mutable live ledger: after r2, its disposable copy correctly refused the sixth unknown request. The fix freezes its original five-complete-call premise from `f2b9bfd040:.../usage-ledger.json`, rather than clearing the real unknown call or changing production accounting. Exact fixture SHA-256: `3bfb462fec533bed82205cc396feacbfa8c1ccc444548f122f77e02271617840`. The original failed portfolio and subsequent green run are retained. Existing unresolved-accounting refusal tests still pass.

The ordinary portfolio build was followed by the documented website build configuration `VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat` for local browser witnessing. No source changes accompanied that configuration. Test screenshots were inspected: the labelled synthetic net, current TEST workpiece and actual structured response are visible; the overlay/panel presentation is still rough and earns no polished interaction or utility claim.

## Exact commands

From ALPHA repository root, `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery`, with a fresh output root `O`:

```sh
node "$E/verify-network-guard.mjs"
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/petrinaut-core --filter=@hashintel/petrinaut --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --continue=always --force --concurrency=1
sandbox-exec -f "$E/deny-network.sb" env VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 yarn workspace @apps/petrinaut-website build
# In apps/brunch-agent, E resolves to the absolute profile directory:
sandbox-exec -f "$E/loopback-only.sb" env M7_TYPED_STATE_OUTPUT="$O/typed-browser" node --experimental-strip-types test/typed-state.integration.ts
sandbox-exec -f "$E/loopback-only.sb" env M7_ROOT_CREATION_OUTPUT="$O/root-browser" node --experimental-strip-types test/root-creation.integration.ts
sandbox-exec -f "$E/loopback-only.sb" env M7_A5=1 M7_BROWSER_OUTPUT="$O/legacy-a5" node --experimental-strip-types test/transition-records.integration.ts
sandbox-exec -f "$E/deny-network.sb" node --experimental-strip-types test/provider-accounting.integration.ts
sandbox-exec -f "$E/deny-network.sb" node --experimental-strip-types test/real-provider-a5-terminal.integration.ts
```

Parent output root: `/tmp/m7-landing-20260909T055346Z/`. The original root discriminator and green variant are retained with exact commands in their scripts. The supplied typed audit and corrected captured-history discriminator were explicitly invoked from repository root. Selected raw logs, complete public histories/records/why results, summaries and screenshots are losslessly archived and hash-bound in `artifact-manifest.json`; original full local outputs/stores remain in place. These are diagnostic/equality artifacts, never state-import authority. This landing does not rerun or repin the entire historical crash/process/carry campaign: its unchanged contracts retain their existing bounded evidence.

## Accounting, resources and remaining limits

Shared-ledger hashes remain exact throughout landing:

- `usage-ledger.json`: `76f340dc803b78d9658f35f93ffcf971beffcc39fd045b8fb1c94db2386c3031`
- `attempt-ledger.md`: `b86a166546dd2afa5652dd70cae2d87e78b737018150e65203d72824aa49cee4`

R2 remains blocked with one unknown request and US$7 held; final worker reporting is not a second invocation or a settlement. The parent answered typed inventory ownership, received both final handoffs, and saved **34 recursive registry/status/result/transcript records** at `~/.pi/agent/session-artifacts/01a08002-25a3-7436-bdca-5cd981ff9560/landing-final-statuses-20260909T062150Z/` before closing the two last relevant panes. Historical answered questions remain in registry records; canonical status showed both children settled, not blocked. Worktrees and raw evidence were not deleted.

Remaining root classes and field breadth stay in the original class matrix, amended by this landing's aggregate-refusal limit. Genuine Vestera, real-model full-instrument tool use, behavior, semantic correspondence, cadence/basis, useful ordinary/per-class explanation coverage and Lu's gate remain unearned. Safe aggregate refusal is not useful support. The separate documentation side quest remains untouched. Return the health assessment and stop; do not convert a clean checkpoint into mission acceptance or automatic dispatch.
