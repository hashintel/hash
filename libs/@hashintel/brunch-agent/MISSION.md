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

Automatic construction, fresh current-turn proof across multiple turns, user-facing
documentation, provenance, and Voice/browser witness work remain in the linked plan for later
tasks. This mission does not claim them.
