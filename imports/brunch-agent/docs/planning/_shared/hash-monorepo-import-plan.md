# HASH monorepo import plan

**Status:** recommended execution plan for FE-1437 (the monorepo import). This is a bounded
cross-effort plan: it settles as a record when `hashintel/hash` is the sole writable authority for
Brunch. [ADR-0004](../../adr/0004-in-petrinaut-staging-and-the-monorepo-import.md) owns the accepted
decision to move; [COORDINATION](./COORDINATION.md) owns the live handoff threshold and sequencing.

## Recommendation

Assimilate Brunch into HASH's Yarn/Turbo workspace as native sibling workspaces. Preserve the
current package boundaries; do not preserve the current Bun workspace as a nested monorepo and do
not collapse it into one implementation package.

The current workspaces are architectural modules, not a repository boundary that must survive.
Their tested direction remains useful after HASH becomes their workspace root:

```text
libs/@hashintel/brunch-agent
  package: @hashintel/brunch-agent
  role: substrate- and renderer-independent harness + plugin SDK
       ^                         ^                         ^
       |                         |                         |
libs/@hashintel/           libs/@hashintel/          libs/@hashintel/
brunch-agent-binding-flue  brunch-agent-             brunch-agent-plugin-gherkin
                           transport-aisdk
       \_________________________|_________________________/
                                 |
                                 v
apps/brunch-agent
  package: @apps/brunch-agent
  role: remote server, host wiring, local diagnostics
                                 |
                         HTTP / AI SDK stream
                                 |
                                 v
apps/petrinaut-website --------> libs/@hashintel/petrinaut
```

Applications are the only meeting place. The Brunch packages remain renderer-agnostic;
`@hashintel/petrinaut` remains elicitor-agnostic. `@apps/brunch-agent` may consume Brunch packages
and generic Petrinaut tool schemas, while `@apps/petrinaut-website` owns the client mode and remote
transport wiring.

## Package ownership and public surface

Use `@hashintel` for every reusable Brunch package whose contract is intended to work outside the
HASH applications. Use `@local` only for code whose contract is meaningful inside `hashintel/hash`
and nowhere else. Package scope and publication state are separate decisions: HASH already
contains private packages under `libs/@hashintel/`, so an `@hashintel` name does not require
publishing during the import.

Here **supported package** means a named, installable boundary that the Brunch maintainers own,
document, and include in build and boundary gates. It does not promise publication, semantic
version stability, or external support while `private: true` remains set.

| HASH path | Package | Owned contract | Import posture |
| --- | --- | --- | --- |
| `libs/@hashintel/brunch-agent` | `@hashintel/brunch-agent` | Harness mechanism, substrate-neutral protocols, storage port, plugin SDK | `private: true` |
| `libs/@hashintel/brunch-agent-binding-flue` | `@hashintel/brunch-agent-binding-flue` | Flue binding and current local-file storage implementation | `private: true` |
| `libs/@hashintel/brunch-agent-transport-aisdk` | `@hashintel/brunch-agent-transport-aisdk` | AI SDK UI-message-stream transport | `private: true` |
| `libs/@hashintel/brunch-agent-plugin-gherkin` | `@hashintel/brunch-agent-plugin-gherkin` | Gherkin target plugin and reference implementation | `private: true` |
| `apps/brunch-agent` | `@apps/brunch-agent` | Deployment, authentication, environment configuration, HTTP mounting, diagnostics | always private |

This placement follows the intended portability:

- A consumer should be able to install the harness with only the binding, transport, and plugins
  its deployment needs.
- Binding and transport packages are part of how Brunch supports different substrates and UI
  shells; treating them as `@local` would falsely describe them as HASH-only wiring.
- FE-1437 moves the existing local-file store with the Flue binding. FE-1441 separately decides and
  adds the Postgres implementation behind the unchanged storage port. A host-neutral
  implementation belongs to the binding; HASH credentials, deployment manifests, and
  environment-specific composition stay in `@apps/brunch-agent`.
- No `@local` Brunch package is created during the import merely to defer a publication decision.

### Export and dependency rules

1. `@hashintel/brunch-agent` names the current `core` contract. It does not re-export bindings,
   transports, plugins, or application code through an umbrella facade.
2. Each extension package has its own explicit exports and depends inward on
   `@hashintel/brunch-agent`; core never imports an extension package.
3. Plugins import core only. Bindings import core and their substrate. Transports import core and
   their wire library, never a binding.
4. Applications compose packages and may know about both Brunch and Petrinaut. Libraries may not.
5. The existing role nouns (`binding-*`, `transport-*`, `plugin-*`) remain in the package names so
   dependency direction stays legible.

ADR-0004's singular `@hashintel/brunch-agent` name remains the harness package. Its amendment makes
the companion package family explicit; it does not turn the harness into an umbrella package.

All four libraries remain `private: true` through FE-1437. Publishing is a later, independent
release decision: remove `private` only when there is a named consumer and a reviewed versioned
contract. At that point HASH's normal Changesets process and `workspace:^` rule apply. Deferring
publication must not force another namespace or directory migration.

## Application disposition

