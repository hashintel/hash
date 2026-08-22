# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net), and progressive support for **SDCPN** (Stochastic Dynamic Coloured Petri Nets).

Currently **under development** and not ready for usage.

## Embedding Petrinaut

The visual editor is exposed as a React component:

```tsx
import { Petrinaut } from "@hashintel/petrinaut";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

const handle = createJsonDocHandle({
  id: "my-net",
  initial: { places: [], transitions: [] },
});

export function App() {
  return <Petrinaut handle={handle} title="My net" />;
}
```

For host applications that own their Petri net data, implement a
`PetrinautDocHandle` adapter and pass it to `<Petrinaut />`. The integration
guide lives in the architecture docs:
[Embedding in a host application](https://github.com/hashintel/hash/blob/main/libs/%40local/petrinaut-arch-docs/content/handle/host-integration.mdx).

## Storybook

Run Petrinaut's component stories from the repository root:

```bash
yarn workspace @hashintel/petrinaut dev
```

The **Simulate / SimulateView / Run Supply Chain optimization** story opens
the optimization UI with an internal fake optimizer, so it does not require
the Python service or Docker.
