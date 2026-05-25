import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { css, cva } from "@hashintel/ds-helpers/css";

import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { Button } from "../../../../components/button";
import { Input } from "../../../../components/input";
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
};

const shellStyle = css({
  position: "absolute",
  top: "0",
  right: "0",
  bottom: "0",
  width: "[420px]",
  maxWidth: "[calc(100vw - 32px)]",
  zIndex: 1090,
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
  zIndex: 1,
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

const errorStyle = css({
  borderRadius: "lg",
  padding: "2",
  backgroundColor: "red.bg.subtle",
  color: "red.s100",
  fontSize: "sm",
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
  alignItems: "center",
  gap: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 4px 4px -12px rgba(0,0,0,0.02)]",
  padding: "1",
});

const inputStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  width: "auto",
  borderColor: "[transparent]",
  backgroundColor: "[transparent]",
  boxShadow: "[none]",
  _hover: {
    borderColor: "[transparent]",
  },
  _focus: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
  _active: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
  _placeholder: {
    color: "neutral.s70",
  },
});

const getMessagesScrollKey = (messages: PetrinautAiMessage[]): string =>
  messages
    .map((message) =>
      [
        message.id,
        message.parts
          .map((part) => {
            if (part.type === "text" || part.type === "reasoning") {
              return `${part.type}:${part.state ?? ""}:${part.text}`;
            }

            return "state" in part ? `${part.type}:${part.state}` : part.type;
          })
          .join(","),
      ].join(":"),
    )
    .join("|");

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
}: AiAssistantContentsProps) => {
  const isBusy = status === "submitted" || status === "streaming";
  const canSubmit = input.trim().length > 0 && !isBusy;
  const [assistantWidth, setAssistantWidth] = useState(420);
  // In-memory only — resets when the panel is closed and reopened, so
  // dismissing the chips is a single-session preference.
  const [chipsDismissed, setChipsDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);
  const showChips =
    !chipsDismissed &&
    onSendPrompt !== undefined &&
    promptChips !== undefined &&
    promptChips.length > 0;

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

  useEffect(() => {
    const scrollToEnd = () => {
      // The inner optional chain (`scrollIntoView?.`) is intentional — jsdom
      // omits `Element.prototype.scrollIntoView`, so unit tests need the
      // graceful no-op. The lint rule can't see that.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      messagesEndRef.current?.scrollIntoView?.({
        block: "end",
        behavior: "smooth",
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
          <div className={tabStyle({ active: true })}>Petrinaut AI</div>
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
            tooltipDisplay="inline"
          />
          <Button
            size="xs"
            variant="ghost"
            className={headerButtonStyle}
            aria-label="Close AI assistant"
            onClick={onClose}
            iconName="close"
            tooltip="Close AI assistant"
            tooltipDisplay="inline"
          />
        </div>

        <div className={messagesStyle}>
          {messages.length === 0 && (
            <div className={emptyStyle}>
              <AiAssistantIcon size={28} />
              <div>
                Ask Petrinaut AI to create a Petri net, explain or revise the
                current model.
              </div>
            </div>
          )}
          {messages.map((message) => {
            const role = message.role === "user" ? "user" : "assistant";
            const renderItems = getMessageRenderItems(message);

            return (
              <div
                key={message.id}
                className={messageStyle({ role })}
                data-role={role}
              >
                {renderItems.map((item) => {
                  switch (item.type) {
                    case "text":
                      return (
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
                          onInteractiveToolSubmit={onInteractiveToolSubmit}
                          onSelectToolTarget={onSelectToolTarget}
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
          })}
          {error && <div className={errorStyle}>{error.message}</div>}
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
              <Input
                ref={inputRef}
                className={inputStyle}
                size="sm"
                value={input}
                onChange={(event) => onInputChange(event.currentTarget.value)}
                placeholder={
                  messages.length === 0
                    ? "Get creating..."
                    : "Continue iterating..."
                }
                aria-label="Message Petrinaut AI"
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
                tooltipDisplay="inline"
              />
            </div>
          </form>
        </div>
      </div>
    </aside>
  );
};