The recommended end state re-charters the current `apps/dev` as `apps/brunch-agent`: the remote
host with its local target gallery and diagnostic UI retained as internal operational surfaces.
The current [route map](../../../apps/dev/src/app.ts) already mounts the Flue agent router, the
Petrinaut chat transport, and the production diagnostic assets. Re-chartering that host avoids a
second app around those same routes.

ADR-0004 and FE-1437 currently say that `apps/dev` remains only a local harness. Before the import,
amend those contracts explicitly to record the re-charter; do not let a path rename silently make
the decision. If the deployed server later proves to require a materially different runtime, that
evidence can justify a second app then.

## Authority threshold

The import is an authority handoff, not a freeze on all harness development:

```text
brunch-lite authoritative
  FE-1434 + FE-1435 verdicts landed
  FE-1388/1389/1390/1399 review stack merged
                    |
                    v
          == FE-1437 import ==
                    |
                    v
hashintel/hash authoritative
  FE-1440 website wiring + FE-1441 deployment
```

FE-1438 (client-tool round-trip) and FE-1439 (private durable sessions) may land before FE-1437 and
travel with the imported history. The write freeze occurs when the final standalone head SHA is
recorded and its history-import commit is created on the FE-1437 HASH branch. From that point,
unfinished work continues only in HASH; after FE-1437 lands, HASH is the canonical repository.
There is no dual-write period or compatibility bridge between repository layouts.

## Execution plan

### 1. Prepare the cutover

- Satisfy the gates in `COORDINATION.md` and take a final green baseline in `brunch-lite`.
- Amend ADR-0004 and FE-1437 to clarify the package family and the `apps/dev` re-charter.
- Record the final standalone `main` SHA, then stop accepting new standalone changes before
  creating the history-import commit. If that SHA must change, regenerate the import before any
  HASH-side semantic work proceeds.

### 2. Import history without creating a permanent subtree

- Create a disposable clone of `brunch-lite`; never rewrite the shared checkout. The import input
  is the complete ancestry of the recorded `main` SHA, including its merge commits. Unmerged
  branches, pull-request refs, and unrelated tags are not inputs unless the preparation step names
  one explicitly.
- Prefix that ancestry under a temporary path such as `imports/brunch-agent` using
  `git filter-repo --refs refs/heads/main --to-subdirectory-filter imports/brunch-agent`.
- Merge that history into the FE-1437 branch of `hashintel/hash` without squashing.
- In the next mechanical commit, move each workspace to its final `libs/@hashintel/*` or `apps/*`
  path. Keep semantic edits out of this move so rename detection and review remain useful.
- Run `git blame` and `git log --follow` on one pre-existing source file and one pre-existing test
  file from each of the five moved workspaces. Every sample must reach a pre-import commit.

This is a one-time history merge, not an ongoing `git subtree`, submodule, or synchronization
relationship.

### 3. Dispose of repository-level material deliberately

- Use `docs/INDEX.md` plus the tracked files outside `apps/`, `packages/`, and `test/` as the
  disposition inventory. For every entry, record one outcome in the FE-1437 work: move to a named
  HASH path, retain as an explicitly historical record, or remove after import with a reason.
- The named home for living documentation is `libs/@hashintel/brunch-agent/docs/`. Move there
  everything that still governs the imported code: ADR-0002 (the placement rules behind the
  boundary gates), ADR-0004, the amended kernel spec, `CONTEXT.md` (the domain model), and this
  plan's own settled record. The harness package README links that home so every living document
  remains reachable from the package documentation.
- Re-home the cross-effort control surfaces that remain live after the handoff to the same home.
  At import time FE-1440, FE-1441, and FE-1442 are still open, so `COORDINATION.md` and
  `SPEC-LEDGER.md` qualify. Historical planning need not remain live.
- The agent working methods (`AGENTS.md`, `CLAUDE.md`, the `docs/agents/*` protocols, the
  `arc-close` skill, and the INDEX gate in `test/docs-index.test.ts`) receive an explicit
  recorded decision rather than disposal by omission: either re-author them under HASH's own
  agent-guidance conventions, or retire them and restate the practices that outlive this
  repository — the issue-writing contract, triage roles, and documentation protocol govern the
  Linear-side work regardless of where the code lives. Do not carry them forward unchanged as a
  nested project root.
- Do not carry standalone CI, Bun lockfiles, or repository setup forward.
- The disposition is complete only when every inventory row resolves to its recorded destination
  or removal commit. Removing a file after the mechanical import does not remove its Git history.

### 4. Adopt the HASH toolchain

- Convert manifests to native HASH workspaces and the package names above.
- Use `workspace:*` while packages are private. Do not add exceptions to HASH's dependency
  constraints merely to preserve standalone-repo versions.
- Replace `bun:test` with Vitest and replace the small number of Bun runtime APIs with Node or web
  platform equivalents.
- Adopt HASH's package-level TypeScript, oxlint, Vite/Vitest, and Turbo task conventions rather
  than wrapping the old root scripts. Every imported library exposes `build`, `lint:eslint`,
  `lint:tsc`, and `test:unit`; the app exposes the same four tasks plus its normal `dev` task.
