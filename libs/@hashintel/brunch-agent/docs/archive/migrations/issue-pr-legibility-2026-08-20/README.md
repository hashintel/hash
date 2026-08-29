# Issue and PR legibility migration package

This package freezes the 20 August 2026 source records and proposed legibility edits for the
`brunch-agent` Linear project and its `brunch-lite` pull requests. Preparing and committing the
package did not write to Linear or GitHub. Application began only after separate approval;
[`apply-log.jsonl`](apply-log.jsonl) is its append-only audit record.

The migration completed on 20 August 2026. Final reconciliation verified all 67 Linear targets,
all 25 GitHub targets, and the title, body, and URL of all six excluded issues against the
frozen source. FE-1333's `updatedAt` moved to `2026-08-20T10:50:17.548Z` while the first FE-1357
write was in flight; FE-1333 is the duplicate issue tied to FE-1357, and no excluded content
changed. The other five excluded timestamps remain exact.

## Scope

The Linear snapshot contains 73 issues. The proposals cover all 67 Lu Nelson-authored issues,
including sub-issues. FE-1328, FE-1329, FE-1330, FE-1331, FE-1333, and FE-1334 are Dora
Ma-authored and have no proposal. The migration has 67 issue targets. It changes 65 titles and
writes 66 bodies; FE-1451 already has the exact canonical stored body and is verified without a
write.

The GitHub snapshot contains 25 pull requests. The proposals change 24 titles and eight bodies;
the remaining bodies already have the required structure. Historical issue and pull-request
comments are outside the migration and remain untouched.

For each proposed body, the short outer prose may change while the existing detailed record is
preserved inside one canonical `🏗️ Agent notes` wrapper. PR #23 is the sole normalization case:
its accidentally nested standalone wrapper lines are removed, while every other byte of its
inner record remains in source order.

The reviewed Linear proposal files remain frozen as approved. A trial write showed that Linear
requires a space after the `+++` opener and blank separator lines around the folded content;
both its issue CLI and raw GraphQL API canonicalize absent whitespace. The exact stored bodies
are therefore derived from each approved `proposedOuter` and byte-preserved `innerRecord`, with
their hashes frozen in `data/linear-canonical-target-hashes.json`. Linear also expands the bare
`demo.petrinaut.org` domain in the FE-1433 and FE-1440 outers into its stored Markdown-link
syntax; those two exact replacements live beside their target hashes. No inner-record byte
changes. The wrapper format matches the body Linear already stores for FE-1451.

## Review surfaces

- [`review/linear-FE-1357.md`](review/linear-FE-1357.md),
  [`review/linear-FE-1366.md`](review/linear-FE-1366.md),
  [`review/linear-FE-1383.md`](review/linear-FE-1383.md),
  [`review/linear-FE-1401.md`](review/linear-FE-1401.md), and
  [`review/linear-FE-1406.md`](review/linear-FE-1406.md) show each issue title and outer-prose
  change without repeating the detailed record.
- [`review/github.md`](review/github.md) shows the equivalent pull-request changes.
- [`review/linear-editorial-review.md`](review/linear-editorial-review.md) and
  [`review/github-editorial-review.md`](review/github-editorial-review.md) record the independent
  editorial and fidelity passes.
- [`data/`](data/) holds the byte-exact source snapshots, reviewed proposals, exact Linear stored
  target hashes, and per-record source hashes. The source snapshots include records that are
  intentionally excluded from the migration.

## Frozen data

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `data/linear-source.json`                  | `863ba1deb87718cf3ba3c2accf70ac11cbe7b51a479aff9d9f1bf2719f26f152` |
| `data/linear-canonical-target-hashes.json` | `2368d1d7a6d63193b981757e713148f8c155fb29e3ae68c1c805a03b1e338b25` |
| `data/linear-proposals-FE-1366.json`       | `2473f32ebe5a4ef59f11d910e1ccf57f9eb22df60a9de40440652509e61bc327` |
| `data/linear-proposals-FE-1383.json`       | `80146357d942c89602a3bbe74a31efa2f2c47556988c10c37c291d2778ae9ea7` |
| `data/linear-proposals-FE-1401.json`       | `acdc70da63e7d8d74bff8aa736aa903978c695134e9f828e23419d7f4fa3a3d8` |
| `data/linear-proposals-FE-1406.json`       | `87324f17f294996c8dcf0fc9ba92c76c51554ee0f7c48082f404e966e7275fbf` |
| `data/github-source.json`                  | `ff209f957d17fb3c3049a3c19845b2c3f2310c88cda88d01712a2a3ab67c5113` |
| `data/github-proposals.json`               | `5c77c007537c15357a2d482c51bc933bc61b7727a6982e8324851d007e55adcc` |

