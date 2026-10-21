import { useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { ExperimentalIcon } from "@hashintel/petrinaut/ui";
import { AssistantPanelTitle } from "@hashintel/petrinaut/ui/plugin";

import { useAssistantChatApi } from "./chat-api";
import { AiAssistantComposer } from "./chat-view/composer";
import { errorNotification } from "./chat-view/error-notification";
import { aiFooterMinHeight } from "./chat-view/footer-height";
import { PromptChips, type PromptChip } from "./chat-view/prompt-chips";
import { Transcript } from "./chat-view/transcript";

import type { PetrinautAiMessage } from "../ai-message";
import type { AiExperimentState } from "./chat-view/experiment-card";
import type { OnInteractiveToolSubmit } from "./chat-view/tool-list";
import type { AiToolTarget } from "./tool-summaries";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

type ChatViewProps = {
  error?: Error;
  experimentStates?: Record<string, AiExperimentState>;
  onCancelExperiment?: (toolCallId: string) => void;
  input: string;
  isOpen?: boolean;
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onInputChange: (value: string) => void;
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  onSendPrompt?: (prompt: string) => void;
  onStop: () => void;
  onSubmit: () => void;
  promptChips?: PromptChip[];
  status: AiAssistantStatus;
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
  minHeight: `[${aiFooterMinHeight}px]`,
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
  experimentStates,
  onCancelExperiment,
  error,
  input,
  isOpen = true,
  messages,
  onClearMessages,
  onInputChange,
  onInteractiveToolSubmit,
  onSelectToolTarget,
  onSendPrompt,
  onStop,
  onSubmit,
  promptChips,
  status,
  stopped = false,
}: ChatViewProps) => {
  const { notifications } = useAssistantChatApi();
  const isBusy = status === "submitted" || status === "streaming";

  const [chipsDismissed, setChipsDismissed] = useState(false);

  const notifiedErrorRef = useRef<Error | undefined>(undefined);
  useEffect(() => {
    if (!error) {
      notifiedErrorRef.current = undefined;
      return;
    }
    if (notifiedErrorRef.current === error) {
      return;
    }
    notifiedErrorRef.current = error;
    notifications.add(errorNotification("AI assistant error", error.message));
  }, [notifications, error]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const showChips =
    !chipsDismissed &&
    onSendPrompt !== undefined &&
    promptChips !== undefined &&
    promptChips.length > 0;

  // Stable container for the per-render callbacks so the memoised transcript
  // messages don't see identity churn from the panel's inline arrow functions
  // on every render. The ref itself is stable across renders, so memoised
  // children never re-render due to handler changes — but we refresh
  // `.current` in an effect so any new closure capture is picked up by the
  // next event.
  const handlersRef = useRef({ onInteractiveToolSubmit, onSelectToolTarget });
  useEffect(() => {
    handlersRef.current = { onInteractiveToolSubmit, onSelectToolTarget };
  });

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
  }, [messagesScrollKey, status]);

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
          experimentStates={experimentStates}
          handlersRef={handlersRef}
          messages={messages}
          onCancelExperiment={onCancelExperiment}
          stopped={stopped && !error}
          busy={isBusy}
        />
      </div>

      <div className={composerWrapStyle}>
        {showChips && (
          <PromptChips
            chips={promptChips}
            disabled={isBusy}
            onDismiss={() => setChipsDismissed(true)}
            onSelect={(prompt) => onSendPrompt(prompt)}
          />
        )}
        <AiAssistantComposer
          busy={isBusy}
          hasHistory={messages.length > 0}
          input={input}
          inputRef={inputRef}
          isOpen={isOpen}
          onInputChange={onInputChange}
          onStop={onStop}
          onSubmit={onSubmit}
        />
      </div>
    </>
  );
};
