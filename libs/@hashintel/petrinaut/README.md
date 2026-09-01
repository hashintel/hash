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

## Commands and the palette

Petrinaut registers its user-invocable actions (undo, tools, search, panel
toggles, auto-layout) into a command registry the host owns. The host renders
the palette; Petrinaut ships none.

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
registries, and `createPetrinaut({ commandRegistry })` registers the
instance's commands. The guide, with a reference palette, lives in the
architecture docs:
[Commands and the palette](https://github.com/hashintel/hash/blob/main/libs/%40local/petrinaut-arch-docs/content/commands/usage-manual.mdx).

## Storybook

Run Petrinaut's component stories from the repository root:

```bash
yarn workspace @hashintel/petrinaut dev
```

The **Simulate / SimulateView / Run Supply Chain optimization** story opens
the optimization UI with an internal fake optimizer, so it does not require
the Python service or Docker.

## Host-owned interactive AI tools

Hosts can render their own dynamic AI tools inline in Petrinaut's chat panel.
Define each tool with runtime input and output schemas, then pass the resulting
registration through `aiAssistant.interactiveTools`:

```tsx
import {
  definePetrinautAiInteractiveTool,
  Petrinaut,
} from "@hashintel/petrinaut";
import { z } from "zod";

const confirmationTool = definePetrinautAiInteractiveTool({
  toolName: "confirmOperation",
  inputSchema: z.object({ question: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  component: ({ input, state, submit, submittedOutput, toolCallId }) =>
    state === "awaiting" ? (
      <section data-tool-call-id={toolCallId}>
        <p>{input.question}</p>
        <button onClick={() => submit({ approved: true })}>Approve</button>
        <button onClick={() => submit({ approved: false })}>Decline</button>
      </section>
    ) : (
      <p>{submittedOutput.approved ? "Approved" : "Declined"}</p>
    ),
});

<Petrinaut
  aiAssistant={{
    transport,
    interactiveTools: [confirmationTool],
  }}
  handle={handle}
/>;
```

Any object with a `parse(unknown)` method can be used as a schema; Zod is only
an example and is not required by Petrinaut. The input schema is checked when
the dynamic call arrives and again before rendering. The output schema is
checked before Petrinaut calls the AI SDK's `addToolOutput`.

The component receives a stable `toolCallId` plus a discriminated lifecycle:
`state: "awaiting"` has no submitted output, while `state: "submitted"`
includes the validated `submittedOutput`. While a submission is in flight,
duplicate `submit` calls are ignored. An accepted submission stays one-shot;
if the AI SDK rejects it, the awaiting component can submit again. Once every
pending tool call has output, the existing AI SDK automatic follow-up runs as
usual.

Tool names must be unique within the host registry and must not collide with a
built-in Petrinaut tool such as `applyAutoLayout`. A dynamic tool call with no
matching registration throws `Unknown AI tool: <name>`.

Run the **Petrinaut / With Host Interactive Ai Tool** Storybook story for a
complete synthetic awaiting → submitted → AI follow-up lifecycle.