- Reconcile dependency versions through HASH's constraints. The AI SDK wire package already
  matches the website's AI SDK major. Flue and Valibot do not yet exist in HASH: add their required
  versions to the imported manifests, run `yarn lint:constraints`, and resolve any conflict rather
  than adding a Brunch-specific constraint exemption.
- Remove `bun.lock`, `bunfig.toml`, Bun-specific root configuration, and the old workspace root
  only after their HASH replacements run.

### 5. Preserve architectural enforcement

Port the current [boundary suite](../../../test/boundaries.test.ts) and its
[workspace scanner](../../../test/workspace.ts) instead of replacing them with prose:

- Keep the manifest and source-import checks that enforce plugin/core, binding/core/substrate, and
  transport/core/wire directions.
- Adapt package discovery and expected names to HASH paths and scopes.
- Use `yarn.config.cjs` constraints for declared workspace relationships and the ported source
  scanner for actual imports.
- Do not claim that forbidden third-party imports physically cannot resolve under HASH's hoisted
  `node_modules` linker. The current Bun resolver proof depends on isolated installation; replace
  that portion with an honest gate over manifests and source imports rather than a green false
  equivalent.
- Retain the fail-loud Flue entrypoint checks: directive placement, pinned agent identity, mount,
  and storage entry. Port the [bundle assertions](../../../test/build-artifact.test.ts) that prove
  the emitted server registers every agent, mounts the router and conversation store, carries no
  model key, and that emitted HTML points to a built client asset.
- Prove the negative oracle once during the move by temporarily adding an `@flue/runtime` import to
  the Gherkin plugin in the disposable import worktree: the targeted boundary test must fail, then
  pass again after the mutation is removed.

### 6. Complete FE-1437 before integrating the applications

FE-1437 is complete when the imported package family builds and tests natively in HASH, history is
traceable, and the architectural gates hold. The host runtime proof ports
`apps/dev/test/petrinaut-chat.test.ts`: POST the existing conversation fixture through the mounted
application route with the faux provider and assert the AI SDK stream, without a Petrinaut website
checkout. Keep the following in later issues:

- FE-1440 commits the Petrinaut website's elicitor mode and transport switch.
- FE-1441 adds HASH deployment, Postgres-backed storage, rate limiting, and origin policy.
- Publication of any Brunch package remains separate from both the import and demo deployment.

### 7. End standalone authority

- Mark `hashintel/hash` as the canonical source in the old repository's landing page.
- Close or redirect automation that could accept new standalone changes.
- Archive the old repository only after the HASH branch is landed and the history checks pass.

These are shared-state actions and require explicit approval when FE-1437 executes them.

## Verification gates

| Gate | Required evidence |
| --- | --- |
| Baseline | Standalone lint, format, typecheck, all tests, and build pass at the recorded import SHA |
| Workspace | HASH install and constraints pass with no Brunch-specific exemption |
| Packages | Each Brunch workspace exposes and passes `build`, `lint:eslint`, `lint:tsc`, and `test:unit` |
| Boundaries | A temporary Gherkin-plugin → Flue import fails the targeted gate; the restored tree passes |
| Runtime | The host builds both bundles and the faux-provider POST passes through its mounted conversation route |
| History | One source and one test file from every moved workspace reach pre-import commits by blame and follow-log |
| Removal | No Bun lockfile, nested workspace root, or Bun runtime/test import remains |
| Integration | FE-1440 separately proves the real Petrinaut website against the imported server |

## Trade-offs

**What native assimilation buys**

- Atomic changes across Brunch, Petrinaut, and the website.
- One dependency policy, lockfile, CI graph, security-update path, and deployment environment.
- No publishing or local-link ceremony for product integration work.
- Package boundaries remain explicit while cross-package refactors become easier.

**What it costs**

- A one-time Bun-to-HASH tooling port.
- A larger install, CI, and review context for Brunch-only work.
- Root dependency constraints may expose Flue, Vite, React, or schema-library conflicts.
- The standalone repository's focused iteration loop is replaced by HASH's broader governance.
- The history import and document disposition require a deliberately staged review.

## Alternatives not recommended

| Alternative | When it would be better | Why it is not the current choice |
| --- | --- | --- |
| Keep Brunch separate behind HTTP or published packages | Independent ownership, release cadence, deployment lifecycle, or external consumers dominate | Reverses ADR-0004 and loses atomic work across the current product seam |
| Collapse everything into `@hashintel/brunch-agent` | The package boundaries prove ceremonial and there is one enduring consumer | Erases currently tested substrate/plugin/transport directions |
| Nest the Bun monorepo inside HASH | Very short-lived import staging only | Creates two package managers, lockfiles, task graphs, and ambiguous workspace discovery |
| Git submodule or permanent subtree | Source must remain independently authoritative | Preserves the cross-repository coordination cost the move is intended to remove |

The reconsideration trigger is concrete evidence of independent product life: a separate owner,
release cadence, external consumer base, or runtime that must deploy independently of HASH. Without
that evidence, native workspaces with the reusable package family under `@hashintel` are the
smallest coherent end state.
