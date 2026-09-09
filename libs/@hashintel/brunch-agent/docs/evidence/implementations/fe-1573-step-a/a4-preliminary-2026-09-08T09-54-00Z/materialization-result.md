# A4 preliminary retention, materialization and reopen

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Verdict and selected branch

**Pass — genuine retained-live-store history retrieval and continuation, under the local header authorization contract. Relocation unsupported/not attempted; final authorized product why remains pending.** After graceful shutdown, a fresh process loaded the same production artifact and SQLite store, reauthorized the caller through the mounted route, returned the exact public history, and admitted a normal follow-up against the original instance UID. It did not import a diagnostic snapshot or replay prepared messages to manufacture the original conversation.

This selects the mission's retained-live-store alternative. No relocation route was found in the installed public API/documentation, so no copy/import experiment was presented as supported relocation. This is not a terminal no-reopen result. No document-incarnation or final product-why claim follows.

## Observed identities and store ownership

Primary run: `threshold-repeat/`, test commit `8493526924f43bcb3f29aea90aa306a2b74c2c28`. Earlier equivalent run: `threshold/`. Each pair used sequential child processes, never concurrent owners.

| Boundary | Original | Reopened |
| --- | --- | --- |
| Runtime process | PID `12870` | PID `13169` |
| Principal header | `a4-principal-threshold-repeat` | Same, resupplied to every request |
| Panel conversation header | `a4-history-threshold-repeat` | Same |
| Mounted instance ID | `37af753c164f3092164f068119fecefe44899842c37281da7bdcd2433acce7b5` | Same |
| Stable agent identity | `brunch-chat-agent` | Same built production registration |
| SDK instance UID | `inst_01M20795TSKB14QCXG9D09YAXG` | Same, enforced on follow-up send |
| Public conversation ID | `conv_01M20795TR2J7N7SW20WZGVZ4Q` | Same |
| Public stream incarnation | `inc_01M20795TQ4QB0HQTDZTZC7C9K` | Same |
| Store | Absolute `threshold-repeat/conversation.db` path recorded in `identity.json` | Same path, production `db.ts` local SQLite selection |
| Document/incarnation binding | Not exposed or supplied in this probe | No proof invented |

`identity.json` and `reopen-result.json` preserve the exact path, headers' values, receipts and identities. Instance UID (`inst_…`), public conversation ID (`conv_…`), stream incarnation (`inc_…`) and caller's panel conversation ID are different things; none is a document-incarnation ID. These values must not be collapsed into a single generic “conversation id.”

The file-backed SQLite route is selected by `BRUNCH_DEV_DB_PATH` before built application loading, with `NODE_ENV=test`. This uses the production mount and application composition but deliberately not its deployed `NODE_ENV=production` Postgres configuration. The latter rejects local DB overrides. No Postgres, host-loss recovery, crash recovery, multi-owner failover, retention duration or remote deployment was tested.

## Executed assertions

- The create phase refuses an already-existing DB before boot; the first `history()` is 404; first `send({ uid: null })` creates through the actual mounted route. All user and tool records originate through this runtime.
- All seven original submissions settle before `application.stop()`. The process exits before the reopen process starts. `create-shutdown.json` and `reopen-shutdown.json` record awaited shutdown completion.
- Reopen reads canonical history through `client.history()`. Deep equality against the original diagnostic snapshot covers the complete 14-message snapshot, IDs, roles, purposes, parts, settlements, offset and stream incarnation. The saved JSON is only the comparison oracle; it is never loaded into the runtime/store.
- Reopen history acquisition generates **zero provider calls**. It does not reapply tools or run an assistant turn merely to reconstruct history.
- Both processes observe missing headers → 401, mismatched principal on the original instance → 403, mismatched panel conversation on the original instance → 403, and correctly bound but nonexistent conversation → 404.
- Sending with a wrong SDK instance UID returns 404 and leaves the public snapshot unchanged.
- A later ordinary user send uses the original `uid`; it returns that same UID, settles normally, and retains the same public conversation and stream incarnation. This follow-up has a controlled assistant acknowledgement and no tools. It is **not a why operation**.

Headers prove only the app's current local ownership check: `ownsFlueInstance()` hashes the caller-provided principal/conversation pair and compares it to the path. This is not authenticated human identity or a remote security boundary; a trusted principal source remains necessary outside the accepted local scope. The UID conditional is accident prevention, not authorization. The mount guard must still run on every history or assistant-operation request.

## Supported facilities inspected — source findings, not behavioral passes

Installed Flue/SDK version: 2.0.3. Primary local documents and implementations:

- `@flue/runtime/docs/guide/database.md`: explicit `db.ts`, file-backed SQLite, append-only canonical conversations, persisted state, one live owner; `sqlite(path)` survives same-host process restarts.
- `docs/guide/durability.md` and `docs/reference/agent-api.md`: graceful stop drains/disconnects; recovery uses durable records; `createAgentRouter()` exposes send, stream/history, abort and attachment download, not import/relocate.
- `docs/reference/data-persistence-api.md`: adapter `connect/migrate/close`, submission store, append-only stream store and attachment store. Fold checkpoints are caches over the canonical stream, not independent authorities. Low-level append/read capabilities do not constitute a supported conversation export/import workflow.
- `@flue/sdk/docs/sdk/create-flue-client.md`, `sdk/flue-client.md` and `dist/index.d.mts`: client URL/header/transport configuration; public `send/read/wait/abort/history/observe/attachmentUrl` surface; no canonical import/relocation operation. The actual declarations include optional `incarnation`, which the older documentation's snapshot snippet omits.
- App `src/app.ts`, `conversation/identity.ts`, `http/ownership.ts`, `database-config.ts`, `db-path.ts`, `db.ts` and existing built-application loader: actual mount, identity policy, local-vs-production database selection and stop seam.

**No supported per-conversation export/relocation/rebinding route was identified.** Arbitrary SQLite file copying, feeding a public `history.json` into canonical append APIs, and restoring a prepared fixture were not attempted. A database vendor's backup capability may preserve an entire store, but no such route or identity rebinding is proved here. A5 can consume retained storage now; portability is an owner/upstream question, not a reason to invent a parallel store.

The disposable DB files remain locally under this evidence directory and are git-ignored, like A1's store. Committed JSON is diagnostic evidence, not a portable canonical backup. A new worktree must generate its own conversation by running the test, or obtain an explicitly approved canonical-store access/copy procedure; it must not reconstruct one from these projections.

## Required later gate

The final `apps/brunch-agent/test/reopened-why.integration.ts` must reopen a genuine conversation containing A2 settled revisions and A3 mutation/transition records, reauthorize its principal/conversation/document binding, run A5's actual model-facing lookup/assistant operation, and verify interpretation/refusal against current document reconciliation. Neither this history getter nor the controlled acknowledgement substitutes for that operation. No edit to that integration test was made here.

Preserve Mission 6b's accepted limits: snapshot hydration does not establish direct spoken-user origin; post-settlement locally withheld browser work may reopen as pending; no comparative latency claim exists. These tests add no Voice metadata, withholding marker, rollback or speech behavior.
