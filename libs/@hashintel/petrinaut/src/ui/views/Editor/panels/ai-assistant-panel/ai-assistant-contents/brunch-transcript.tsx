import { memo, use, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { NotificationsContext } from "../../../../../../react/notifications/context";
import { ExperimentalIcon } from "../../../../../experimental-icons";
import {
  BrunchWorkFold,
  BrunchWorkPending,
} from "./brunch-transcript/brunch-work-fold";
import { VoiceInputProvenance } from "./brunch-transcript/voice-input-provenance";
import { ExperimentCard } from "./experiment-card";
import { getMessageRenderItems } from "./get-message-render-items";
import { AiAssistantReasoning } from "./reasoning";
import { errorNotification } from "./shared/error-notification";
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
        gap: "1",
        padding: "[6px 0]",
        '&[data-input-mode="text"]': {
          paddingY: "1",
          '& > [data-answer="brunch"]:not(:first-child)': { marginTop: "1" },
          "@media (hover: hover) and (pointer: fine)": {
            "&:not([data-latest-answer]):not(:hover):not(:focus-within) > [data-answer-actions]":
              {
                opacity: "0",
                pointerEvents: "none",
              },
          },
        },
      },
      user: {
        alignSelf: "flex-end",
        maxWidth: "[92%]",
        gap: "0.5",
        padding: "[0]",
      },
    },
  },
});

// User input isn't Markdown — rendering it as such would mangle stray
// `*`, `_`, `#`, etc. and collapse the single newlines they typed. Render it
// verbatim with preserved whitespace instead.
const userTextStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "1.5",
  alignSelf: "flex-end",
  backgroundColor: "neutral.a20",
  borderRadius: "lg",
  padding: "[10px]",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const answerStyle = css({
  alignSelf: "flex-start",
  maxWidth: "[92%]",
  backgroundColor: "blue.a20",
  borderRadius: "lg",
  padding: "[10px]",
  color: "neutral.s100",
  overflowWrap: "anywhere",
  '&[data-streaming="true"]': {
    animation: "[petrinautComposerActionSwap 180ms ease-out]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    animation: "[none]",
  },
  "[data-work-status] &": {
    alignSelf: "stretch",
    maxWidth: "full",
    backgroundColor: "neutral.s00",
    border: "[1px solid {colors.neutral.a30}]",
  },
});

const stoppedNoteStyle = css({
  alignSelf: "center",
  marginTop: "1.5",
  paddingY: "1",
  fontSize: "xs",
  color: "neutral.s80",
});