Two later, deliberate departures from the original freeze, both made after the migration was
applied and both preserved in git history:

- `data/linear-proposals-FE-1357.json` (frozen as
  `3832104ff8079ff56102235d86c1982970bfb5752e508baa4fc4646a69162985`) was removed from the
  repository: its issue-URL-adjacent prose tripped hashintel/hash's preflight scan that blocks
  merging any pull request whose title names a ticket still referenced beside a task marker,
  for every ticket from FE-1437 through FE-1441. The
  validator's `REMOVED_LINEAR_PROPOSAL_TITLES` map carries the 29 removed proposals'
  identifiers and applied titles, so coverage and the PR title checks still account for the
  whole subtree. The canonical target hashes for those issues remain in
  `data/linear-canonical-target-hashes.json`.
- `data/linear-source.json` and `data/github-source.json` were captured minified
  (`1a7200ac…`, `2d00d591…`) and were pretty-printed by the monorepo formatter when Brunch was
  assimilated into hashintel/hash. The parsed content is unchanged; the table above pins the
  reformatted bytes, and `source-record-hashes.json` keeps the capture-time hashes in its
  `generatedFrom` block.

[`data/source-record-hashes.json`](data/source-record-hashes.json) records the source
`updatedAt`, title hash, and body hash for every one of the 73 issues and 25 pull requests. Its
SHA-256 is `15ff2f72cd7e49a6d3d20f3a71ebbf6f583573f384700a68775f1a4390c31717`.

Run the deterministic validator from the repository root:

```sh
node --experimental-strip-types docs/planning/legibility-sweep/issue-pr-migration-2026-08-20/validate.ts
```

It checks the frozen file hashes, source coverage, authorship exclusions, per-record source and
proposal hashes, byte-exact inner-record preservation, Linear canonical target hashes, wrapper
shape, and issue-to-PR title links.

## Apply protocol

Application requires separate, explicit approval. Apply Linear issues in identifier order, then
GitHub pull requests in number order, one record at a time. For each record:

1. Fetch its raw title, body, and `updatedAt` immediately before writing. Require all three to
   equal the frozen source values and recompute the title and body hashes. Any difference is
   drift: do not write that record. Rebuild and review its proposal from the fresh content.
   FE-1357 and FE-1433 are the documented exceptions: failed trial writes and byte-exact
   rollbacks changed only their immutable `updatedAt` history. Require their frozen title/body
   hashes and the last recovered timestamps recorded in the apply log instead.
2. For Linear, write the exact `proposedTitle` and derive the stored body only from the approved
   `proposedOuter` and `innerRecord` using the canonical wrapper and two declared bare-domain
   replacements above; require its hash to match `linear-canonical-target-hashes.json` before
   writing. For GitHub, write the exact `proposedTitle` and `proposedBody`. Do not reconstruct
   editorial content from a compact review manifest.
3. Fetch the raw record again. Require exact title and body equality with the system-specific
   target and recompute its hashes. Any mismatch is a failed verification: stop before touching
   the next record.
4. Append one result to `apply-log.jsonl` in this directory: record id and URL, pre-fetch time,
   source `updatedAt` and hashes, proposed hashes, post-fetch time and hashes, and pass/fail. A
   failed or drifting record stops the run.

After the last record, fetch the complete scope again and reconcile it with the proposals and
the apply log. The six excluded Dora-authored issues must still match the source snapshot in
title, body, and URL. Require the source `updatedAt` too, except for FE-1333's exact documented
metadata-only side effect above. No step in this protocol calls a comment-writing endpoint, so
historical comments remain outside the operation.

## Rollback

The raw snapshots are the rollback authority. To emit their original titles and bodies without
adding or removing a newline, choose an empty destination and run:

```sh
bun docs/planning/legibility-sweep/issue-pr-migration-2026-08-20/validate.ts \
  --emit-originals /tmp/brunch-legibility-originals
```

This creates `title.txt` and `body.md` for all 73 issues and 25 pull requests and reads every
file back to prove byte equality. Before restoring a record, fresh-fetch it and require it to
match the applied system-specific target; otherwise stop for review. After restoring,
fresh-fetch again and require its title and body hashes to match
`data/source-record-hashes.json`.
