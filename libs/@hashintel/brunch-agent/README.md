# Brunch agent

Brunch is the elicitation agent used by Petrinaut to build and explain operational-process models. This directory groups its reusable packages, runtime guidance, and persona-test cases; it is not itself a package workspace.

## Packages

- [`packages/core/`](./packages/core/) — `@hashintel/brunch-agent`: the core prompt, elicitation skill, workpiece contracts, and Flue contribution.
- [`packages/plugin-sdcpn/`](./packages/plugin-sdcpn/) — the mounted SDCPN/Petrinaut plugin, including its prompt, modelling skill, and construction tools.
- [`packages/transport-aisdk/`](./packages/transport-aisdk/) — the AI SDK transport over a caller-provided Flue client.

The server and composition point live in [`apps/brunch-agent/`](../../../apps/brunch-agent/). Petrinaut’s browser-side integration lives in [`apps/petrinaut-website/`](../../../apps/petrinaut-website/).

## Development

From the repository root:

```sh
yarn dev:brunch
yarn workspace @apps/brunch-agent test:unit
yarn workspace @hashintel/brunch-agent test:unit
```

Run other checks through the owning workspace or Turbo. The repository root owns dependency resolution and the lockfile.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for implemented boundaries and invariants, and [`EVALUATIONS.md`](./EVALUATIONS.md) for the retained persona-testing surface.
