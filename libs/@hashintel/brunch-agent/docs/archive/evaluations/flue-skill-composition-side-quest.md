# Flue skill-composition side-quest retirement

The v1–v3 Flue skill-composition side quest compared independent core `elicitation` activation with packaged universal disclosure. Its human-readable adjudications remain at:

- [`../../evidence/evaluations/flue-skill-composition-side-quest-v1/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v1/comparison.md)
- [`../../evidence/evaluations/flue-skill-composition-side-quest-v2/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v2/comparison.md)
- [`../../evidence/evaluations/flue-skill-composition-side-quest-v3/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v3/comparison.md)

The owner set aside the side quest's Candidate B fallback and directed Mission 4 to implement the independent capability topology. V3 remains bounded evidence that independent activation was unreliable in that instrument and packaged disclosure routed more often on S1; neither topology passed the complete cross-scenario condition. The runner has been removed, no current code consumes individual run payloads, and the future spine cites only the v3 adjudication. Keeping 47 repetitive raw JSON records in every checkout no longer serves a live consumer.

## Raw-run identity and recovery

The complete pre-retirement tree is historical commit `d9ae5de506a2fc00cf7473c03a217d20f3a9fc63` on PR [#9468](https://github.com/hashintel/hash/pull/9468). That SHA is an informational locator. The durable identities are the ordered path/content ledgers retained beside each comparison:

| Campaign | Files | Lines | Bytes | Ledger | Ledger SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| v1 | 11 | 29,283 | 3,985,364 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v1/retired-runs.sha256) | `314e1eade7be67fc087e718403d0927fa3b360cf29d5f5ae205686e754224eb5` |
| v2 | 12 | 30,584 | 4,529,190 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v2/retired-runs.sha256) | `200aed778e38c31d858bdafabd49b36579477b580cadace85390d45ce34ad72b` |
| v3 | 24 | 62,392 | 7,968,249 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v3/retired-runs.sha256) | `3c4a401dec62eba25498e62ceb6e2a79514d1b8dabb45a1822ca3065e312a6e5` |

Recover and verify a campaign from the repository root:

```shell
PIN=d9ae5de506a2fc00cf7473c03a217d20f3a9fc63
CAMPAIGN=flue-skill-composition-side-quest-v3
ROOT=libs/@hashintel/brunch-agent
RECOVERY_DIR=$(mktemp -d)

git archive "$PIN" -- "$ROOT/docs/evidence/evaluations/$CAMPAIGN/runs" | tar -x -C "$RECOVERY_DIR"
(
  cd "$RECOVERY_DIR"
  shasum -a 256 -c "$OLDPWD/$ROOT/docs/evidence/evaluations/$CAMPAIGN/retired-runs.sha256"
)
```

The unchanged campaign manifests still describe the executed campaigns. Their `runs/...` lists and JSON pointers are historical paths and resolve at the pinning commit, not in the current working tree. Do not reinterpret a missing live-tree run as a campaign omission.

## Retired material

All three `runs/` directories were removed as one coherent retirement. No arbitrary paid or hermetic sample remains in the live tree, because a partial corpus would look complete while failing the campaign manifests. No raw observed artifact was edited. Mission 4 proof-of-life v1/v2 evidence and every other campaign remain untouched.
