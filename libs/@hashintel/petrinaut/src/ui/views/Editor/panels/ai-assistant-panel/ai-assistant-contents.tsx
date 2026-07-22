import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { getMessageRenderItems } from "./ai-assistant-contents/get-message-render-items";
import {
  PromptChips,
  type PromptChip,
} from "./ai-assistant-contents/prompt-chips";
import { AiAssistantReasoning } from "./ai-assistant-contents/reasoning";
import { markdownStyle } from "./ai-assistant-contents/shared/markdown-style";
import {
  AiAssistantToolList,
  type OnInteractiveToolSubmit,
} from "./ai-assistant-contents/tool-list";

import type { AiToolTarget } from "./tool-summaries";
import type { PetrinautAiMessage } from "./types";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

export type AiAssistantContentsProps = {
  error?: Error;
  input: string;
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  onSendPrompt?: (prompt: string) => void;
  onStop: () => void;
  onSubmit: () => void;
  promptChips?: PromptChip[];
  rightOffset?: number;
  status: AiAssistantStatus;
  stopped?: boolean;
};

const defaultAssistantWidth = 500;

const shellStyle = css({
  position: "absolute",
  top: "0",
  right: "0",
  bottom: "0",
  width: `[${defaultAssistantWidth}px]`,
  maxWidth: "[calc(100vw - 32px)]",
  zIndex: "sticky",
  padding: "2",
  pointerEvents: "auto",
  transition: "[right 150ms ease-in-out]",
  _before: {
    content: '""',
    position: "absolute",
    inset: "2",
    borderRadius: "[14px]",
    background:
      "[radial-gradient(circle at 78% 28%, rgba(52,160,250,0.22), rgba(190,230,255,0.04) 54%, transparent 80%)]",
    filter: "[blur(4px)]",
    pointerEvents: "none",
  },
});

const resizeHandleStyle = css({
  position: "absolute",
  top: "2",
  bottom: "2",
  left: "0",
  width: "[10px]",
  cursor: "ew-resize",
  zIndex: "[1]",
  touchAction: "none",
  _before: {
    content: '""',
    position: "absolute",
    top: "[12px]",
    bottom: "[12px]",
    left: "[4px]",
    width: "[2px]",
    borderRadius: "full",
    backgroundColor: "[transparent]",
    transition: "[background-color 120ms ease-out]",
  },
  _hover: {
    _before: {
      backgroundColor: "neutral.a40",
    },
  },
});

const cardStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s10",
  borderRadius: "[12px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 4px 4px -12px rgba(0,0,0,0.02)]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[1px]",
  paddingX: "1",
  paddingTop: "[6px]",
  borderBottom: "[1px solid rgba(0,0,0,0.08)]",
  flexShrink: 0,
});

const tabStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    height: "[28px]",
    maxWidth: "[112px]",
    paddingX: "3",
    borderTopLeftRadius: "lg",
    borderTopRightRadius: "lg",
    fontSize: "xs",
    fontWeight: "medium",
    lineHeight: "[12px]",
    color: "neutral.s90",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  variants: {
    active: {
      true: {
        backgroundColor: "neutral.s00",
        boxShadow: "[0px 0px 0px 1px rgba(0,0,0,0.08)]",
        color: "neutral.s100",
      },
    },
  },
});

const headerButtonStyle = css({
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
  padding: "2",
});

const emptyStyle = css({
  display: "flex",
  flex: "[1]",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  minHeight: "[240px]",
  color: "neutral.s90",
  textAlign: "center",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[20px]",
  padding: "[20px]",
});

const messageStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "2",
    borderRadius: "xl",
    padding: "[10px]",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[1.5]",
    color: "neutral.s100",
    userSelect: "text",
    boxShadow:
      "[0px 0px 0px 1px rgba(0,0,0,0.07), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 8px 8px -6px rgba(0,0,0,0.04)]",
  },
  variants: {
    role: {
      assistant: {
        alignSelf: "stretch",
        backgroundColor: "white.a95",
      },
      user: {
        alignSelf: "flex-end",
        maxWidth: "[92%]",
        backgroundColor: "neutral.s20",
        textAlign: "right",
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

const errorStyle = css({
  borderRadius: "lg",
  padding: "2",
  backgroundColor: "red.bg.subtle",
  color: "red.s100",
  fontSize: "sm",
  fontWeight: "medium",
  userSelect: "text",
});

const stoppedNoteStyle = css({
  alignSelf: "center",
  paddingY: "1",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
});

const composerWrapStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  backgroundColor: "neutral.bg.subtle",
  flexShrink: 0,
});

const composerStyle = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 4px 4px -12px rgba(0,0,0,0.02)]",
  padding: "1",
});

