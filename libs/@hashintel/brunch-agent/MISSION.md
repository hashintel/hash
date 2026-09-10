# FE-1653: Ground Brunch in the current Petrinaut net

## Status

Live on the Graphite-tracked child branch of PR #9619. Voice behavior is unchanged by this
mission.

## Imperative

Make an ordinary mounted Brunch conversation able to read the current open Petrinaut net before
answering a request about it, while keeping every mutation tool unavailable outside its existing
validated-construction and prepared-fixture modes.

## Throughline

```text
ordinary Flue conversation
→ globally mounted getLatestNetDefinition read
→ existing client-tool-result continuation
→ shared browser classification
→ live transport and hydrated history projection
```

## Proof

- `apps/brunch-agent/test/petrinaut-chat.test.ts` proves the ordinary server exposes
  `getLatestNetDefinition` and no construction mutation.
- The faux-provider request inspection proves the grounding instruction and canonical read tool
  definition reach the model request.
- `local-storage-demo-app.test.tsx` proves the ordinary browser catalog is exactly the docs reader
  and current-net reader.
- `use-flue-chat-history.test.ts` proves a correlated current-net result hydrates as an
  `output-available` tool part.
- The focused commands in the task brief are the acceptance oracle. They prove this read-only
  seam, not automatic construction, provider behavior, Voice latency, or provenance.

## Constraints

- Use the existing mounted Flue route and `client-tool-result` signal.
- Use the canonical `petrinautConstructionTools` definitions and
  `getLatestNetDefinitionToolName`.
- Mount the current-net read globally; ordinary conversations receive no mutation.
- Preserve validated construction and prepared-fixture tool gates.
- Keep the shared browser catalog authoritative for both live transport and hydration.
- Do not add a second route, snapshot cache, automatic construction, or Voice/OpenAI canvas
  context. PR #9619 is the stack parent; do not change Voice behavior here.

## Fog-line

This task does not decide how future turns prove freshness beyond the current continuation, how
automatic construction or provenance will work, or how Voice-originated requests should carry
canvas context. Re-enter those questions only when a later mission owns their production boundary.

## Stop or reorient

Stop if the ordinary path can invoke `addArc` or another mutation, if the browser and history
catalogs diverge, if the read bypasses `client-tool-result`, or if implementation requires a new
conversation route or Voice change.

## Expected touched paths

`docs/superpowers/plans/2026-09-09-ground-brunch-current-net.md`,
`apps/brunch-agent/test/petrinaut-chat.test.ts`,
`apps/brunch-agent/test/petrinaut-chat.integration.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts`,
the five listed `apps/petrinaut-website/src/main/app/local-storage-demo/` catalog, transport,
history, and test files.

## Deferred

Automatic construction and provenance remain future work. Paid-provider output, browser behavior,
and audible Voice behavior remain skipped witness boundaries; this mission does not claim them.


## FE-1653 Verification Close

**Implementation under verification:** `a0aa5bef4b` (`Capture current-net signal evidence`),
with type-aware proof fixes in `6f1713f28c`.

### Deterministic verification

- `yarn install --immutable` — **PASS**; no lockfile change.
- `yarn workspace @apps/brunch-agent test:unit` — **PASS** after the verified
  `--testTimeout 30000` rerun: 25 files, 200 tests.
- `NODE_OPTIONS=--no-experimental-webstorage yarn workspace @apps/petrinaut-website
  test:unit` — **PASS**: 41 files, 372 tests.
- `yarn workspace @hashintel/petrinaut test:unit` — **PASS**: 94 files, 802 tests.
- `yarn workspace @apps/brunch-agent lint:tsc` — **PASS**.
- `yarn workspace @apps/petrinaut-website lint:tsc` — **PASS**.
- `yarn workspace @hashintel/petrinaut lint:tsc` — **PASS**.
- `yarn workspace @apps/brunch-agent lint:eslint` — **PASS**, with 14 pre-existing
  warnings and 0 errors.
- `yarn workspace @apps/petrinaut-website lint:eslint` — **PASS**, with 0 warnings/errors.
- `yarn workspace @hashintel/petrinaut lint:eslint` — **PASS**, with 0 warnings/errors.
- Requested Turbo build command is unavailable because `turbo` is not on PATH and no
  `yarn turbo` script exists. The Yarn workspace Vite shim is also absent, so package
  build scripts report `command not found: vite`; this is an environment/linker issue.
- Equivalent direct production builds **PASS**:
  `node ../../node_modules/vite/bin/vite.js build && node ../../node_modules/vite/bin/vite.js
  build --config vite.client.config.ts` in `apps/brunch-agent`;
  `node ../../node_modules/vite/bin/vite.js build` in `apps/petrinaut-website`; and the
  direct `@hashintel/petrinaut` build.
- `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`, `yarn lint:format`, and
  `git diff --check` — **PASS**. The Task 2 fixer’s focused Brunch test, typecheck, lint,
  and diff check — **PASS**.

### PR review hardening

**Executable head verified:** `a44b393cdd` (`Gate current-net reads by delivery kind`).
Any following verification-close commit changes evidence only.

- Strengthened ordinary and prepared-fixture faux-provider checks deliberately request a duplicate
  current-net read whenever a continuation still advertises it. Both focused Brunch integration
  tests — **PASS**; each user turn keeps one initial read and zero resumed reads.
- `yarn workspace @apps/brunch-agent test:unit` after direct server and client production builds —
  **PASS**: 25 files, 200 tests.
- `yarn workspace @hashintel/brunch-agent-plugin-sdcpn test:unit` — **PASS**: 2 files, 12 tests.
- Focused Petrinaut website transport/history tests — **PASS**: 2 files, 26 tests.
- Brunch and SDCPN plugin TypeScript checks — **PASS**.
- Brunch ESLint — **PASS** with 14 pre-existing warnings and 0 errors.

### Browser witness and proof boundary

The local browser witness remains **SKIPPED**: only the repository dummy
`OPENAI_API_KEY` is available, so no paid provider was called and no credentials were
exposed. Deterministic tests and direct builds establish current-net grounding,
changed-net re-grounding, client-tool-result persistence, and production buildability.
They do not establish paid-provider output, audible Voice behavior, or remote deployment
behavior.
