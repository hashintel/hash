# Task 1 report

## Implementation

- Replaced the inherited mission with the focused FE-1653 current-net grounding mission.
- Mounted the canonical `getLatestNetDefinition` read in every SDCPN mode, while retaining
  mutation access only for validated construction and prepared fixtures.
- Added the prompt-lifetime grounding instruction and kept one construction-tool iteration.
- Added the shared ordinary browser catalog containing exactly `readPetrinautDoc` and
  `getLatestNetDefinition`, and reused it for live transport and hydrated history.
- Added server request/tool-boundary assertions and hydrated current-net projection coverage.

## Files changed

`libs/@hashintel/brunch-agent/MISSION.md`,
`apps/brunch-agent/test/petrinaut-chat.test.ts`,
`apps/brunch-agent/test/petrinaut-chat.integration.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts`,
the five requested `apps/petrinaut-website/src/main/app/local-storage-demo/` files, and
`docs/superpowers/plans/2026-09-09-ground-brunch-current-net.md`.

## RED evidence

`yarn workspace @apps/brunch-agent test:unit test/petrinaut-chat.test.ts` failed because the
grounding instruction was absent. The website command failed its new hydrated current-net test
and the ordinary catalog assertion because `getLatestNetDefinition` was absent.

## GREEN evidence

- `yarn workspace @apps/brunch-agent test:unit test/petrinaut-chat.test.ts`: 1 file, 1 test passed.
- `NODE_OPTIONS=--no-experimental-webstorage yarn workspace @apps/petrinaut-website test:unit src/main/app/local-storage-demo/local-storage-demo-app.test.tsx src/main/app/local-storage-demo/use-flue-chat-history.test.ts`: 2 files, 26 tests passed.
- `yarn workspace @apps/brunch-agent lint:tsc && yarn workspace @apps/petrinaut-website lint:tsc`: passed.
- `git diff --check`: passed. IDE diagnostics reported no errors.

## Self-review and concerns

The ordinary path mounts only the read tool; `addType`, `addParameter`, `addPlace`,
`addTransition`, and `addArc` remain rejected by the server contract test. Live transport and
hydration share the same catalog, and the correlated signal preserves the current-net snapshot.
No unintended mutation-tool exposure or unrelated source mutation was found. No concerns.
# Task 1 implementation report

## Status

DONE. The live mission authority was amended and committed independently of
implementation work.

## Files changed

- `libs/@hashintel/brunch-agent/MISSION.md`

The requested report is ignored by Git and is not part of the commit.

## Commit

`394be7bf14b965fe3b9457061e7cd2d909511324` — `Clarify Brunch CORS mission authority`

The commit's parent is the required base
`18cfae4937e00eb106fe28f0fbaaa2f24839708b`, and the commit contains only
`MISSION.md`.

## Implementation

- Corrected the authority's branch name to
  `kafe/fe-1626-cors-agents-routes`.
- Linked the Brunch application README's production configuration section
  for operator details and removed concrete deployment-origin examples from
  the mission.
- Replaced deployment-specific platform and hostname wording with generic
  deployment language.
- Clarified that CORS controls whether conforming browsers expose
  cross-origin responses to client code. It is not caller authentication and
  does not prevent non-browser clients from sending requests or receiving
  ordinary HTTP responses.

## Checks performed

- `git diff --check HEAD^ HEAD` — passed.
- Staged-file and committed-file scope checks — exactly
  `libs/@hashintel/brunch-agent/MISSION.md`.
- Commit parent check — exactly the required base commit.
- Final `git status --short` — clean.
- Forced literal-file Markdown lint:
  `mise exec --env dev markdownlint-cli2 -- markdownlint-cli2 ":libs/@hashintel/brunch-agent/MISSION.md" --config .markdownlint-cli2.jsonc --configPointer /config --no-globs`
  — passed with 0 errors.
- Required-section scan — Status, Imperative, Throughline, Proof, Constraints,
  Fog-line, Stop or reorient, and Deferred are all present.
- Stale deployment wording scan — no old branch spelling, named deployment
  platforms, concrete origin hostnames, or preview-host examples remain.

The repository formatter intentionally excludes Brunch Markdown, so a
targeted `oxfmt` check reported no eligible target. The pre-commit wrapper
also did not resolve its bare `oxfmt` and `markdownlint-cli2` commands while
still reporting success; the explicit Markdown lint and diff checks above
were run independently.

## Self-review findings

- The complete mission contract remains under all required semantic
  addresses.
- The exact-origin parser behavior, startup failure cases, route scope,
  middleware ordering, allowed methods and request headers, exposed response
  headers, disabled credentials, preflight cache, ownership enforcement, and
  proof oracles remain intact.
- The application-only proof boundary, infrastructure uncertainty,
  dependency-version re-entry condition, stop conditions, expected touched
  paths, and deferred issue ownership remain intact.
- The rewritten CORS language preserves the original fact that direct
  non-browser callers may receive ordinary responses while making the
  browser-enforced boundary explicit.
- The README link resolves from the mission to
  `apps/brunch-agent/README.md#production-container`.
- No mission semantics were found to be accidentally lost.

## Concerns

None.
