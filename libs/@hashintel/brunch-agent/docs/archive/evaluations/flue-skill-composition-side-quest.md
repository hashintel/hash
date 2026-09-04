# Flue skill-composition side-quest retirement

The v1–v3 Flue skill-composition side quest compared independent core `elicitation` activation with packaged universal disclosure. Its human-readable adjudications remain at:

- [`../../evidence/evaluations/flue-skill-composition-side-quest-v1/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v1/comparison.md)
- [`../../evidence/evaluations/flue-skill-composition-side-quest-v2/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v2/comparison.md)
- [`../../evidence/evaluations/flue-skill-composition-side-quest-v3/comparison.md`](../../evidence/evaluations/flue-skill-composition-side-quest-v3/comparison.md)

The owner set aside the side quest's Candidate B fallback and directed Mission 4 to implement the independent capability topology. V3 remains bounded evidence that independent activation was unreliable in that instrument and packaged disclosure routed more often on S1; neither topology passed the complete cross-scenario condition. The runner has been removed, no current code consumes individual run payloads, and the future spine cites only the v3 adjudication. Keeping 47 repetitive raw JSON records in every checkout no longer serves a live consumer.

## Raw-run identity and recovery

The complete pre-retirement tree was captured at historical commit
`d9ae5de506a2fc00cf7473c03a217d20f3a9fc63` on PR
[#9468](https://github.com/hashintel/hash/pull/9468). Recovery does not depend on that
intermediate commit: the final tree retains the complete 47-file corpus in
[`flue-skill-composition-side-quest-runs.tar.gz`](flue-skill-composition-side-quest-runs.tar.gz).
The archive's SHA-256 is
`99d5302fb42807b9e9d77d4c432f4b52b77aeea4f7312cd6fb8f104452e3fc2a`.
The ordered path/content ledgers retained beside each comparison verify every extracted file:

| Campaign | Files | Lines | Bytes | Ledger | Ledger SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| v1 | 11 | 29,283 | 3,985,364 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v1/retired-runs.sha256) | `314e1eade7be67fc087e718403d0927fa3b360cf29d5f5ae205686e754224eb5` |
| v2 | 12 | 30,584 | 4,529,190 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v2/retired-runs.sha256) | `200aed778e38c31d858bdafabd49b36579477b580cadace85390d45ce34ad72b` |
| v3 | 24 | 62,392 | 7,968,249 | [`retired-runs.sha256`](../../evidence/evaluations/flue-skill-composition-side-quest-v3/retired-runs.sha256) | `3c4a401dec62eba25498e62ceb6e2a79514d1b8dabb45a1822ca3065e312a6e5` |

Recover and verify a campaign from the repository root:

```shell
CAMPAIGN=flue-skill-composition-side-quest-v3
ROOT=libs/@hashintel/brunch-agent
RECOVERY_DIR=$(mktemp -d)
ARCHIVE=$ROOT/docs/archive/evaluations/flue-skill-composition-side-quest-runs.tar.gz

echo "99d5302fb42807b9e9d77d4c432f4b52b77aeea4f7312cd6fb8f104452e3fc2a  $ARCHIVE" |
  shasum -a 256 -c -
tar -xzf "$ARCHIVE" -C "$RECOVERY_DIR"
(
  cd "$RECOVERY_DIR"
  shasum -a 256 -c "$OLDPWD/$ROOT/docs/evidence/evaluations/$CAMPAIGN/retired-runs.sha256"
)
```

The core unit suite executes the same extraction and verifies all three ledgers from checked-out
files, without fetching a historical ref. The unchanged campaign manifests still describe the
executed campaigns. Their `runs/...` lists and JSON pointers are paths inside the archive, not
omissions from the campaign.

## Retired material

All three `runs/` directories were removed as one coherent retirement. No arbitrary paid or hermetic sample remains in the live tree, because a partial corpus would look complete while failing the campaign manifests. No raw observed artifact was edited. Mission 4 proof-of-life v1/v2 evidence and every other campaign remain untouched.
