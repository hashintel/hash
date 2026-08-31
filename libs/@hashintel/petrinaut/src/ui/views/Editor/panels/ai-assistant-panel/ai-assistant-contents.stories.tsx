import { type ReactNode, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AiAssistantContents } from "./ai-assistant-contents";
import { VoiceInputProvenance } from "./ai-assistant-contents/voice-input-provenance";

import type { PetrinautAiMessage } from "./types";
import type { Meta, StoryObj } from "@storybook/react-vite";

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

const voicePreviewStyle = css({
  display: "flex",
  width: "full",
  flexDirection: "column",
  gap: "2",
  paddingY: "1",
});

const partialBubbleStyle = css({
  display: "flex",
  maxWidth: "[92%]",
  alignSelf: "flex-end",
  alignItems: "flex-start",
  gap: "2",
  paddingX: "3",
  paddingY: "2.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "relaxed",
  textAlign: "right",
});

const voiceDividerStyle = css({
  display: "flex",
  minHeight: "[32px]",
  alignItems: "center",
  gap: "2",
  color: "neutral.s80",
});

const voiceDividerLineStyle = css({
  minWidth: "4",
  height: "[1px]",
  flex: "1",
  backgroundColor: "neutral.a20",
});

const voiceWaveformStyle = css({
  display: "inline-flex",
  height: "[16px]",
  flexShrink: "0",
  alignItems: "center",
  gap: "[2px]",
  color: "blue.s70",
  "& > span": {
    display: "block",
    width: "[2px]",
    minHeight: "[3px]",
    borderRadius: "full",
    backgroundColor: "[currentColor]",
  },
});

const voiceStatusStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "none",
  whiteSpace: "nowrap",
});

const voiceActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const recoveryMessageStyle = css({
  alignSelf: "center",
  paddingX: "3",
  color: "red.s90",
  fontSize: "xs",
  lineHeight: "snug",
  textAlign: "center",
});

const technicalDetailsStyle = css({
  alignSelf: "center",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "snug",
  "& > summary": {
    cursor: "pointer",
    fontWeight: "medium",
  },
});

type VoicePreviewStatus =
  | "Listening"
  | "Speaking"
  | "Paused"
  | "Connection interrupted";

const waveformHeightsByStatus: Record<VoicePreviewStatus, readonly number[]> = {
  Listening: [5, 11, 15, 9, 4],
  Speaking: [6, 11, 15, 9, 5],
  Paused: [4, 6, 8, 6, 4],
  "Connection interrupted": [4, 6, 8, 6, 4],
};
const voiceWaveformBarIds = [
  "leading",
  "middle-left",
  "center",
  "middle-right",
  "trailing",
] as const;

const VoiceModePreview = ({
  partialText,
  status,
}: {
  partialText?: string;
  status: VoicePreviewStatus;
}) => {
  const showReconnect = status === "Connection interrupted";
  const showResume = status === "Paused";

  return (
    <section aria-label={`Voice mode: ${status}`} className={voicePreviewStyle}>
      {partialText && (
        <div className={partialBubbleStyle}>
          <VoiceInputProvenance />
          <span>{partialText}</span>
        </div>
      )}
      <div className={voiceDividerStyle}>
        <span className={voiceDividerLineStyle} />
        <span aria-hidden="true" className={voiceWaveformStyle}>
          {voiceWaveformBarIds.map((waveformBarId, index) => (
            <span
              key={waveformBarId}
              style={{
                height: `${waveformHeightsByStatus[status][index]}px`,
              }}
            />
          ))}
        </span>
        <span className={voiceStatusStyle}>{status}</span>
        <span className={voiceDividerLineStyle} />
        <span className={voiceActionsStyle}>
          {showResume && (
            <Button iconName="play" size="xs" type="button" variant="solid">
              Resume
            </Button>
          )}
          {showReconnect && (
            <Button iconName="rotate" size="xs" type="button" variant="solid">
              Reconnect
            </Button>
          )}
          <Button
            aria-label="Voice mode actions"
            iconName="ellipsis"
            size="xs"
            tooltip="Voice mode actions"
            type="button"
            variant="ghost"
          />
        </span>
      </div>
      {showReconnect && (
        <>
          <div className={recoveryMessageStyle}>
            Check your connection, then reconnect.
          </div>
          <details className={technicalDetailsStyle}>
            <summary>Technical details</summary>
            <code>network</code>
          </details>
        </>
      )}
    </section>
  );
};

const Frame = ({
  error,
  inputMode = "text",
  messages,
  status = "ready",
  stopped = false,
  voiceMode,
  voiceModeAvailable = false,
}: {
  error?: Error;
  inputMode?: "text" | "voice";
  messages: PetrinautAiMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  stopped?: boolean;
  voiceMode?: ReactNode;
  voiceModeAvailable?: boolean;
}) => {
  const [input, setInput] = useState("");

  return (
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
  );
};

export const Empty: Story = {
  render: () => <Frame messages={[]} />,
};

export const EmptyWithVoiceAvailable: Story = {
  render: () => <Frame messages={[]} voiceModeAvailable />,
};

export const VoiceModeWithTranscript: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={
        <VoiceModePreview
          partialText="The pharmacist checks the delivery against the order"
          status="Listening"
        />
      }
      voiceModeAvailable
    />
  ),
};

export const VoiceModeSpeaking: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<VoiceModePreview status="Speaking" />}
      voiceModeAvailable
    />
  ),
};

export const VoiceModePaused: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<VoiceModePreview status="Paused" />}
      voiceModeAvailable
    />
  ),
};

export const VoiceModeRecovery: Story = {
  render: () => (
    <Frame
      inputMode="voice"
      messages={[userMessage, assistantMarkdownMessage]}
      voiceMode={<VoiceModePreview status="Connection interrupted" />}
      voiceModeAvailable
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
