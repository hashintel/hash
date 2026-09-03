# Mission 4 final Graphite restack provenance

Date: 2026-09-03

Status: **verified after `gt sync && gt restack`; content manifests are authoritative and commit SHAs are historical provenance only.**

## Restack result

`gt sync && gt restack` updated `ln/fe-1563-redesign-runbook-workpiece` onto parent `ln/fe-1525-headless-runbook-pn` at `d8c17c37fae80c57d3b22b748a94ab39e96e18ee`. Mission 4 restacked without conflict. Graphite separately warned that `ln/h-6363-ingest-route`, `zzz/bravo`, `zzz/charlie`, and `zzz/delta` could not be restacked cleanly; those branches are outside this mission and were not modified here.

The restack rewrote commit identities but not instrument or run-artifact content. Durable evidence identity comes from the manifest digest and its ordered path/content hashes: v1 manifest SHA-256 `ec6399fd19914b15c9fe5e43d268b56f3e4816e128b02f3e694f7a807e7d1987`; v2 manifest SHA-256 `91bc02e59dad3ed2d7791e3e1b095435c18fca8c78b4302e9e3bb43872e727a9`. The `instrumentCommit` and `executionHead` values retained in accepted manifests and `run.json` files state where those bytes lived when execution occurred. They are useful provenance, not evidence primary keys, current-ancestry requirements, or promises that Git will retain those objects forever.

The historical records remain unchanged because they accurately describe execution time, not because current consumers must resolve those SHAs. The following patch-equivalent map is an optional navigation aid after this restack:

| Historical accepted commit | Current-ancestry patch-equivalent | Role |
| --- | --- | --- |
| `ce2fbde9d96faaaf52ecf532e1071d3d9e952f1a` | `680fb33014086d36a129cfe3b4c7c13e713d6de6` | v1 instrument |
| `cc9a68497da47ca5ee73f9e7b4273ca7961893a1` | `11f421c4453cefcfafd61787facb3fe4245d358e` | v1 manifest |
| `297161ac0d3569b440062b519225e5417e6d4924` | `0a9675b0b38063449b3cded3a137de5025d62ddb` | v1 authorization |
| `95954b494308fbba384cc4ce169a813916f164f9` | `70040ae4bd85ecd0f5a116e79282eb17a1e22ee3` | v2 instrument |
| `d9ca2fe1498f6484746b2abaaf18973e7abcbeaa` | `6ff5da0bad088b5617c603948949ad2d9e9cd43d` | v2 manifest |
| `4841bdab59e29fba59f920ae9e88bff29baa785b` | `25a0a33055fa0f61e6029337d27d913a4926aeac` | v2 authorization |
| `e42a53bcf9f97702d1e1cc6cf3fc59ecd60a6369` | `1d3beb7644f987e0a8c895c5f2c2514ca3e429a3` | v2 result and accepted implementation/evidence head |
| `bdaf8c8f04088d40418d847e16cbcad74dd35df3` | `700f05d39189feffdacdb880b695c10bda0f50df` | closure and Voice handoff before this provenance amendment |

`git patch-id --stable` matched for every pair. Both frozen instrument manifests still match all 33 and 35 current worktree files respectively, and every retained per-run manifest remains valid. Consumers may discard this map once it stops helping navigation; they must continue to verify content against the manifest hashes.

## Future campaign rule

Future protocols should separate `instrumentId` from `provenanceAtExecution`. `instrumentId` is the manifest SHA-256 plus its path/content hash set. `provenanceAtExecution` may record source and execution commits as informational locators. A restack requires content verification and, optionally, a navigation map—not refreezing, rewriting historical runs, or preserving old commit reachability. If permanent Git-object retention is genuinely required, earn and name an explicit durable tag or archived bundle rather than relying on reflogs or PR history.

## Voice-stack landscape after synchronization

The Mission 4 stack and current Voice stack remain parallel. Their merge base is `807fc0481ae3eed147f911d5d4a49ef9031a8afe`; neither is the other's parent. The Voice stack begins from `kostandin/fe-1570-voice-optimized-brunch-responses` (PR #9496, base `main`), continues through `kah-6763-temporary-brunch-ask` (PR #9507), and ends at `kah-6800-improve-petrinaut-voice-turn-taking-and-answer-provenance` (PR #9512). Coordination therefore requires an explicit reconciliation branch or restacked parent choice after the involved PR owners choose integration order; ordinary `gt restack` on Mission 4 does not combine them.

The detailed file/ownership collision map remains in [`mission-4-voice-integration-handoff.md`](../implementations/mission-4-voice-integration-handoff.md). Its main constraint survives synchronization: port Voice behavior into Mission 4's package-composed agent and relocated conversation modules rather than restoring the Voice branch's older app-local stub.
