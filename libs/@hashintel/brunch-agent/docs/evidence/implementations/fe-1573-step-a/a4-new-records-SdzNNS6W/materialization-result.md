# Retained-live-store reopen — preliminary Pass; full materialization Partial

Final observation: `a4-replay-TZu8fGk9/browser/retention-{fold,reopen}-result.json`, complete public snapshots and comparisons beside them. The original disposable browser-created store stays at `a4-replay-TZu8fGk9/browser/conversation.db` under this worktree. It is locally retained/ignored, not committed or represented as a portable import authority. No relocation, rebinding, projection import or alternative storage was attempted. The supported same-store route is sufficient for this preliminary check; portability is not a prerequisite.

The unchanged browser entrypoint closed the app and exited. PID **2799** reopened its actual records, compacted them and awaited application shutdown. PID **2807** then reopened the **same path** with the same built app. Before any model request it returned the exact 41-message post-compaction snapshot, including its public conversation/stream identity, record offsets, settlements and failed/conflicting attempts. A normal follow-up then completed on the retained instance, with unchanged revision state and no new tool call. JSON files are equality oracles only; the runtime never receives them as history.

| Identity | Original retained / reopened value |
| --- | --- |
| Local principal header | `82445a77-1e4a-41b7-93b4-774e53dd979f` |
| Caller conversation | `prepared-root-arc:36fa2a4a-cb25-42e9-9553-84a3cc3198c0` |
| Mounted instance path | `ec2e357753cef55cc9a765ebd436d0ad019f26bf8df5ddc3c367aedac27618c9` |
| SDK UID | `inst_01M20YPMM4RAXDSMNSXNGAG0DY` |
| Public conversation | `conv_01M20YPMM4D7YMRD5BZ2DGNVHK` |
| Public stream incarnation | `inc_01M20YPMM234YKAKD4EFS1YWYM` |
| Document incarnation | `36fa2a4a-cb25-42e9-9553-84a3cc3198c0` |

Both retained-store processes assert missing ownership headers → **401**, foreign principal on the original path → **403**, foreign caller conversation → **403**, wrong SDK UID on send → **404**, and exact unchanged history after those refused requests. History acquisition makes **zero provider requests**. Each ordinary follow-up preserves the same UID and public identities. No mutation is reissued; all original tools/results remain equal; the hydrated projection exposes no executable arc input. The current revision is emitted from the actual core state through the plugin signal, not inferred from a historical pointer alone.

**No second live browser after process restart was exercised.** Actual browser mutation, same-key dedup, unchanged canonical document after reload and no reload reapplication are proved by the preceding unmodified browser witness. Post-process reopen proves retained canonical history/state and the public no-pending-mutation projection; it does not establish arbitrary cross-process external-effect exactly-once behavior. The evidence inventory makes this split explicit rather than upgrading hydration into a browser/crash proof.

Authorization is the accepted local header-bound identity check, not a trusted remote human-principal implementation. SQLite is the existing local/test database selection, not deployed Postgres or host-loss durability. Graceful stop/reopen is not crash proof; separate actual process-kill results are in `diagnostics.md`.

**A5 why does not exist yet.** No reopened-why success is claimed. The full materialization probe remains Partial/pending the genuine record set, authorized product lookup, live-document reconciliation and assistant interpretation. Next: repeat this retained-store/authorization contract after native integration, then run final A4 against genuine records through A5. Do not promote saved JSON or DB files into a portable history import contract.
