# Brunch agent

This directory is the Brunch context and agent-session root inside `hashintel/hash`. HASH root
guidance always wins where it conflicts with this file.

## Scope

- `packages/core`: substrate- and renderer-independent harness and plugin SDK.
- `packages/binding-*`: substrate bindings; each depends inward on the harness.
- `packages/transport-*`: wire transports; none may depend on a binding.
- `packages/plugin-*`: target plugins; each depends only on the harness.
- `../../../apps/brunch-agent`: remote server, application composition, and local diagnostics.
- `evaluations`: cases, protocols, and oracles; see `evaluations/AGENTS.md` before changing them.

The context root is not a package-manager root. Do not add a `package.json`, lockfile, nested
workspace configuration, or standalone CI here. Run package tasks through HASH's root Yarn/Turbo
workspace.

## Before changing Brunch

1. Read `CONTEXT.md` and the relevant decision under `docs/adr/`.
2. Read the protocol under `docs/agents/` that corresponds to the operation.
3. Preserve the executable package-direction, Flue entrypoint, bundle, and hermetic-runtime gates.

## Working methods

- Use Graphite (`gt`) for stack operations; do not use `gh stack` in HASH.
- Issues live in Linear team `FE`, project `brunch-agent`.

Route by trigger; load only the applicable compact protocol:

- Start or resume without a proof target, or when objectives, pressure, proof, authority, external
  gates, frontier value, or arc-close findings change: `docs/agents/steering.md`.
- Create, mutate, triage, or structure issues: `docs/agents/issue-tracker.md`,
  `docs/agents/issue-writing.md`, and `docs/agents/triage-labels.md`.
- Add, move, settle, or index documents: `docs/agents/documentation.md`.
- Change domain terms or accepted context decisions: `docs/agents/domain.md`.
- Make a Flue design choice: `docs/agents/flue-routing.md`.
- Produce a significant agent-authored artifact or proof: `docs/agents/legibility.md`.
- Make an architecture-sensitive move: `docs/agents/posture.md`.
- Operate on branches, stacks, commits, or PRs: `docs/agents/git-workflow.md`.
- Close a work arc: run the context-local `arc-close` skill and
  `docs/agents/arc-close.md`.
