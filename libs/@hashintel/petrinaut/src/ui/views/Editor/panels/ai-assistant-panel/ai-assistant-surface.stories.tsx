import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { AiAssistantSurface } from "./ai-assistant-surface";
import type { PetrinautAiMessage } from "./types";

const meta = {
  title: "Editor / AI Assistant",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const userMessage: PetrinautAiMessage = {
  id: "user-1",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Create a pharmaceutical supply chain Petri net.",
    },
  ],
};

const followUpUserMessage: PetrinautAiMessage = {
  id: "user-2",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Turn this into an SIR model petri net please.",
    },
  ],
};

const assistantMarkdownMessage: PetrinautAiMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "text",
      state: "done",
      text: "I created a **supply intake** structure with:\n\n- stochastic supply places\n- a delivery transition\n- a manufacturing buffer",
    },
  ],
};

const reasoningMessage: PetrinautAiMessage = {
  id: "assistant-reasoning",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      state: "done",
      text: "Identify diagram type: Petri net\n\n- Extract required places and transitions\n- Keep IDs stable\n- Add positions for immediate visual feedback",
    },
    {
      type: "text",
      state: "done",
      text: "I understand the requested model and will update the net directly.",
    },
  ],
};

const streamingReasoningMessage: PetrinautAiMessage = {
  id: "assistant-streaming-reasoning",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      state: "streaming",
      text: "I need to identify the SIR compartments and map movement between susceptible, infected, and recovered places.",
    },
  ],
};

const singleToolCallMessage: PetrinautAiMessage = {
  id: "assistant-single-tool",
  role: "assistant",
  parts: [
    {
      type: "tool-updatePlacePosition",
      state: "output-available",
      toolCallId: "tool-position",
      input: {
        placeId: "place__plant_supply",
        position: { x: 80, y: 40 },
      },
      output: {
        applied: true,
        title: "Moved place Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
  ],
};

const toolCallMessage: PetrinautAiMessage = {
  id: "assistant-tools",
  role: "assistant",
  parts: [
    {
      type: "tool-addPlace",
      state: "output-available",
      toolCallId: "tool-1",
      input: {
        id: "place__plant_supply",
        name: "Plant Supply",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      output: {
        applied: true,
        title: "Added place Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
    {
      type: "tool-addTransition",
      state: "output-available",
      toolCallId: "tool-2",
      input: {
        id: "transition__delivery",
        name: "Delivery",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "export const Lambda = () => true;",
        transitionKernelCode: "export const TransitionKernel = () => ({});",
        x: 160,
        y: 0,
      },
      output: {
        applied: true,
        title: "Added transition Delivery",
        target: {
          kind: "selection",
          item: { type: "transition", id: "transition__delivery" },
        },
      },
    },
  ],
};

const renamedToolCallMessage: PetrinautAiMessage = {
  id: "assistant-renamed-tool",
  role: "assistant",
  parts: [
    {
      type: "tool-updatePlace",
      state: "output-available",
      toolCallId: "tool-rename",
      input: {
        placeId: "place__plant_supply",
        update: {
          name: "Warehouse Supply",
        },
      },
      output: {
        applied: true,
        title: "Updated place Warehouse Supply",
        detail: "Previous name: Plant Supply",
        target: {
          kind: "selection",
          item: { type: "place", id: "place__plant_supply" },
        },
      },
    },
  ],
};

const errorMessage = new Error(
  "The assistant could not reach the AI endpoint.",
);

const Frame = ({
  error,
  messages,
  status = "ready",
}: {
  error?: Error;
  messages: PetrinautAiMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
}) => {
  const [input, setInput] = useState("");

  return (
    <div style={{ height: "720px", position: "relative", width: "100%" }}>
      <AiAssistantSurface
        error={error}
        input={input}
        messages={messages}
        onClose={() => {}}
        onInputChange={setInput}
        onStop={() => {}}
        onSubmit={() => setInput("")}
        status={status}
      />
    </div>
  );
};

export const Empty: Story = {
  render: () => <Frame messages={[]} />,
};

export const StreamingMarkdown: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...assistantMarkdownMessage,
          parts: assistantMarkdownMessage.parts.map((part) =>
            part.type === "text" ? { ...part, state: "streaming" } : part,
          ),
        },
      ]}
      status="streaming"
    />
  ),
};

export const ReasoningCollapsed: Story = {
  render: () => <Frame messages={[userMessage, reasoningMessage]} />,
};

export const StreamingReasoning: Story = {
  render: () => (
    <Frame
      messages={[userMessage, streamingReasoningMessage]}
      status="streaming"
    />
  ),
};

export const SingleCompletedToolCall: Story = {
  render: () => <Frame messages={[userMessage, singleToolCallMessage]} />,
};

export const CompletedToolCalls: Story = {
  render: () => <Frame messages={[userMessage, toolCallMessage]} />,
};

export const RenameDetail: Story = {
  render: () => <Frame messages={[userMessage, renamedToolCallMessage]} />,
};

export const MixedConversation: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...reasoningMessage,
          parts: [
            ...reasoningMessage.parts,
            ...toolCallMessage.parts,
          ] as PetrinautAiMessage["parts"],
        },
        followUpUserMessage,
        streamingReasoningMessage,
      ]}
      status="streaming"
    />
  ),
};

export const ToolError: Story = {
  render: () => (
    <Frame
      messages={[
        {
          ...toolCallMessage,
          parts: toolCallMessage.parts.map((part) =>
            part.type.startsWith("tool-")
              ? {
                  ...part,
                  state: "output-error",
                  errorText: "Validation failed",
                }
              : part,
          ) as PetrinautAiMessage["parts"],
        },
      ]}
      status="error"
    />
  ),
};

export const NetworkError: Story = {
  render: () => <Frame error={errorMessage} messages={[userMessage]} />,
};
