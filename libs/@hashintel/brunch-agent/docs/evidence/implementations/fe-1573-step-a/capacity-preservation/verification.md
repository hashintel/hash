# Canonical capacity repair — verified and delivered

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Bounded result

Owner implementation **`28a529a7bf`** fixes the confirmed root-place capacity omission in ALPHA. The same commit is already delivered to the root-creation worktree as **`28ea6db828`**, following owner importer/script admission **`e13a8e0e8f`**. The root worker must now rebuild and replay the unchanged actual Chrome reopening assertion and previously unreachable controls before its broader node checkpoint is accepted.

The production change is only canonical `Place["capacity"]` projection in `SDCPNPlaceInput` and non-undefined pass-through in `normalizeSDCPN`, with its existing optional-output comment updated. Absence stays absent, explicit undefined follows the existing omission convention, and null/zero/positive remain exact. No new validation/default, handle/storage/history behavior or Brunch backfill was introduced. Existing capacity documentation now states save/reopen preservation, and one Petrinaut-core patch changeset records the fix.

## Evidence

- **Red:** new strict normalization and canonical-handle JSON-reopen tests produced **6 failures / 28 passes**, losing null/zero/3 in both paths. The original parent's actual-record diagnostic failed `undefined !== 3` before implementation.
- **Green:** the same narrow suites pass **34/34**; core TypeScript/lint pass.
- **Affected portfolio:** **66/66 uncached tasks / 3,223 tests**, all builds, types and lints pass under verified denial. Counts: Petrinaut-core1554, Brunch-core128, plugin76, binding20, transport45, app315, Petrinaut699, website386.
- **Published API:** the diagnostic imports the freshly built ALPHA core while retaining the root worker's verifier for the original actual Chrome record. Its required capacity3 assertion passes, plus added deep equality checks between the complete observed definition and both normalized/reopened outputs. This is a fresh test handle, not a restored conversation or corrected live Chrome replay.
- **Independent fix review:** no blocker. The reviewer independently passes the narrow 34 tests, original-record capacity/full-content checks and five frozen-input shape/nonmutation controls. Owner typing and absent/undefined/null/zero/positive semantics remain intact; validator, sanitizer and handle implementation are unchanged.

Complete fix review and exact commands: `fix-review/review.md.gz`. Parent commands/logs and immutable red are retained in `owner/`. The first commit attempt rejected the untracked changeset path before committing; it is retained. The successful commit explicitly staged the five intentional files. No history rewrite or push occurred.

## Reproduction

From repository root with `E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery`:

```sh
sandbox-exec -f "$E/deny-network.sb" yarn workspace @hashintel/petrinaut-core exec vitest run src/types/sdcpn-input.test.ts src/handle/json-doc-handle/create-json-doc-handle.test.ts
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/petrinaut-core --filter=@hashintel/petrinaut --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --continue=always --force --concurrency=1
```

The process-tree verifier passed before the portfolio. No dependency acquisition, provider contact or paid invocation occurred. The parent API probe source and exact stdout/stderr are retained; only its explicit core import is rebased to ALPHA, and both added assertions strengthen full-value preservation. The required original capacity assertion was not weakened.

## Remaining gates

This closes the canonical core cause and its public-API regression, **not yet the rebuilt actual Chrome root-creation gate**. Do not skip that gate or count the stale/retired/foreign/conflicting-node controls beyond the old red until reached. No retrospective healing of previously overwritten capacity, new source relevance, all-class effect/why coverage, genuine/provider admission, semantic utility or Step A/B acceptance is claimed. The browser-topology correction remains an independent lane. Actual paid usage is still **5 calls / US$0.09113535**, with no active allocation.
