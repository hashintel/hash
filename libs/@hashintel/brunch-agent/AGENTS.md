# Brunch agent

This directory is the Brunch context and agent-session root inside `hashintel/hash`. HASH root
guidance always wins where it conflicts with this file.

## Scope

- `packages/core`: substrate- and renderer-independent harness and plugin SDK.
- `packages/binding-*`: substrate bindings; each depends inward on the harness.
- `packages/transport-*`: wire transports; none may depend on a binding.
- `packages/plugin-*`: target plugins; each depends only on the harness.
- `../../../apps/brunch-agent`: remote server, application composition, and local diagnostics.

The context root is not a package-manager root. Do not add a `package.json`, lockfile, nested
workspace configuration, or standalone CI here. Run package tasks through HASH's root Yarn/Turbo
workspace.

## Before changing Brunch

1. Read `CONTEXT.md` and the relevant decision under `docs/adr/`.
2. Read the protocol under `docs/agents/` that corresponds to the operation.
3. Preserve the executable package-direction, Flue entrypoint, bundle, and hermetic-runtime gates.

## Working methods

- Use `gh stack` for stack operations; never use `gt` in HASH.
- Issues live in Linear team `FE`, project `brunch-agent`.
- Keep the human-owned issue contract separate from collapsed `🏗️ Agent notes`; see
  `docs/agents/issue-writing.md`.
- Maintain the glossary in `CONTEXT.md` and context decisions in `docs/adr/`; see
  `docs/agents/domain.md`.
- Keep `docs/INDEX.md` complete and follow `docs/agents/documentation.md`.
- Before closing a Brunch work arc, run the context-local `arc-close` skill and its canonical
  procedure in `docs/agents/arc-close.md`.
- At design moments involving Flue, follow `docs/agents/flue-routing.md`.

The complete protocol set is:

- `docs/agents/arc-close.md`
- `docs/agents/documentation.md`
- `docs/agents/domain.md`
- `docs/agents/flue-routing.md`
- `docs/agents/git-workflow.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/issue-writing.md`
- `docs/agents/legibility.md`
- `docs/agents/posture.md`
- `docs/agents/triage-labels.md`

The complete protocol set is:

- `docs/agents/arc-close.md`
- `docs/agents/documentation.md`
- `docs/agents/domain.md`
- `docs/agents/flue-routing.md`
- `docs/agents/git-workflow.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/issue-writing.md`
- `docs/agents/legibility.md`
- `docs/agents/posture.md`
- `docs/agents/triage-labels.md`
