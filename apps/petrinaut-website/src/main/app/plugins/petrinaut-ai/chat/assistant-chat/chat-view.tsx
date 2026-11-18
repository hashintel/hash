import { useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { ExperimentalIcon } from "@hashintel/petrinaut/ui";
import { AssistantPanelTitle } from "@hashintel/petrinaut/ui/plugin";

import { AiAssistantComposer } from "./chat-view/composer";
import { PromptChips, type PromptChip } from "./chat-view/prompt-chips";
import { Transcript } from "./chat-view/transcript";

import type { PetrinautAiMessage } from "../ai-message";
import type { AiExperimentState } from "./chat-view/experiment-card";
import type { OnInteractiveToolSubmit } from "./chat-view/tool-list";

type ChatViewProps = {
  /** Whether the reply is streaming or running its tools. */
  busy?: boolean;
  experimentStates?: Record<string, AiExperimentState>;
  onCancelExperiment?: (toolCallId: string) => void;
  input: string;
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onInputChange: (value: string) => void;
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSendPrompt?: (prompt: string) => void;
  onStop: () => void;
  onSubmit: () => void;
  promptChips?: PromptChip[];
  stopped?: boolean;
};

const titleButtonStyle = css({
  position: "relative",
  color: "neutral.s90",
  _hover: {
    color: "neutral.s110",
  },
});

const messagesStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
  padding: "3",
  overscrollBehavior: "contain",
});

const emptyStyle = css({
  display: "flex",
  flex: "[1]",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "[240px]",
  color: "neutral.s90",
  textAlign: "center",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[20px]",
  padding: "[20px]",
});

const composerWrapStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "2",
  padding: "3",
  borderTop: "[1px solid {colors.neutral.bd.subtle}]",
  backgroundColor: "neutral.s00",
  flexShrink: 0,
  boxSizing: "border-box",
  minHeight: "[56px]",
});

const getPartScrollSignature = (
  part: PetrinautAiMessage["parts"][number],
): string => {
  if (part.type === "text" || part.type === "reasoning") {
    return `${part.type}:${part.state ?? ""}:${part.text.length}`;
  }
  return "state" in part ? `${part.type}:${part.state}` : part.type;
};

// The scroll effect only needs to know when *anything* changed — it doesn't
// need to capture every byte of every part. Look only at the last part of the
// last message. This runs on every render during streaming, so concatenating
// every part's full text would burn meaningful CPU once transcripts get long.
const getMessagesScrollKey = (messages: PetrinautAiMessage[]): string => {
  if (messages.length === 0) {
    return "0";
  }
  const last = messages[messages.length - 1]!;
  const lastPart = last.parts[last.parts.length - 1];
  const partSignature = lastPart ? getPartScrollSignature(lastPart) : "";
  return `${messages.length}:${last.id}:${last.parts.length}:${partSignature}`;
};

/** The chat's title bar, transcript, prompt chips and composer. */
export const ChatView = ({
  busy = false,
  experimentStates,
  onCancelExperiment,
  input,
  messages,
  onClearMessages,
  onInputChange,
  onInteractiveToolSubmit,
  onSendPrompt,
  onStop,
  onSubmit,
  promptChips,
  stopped = false,
}: ChatViewProps) => {
  const [chipsDismissed, setChipsDismissed] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const showChips =
    !chipsDismissed &&
    onSendPrompt !== undefined &&
    promptChips !== undefined &&
    promptChips.length > 0;

  const hasScrolledOnceRef = useRef(false);

  // The transcript follows new output to its end.
  useEffect(() => {
    const isFirstScroll = !hasScrolledOnceRef.current;
    hasScrolledOnceRef.current = true;
    const scrollToEnd = () => {
      // Scroll only the transcript: the panel may be sliding outside the editor.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      messagesRef.current?.scrollTo?.({
        top: messagesRef.current.scrollHeight,
        behavior: isFirstScroll ? "instant" : "smooth",
      });
    };
    const frameId = window.requestAnimationFrame(scrollToEnd);

    return () => window.cancelAnimationFrame(frameId);
  }, [messagesScrollKey, busy]);

  return (
    <>
      <AssistantPanelTitle
        actions={
          messages.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              tone="error"
              className={titleButtonStyle}
              aria-label="Clear AI chat"
              onClick={onClearMessages}
              prefix={<ExperimentalIcon name="trash" size={14} />}
              tooltip="Clear AI chat"
            />
          )
        }
      >
        <span>AI</span>
      </AssistantPanelTitle>
      <div
        className={messagesStyle}
        data-testid="ai-transcript"
        ref={messagesRef}
      >
        {messages.length === 0 && (
          <div className={emptyStyle}>
            Ask AI to create a Petri net, explain or revise the current model.
          </div>
        )}
        <Transcript
          busy={busy}
          experimentStates={experimentStates}
          messages={messages}
          onCancelExperiment={onCancelExperiment}
          onInteractiveToolSubmit={onInteractiveToolSubmit}
          stopped={stopped}
        />
      </div>

      <div className={composerWrapStyle}>
        {showChips && (
          <PromptChips
            chips={promptChips}
            disabled={busy}
            onDismiss={() => setChipsDismissed(true)}
            onSelect={(prompt) => onSendPrompt(prompt)}
          />
        )}
        <AiAssistantComposer
          busy={busy}
          hasHistory={messages.length > 0}
          input={input}
          onInputChange={onInputChange}
          onStop={onStop}
          onSubmit={onSubmit}
        />
      </div>
    </>
  );
};
