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
`PetrinautDocHandle` adapter and pass it to `<Petrinaut />`. See
[INTEGRATION.md](INTEGRATION.md) for the recommended patterns.

## Development Mode

For development and testing, you can use the included dev mode:

```bash
yarn dev
```

This will start a development server with a fully functional Petrinaut editor that uses local storage to persist created nets.
