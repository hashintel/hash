import { type ReactNode, useState } from "react";
import { userEvent, within } from "storybook/test";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import { createVoiceSessionStore } from "../../../../../react/voice-session/store";
import { AiAssistantContents } from "./ai-assistant-contents";

import type { PetrinautAiVoiceSessionState } from "../../../../types/ai-assistant-composer-control";
import type { PetrinautAiMessage } from "./types";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Editor / AI Assistant",
  decorators: [
    (Story) => (
      <NotificationsProvider>
        <Story />
      </NotificationsProvider>
    ),
  ],
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

const hostSlotStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  paddingX: "3",
  paddingY: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "sm",
  lineHeight: "relaxed",
});

const hostSlotTitleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
});

/**
 * Stands in for a host's pre-session slot. Once a session is running the host
 * reports state instead of rendering, and Petrinaut's own dock takes over.
 */
const HostVoiceSlotPreview = () => (
  <section aria-label="Voice mode consent" className={hostSlotStyle}>
    <span className={hostSlotTitleStyle}>Voice mode</span>
    <span>
      OpenAI processes live audio to speak the interviewer's questions.
      Petrinaut keeps finalized answers in the conversation rather than the
      audio.
    </span>
    <Button size="xs" type="button" variant="solid">
      Start voice mode
    </Button>
  </section>
);

const Frame = ({
  error,
  inputMode = "text",
  messages,
  status = "ready",
  stopped = false,
  voiceMode,
  voiceModeAvailable = false,
  voiceSession,
}: {
  error?: Error;
  inputMode?: "text" | "voice";
  messages: PetrinautAiMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  stopped?: boolean;
  voiceMode?: ReactNode;
  voiceModeAvailable?: boolean;
  voiceSession?: PetrinautAiVoiceSessionState;
}) => {
  const [input, setInput] = useState("");
  // Stands in for the host, which reports session state rather than rendering
  // the live surfaces itself.
  const [voiceSessionStore] = useState(() => {
    const store = createVoiceSessionStore();
    store.setActions({
      end: () => {},
      pause: () => {},
      reconnect: () => {},
      resume: () => {},
      setMicrophoneMuted: () => {},
    });
    store.setState(voiceSession ?? null);

    return store;
  });

  return (
    <VoiceSessionContext.Provider value={voiceSessionStore}>
      <div style={{ height: "720px", position: "relative", width: "100%" }}>
        <AiAssistantContents
          error={error}
          input={input}
          inputMode={inputMode}
          messages={messages}
          onClose={() => {}}
          onInputChange={setInput}
          onInputModeChange={() => {}}
          onStop={() => {}}
          onSubmit={() => setInput("")}
          status={status}
          stopped={stopped}
          voiceMode={voiceMode}
          voiceModeAvailable={voiceModeAvailable}
        />
      </div>
    </VoiceSessionContext.Provider>
  );
};

const liveSession = (
  overrides: Partial<PetrinautAiVoiceSessionState>,
): PetrinautAiVoiceSessionState => ({
  errorMessage: null,
  microphoneLevel: 0,
  microphoneMuted: false,
  phase: "listening",
  ...overrides,
});

export const Empty: Story = {
  render: () => <Frame messages={[]} />,
};

export const EmptyWithVoiceAvailable: Story = {
  render: () => <Frame messages={[]} voiceModeAvailable />,
};

export const VoiceModeAwaitingConsent: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
    />
  ),
};

export const VoiceSessionListening: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        microphoneLevel: 0.6,
      })}
    />
  ),
};

export const VoiceSessionCollapsed: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<HostVoiceSlotPreview />}
      voiceModeAvailable
      voiceSession={liveSession({ microphoneLevel: 0.6 })}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Collapse voice session",
      }),
    );
  },
};

export const VoiceSessionSpeaking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        phase: "speaking",
      })}
    />
  ),
};

export const VoiceSessionThinking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({ phase: "thinking" })}
    />
  ),
};

export const VoiceSessionMuted: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({ microphoneMuted: true, phase: "muted" })}
    />
  ),
};

export const VoiceSessionPaused: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({ phase: "paused" })}
    />
  ),
};

export const VoiceSessionRecovery: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceModeAvailable
      voiceSession={liveSession({
        errorMessage:
          "Connection interrupted. Check your connection. (network)",
        phase: "error",
      })}
    />
  ),
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
          ...singleToolCallMessage,
          parts: singleToolCallMessage.parts.map((part) =>
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

export const StoppedResponse: Story = {
  render: () => (
    <Frame
      messages={[
        userMessage,
        {
          ...reasoningMessage,
          parts: [reasoningMessage.parts[0]!],
        },
      ]}
      stopped
    />
  ),
};

export const WaitingForResponse: Story = {
  render: () => (
    <Frame
      messages={[userMessage, streamingReasoningMessage]}
      status="submitted"
    />
  ),
};

const applyAutoLayoutPendingMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-pending",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "input-available",
      toolCallId: "tool-apply-auto-layout-pending",
      input: { askUserFirst: true },
    },
  ],
};

const applyAutoLayoutAppliedMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-applied",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "output-available",
      toolCallId: "tool-apply-auto-layout-applied",
      input: { askUserFirst: true },
      output: { applied: true, title: "Auto-laid out 8 nodes" },
    },
  ],
};

const applyAutoLayoutDeclinedMessage: PetrinautAiMessage = {
  id: "assistant-apply-auto-layout-declined",
  role: "assistant",
  parts: [
    {
      type: "tool-applyAutoLayout",
      state: "output-available",
      toolCallId: "tool-apply-auto-layout-declined",
      input: { askUserFirst: true },
      output: { applied: false, reason: "User declined auto-layout." },
    },
  ],
};

export const ApplyAutoLayoutAwaitingConfirmation: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutPendingMessage]} />
  ),
};

export const ApplyAutoLayoutApplied: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutAppliedMessage]} />
  ),
};

export const ApplyAutoLayoutDeclined: Story = {
  render: () => (
    <Frame messages={[userMessage, applyAutoLayoutDeclinedMessage]} />
  ),
};
