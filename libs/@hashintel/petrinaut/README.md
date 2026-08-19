# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net), and progressive support for **SDCPN** (Stochastic Dynamic Coloured Petri Nets).

Currently **under development** and not ready for usage.

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
includes the validated `submittedOutput`. Only the first valid `submit` call
is forwarded. Once every pending tool call has output, the existing AI SDK
automatic follow-up runs as usual.

Tool names must be unique within the host registry and must not collide with a
built-in Petrinaut tool such as `applyAutoLayout`. A dynamic tool call with no
matching registration throws `Unknown AI tool: <name>`.

Run the **Petrinaut / With Host Interactive Ai Tool** Storybook story for a
complete synthetic awaiting → submitted → AI follow-up lifecycle.
