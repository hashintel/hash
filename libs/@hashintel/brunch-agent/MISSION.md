# FE-1653: Ground Brunch in the current Petrinaut net

## Status

Live on PR #9637 and reconciled with `origin/main` after
[PR #9562](https://github.com/hashintel/hash/pull/9562) landed. Mission 7a's
construction validation, immutable bindings, observed effects, declared
provenance, and settled-workpiece authority are the inherited foundation.
This mission adds an ordinary read-only capability without broadening those
construction modes or changing Voice behavior.

## Imperative

Make an ordinary mounted Brunch conversation able to read the current open
Petrinaut net on demand, and instruct it to do so before answering a request
about that net. Keep every mutation unavailable outside the validated
construction, conversation-bound construction, and prepared-fixture modes
that explicitly authorize it.

## Throughline

```text
ordinary Flue conversation (no construction initial data)
→ getLatestNetDefinition available at each ordinary user delivery
→ invoking it atomically marks that user turn as requested
→ client-tool-result and later continuations keep it withdrawn
→ a later user delivery makes it available again
→ shared browser classification
→ live transport and hydrated history projection
```

The plugin's inherited construction paths remain separate:

```text
conversationConstructionMode
→ immutable browser binding + authorized observation lookup
→ observed read / compilation / mutation tools
→ effect and identity checks against recorded browser observations

validated-construction
→ bounded canonical headless construction catalog

prepared-workpiece fixture
→ optional issued browser base + settled WorkpieceRevision authority
→ prepared-fixture read and mutation catalog
```

Ordinary chat does not receive a construction mode, mutation executor, workpiece
authority, or mutation tool. Its browser catalog contains only the documentation
reader and current-net reader.

## Proof

- `apps/brunch-agent/test/integration/petrinaut-chat.test.ts` exercises the
  mounted ordinary server and proves one fresh read on each of two user turns,
  no repeat on continuations, live result carriage, history hydration, and the
  absence of representative mutation tools.
- `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/test/construction-tools.test.ts`
  proves the ordinary reader's per-turn state and that ordinary delivery does
  not expose `addArc`.
- `apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx`
  proves the ordinary browser catalog includes the two read-only tools while
  `executeMutation` remains absent.
- `apps/petrinaut-website/src/main/app/local-storage-demo/use-flue-chat-history.test.ts`
  proves a correlated current-net result hydrates as an output-available tool
  part.
- The Mission 7a plugin and website tests, including `root-node.test.ts`,
  `root-state.test.ts`, `declared-basis.test.ts`, `transition-record.test.ts`,
  and the workpiece tests, remain the oracles for construction binding,
  provenance, complete effects, and workpiece authority. The ordinary-reader
  tests do not replace or weaken them.
- Focused Brunch, SDCPN plugin, and Petrinaut website tests plus affected
  typechecks and lint are the reconciliation acceptance oracle.

These prove an available read-only path and its tool-call gate. They do not
prove that a provider always follows the instruction, that an ordinary read
has construction provenance, or that a complete model can be constructed.

### Reconciliation verification

Verified on 2026-09-11 after merging `origin/main`:

- The affected Brunch and Petrinaut dependency graph built successfully.
- Four focused Brunch integration files passed six tests, including ordinary
  current-net carriage, prepared-workpiece flow, browser-proposal admission,
  and workpiece revisions.
- All nine SDCPN plugin test files passed 73 tests.
- Six focused Petrinaut website test files passed 66 tests, covering the
  ordinary catalog, transport/history, transition recording, typed state, and
  workpiece surface.
- Brunch, the SDCPN plugin, and the Petrinaut website passed TypeScript and
  Oxlint. Brunch reported 27 pre-existing warnings and the website one
  pre-existing warning; neither reported an error. The plugin reported no
  diagnostics.
- Formatting and whitespace checks passed for the final diff, and affected
  Markdown lint reported no errors.

## Constraints

- Use the mounted Flue route and existing `client-tool-result` signal; add no
  second route, snapshot cache, or transport-specific state.
- Use the canonical Petrinaut tool definitions and
  `getLatestNetDefinitionToolName`.
- Track the ordinary turn's read at the tool-call boundary. Do not infer policy
  from serialized result payloads.
- Keep the browser catalog authoritative for both live transport and history
  hydration.
- Preserve Mission 7a's mode schema. Conversation construction requires its
  distinct immutable binding and authorized observation lookup. Joined
  prepared construction requires the issued base and core settled-revision
  authority. Validated headless construction remains explicitly selected.
- Preserve declared basis, revision/hash and locator checks, operation scope,
  observed pre/post effects, workpiece authority, identity checks, and the
  refusal of stale, unknown, conflicting, failed, or no-op attempts as causes.
- Keep ordinary conversations mutation-free. A read result is machine evidence,
  not permission to mutate and not provenance for a later construction action.
- Describe grounding as an on-demand capability plus model instruction. A hard
  pre-answer guarantee is not established by a model-selected browser tool.
- Voice input uses the same ordinary chat path, but this mission adds no
  OpenAI canvas context or Voice lifecycle behavior.

## Fog-line

The ordinary path does not decide how a future host-enforced pre-answer
snapshot protocol would work, nor how ordinary read evidence could become
authorized construction provenance. Mission 7a supplies bounded,
record-backed provenance inside its explicit construction modes; that must not
be generalized to ordinary chat without a new authority boundary.

## Stop or reorient

Stop if ordinary chat can invoke `addArc` or another mutation, if the browser
and history catalogs diverge, if the read bypasses `client-tool-result`, if a
continuation remounts a reader already used in the current user turn, or if
the reconciliation drops construction bindings, observation metadata,
declared basis, settled-workpiece authority, or mode validation.

## Expected touched paths

`apps/brunch-agent/test/integration/petrinaut-chat.integration.ts`,
`apps/brunch-agent/test/integration/petrinaut-chat.test.ts`,
`apps/petrinaut-website/src/main/app/local-storage-demo/brunch-client-tools.ts`,
`apps/petrinaut-website/src/main/app/local-storage-demo/brunch-panel-transport.ts`,
`apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx`,
`apps/petrinaut-website/src/main/app/local-storage-demo/use-flue-chat-history.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/test/construction-tools.test.ts`,
`.changeset/fresh-net-grounding-docs.md`, and
`libs/@hashintel/petrinaut/docs/ai-assistant.md`.

## Deferred

A host-enforced fresh snapshot, ordinary-chat provenance, automatic
construction, direct Voice/OpenAI canvas context, broader construction
semantics, and provider-quality evaluation remain future work. Mission 7b owns
the substantial worked-scenario and explanation-quality successor to Mission
7a.
