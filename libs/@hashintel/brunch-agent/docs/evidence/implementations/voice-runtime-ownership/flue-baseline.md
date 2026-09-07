# Flue external-recording prerequisite — baseline evidence

2026-09-07. **Blocked on a supported recorder, not a passing recorder test.** This report records existing public behavior and an upstream contribution constraint. It does not convert the HASH mission or approve product implementation. The [request draft](../../../mission-drafts/flue-external-recording-request.md) is the next external decision surface.

## Exact boundary

- HASH parent [PR #9564](https://github.com/hashintel/hash/pull/9564) re-queried at [a0ca1cb](https://github.com/hashintel/hash/commit/a0ca1cbf52ea44420db24cb615c349e151036c14). Successor checkout remains above that exact foundation; original shared checkout and uncommitted design/spine are untouched by this probe.
- Upstream [withastro/flue at 832ad2e](https://github.com/withastro/flue/commit/832ad2eeaf5e4b07d39749fc669e7ad556238313), both runtime and SDK version 2.0.3. Clean source clone at `/Users/kostandin/Projects/oss/flue-external-recording`; no upstream source patch, HASH dependency patch, or fork publication.
- Node v22.21.1, pnpm 11.1.1, macOS arm64. Installed the pinned lockfile for runtime/SDK only. Build warnings identify TypeScript 7's experimental API; the workspace install also warns about the unselected WhatsApp package's Node >=24 requirement.
- [Probe](flue-baseline.mjs): built public SDK → actual `createAgentRouter` via its in-process fetch boundary → public `start()` Node runtime → native SQLite adapter. Only an in-process faux provider is registered, runtime env is empty, and global fetch is disabled. No API keys, paid calls, HTTP server, HASH application, browser, or microphone are involved.

## Observed result

The [retained JSON](flue-baseline.json) contains the complete materialized snapshots from two distinct child processes, public method surfaces and observed lifecycle counts. The parent asserts exact snapshot equality after the first process fully exits, not merely equal text. Counts below are increments per action; agent entries count function renders, not logical submissions.

| Action | Agent entries | Start hooks | Model calls | Result |
| --- | ---: | ---: | ---: | --- |
| Normal typed send | 2 | 1 | 1 | Completed |
| Normal signal send | 2 | 1 | 1 | Completed; original signal projects as system/dispatch, not human |
| Signal deliberately rejected in start hook | 1 | 1 | 0 | Failed; disproves “zero model calls means no agent invocation” |
| Second-process history read after startup and before shutdown | 0 | 0 | 0 | Same canonical IDs/order/text/settlements/incarnation; no observed submission lifecycle events |

The writing process observed three queued, three running, three settled and one recovery event. The recovery event accompanies the deliberately failed submission; it is not evidence of injected process-crash recovery. Expected stderr contains that hook failure and Node's SQLite experimental warning. Neither is suppressed by the probe.

The SDK's actual method surface was `abort`, `attachmentUrl`, `history`, `observe`, `read`, `send`, `url`, `wait`. The programmatic handle exposed `abort`, `dispatch`, `id`, `read`. The exact source's public types and router registrations confirm no external recording surface. Method enumeration alone would not establish that absence.

During probe development, three harness assumptions were corrected from public source: SDK sends require `{ kind: "user", body }` rather than the runtime handle's string shorthand; `FlueExecutionError` exposes `failure`/`targetId`, not `code`; history deliberately hides the internal signal type and exposes purpose/display plus signal attributes. These were probe errors, not changes to or defects proved in Flue. The retained run passes the corrected assertions.

## Reproduce

In a clean upstream checkout at the pin:

```sh
pnpm install --filter @flue/runtime... --filter @flue/sdk... --frozen-lockfile
pnpm --dir packages/runtime build
pnpm --dir packages/sdk build
pnpm --dir packages/runtime check:types
pnpm --dir packages/sdk check:types
```

All commands above completed successfully for this run. From the HASH successor checkout:

```sh
node libs/@hashintel/brunch-agent/docs/evidence/implementations/voice-runtime-ownership/flue-baseline.mjs /absolute/path/to/pinned/flue
```

The script creates a unique temporary SQLite database, runs separate write/reopen processes, fails on mismatches, emits JSON, and removes its database directory. No production database is touched. The source pin is asserted; rebuild from clean source before rerunning. A source pin check does not authenticate arbitrary pre-existing build output.

The upstream package scripts name Vitest but this checkout contains reusable contract-test definitions rather than executable test files in runtime/SDK. No upstream unit-suite pass is claimed. Builds/typechecks and the above probe are the executed checks. HASH product checks and browser/media witnesses are not applicable to this baseline-only change and have not been run.

## Consequences and remaining gates

1. Flue's [CONTRIBUTING.md](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/CONTRIBUTING.md) sends feature requests to Discussions and says unsolicited PRs are closed/converted. The approval to pursue upstream work is not maintainer acceptance. Prepare/post the feature request only with the required external-write approval; no unsupported implementation is installed meanwhile.
2. Related [discussion #605](https://github.com/withastro/flue/discussions/605) concerns bootstrap/import and deletion. Its no-model import goals overlap, but continuous append to an existing conversation is a different consumer contract. It had no comments when inspected; no support decision is inferred.
3. No-wake writes, external actor trust, original raw/normalized text attribution, duplicate/conflicting external identities, stale incarnation and cross-conversation rejection, concurrent ordering, and append acknowledgement loss remain **untested and unimplemented**. Clean settled-history reopen is not crash/reconnect proof for a recorder.
4. Before a HASH cut, require maintainer-supported public semantics, an inspectable/distributable pin, and real no-wake/reconstruction evidence with a live execution observer. The later HASH integration must use its existing built-app harness and ownership boundary, not this small upstream baseline as a substitute.
5. Product stages, Brunch-only workpiece eligibility, stale delegation, modality switching, interleaved continuations, partial effects, durable post-settlement Stop, actual wording/playback uncertainty, no-autoplay, human witnesses and owner acceptance remain in the [conversion plan](../../../mission-drafts/voice-runtime-ownership-conversion.md) and [design](../../../mission-drafts/voice-runtime-ownership.md). No product-safety, exactly-once-effect, audible-quality, or full-architecture completion claim follows from this probe.
