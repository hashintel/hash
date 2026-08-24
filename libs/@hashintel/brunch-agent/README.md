# Brunch agent

Brunch is a stateful elicitation harness and package family inside the HASH monorepo.

This directory is its context and agent-session root, not a package workspace:

- [`CONTEXT.md`](./CONTEXT.md) defines the domain language.
- [`docs/adr/`](./docs/adr/) records governing decisions.
- [`docs/specs/elicitation-kernel.md`](docs/specs/elicitation-kernel.md) defines the harness contract.
- [`docs/INDEX.md`](./docs/INDEX.md) indexes Brunch documentation.
- [`packages/core/`](./packages/core/) is `@hashintel/brunch-agent`.
- [`packages/binding-flue/`](./packages/binding-flue/) is the Flue binding.
- [`packages/transport-aisdk/`](./packages/transport-aisdk/) is the AI SDK transport.
- [`packages/plugin-gherkin/`](./packages/plugin-gherkin/) is the Gherkin target plugin.
- [`../../../apps/brunch-agent/`](../../../apps/brunch-agent/) is the remote server and diagnostic
  application.

HASH's repository root owns package discovery, dependency policy, the lockfile, and the Turbo task
graph.
