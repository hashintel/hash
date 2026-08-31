# Brunch agent

Brunch is the stateful elicitation harness and package family at `libs/@hashintel/brunch-agent`.

- [`AGENTS.md`](./AGENTS.md) is the agent charter.
- [`MISSION.md`](./MISSION.md) is the current objective and stop conditions.
- [`CONTEXT.md`](./CONTEXT.md) defines the domain language.
- [`docs/specs/`](./docs/specs/) and [`docs/adr/`](./docs/adr/) record the harness contract and
  prior design decisions (see [`docs/adr/README.md`](./docs/adr/README.md)).
- [`docs/evidence/`](./docs/evidence/) holds observed results and proofs.
- [`packages/core/`](./packages/core/) is `@hashintel/brunch-agent`; its guarded `./prompts`
  subpath ships the harness repertoire, rendered by bindings and never imported by plugins.
- [`packages/binding-flue/`](./packages/binding-flue/) is the Flue binding.
- [`packages/transport-aisdk/`](./packages/transport-aisdk/) is the AI SDK transport.
- [`packages/plugin-gherkin/`](./packages/plugin-gherkin/) and
  [`packages/plugin-sdcpn/`](./packages/plugin-sdcpn/) are the target plugins.
- [`../../../apps/brunch-agent/`](../../../apps/brunch-agent/) is the server and diagnostics app.

HASH's repository root owns package discovery, dependency policy, the lockfile, and the Turbo task
graph.
