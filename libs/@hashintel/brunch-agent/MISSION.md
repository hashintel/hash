# Brunch architecture-check ownership

## Status

**Live as of 2026-09-09** for
[SRE-1010](https://linear.app/hash/issue/SRE-1010/move-brunch-architecture-checks-out-of-core-unit-tests)
on `ln/sre-1010-move-brunch-checks`. This file is the branch's sole execution authority.

## Imperative

Move Brunch family-wide architecture conventions into repo-chores as a dedicated lint task, so
ordinary core and app unit-test tasks own only their local contracts. Do this now because the
SRE-1007 hotfix modeled sibling packages and the app as inputs to core, creating a reverse
`libs -> apps` edge and requiring downstream trees in a core prune.

## Throughline

```text
change in apps/brunch-agent or a Brunch package
→ the checker-owned Turbo inputs invalidate @local/repo-chores#lint:brunch-architecture
→ the dedicated Global lint step runs the repo-chores command against the full checkout
→ a package-family boundary violation fails as a repository lint error

change in apps/brunch-agent
→ @apps/brunch-agent#test:unit
→ app-local agent-module and emitted-artifact checks

change in Brunch core
→ @hashintel/brunch-agent#test:unit
→ core-local tests, without app or sibling-package inputs
```

The repo-chores task owns the explicit Brunch-family inputs because it is the repository-level
consumer of those files. It runs in the unpruned Global lint job; do not make governed workspaces
depend on the checker or recreate the old reverse edge at core.

## Proof

This mission establishes task ownership, affected-task selection, and prune closure for the
existing Brunch architecture checks. It does **not** redesign the architecture rules, broaden
their policy, or replace Yarn and package-local lint enforcement.

1. **App checks are app-local.** The agent directive, pinned identity, app-entrypoint, and emitted
   artifact checks pass from `@apps/brunch-agent`, and its architecture helper reads no sibling
   package. Oracle: `yarn workspace @apps/brunch-agent test:unit`.
2. **Family checks have one repository owner.** Package naming, dependency direction, schema,
   import, runtime, export-lane, and hermetic-test inventory checks pass from the repo-chores
   `check-brunch-architecture` command. Oracle:
   `yarn workspace @local/repo-chores lint:brunch-architecture`.
3. **Relevant changes invalidate the family check.** The repo-chores Turbo task hashes the governed
   app and package manifests, authored source, and tests while excluding generated and dependency
   directories. Oracle: focused Turbo dry-run fixtures recorded in the implementation verification.
4. **A core prune owns no downstream Brunch tree.** The core task has no app or sibling-package
   input glob, and requesting only core no longer adds the app or plugins through prune
   exceptions. Oracle: `.github/actions/prune-repository/prune_test.py` plus inspection of
   `turbo run test:unit --filter @hashintel/brunch-agent --dry=json`.
5. **The new command is independently healthy.** The command, its scanner tests, repo-chores
   typecheck and lint, and relevant package graph checks pass. Oracle: focused repo-chores
   test/lint/typecheck commands and `yarn constraints`.

## Constraints

- Preserve the behavior and failure coverage of every existing architecture assertion while
  splitting app-only checks from repository-family lint.
- Keep Yarn constraints and package-local Oxlint rules with their current owning packages.
- Keep checker inputs on the repo-chores task; never make a governed workspace depend on the
  checker.
- Keep core's context-root script coverage only as narrowly hashed inputs that it genuinely reads;
  do not use the Brunch-family glob.
- Run the family check as its own step in the existing Global lint job, where the complete
  repository is available without prune exceptions.
- No implementation begins until this authority cut is committed separately. Material changes to
  this contract require owner review and another focused authority commit.

### Expected touched paths

```text
~ libs/@hashintel/brunch-agent/MISSION.md
~ apps/brunch-agent/test/architecture/*
~ libs/@local/repo-chores/node/scripts/check-brunch-architecture*
~ libs/@local/repo-chores/node/package.json
~ libs/@local/repo-chores/node/turbo.json
~ libs/@hashintel/brunch-agent/packages/core/turbo.json
~ apps/brunch-agent/turbo.json
~ .github/actions/prune-repository/prune.py
~ .github/actions/prune-repository/prune_test.py
~ .github/workflows/lint.yml
~ yarn.lock
```

## Fog-line

- Turbo's task inputs must include every governed manifest, source file, and test while excluding
  generated and dependency directories. If a focused dry run disproves that, stop and correct the
  checker-owned inputs rather than widening a governed package task.
- Some app unit tests independently read non-workspace Brunch evaluation and documentation assets.
  This mission removes family architecture ownership from the app but does not remove inputs those
  product tests still genuinely consume.
- Core's Linear graph test still exercises a context-root script. Narrow hashing is in scope;
  relocating that unrelated utility is not.

## Stop or reorient

Stop if the dedicated repo-chores task does not invalidate for both app and package changes, if it
requires a prune exception in the Global job, or if moving an assertion changes what it permits or
rejects.

Stop if removing a prune exception makes a non-architecture core or app test lose a genuine
fixture. Preserve that proven dependency narrowly and report it instead of deleting it to satisfy
the desired graph shape.

## Deferred

The canonical future planning record remains
[`MISSION.next.md`](MISSION.next.md). SRE-1008 owns repository-wide detection of undeclared Turbo
task inputs; this mission supplies declared checker-owned Brunch inputs for it to inspect.
