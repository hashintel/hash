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

Petrinaut declares its user-invocable actions into a **command registry** the
host owns; the host renders the palette (Petrinaut ships none). Wrap the
editor in `CommandRegistryProvider`, read the live command list with
`useCommands()`, and invoke entries with `registry.execute(id)`:

```tsx
import {
  CommandRegistryProvider,
  useCommand,
} from "@hashintel/petrinaut/react";

<CommandRegistryProvider>
  <Petrinaut handle={handle} />
  <MyCommandPalette /> {/* renders from useCommands() */}
</CommandRegistryProvider>;
```

The command bindings are also re-exported from the package root; prefer
`@hashintel/petrinaut/react`, which carries the React bindings without the
editor's visual chunk.

Host components register their own commands with the same
`useCommand(command, { when })` hook — `when` is a plain boolean, and the
command leaves the registry the moment it turns false or the component
unmounts. Non-React code registers imperatively:
`createCommandRegistry()` / `registry.register(command)` (returns a
disposer) live in `@hashintel/petrinaut-core`, `createPetrinaut` accepts the
registry via its `commandRegistry` option, and
`combineCommandRegistries(...)` merges several sources into one read view
for the palette. The **Commands / Command palette** Storybook story and the
demo website's ⌘K palette are reference host implementations.

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
