# Linear migration editorial review

## Summary

- Reviewed: 67 of 67 in-scope Lu-authored issues.
- Issue result: 67 pass, 0 fail.
- Editorial findings: 0 blocker, 0 major, 0 minor.
- Apply-time platform formatting was incorporated without changing any inner record.

## Findings

None.

## Apply-time platform correction

The frozen review bodies used `+++🏗️ Agent notes` without the whitespace Linear stores around a
fold. The first migration write proved that both the issue CLI and raw GraphQL canonicalize this
to `+++ 🏗️ Agent notes` with blank separator lines. FE-1451's existing body has the same stored
shape.

The stored targets now derive deterministically from each approved `proposedOuter` and exact
`innerRecord`. The correction adds one to three wrapper-whitespace bytes per body. Linear also
expands the only bare domain in two approved outers, FE-1433 and FE-1440, into its stored
Markdown-link syntax; the manifest declares those exact replacements. All 67 inner records
remain byte-identical, and `linear-canonical-target-hashes.json` freezes the resulting body
hashes. The original proposal files and their review hashes remain unchanged as the approval
artifact.

## Resolved from prior pass

- **FE-1424 — RECORD_LOSS:** Resolved. The complete unheaded numbered source body is now the `innerRecord`, appears byte-for-byte once inside `🏗️ Agent notes`, and has matching inner and proposed-body hashes.
- **FE-1361 — STATUS_DRIFT:** Resolved. The outer now describes the completed baseline, its two termination failures, the comparison evidence, and the remaining machinery requirements.
- **FE-1363 — STATUS_DRIFT:** Resolved. The outer identifies truck-fleet predictive maintenance as the engineering recommendation pending team agreement, cold chain as the runner-up, and production scheduling as the baseline.
- **FE-1364 — STATUS_DRIFT:** Resolved. The outer describes the representation as conditionally defined and assigns worked-payload validation before ratification to FE-1397.
- **FE-1406 — MATERIAL_OMISSION:** Resolved. The outer records the 2026-08-19 scope decision and the three unresolved mechanics: model-gap cues without a schema walk, session stopping versus model completion, and whether inferred interaction preferences require stored state.

## Mechanical validation

All checks passed:

- The candidate set contains all 67 Lu-authored source issues exactly once.
- No duplicate candidate and no Dora-authored issue appears.
- All 67 source titles match the source data, and all 67 source title and source body hashes recompute correctly.
- All 67 `innerSha256` values recompute correctly.
- Every nonempty `innerRecord` appears byte-for-byte exactly once in its `proposedBody`.
- Every reviewed body contains exactly one standalone `+++🏗️ Agent notes` opener and exactly one standalone `+++` closer. Inline backticked mentions were not counted.
- All 67 `proposedBodySha256` values recompute correctly.
- All 67 stored targets contain the canonical `+++ 🏗️ Agent notes` wrapper, preserve the exact
  `innerRecord`, and match `linear-canonical-target-hashes.json`.

The proposed titles and outers were also re-scanned for unsupported claims, material omissions, status drift, title commitment errors, register defects, and banned words. No current finding resulted.