const StreamingWords = ({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) =>
  streaming
    ? [...text.matchAll(/\S+\s*|\s+/gu)].map((word) => (
        <span
          key={word.index}
          data-streamed-word
          className={css({
            animation: "[petrinautComposerActionSwap 180ms ease-out]",
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          })}
        >
          {word[0]}
        </span>
      ))
    : text;

type BrunchMessageProps = Omit<TranscriptProps, "messages"> & {
  message: PetrinautAiMessage;
  voice: boolean;
  active: boolean;
  canRetry: boolean;
  latestAnswer: boolean;
};

/**
 * One conversation turn: the user's bubble, the work fold, the written answer
 * and any produced cards, wrapped in `React.memo`.
 *
 * The AI SDK rebuilds the `messages` array on every reasoning/text delta but
 * uses `slice` for unchanged messages and only `structuredClone`s the active
 * one. That gives every completed message a stable reference between chunks,
 * so memoising by reference equality lets us skip re-rendering the whole
 * transcript on every chunk — only the message currently being streamed has
 * to re-render.
 */
const BrunchMessage = memo(
  ({
    handlersRef,
    hiddenToolNames,
    interactiveTools,
    message,
    experimentStates,
    onCancelExperiment,
    resolveToolPresentation,
    voice,
    active,
    stopped,
    canRetry,
    latestAnswer,
  }: BrunchMessageProps) => {
    const { addNotification } = use(NotificationsContext);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
      if (!copied) return;
      const timer = window.setTimeout(() => setCopied(false), 1_200);
      return () => window.clearTimeout(timer);
    }, [copied]);
    const role = message.role === "user" ? "user" : "assistant";
    const renderItems = getMessageRenderItems(
      message,
      interactiveTools,
      resolveToolPresentation,
      hiddenToolNames,
    );
    const { work, answers, cards, brief, voiceAgentReply, voiceAgentWrapUp } =
      renderItems;
    const wasStopped = stopped || message.metadata?.stopped === true;
    const awaitingApproval = work.tools.some(
      (tool) => tool.interactive && tool.state === "input-available",
    );
    const workStatus = wasStopped
      ? "stopped"
      : awaitingApproval
        ? "approval"
        : active
          ? "streaming"
          : "settled";
    const writtenAnswer =
      answers.length > 0 ? (
        <div
          className={answerStyle}
          data-answer="brunch"
          data-streaming={active || undefined}
        >
          {answers.map((item) => (
            <div className={markdownStyle} key={item.key}>
              <ReactMarkdown>{item.part.text}</ReactMarkdown>
            </div>
          ))}
        </div>
      ) : null;
    // Voice renders the written answer inside the fold; Chat renders it below.
    const showWork =
      role === "assistant" &&
      (active ||
        wasStopped ||
        work.reasoning.length > 0 ||
        work.tools.length > 0 ||
        (voice && answers.length > 0));

    return (
      <div
        className={messageStyle({ role })}
        data-role={role}
        data-input-mode={voice ? "voice" : "text"}
        data-latest-answer={latestAnswer || undefined}
        data-voice-origin={message.metadata?.source === "voice" || undefined}
      >
        {role === "user" && (
          <div className={userTextStyle} data-user-bubble>
            {!voice && message.metadata?.source === "voice" && (
              <SentUsingVoiceMark />
            )}
            <div className={css({ minWidth: "[0]" })}>
              {answers.map((item) => (
                <div key={item.key}>
                  <StreamingWords
                    text={item.part.text}
                    streaming={
                      item.part.state === "streaming" &&
                      message.metadata?.source === "voice"
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {brief && <VoiceInputProvenance brief={brief} />}
        {voiceAgentReply && (
          <div
            className={answerStyle}
            data-answer="voice-reply"
            aria-busy={voiceAgentReply.state === "streaming"}
          >
            <StreamingWords
              text={voiceAgentReply.text}
              streaming={voiceAgentReply.state === "streaming"}
            />
          </div>
        )}
        {showWork && (
          <BrunchWorkFold status={workStatus} preserveOpen>
            {work.reasoning.map((item) => (
              <AiAssistantReasoning
                key={item.key}
                isStreaming={active && item.part.state === "streaming"}
                expandWhileStreaming={!voice}
                part={item.part}
                presentation="brunch"
              />
            ))}
            <AiAssistantToolList
              tools={work.tools}
              active={active}
              stopped={wasStopped}
              preserveOpen
              presentation="brunch"
              onInteractiveToolSubmit={(params) =>
                handlersRef.current.onInteractiveToolSubmit?.(params)
              }
              onSelectToolTarget={(target) =>
                handlersRef.current.onSelectToolTarget?.(target)
              }
            />
            {voice && writtenAnswer}
            {voice && active && !writtenAnswer && (
              <div className={answerStyle} role="status" aria-label="Thinking">
                {["92%", "74%", "46%"].map((width) => (
                  <span
                    key={width}
                    style={{ width }}
                    className={css({
                      display: "block",
                      height: "[10px]",
                      marginY: "2",
                      borderRadius: "sm",
                      backgroundColor: "neutral.a30",
                      animation: "[pulse 1.6s ease-in-out infinite]",
                      "@media (prefers-reduced-motion: reduce)": {
                        animation: "none",
                      },
                    })}
                  />
                ))}
              </div>
            )}
          </BrunchWorkFold>
        )}
        {role === "assistant" && !voice && writtenAnswer}
        {cards.map((item) =>
          item.type === "experiment" ? (
            <ExperimentCard
              key={item.key}
              part={item.part}
              state={experimentStates?.[item.part.toolCallId]}
              onCancel={onCancelExperiment}
            />
          ) : (
            <AiAssistantToolList
              key={item.key}
              tools={[item.tool]}
              producedCard
              presentation="brunch"
              onInteractiveToolSubmit={(params) =>
                handlersRef.current.onInteractiveToolSubmit?.(params)
              }
              onSelectToolTarget={(target) =>
                handlersRef.current.onSelectToolTarget?.(target)
              }
            />
          ),
        )}
        {voiceAgentWrapUp && (
          <div
            className={answerStyle}
            data-answer="voice-wrap-up"
            aria-busy={voiceAgentWrapUp.state === "streaming"}
          >
            <StreamingWords
              text={voiceAgentWrapUp.text}
              streaming={voiceAgentWrapUp.state === "streaming"}
            />
          </div>
        )}
        {role === "assistant" && wasStopped && (
          <div className={stoppedNoteStyle}>Response stopped</div>
        )}
        {role === "assistant" && !voice && writtenAnswer && !active && (
          <div
            className={css({
              display: "flex",
              gap: "1",
              color: "neutral.s80",
            })}
            data-answer-actions
          >
            <Button
              size="xs"
              variant="ghost"
              aria-label={copied ? "Answer copied" : "Copy answer"}
              tooltip={copied ? "Copied" : "Copy"}
              prefix={
                <ExperimentalIcon name={copied ? "check" : "copy"} size={14} />
              }
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(
                      answers.map((answer) => answer.part.text).join("\n\n"),
                    );
                    setCopied(true);
                  } catch {
                    addNotification(
                      errorNotification("Could not copy the answer"),
                    );
                  }
                })();
              }}
            />
            {canRetry && (
              <Button
                size="xs"
                variant="ghost"
                aria-label="Retry answer"
                tooltip="Retry as a new turn"
                prefix={<ExperimentalIcon name="rotate" size={14} />}
                onClick={() => handlersRef.current.onRetryMessage(message.id)}
              />
            )}
          </div>
        )}
      </div>
    );
  },
);
BrunchMessage.displayName = "BrunchMessage";

