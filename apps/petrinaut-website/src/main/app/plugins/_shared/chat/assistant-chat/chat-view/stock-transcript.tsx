import { memo } from "react";
import ReactMarkdown from "react-markdown";

import { css, cva } from "@hashintel/ds-helpers/css";

import { ExperimentCard } from "./experiment-card";
import { getChronologicalRenderItems } from "./get-message-render-items";
import { AiAssistantReasoning } from "./reasoning";
import { markdownStyle } from "./shared/markdown-style";
import { SentUsingVoiceMark } from "./shared/sent-using-voice-mark";
import { AiAssistantToolList } from "./tool-list";

import type { PetrinautAiMessage } from "../types";
import type { TranscriptProps } from "./shared/transcript-props";

const messageStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "2",
    padding: "[10px]",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[1.5]",
    color: "neutral.s100",
    userSelect: "text",
  },
  variants: {
    role: {
      assistant: {
        alignSelf: "stretch",
        paddingX: "[0]",
      },
      user: {
        alignSelf: "flex-end",
        maxWidth: "[92%]",
        backgroundColor: "neutral.bg.subtle",
        borderRadius: "lg",
      },
    },
  },
});

// User input isn't Markdown — rendering it as such would mangle stray
// `*`, `_`, `#`, etc. and collapse the single newlines they typed. Render it
// verbatim with preserved whitespace instead.
const userTextStyle = css({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const stoppedNoteStyle = css({
  alignSelf: "center",
  paddingY: "1",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
});

type StockMessageProps = Omit<TranscriptProps, "messages"> & {
  message: PetrinautAiMessage;
  /** Whether this is the reply currently streaming. */
  active: boolean;
};

/**
 * Every part in the order it streamed, wrapped in `React.memo`.
 *
 * The AI SDK rebuilds the `messages` array on every reasoning/text delta but
 * uses `slice` for unchanged messages and only `structuredClone`s the active
 * one. That gives every completed message a stable reference between chunks,
 * so memoising by reference equality lets us skip re-rendering the whole
 * transcript on every chunk — only the message currently being streamed has
 * to re-render.
 */
const StockMessage = memo(
  ({
    handlersRef,
    hiddenToolNames,
    interactiveTools,
    message,
    experimentStates,
    onCancelExperiment,
    resolveToolPresentation,
    stopped,
    active,
  }: StockMessageProps) => {
    const role = message.role === "user" ? "user" : "assistant";
    const wasStopped = stopped || message.metadata?.stopped === true;
    const renderItems = getChronologicalRenderItems(
      message,
      interactiveTools,
      resolveToolPresentation,
      hiddenToolNames,
    );
    const hasVoiceOrigin =
      role === "user" && message.metadata?.source === "voice";
    const firstTextKey =
      renderItems.find((item) => item.type === "text")?.key ?? null;

    return (
      <div
        className={messageStyle({ role })}
        data-role={role}
        data-voice-origin={hasVoiceOrigin || undefined}
      >
        {renderItems.map((item) => {
          switch (item.type) {
            case "text":
              return role === "user" ? (
                <div className={userTextStyle} key={item.key}>
                  {hasVoiceOrigin && item.key === firstTextKey && (
                    <SentUsingVoiceMark />
                  )}
                  <span>{item.part.text}</span>
                </div>
              ) : (
                <div className={markdownStyle} key={item.key}>
                  <ReactMarkdown>{item.part.text}</ReactMarkdown>
                </div>
              );
            case "reasoning":
              return (
                <AiAssistantReasoning
                  key={item.key}
                  isStreaming={active && item.part.state === "streaming"}
                  part={item.part}
                />
              );
            case "experiment":
              return (
                <ExperimentCard
                  key={item.key}
                  part={item.part}
                  state={experimentStates?.[item.part.toolCallId]}
                  onCancel={onCancelExperiment}
                  onSelectToolTarget={(target) =>
                    handlersRef.current.onSelectToolTarget?.(target)
                  }
                />
              );
            case "tools":
              return (
                <AiAssistantToolList
                  key={item.key}
                  tools={item.tools}
                  stopped={wasStopped}
                  onInteractiveToolSubmit={(params) =>
                    handlersRef.current.onInteractiveToolSubmit?.(params)
                  }
                  onSelectToolTarget={(target) =>
                    handlersRef.current.onSelectToolTarget?.(target)
                  }
                />
              );
            default: {
              const exhaustiveCheck: never = item;
              throw new Error(
                `Unknown message part: ${JSON.stringify(exhaustiveCheck)}`,
              );
            }
          }
        })}
        {role === "assistant" && message.metadata?.stopped && (
          <div className={stoppedNoteStyle}>Response stopped</div>
        )}
      </div>
    );
  },
);
StockMessage.displayName = "StockMessage";

export const StockTranscript = ({
  messages,
  stopped,
  busy,
  ...messageProps
}: TranscriptProps & { busy: boolean }) => (
  <>
    {messages.map((message, index) => (
      <StockMessage
        key={message.id}
        message={message}
        {...messageProps}
        stopped={stopped && index === messages.length - 1}
        active={
          busy && index === messages.length - 1 && message.role === "assistant"
        }
      />
    ))}
    {stopped && !messages.at(-1)?.metadata?.stopped && (
      <div className={stoppedNoteStyle}>Response stopped</div>
    )}
  </>
);