// Caps how tall the composer can auto-grow before it starts scrolling
// internally. Kept in sync with `maxHeight` below — the auto-grow effect
// reads this constant directly so the two can't drift.
const composerMaxHeight = 160;

const composerTextareaStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  // Matches the previous single-line `size="sm"` input height so the
  // collapsed composer looks unchanged.
  minHeight: "[28px]",
  maxHeight: `[${composerMaxHeight}px]`,
  paddingX: "2",
  paddingY: "[5px]",
  border: "none",
  outline: "none",
  resize: "none",
  overflowY: "auto",
  backgroundColor: "[transparent]",
  color: "neutral.fg.body",
  fontFamily: "[inherit]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.4]",
  // Animates the height changes driven by the auto-grow effect, so adding a
  // line (Shift+Enter) or wrapping expands the box smoothly.
  transition: "[height 120ms ease]",
  _placeholder: {
    color: "neutral.s70",
  },
  _disabled: {
    cursor: "not-allowed",
    color: "neutral.s90",
  },
});

// The scroll effect only needs to know when *anything* changed — it doesn't
// need to capture every byte of every part. Constant-time: look at the last
// message and its last part. This runs on every render during streaming, so
// concatenating every part's full text would burn meaningful CPU once
// transcripts get long.
const getMessagesScrollKey = (messages: PetrinautAiMessage[]): string => {
  if (messages.length === 0) {
    return "0";
  }
  const last = messages[messages.length - 1]!;
  const lastPart = last.parts[last.parts.length - 1];
  let partSignature = "";
  if (lastPart) {
    if (lastPart.type === "text" || lastPart.type === "reasoning") {
      partSignature = `${lastPart.type}:${lastPart.state ?? ""}:${lastPart.text.length}`;
    } else {
      partSignature =
        "state" in lastPart
          ? `${lastPart.type}:${lastPart.state}`
          : lastPart.type;
    }
  }
  return `${messages.length}:${last.id}:${last.parts.length}:${partSignature}`;
};

type MessageHandlersRef = RefObject<{
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
}>;

/**
 * Per-message renderer wrapped in `React.memo`.
 *
 * The AI SDK rebuilds the `messages` array on every reasoning/text delta but
 * uses `slice` for unchanged messages and only `structuredClone`s the active
 * one. That gives every completed message a stable reference between chunks,
 * so memoising by reference equality lets us skip re-rendering the whole transcript on
 * every chunk — only the message currently being streamed has to re-render.
 *
 * Callbacks are forwarded via a ref so identity churn from the panel's inline
 * arrow functions doesn't bust the memo.
 */
