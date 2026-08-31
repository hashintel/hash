# Brunch agent

Brunch is a stateful elicitation harness and package family inside the HASH monorepo.

This directory is its context and agent-session root, not a package workspace:

- [`CONTEXT.md`](./CONTEXT.md) defines the domain language.
- [`docs/adr/`](./docs/adr/) records governing decisions.
- [`docs/specs/elicitation-kernel.md`](docs/specs/elicitation-kernel.md) defines the harness contract.
- [`docs/INDEX.md`](./docs/INDEX.md) indexes Brunch documentation.
- [`docs/control/STEERING.md`](./docs/control/STEERING.md) holds current strategic truth;
  [`STRATEGY-LOG.md`](./docs/control/STRATEGY-LOG.md) records material strategic decisions.
- [`packages/core/`](./packages/core/) is `@hashintel/brunch-agent`.
- [`packages/binding-flue/`](./packages/binding-flue/) is the Flue binding.
- [`packages/transport-aisdk/`](./packages/transport-aisdk/) is the AI SDK transport.
- [`packages/repertoire/`](./packages/repertoire/) is the harness repertoire: the default teaching
  for every guidance and runbook key (ADR-0007), rendered by bindings, never imported by plugins.
- [`packages/plugin-gherkin/`](./packages/plugin-gherkin/) is the Gherkin target plugin: a
  feature-anchored `plugin.yaml` and the verbatim-floor proposal type.
- [`packages/plugin-sdcpn/`](./packages/plugin-sdcpn/) is the SDCPN target plugin: an
  objective-anchored `plugin.yaml` and its slot-assertion proposal type.
- [`../../../apps/brunch-agent/`](../../../apps/brunch-agent/) is the remote server and diagnostic
  application.

HASH's repository root owns package discovery, dependency policy, the lockfile, and the Turbo task
graph.
