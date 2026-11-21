# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net), and progressive support for **SDCPN** (Stochastic Dynamic Coloured Petri Nets).

Currently **under development** and not ready for usage.

## Embedding Petrinaut

The visual editor is exposed as a React component:

```tsx
import { Petrinaut } from "@hashintel/petrinaut";
import {
  createJsonDocHandle,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

const handle = createJsonDocHandle({
  id: generatePetrinautId(),
  initial: { places: [], transitions: [] },
});

export function App() {
  return <Petrinaut handle={handle} title="My net" />;
}
```

For host applications that own their Petri net data, implement a
`PetrinautDocHandle` adapter and pass it to `<Petrinaut />`. The integration
guide lives in the architecture docs:
[Embedding in a host application](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut-core/src/handle/host-integration.mdx).

### `PetrinautProps`

Pass `title` to show a document title in the top bar. The title is read-only
unless the host also supplies `setTitle`; when supplied, Petrinaut calls it
with edits from the title field.

Use `hideNetManagementControls="except-title"` to hide the document-management
menu items while keeping the title visible, or `"all"` to hide the title and
those menu items.

### Presentation profiles

`presentationProfile` chooses how much editing chrome the component draws:

- `editor`, the default, draws the full authoring surface.
- `review` drops the controls whose only purpose is to change the net: the
  add and delete actions in the sidebar lists and property panels. Source
  code, custom visualizers, the minimap and the viewport settings stay, so a
  reader can still inspect and simulate the model.

The profile is chrome, not enforcement. A host that must not accept edits
passes `readonly` as well, which is what disables the fields themselves:

```tsx
<Petrinaut
  handle={handle}
  title="My net"
  presentationProfile="review"
  readonly
/>
```

A blocked node drag or editing shortcut shows a brief notice saying why. On a
document the host made read-only, a [plugin](#plugins) can add a button to
that notice, for example one that saves an editable copy. The manifest gives
the button's label under `readOnlyAction`, and the plugin's contributions give
what it does:

```tsx
export const copyPlugin = definePetrinautPlugin(
  {
    id: "example.copy",
    name: "Copy",
    readOnlyAction: { label: "Make a copy" },
  },
  { readOnlyAction: { run: createEditableCopy } },
);

// <Petrinaut handle={handle} readonly plugins={[copyPlugin]} />
```

The notice shows the action of the first running plugin that declares one.

## Commands and the palette

Petrinaut registers its user-invocable actions (undo, tools, search, panel
toggles, auto-layout) into the ambient command registry: the host's, or the
editor's own when the host provides none. The host, or a plugin inside the
editor, renders the palette; Petrinaut ships none.

```tsx
import {
  CommandRegistryProvider,
  useCommands,
} from "@hashintel/petrinaut/react";

<CommandRegistryProvider>
  <Petrinaut handle={handle} />
  <MyPalette /> {/* lists useCommands(), runs registry.execute(id) */}
</CommandRegistryProvider>;
```

Host components add their own commands with `useCommand(command, { when })`;
a command leaves the registry when `when` turns false or the component
unmounts. Outside React, `createCommandRegistry()` and
`combineCommandRegistries()` from `@hashintel/petrinaut-core` create and merge
registries. The guide, with a reference palette, lives in the architecture
docs:
[Commands and the palette](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut-core/src/command-registry/usage-manual.mdx).

## Plugins

A plugin adds buttons, top-bar items, commands, settings and UI to the
editor. Its manifest declares what it adds and which editor state it reads or
changes; its hook receives `api` and returns the contributions:

```tsx
import { useState } from "react";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

const CounterPlugin = definePetrinautPlugin({
  id: "example.counter",
  name: "Counter",
  topBarItems: { counter: { place: "top-bar-end" } },
});

const useCounterPlugin: PluginHook<typeof CounterPlugin> = () => {
  const [count, setCount] = useState(0);
  return {
    topBarItems: {
      counter: <button onClick={() => setCount(count + 1)}>{count}</button>,
    },
  };
};

export const counterPlugin = CounterPlugin(useCounterPlugin);

// <Petrinaut handle={handle} plugins={[counterPlugin]} />
```

User settings lists the plugins and lets the user switch each one off. The
guide lives in the architecture docs:
[Plugins](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/src/ui/plugins/overview.mdx).

## Icons

The editor draws its icons from
[`@hashintel/ds-icons`](https://github.com/hashintel/hash/tree/main/libs/%40hashintel/ds-icons),
and inside the editor the design-system `Icon` draws from the same set. A host
or a plugin that needs an icon imports it from that package, whose README
describes the components and their props.

## Storybook

Run the Storybook from the repository root:

```bash
yarn workspace @hashintel/petrinaut dev
```

Every story sits under one of three roots:

- **Editor** renders the whole editor: on example nets, one of them with about
  500 nodes, on composed nets, and with plugins.
- **Components** renders one shared building block, such as the code editor,
  the spreadsheet, the scenario form or the contour surface.
- **States** renders a state that is hard to reach by hand, such as a
  read-only document, a plugin that fails, an experiment in a long run or an
  optimizer study.

## AI assistant

The editor's AI assistant comes from a plugin. A plugin that declares
`assistant: true` fills the assistant panel with its own content, such as a
chat, and its title bar with `AssistantPanelTitle`; the editor keeps the
panel's frame, placement, resizing and entry points. Without such a plugin the
editor shows no assistant. The architecture docs'
[Writing a plugin](src/ui/plugins/writing-a-plugin.mdx)
page shows how, and **Editor / Plugins / Assistant** in Storybook renders
one. `petrinautDocsContent` (from `/ui`) exposes the user guide's pages, so an
assistant's tools can answer with the same text.