const AiAssistantMessage = memo(
  ({
    handlersRef,
    message,
  }: {
    handlersRef: MessageHandlersRef;
    message: PetrinautAiMessage;
  }) => {
    const role = message.role === "user" ? "user" : "assistant";
    const renderItems = getMessageRenderItems(message);

    return (
      <div className={messageStyle({ role })} data-role={role}>
        {renderItems.map((item) => {
          switch (item.type) {
            case "text":
              return role === "user" ? (
                <div className={userTextStyle} key={item.key}>
                  {item.part.text}
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
                  isStreaming={item.part.state === "streaming"}
                  part={item.part}
                />
              );
            case "tools":
              return (
                <AiAssistantToolList
                  key={item.key}
                  tools={item.tools}
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
      </div>
    );
  },
);
AiAssistantMessage.displayName = "AiAssistantMessage";

export const AiAssistantContents = ({
  error,
  input,
  messages,
  onClearMessages,
  onClose,
  onInputChange,
  onInteractiveToolSubmit,
  onSelectToolTarget,
  onSendPrompt,
  onStop,
  onSubmit,
  promptChips,
  rightOffset = 0,
  status,
  stopped = false,
}: AiAssistantContentsProps) => {
  const isBusy = status === "submitted" || status === "streaming";
  const canSubmit = input.trim().length > 0 && !isBusy;

  const [assistantWidth, setAssistantWidth] = useState(defaultAssistantWidth);

  const [chipsDismissed, setChipsDismissed] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const showChips =
    !chipsDismissed &&
    onSendPrompt !== undefined &&
    promptChips !== undefined &&
    promptChips.length > 0;

  // Stable container for the per-render callbacks so `AiAssistantMessage`'s
  // memo comparator doesn't see identity churn from the panel's inline
  // arrow functions on every render. The ref itself is stable across renders,
  // so memoised children never re-render due to handler changes — but we
  // refresh `.current` in an effect so any new closure capture is picked up
  // by the next event.
  const handlersRef = useRef({
    onInteractiveToolSubmit,
    onSelectToolTarget,
  });
  useEffect(() => {
    handlersRef.current = { onInteractiveToolSubmit, onSelectToolTarget };
  });

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = assistantWidth;
    const maxWidth = Math.min(window.innerWidth - 32, 720);

    const onPointerMove = (moveEvent: PointerEvent) => {
      setAssistantWidth(
        Math.min(
          Math.max(startWidth + startX - moveEvent.clientX, 320),
          maxWidth,
        ),
      );
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-grow the composer to fit its content (up to `composerMaxHeight`,
  // after which it scrolls internally). Resetting to `auto` before measuring
  // `scrollHeight` lets the box shrink again when text is removed; both writes
  // happen synchronously so the browser only paints the final height and the
  // CSS `height` transition animates the change.
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, composerMaxHeight)}px`;
  }, [input]);

  const hasScrolledOnceRef = useRef(false);

  useEffect(() => {
    const isFirstScroll = !hasScrolledOnceRef.current;
    hasScrolledOnceRef.current = true;
    const scrollToEnd = () => {
      // The inner optional chain (`scrollIntoView?.`) is intentional — jsdom
      // omits `Element.prototype.scrollIntoView`, so unit tests need the
      // graceful no-op. The lint rule can't see that.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      messagesEndRef.current?.scrollIntoView?.({
        block: "end",
        behavior: isFirstScroll ? "instant" : "smooth",
      });
    };
    const frameId = window.requestAnimationFrame(scrollToEnd);

    return () => window.cancelAnimationFrame(frameId);
  }, [messagesScrollKey, status]);

  return (
    <aside
      className={shellStyle}
      style={{ right: rightOffset, width: assistantWidth }}
      aria-label="AI assistant"
    >
      <div
        aria-label="Resize AI assistant"
        className={resizeHandleStyle}
        onPointerDown={onResizeStart}
        role="separator"
      />
      <div className={cardStyle}>
        <div className={headerStyle}>
          <div className={tabStyle({ active: true })}>AI</div>
          <div style={{ flex: 1 }} />
          <Button
            size="xs"
            variant="ghost"
            tone="error"
            className={headerButtonStyle}
            aria-label="Clear AI chat"
            disabled={messages.length === 0}
            onClick={onClearMessages}
            iconName="trash"
            tooltip="Clear AI chat"
          />
          <Button
            size="xs"
            variant="ghost"
            className={headerButtonStyle}
            aria-label="Close AI assistant"
            onClick={onClose}
            iconName="close"
            tooltip="Close AI assistant"
          />
        </div>

        <div className={messagesStyle}>
          {messages.length === 0 && (
            <div className={emptyStyle}>
              <AiAssistantIcon size={28} />
              <div>
                Ask AI to create a Petri net, explain or revise the current
                model.
              </div>
            </div>
          )}
          {messages.map((message) => (
            <AiAssistantMessage
              key={message.id}
              message={message}
              handlersRef={handlersRef}
            />
          ))}
          {error && <div className={errorStyle}>{error.message}</div>}
          {stopped && !error && (
            <div className={stoppedNoteStyle}>Response stopped</div>
          )}
          <div ref={messagesEndRef} />
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) {
                onSubmit();
              }
            }}
          >
            <div className={composerStyle}>
              <textarea
                ref={inputRef}
                className={composerTextareaStyle}
                rows={1}
                value={input}
                disabled={isBusy}
                onChange={(event) => onInputChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  // Enter sends; Shift+Enter inserts a newline (the textarea's
                  // native behaviour, so we just let it through). The
                  // `isComposing` guard stops an IME confirmation keystroke
                  // from sending a half-finished message.
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    if (canSubmit) {
                      onSubmit();
                    }
                  }
                }}
                placeholder={
                  isBusy
                    ? "Waiting for response..."
                    : messages.length === 0
                      ? "Get creating..."
                      : "Continue iterating..."
                }
                aria-label="Message AI assistant"
              />
              <Button
                type={isBusy ? "button" : "submit"}
                size="sm"
                variant={isBusy ? "subtle" : "solid"}
                tone={isBusy ? "neutral" : "brand"}
                disabled={!isBusy && !canSubmit}
                aria-label={isBusy ? "Stop AI response" : "Send message"}
                onClick={() => {
                  if (isBusy) {
                    onStop();
                  }
                }}
                iconName={isBusy ? "stopFilled" : "arrowUp"}
                tooltip={isBusy ? "Stop AI response" : "Send message"}
              />
            </div>
          </form>
        </div>
      </div>
    </aside>
  );
};