export const BrunchTranscript = ({
  messages,
  stopped,
  busy,
  canRetry,
  voice,
  ...messageProps
}: TranscriptProps & {
  busy: boolean;
  /** Whether a finished answer may be retried at all right now. */
  canRetry: boolean;
  voice: boolean;
}) => {
  const firstUserIndex = messages.findIndex(
    (message) => message.role === "user",
  );
  const latestAnswerId = messages.findLast(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) => part.type === "text" && part.text.trim().length > 0,
      ),
  )?.id;
  const lastIndex = messages.length - 1;

  return (
    <>
      {messages.map((message, index) => (
        <BrunchMessage
          key={message.id}
          message={message}
          {...messageProps}
          voice={voice}
          latestAnswer={message.id === latestAnswerId}
          canRetry={canRetry && firstUserIndex >= 0 && index > firstUserIndex}
          active={busy && index === lastIndex && message.role === "assistant"}
          stopped={stopped && index === lastIndex}
        />
      ))}
      {busy && messages.at(-1)?.role !== "assistant" && (
        <div
          className={messageStyle({ role: "assistant" })}
          data-role="assistant"
          data-input-mode={voice ? "voice" : "text"}
        >
          <BrunchWorkPending label="Waiting for Brunch" />
        </div>
      )}
      {stopped && messages.at(-1)?.role === "user" && (
        <div className={stoppedNoteStyle}>Response stopped</div>
      )}
    </>
  );
};
