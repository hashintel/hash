# Brunch architecture-check ownership

## Status

**Live as of 2026-09-09** for
[SRE-1010](https://linear.app/hash/issue/SRE-1010/move-brunch-architecture-checks-out-of-core-unit-tests)
on `ln/sre-1010-move-brunch-checks`. This file is the branch's sole execution authority.

## Supplemental FE-1580 settlement follow-up

**Live as of 2026-09-08** for
[PR #9588](https://github.com/hashintel/hash/pull/9588) on
`kostandin/fe-1580-port-voice-settlement-fixes`, based directly on current
`main` after #9564 and #9537 merged. This supplement preserves the accepted
Voice contract without changing the CORS authority in this file.

- **Imperative:** semantically port the omitted #9531 commit `9415e1b007`;
  release silent Voice ownership and settle completed submissions without
  canonical prose. Preserve failed durable Stop errors and remove the stale
  browser `brunch_ask` catalogue entry.
- **Throughline:** OpenAI terminal output → session/bridge/controller ownership;
  correlated Brunch settlement → next Voice turn; panel Stop rejection →
  deferred browser-tool termination; shared browser catalogue →
  transport/history.
- **Proof:** donor session/bridge/controller and preview regressions; panel DOM
  tests for persistent Stop failure and withheld continuation; catalogue and
  fixture tests; focused unit, build, TypeScript, ESLint and formatting checks.
  These tests establish local settlement behavior, not paid-provider behavior,
  audible latency or a new microphone witness.
- **Constraints:** preserve current `main`'s accepted Voice and CORS joins; no
  #9538 grounding, #9550 VAD/interruption, snapshot-overlay or provenance
  rollback work, generic interactive tools, obsolete shim, or `brunch_ask`
  restoration.
- **Stop or reorient:** stop if the port erases errors, releases unrelated
  playback, revives withheld tools, weakens the CORS policy, or disturbs other
  work.

## Imperative

Make Brunch architecture checks run from a workspace that is downstream of every workspace they
govern, so ordinary core and app unit-test tasks own only their local contracts. Do this now
because the SRE-1007 hotfix modeled sibling packages and the app as inputs to core, creating a
reverse `libs -> apps` edge and requiring downstream trees in a core prune.

## Throughline

```text
change in apps/brunch-agent or a Brunch package
→ Turbo follows the declared workspace dependency into @tests/brunch-agent-architecture
→ its dedicated unit-test task scans the governed manifests and authored source
→ a package-family boundary violation fails in the architecture workspace

change in apps/brunch-agent
→ @apps/brunch-agent#test:unit
→ app-local agent-module and emitted-artifact checks

change in Brunch core
→ @hashintel/brunch-agent#test:unit
→ core-local tests, without app or sibling-package inputs
```

The architecture workspace declares every governed Brunch workspace as a development dependency.
That graph direction is the selection and prune mechanism; do not recreate it with cross-workspace
Turbo input globs or prune exceptions.

## Proof

This mission establishes task ownership, affected-task selection, and prune closure for the
existing Brunch architecture checks. It does **not** redesign the architecture rules, broaden
their policy, or replace Yarn and package-local lint enforcement.

1. **App checks are app-local.** The agent directive, pinned identity, app-entrypoint, and emitted
   artifact checks pass from `@apps/brunch-agent`, and its architecture helper reads no sibling
   package. Oracle: `yarn workspace @apps/brunch-agent test:unit`.
2. **Family checks have one downstream owner.** Package naming, dependency direction, schema,
   import, runtime, export-lane, and hermetic-test inventory checks pass from
   `@tests/brunch-agent-architecture`. Oracle:
   `yarn workspace @tests/brunch-agent-architecture test:unit`.
3. **Relevant changes select the family check.** A Turbo affected-task query against representative
   app and package changes selects `@tests/brunch-agent-architecture#test:unit`; generated and
   dependency directories do not become authored inputs. Oracle: focused Turbo query/dry-run
   fixtures recorded in the implementation verification.
4. **A core prune owns no downstream Brunch tree.** The core task has no app or sibling-package
   input glob, and requesting only core no longer adds the app or plugins through prune
   exceptions. Oracle: `.github/actions/prune-repository/prune_test.py` plus inspection of
   `turbo run test:unit --filter @hashintel/brunch-agent --dry=json`.
5. **The new workspace is independently healthy.** Its tests, typecheck, lint, and relevant
   package graph checks pass. Oracle: focused workspace test/lint/typecheck commands and
   `yarn constraints`.

## Constraints

- Preserve the behavior and failure coverage of every existing architecture assertion while
  splitting app-only checks from family checks.
- Keep Yarn constraints and package-local Oxlint rules with their current owning packages.
- Model governed workspaces as dependencies of the architecture-test workspace; never make a
  governed library depend on the checker.
- Keep core's context-root script coverage only as narrowly hashed inputs that it genuinely reads;
  do not use the Brunch-family glob.
- Use the existing unit-test matrix and Turbo dependency semantics for CI selection. Add a bespoke
  workflow only if evidence shows the dedicated workspace cannot be selected correctly.
- No implementation begins until this authority cut is committed separately. Material changes to
  this contract require owner review and another focused authority commit.

### Expected touched paths

```text
~ libs/@hashintel/brunch-agent/MISSION.md
~ apps/brunch-agent/test/architecture/*
+ tests/brunch-agent-architecture/*
~ libs/@hashintel/brunch-agent/packages/core/turbo.json
~ apps/brunch-agent/turbo.json
~ .github/actions/prune-repository/prune.py
~ .github/actions/prune-repository/prune_test.py
~ yarn.lock
```

## Fog-line

- Turbo's `^manifest` chain is expected to select the architecture workspace for changes in each
  declared dependency. If an affected-task probe disproves that, stop and choose the smallest
  explicit dedicated task input at the checker, never at a governed package.
- Some app unit tests independently read non-workspace Brunch evaluation and documentation assets.
  This mission removes family architecture ownership from the app but does not remove inputs those
  product tests still genuinely consume.
- Core's Linear graph test still exercises a context-root script. Narrow hashing is in scope;
  relocating that unrelated utility is not.

## Stop or reorient

Stop if the dedicated workspace cannot be selected from both app and package changes through the
declared dependency graph, if its prune omits a governed workspace, or if moving an assertion
changes what it permits or rejects.

Stop if removing a prune exception makes a non-architecture core or app test lose a genuine
fixture. Preserve that proven dependency narrowly and report it instead of deleting it to satisfy
the desired graph shape.

## Deferred

The canonical future planning record remains
[`MISSION.next.md`](MISSION.next.md). SRE-1008 owns repository-wide detection of undeclared Turbo
task inputs; this mission supplies a declared Brunch task layout for it to inspect.
