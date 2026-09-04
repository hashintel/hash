# Mission 4 final Graphite restack provenance

Date: 2026-09-03

Status: **verified after `gt sync && gt restack`; content manifests are authoritative and commit SHAs are historical provenance only.**

## Restack result

Graphite synchronized `ln/fe-1563-redesign-runbook-workpiece` and restacked it onto its updated parent `ln/fe-1525-headless-runbook-pn` without a conflict on this branch. Graphite separately reported unrelated branches that could not be restacked cleanly or were checked out in other worktrees; those branches are outside Mission 4 and were not modified here.

The restack rewrote commit identities but not instrument or run-artifact content. Durable evidence identity comes from the manifest digest and its ordered path/content hashes:

- v1 manifest SHA-256: `ec6399fd19914b15c9fe5e43d268b56f3e4816e128b02f3e694f7a807e7d1987`;
- v2 manifest SHA-256: `91bc02e59dad3ed2d7791e3e1b095435c18fca8c78b4302e9e3bb43872e727a9`.

The `instrumentCommit` and `executionHead` values retained in accepted manifests and `run.json` files state where those bytes lived when execution occurred. They are useful historical provenance, not evidence primary keys, current-ancestry requirements, or promises that Git will retain those objects forever. The records remain unchanged because they accurately describe execution time, not because current consumers must resolve those SHAs.

`git patch-id --stable` and complete manifest verification confirmed that the first post-sync chain was patch-equivalent and that both frozen instrument manifests still matched all 33 and 35 current worktree files respectively. A later `gt sync` rewrote the chain again when its parent advanced, demonstrating why a maintained old-to-new SHA map would be churn rather than durable evidence. No such map is retained. Every per-run manifest remains valid.

## Future campaign rule

Future protocols should separate `instrumentId` from `provenanceAtExecution`. `instrumentId` is the manifest SHA-256 plus its path/content hash set. `provenanceAtExecution` may record source and execution commits as informational locators. A rebase or Graphite restack requires content verification—not refreezing, rewriting historical runs, preserving old commit reachability, or maintaining a current-equivalent SHA table. If permanent Git-object retention is genuinely required, earn and name an explicit durable ref or archived bundle rather than relying on reflogs or PR history.

## Voice-stack landscape after synchronization

The Mission 4 stack and current Voice stack remain parallel. Their observed merge base is `807fc0481ae3eed147f911d5d4a49ef9031a8afe`; neither is the other's parent. The Voice stack begins from `kostandin/fe-1570-voice-optimized-brunch-responses` (PR #9496, base `main`), continues through `kah-6763-temporary-brunch-ask` (PR #9507), and ends at `kah-6800-improve-petrinaut-voice-turn-taking-and-answer-provenance` (PR #9512). Coordination therefore requires an explicit reconciliation branch or parent choice after the involved PR owners choose integration order; ordinary `gt restack` on Mission 4 does not combine them.

The detailed file/ownership collision map remains in [`mission-4-voice-integration-handoff.md`](../implementations/mission-4-voice-integration-handoff.md). Its main constraint survives synchronization: port Voice behavior into Mission 4's package-composed agent and relocated conversation modules rather than restoring the Voice branch's older app-local stub.
