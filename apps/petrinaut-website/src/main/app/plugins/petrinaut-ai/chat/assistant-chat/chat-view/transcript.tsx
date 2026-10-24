import ReactMarkdown from "react-markdown";

import { css, cva } from "@hashintel/ds-helpers/css";

import { ExperimentCard } from "./experiment-card";
import { getChronologicalRenderItems } from "./get-message-render-items";
import { AiAssistantReasoning } from "./reasoning";
import { markdownStyle } from "./shared/markdown-style";
import { AiAssistantToolList, type OnInteractiveToolSubmit } from "./tool-list";

import type { PetrinautAiMessage } from "../../ai-message";
import type { AiExperimentState } from "./experiment-card";

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

type TranscriptProps = {
  experimentStates?: Record<string, AiExperimentState>;
  messages: PetrinautAiMessage[];
  onCancelExperiment?: (toolCallId: string) => void;
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  /** Whether the last reply is still streaming or running its tools. */
  busy: boolean;
  /** Whether the user stopped the last reply. */
  stopped: boolean;
};

type MessageProps = Omit<TranscriptProps, "messages" | "busy"> & {
  message: PetrinautAiMessage;
  /** Whether this is the reply currently streaming. */
  active: boolean;
};

/** Every part of a message in the order it streamed. */
const Message = ({
  message,
  experimentStates,
  onCancelExperiment,
  onInteractiveToolSubmit,
  stopped,
  active,
}: MessageProps) => {
  const role = message.role === "user" ? "user" : "assistant";

  return (
    <div className={messageStyle({ role })} data-role={role}>
      {getChronologicalRenderItems(message).map((item) => {
        switch (item.type) {
          case "text":
            return role === "user" ? (
              <div className={userTextStyle} key={item.key}>
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
              />
            );
          case "tools":
            return (
              <AiAssistantToolList
                key={item.key}
                tools={item.tools}
                stopped={stopped}
                onInteractiveToolSubmit={onInteractiveToolSubmit}
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
    </div>
  );
};

/** The conversation's messages, with a note when its last reply stopped. */
export const Transcript = ({
  messages,
  busy,
  stopped,
  ...messageProps
}: TranscriptProps) => (
  <>
    {messages.map((message, index) => {
      const last = index === messages.length - 1;

      return (
        <Message
          key={message.id}
          message={message}
          {...messageProps}
          stopped={stopped && last}
          active={busy && last && message.role === "assistant"}
        />
      );
    })}
    {stopped && <div className={stoppedNoteStyle}>Response stopped</div>}
  </>
);
