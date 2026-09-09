# Brunch architecture-check ownership

## Status

**Live as of 2026-09-09** for
[SRE-1010](https://linear.app/hash/issue/SRE-1010/move-brunch-architecture-checks-out-of-core-unit-tests)
on `ln/sre-1010-move-brunch-checks`. This file is the branch's sole execution authority.

## Imperative

Remove static-policy source walkers from Brunch unit tests and let each existing enforcement
mechanism own the contract it can prove: Oxlint owns authored imports, Yarn owns manifests, and
behavioral tests own emitted behavior. Do this now because the SRE-1007 hotfix modeled sibling
packages and the app as inputs to core, creating a reverse `libs -> apps` edge and requiring
downstream trees in a core prune.

## Throughline

```text
authored dependency-boundary violation
→ the owning workspace's package-local Oxlint configuration
→ an AST-backed lint diagnostic in the existing package lint task

forbidden manifest dependency
→ the repository's Yarn constraints
→ install and Global constraint lint fail

change in apps/brunch-agent
→ @apps/brunch-agent#test:unit
→ the built artifact must contain every declared agent registration

change in Brunch core
→ @hashintel/brunch-agent#test:unit
→ core-local tests and utilities, without context-root, app, or sibling-package inputs
```

No replacement family scanner is introduced. Assertions that restate package manifests, filenames,
source strings, review inventories, or tool configuration are deleted when the existing tool,
compiler, build, or review is already authoritative.

## Proof

This mission establishes native enforcement ownership and prune closure. It does **not** add a new
policy surface merely to preserve every historical assertion.

1. **Import boundaries use existing lint infrastructure.** Each Brunch workspace's existing
   `no-restricted-imports` policy catches forbidden authored imports using Oxlint's parser. Oracle:
   representative negative lint probes in the owning packages.
2. **Manifest boundaries use existing repository infrastructure.** The Brunch transport Yarn
   constraint continues to reject forbidden runtime edges. Oracle: `yarn constraints` and a
   representative negative manifest probe.
3. **Agent registration is behavioral.** The app build-artifact test proves every declared agent
   reaches the emitted registration bundle; source-walking directive and filename checks are
   removed. Oracle: `yarn workspace @apps/brunch-agent test:unit`.
4. **A core prune owns no downstream or context-root Brunch tree.** The core task has no app,
   sibling-package, or context-root input glob, and requesting only core no longer adds them through
   prune exceptions. The Linear graph utility and its tests are co-located in core. Oracle:
   `.github/actions/prune-repository/prune_test.py` plus inspection of
   `turbo run test:unit --filter @hashintel/brunch-agent --dry=json`.
5. **No bespoke checker remains.** The temporary architecture workspace and repo-chores command,
   task, scanner, CI step, and coverage constraint are absent. Oracle: repository search plus
   relevant package lint, typecheck, tests, constraints, and formatting.

## Constraints

- Keep Yarn constraints and package-local Oxlint rules with their current owning packages; do not
  duplicate them in tests or repo-chores.
- Preserve behavioral tests that can fail while source and manifests remain unchanged.
- Delete static assertions whose only oracle is a hard-coded mirror of source, package metadata,
  review inventory, or file layout.
- Move the Linear graph utility into core so its real unit tests use static imports and never skip
  based on checkout shape.
- Never make a governed workspace depend on a checker or recreate a family-wide source walker.
- No implementation begins until this authority cut is committed separately. Material changes to
  this contract require owner review and another focused authority commit.

### Expected touched paths

```text
~ libs/@hashintel/brunch-agent/MISSION.md
~ apps/brunch-agent/test/build-artifact.test.ts
- apps/brunch-agent/test/architecture/*
> libs/@hashintel/brunch-agent/scripts/linear-project-graph.ts
  -> libs/@hashintel/brunch-agent/packages/core/src/linear-project-graph.ts
~ libs/@hashintel/brunch-agent/packages/core/test/architecture/linear-project-graph.test.ts
- libs/@hashintel/brunch-agent/packages/core/test/architecture/context-root.ts
- libs/@hashintel/brunch-agent/packages/core/test/architecture/open-gaps*
~ libs/@hashintel/brunch-agent/packages/core/package.json
~ libs/@hashintel/brunch-agent/packages/core/turbo.json
~ apps/brunch-agent/turbo.json
~ .github/actions/prune-repository/prune.py
~ .github/actions/prune-repository/prune_test.py
~ yarn.lock
```

## Fog-line

- If an import boundary lacks package-local lint coverage, extend the owning workspace's Oxlint
  rule rather than introducing a cross-workspace scanner.
- Some app unit tests independently read non-workspace Brunch evaluation and documentation assets.
  This mission removes family architecture ownership from the app but does not remove inputs those
  product tests still genuinely consume.
- The non-blocking review identifies similar tautological tests outside this architecture cluster.
  They are evidence of the same defect pattern, but broad product-test cleanup is deferred unless a
  touched test blocks this ownership change.

## Stop or reorient

Stop if deleting a source-walking assertion removes the only enforcement of a security boundary or
observable runtime behavior. Preserve that contract in its native tool before deleting the mirror.

Stop if removing a prune exception makes a non-architecture core or app test lose a genuine
fixture. Preserve that proven dependency narrowly and report it instead of deleting it to satisfy
the desired graph shape.

## Deferred

The canonical future planning record remains [`MISSION.next.md`](MISSION.next.md). SRE-1008 owns
repository-wide detection of undeclared Turbo task inputs. The broader non-blocking cleanup of
tautological core tests is deferred.
