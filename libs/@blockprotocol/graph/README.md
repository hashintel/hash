## Block Protocol – Graph module

This package implements the Block Protocol Graph module for blocks and embedding applications.

## Getting started

If you are a block author, we have several block templates available which use this package

`npx create-block-app@latest --help`

The best way to get started is to [read the docs](https://blockprotocol.org/docs).

## stdlib

The package exports a **standard library of helper functions** for interacting with a `Subgraph`, available from `"@blockprotocol/graph/stdlib"`. For example

```typescript
import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";

// find the outgoing links and target entities for a given entity
const linkAndTargetEntities = getOutgoingLinkAndTargetEntities(
  subgraph,
  "entity-123",
);

for (const { linkEntity, rightEntity } of linkAndTargetEntities) {
  // do something with each link and the entity it points to
}
```

For a full list of available functions see `src/stdlib.ts`

## Initializing a graph module handler

If you want to roll your own block template or embedding application,
you can use this package to construct a handler for graph module messages.

1. `yarn add @blockprotocol/graph` or `npm install @blockprotocol/graph`
1. Follow the instructions to use the graph module as a [block](#blocks) or an [embedding application](#embedding-applications)

### Blocks

To create a `GraphBlockHandler`, pass the constructor an element in your block, along with any callbacks you wish to register to handle incoming messages.

#### React

For React, we provide a `useGraphBlockModule` hook, which accepts a `ref` to an element, and optionally any `callbacks` you wish to provide on initialization.

See `npx create-block-app@latest my-block --template react` for an example.

#### Custom elements

For custom elements, this package exports a `BlockElementBase` class
which uses the [Lit](https://lit.dev/) framework, and sets `graphModule` on the instance for sending graph-related messages to the embedding application.

See `npx create-block-app@latest my-block --template custom-element` for an example.

### Embedding applications

You should construct one `GraphEmbedderHandler` per block.

It is not currently possible to wrap multiple blocks with a single handler.

To create a `GraphEmbedderHandler`, pass the constructor:

1. An `element` wrapping your block
1. `callbacks` to respond to messages from the block
1. The starting values for the following messages:

- `blockEntitySubgraph`: the graph rooted at the block entity
- `readonly`: whether or not the block should be in 'readonly' mode

These starting values should also be passed in a `graph` property object, if the block can be passed or assigned properties.

See the [here](https://blockprotocol.org/spec/graph#message-definitions) or check the TypeScript types for message signatures.

```typescript
import { GraphEmbedderHandler } from "@blockprotocol/graph";

const graphModule = new GraphEmbedderHandler({
  blockEntitySubgraph: { ... }, // subgraph containing vertices, edges, and 'roots' which should be a reference to the block entity
  readonly: false,
  callbacks: {
    updateEntity: ({ data }) => updateEntityInYourDatastore(data),
  },
  element: elementWrappingTheBlock,
});
```

#### React

For React embedding applications, we provide a `useGraphEmbedderModule` hook, which accepts a `ref` to an element, and optionally any additional constructor arguments you wish to pass.

```tsx
import { useGraphEmbedderModule } from "@blockprotocol/graph";
import { useRef } from "react";

export const App = () => {
  const wrappingRef = useRef<HTMLDivElement>(null);

  const blockEntitySubgraph = { ... }; // subgraph containing vertices, edges, and 'roots' which should be a reference to the block entity

  const { graphModule } = useGraphEmbedderModule(blockRef, {
    blockEntitySubgraph,
  });

  return (
    <div ref={wrappingRef}>
      <Block graph={{ blockEntitySubgraph }} />
    </div>
  );
};
```
