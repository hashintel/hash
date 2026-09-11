import {
  memo,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import {
  NotificationsContext,
  type AddNotificationInput,
} from "../../../../../react/notifications/context";
import { EditorContext } from "../../../../../react/state/editor-context";
import {
  useVoiceSessionErrorMessage,
  useVoiceSessionPhase,
} from "../../../../../react/voice-session/use-voice-session";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { HorizontalTabsHeader } from "../../../../components/sub-view/horizontal/horizontal-tabs-container";
import { ResizeHandle } from "../../../../resize/resize-handle";
import { AiVoiceModeIcon } from "../../components/ai-voice-mode-button";
import { voiceSetupLabels } from "../../components/voice-session-labels";
import { aiFooterMinHeight } from "./ai-assistant-contents/footer-height";
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
import { useFloatingPosition } from "./ai-assistant-contents/use-floating-position";
import { LiveVoiceDock, VoiceDock } from "./ai-assistant-contents/voice-dock";
import { VoiceInputProvenance } from "./ai-assistant-contents/voice-input-provenance";

import type { PetrinautAiAssistant } from "../../../../petrinaut";
import type { PetrinautAiInputMode } from "../../../../types/ai-assistant-composer-control";
import type { PetrinautAiInteractiveTool } from "../../../../types/ai-interactive-tool";
import type { AiToolTarget } from "./tool-summaries";
import type { PetrinautAiMessage } from "./types";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

const EMPTY_INTERACTIVE_TOOLS: readonly PetrinautAiInteractiveTool[] = [];

const errorNotification = (
  message: string,
  detail?: string,
): AddNotificationInput => ({ detail, message, tone: "error" });

export type AiAssistantContentsProps = {
  additionalTab?: PetrinautAiAssistant["additionalTab"];
  clearMessagesDisabled?: boolean;
  composerControl?: ReactNode;
  composerFocusRequest?: number;
  error?: Error;
  input: string;
  inputMode?: PetrinautAiInputMode;
  interactiveTools?: readonly PetrinautAiInteractiveTool[];
  isOpen?: boolean;
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onClose: () => void;
  onCollapsedVoiceEnd?: () => void;
  onInputModeChange?: (mode: PetrinautAiInputMode) => void;
  onInputChange: (value: string) => void;
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  onSendPrompt?: (prompt: string) => void;
  onStop: () => void;
  onSubmit: () => void;
  onVoiceDockCollapsedChange?: (collapsed: boolean) => void;
  promptChips?: PromptChip[];
  status: AiAssistantStatus;
  stopped?: boolean;
  voiceHandoffPending?: boolean;
  voiceDockCollapsed?: boolean;
  voiceMode?: ReactNode;
  voiceModeAvailable?: boolean;
};

const dockSpaceStyle = css({
  flexShrink: 0,
  minWidth: "[0]",
  maxWidth: "[100%]",
  pointerEvents: "none",
  '&[data-animating="true"]': {
    transition: "[width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
});

const shellStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    right: "[0]",
    height: "full",
    maxHeight: "full",
    maxWidth: "full",
    transform: "[translateX(0)]",
    visibility: "visible",
    zIndex: "[calc(var(--z-index-sticky) + 2)]",
    pointerEvents: "auto",
    '&[data-animating="true"]': {
      transition:
        "[top 150ms ease-in-out, right 150ms ease-in-out, height 150ms ease-in-out, max-height 150ms ease-in-out, transform 150ms ease-in-out, visibility 0s]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    floating: {
      true: {
        top: "[12px]",
        right: "[12px]",
        height: "[calc(100% - 24px)]",
        maxHeight: "[640px]",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
    open: {
      false: {
        transform: "[translateX(100%)]",
        visibility: "hidden",
        pointerEvents: "none",
        '&[data-animating="true"]': {
          transitionDelay: "[0s, 0s, 0s, 0s, 0s, 150ms]",
        },
      },
    },
    collapsed: {
      true: {
        top: "[auto]",
        bottom: "[12px]",
        right: "[12px]",
        height: "auto",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
  },
});

const resizeAnchorStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  width: "[0]",
});

const cardStyle = cva({
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "full",
    overflow: "hidden",
    backgroundColor: "neutral.s00",
    borderLeft: "[1px solid {colors.neutral.bd.subtle}]",
    borderRadius: "[0]",
    '&[data-animating="true"]': {
      transition:
        "[border-radius 150ms ease-in-out, box-shadow 150ms ease-in-out]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    floating: {
      true: {
        borderLeftColor: "[transparent]",
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
    },
  },
});

const panelContentStyle = cva({
  variants: {
    visible: {
      false: { display: "none" },
    },
  },
});

const voiceModeStyle = css({
  position: "relative",
  zIndex: "[2]",
  flexShrink: "0",
  overflow: "visible",
  pointerEvents: "auto",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[40px]",
  paddingLeft: "3",
  paddingRight: "2",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
});

const headerLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "[1]",
  minWidth: "[0]",
  color: "neutral.fg.heading",
  fontSize: "sm",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  border: "none",
  padding: "[0]",
  backgroundColor: "[transparent]",
  textAlign: "left",
  _enabled: { cursor: "grab", touchAction: "none" },
  _active: { cursor: "grabbing" },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[4px]",
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
  padding: "3",
  overscrollBehavior: "contain",
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
  animationName: "[petrinautVoiceSwap]",
  animationDuration: "[200ms]",
  animationTimingFunction: "[ease-out]",
  "@media (prefers-reduced-motion: reduce)": {
    animationName: "[none]",
  },
});

const composerActionGlyphStyle = css({
  display: "inline-flex",
  animationName: "[petrinautComposerActionSwap]",
  animationDuration: "[140ms]",
  animationTimingFunction: "[cubic-bezier(0.2, 0.9, 0.3, 1)]",
  "@media (prefers-reduced-motion: reduce)": {
    animationName: "[none]",
  },
});

const composerStyle = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  padding: "1",
  transition: "[border-color 150ms ease, box-shadow 150ms ease]",
  _focusWithin: {
    borderColor: "blue.s50",
    boxShadow: "[0 0 0 2px {colors.blue.a10}]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
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
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
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
      partSignature = `${lastPart.type}:${lastPart.state ?? ""}:${
        lastPart.text.length
      }`;
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
    interactiveTools,
    message,
  }: {
    handlersRef: MessageHandlersRef;
    interactiveTools: readonly PetrinautAiInteractiveTool[];
    message: PetrinautAiMessage;
  }) => {
    const role = message.role === "user" ? "user" : "assistant";
    const renderItems = getMessageRenderItems(message, interactiveTools);
    const hasVoiceOrigin =
      role === "user" && message.metadata?.source === "voice";
    // The mark belongs in front of the words that were spoken. Only a message
    // with no text of its own — a bare tool answer — falls back to trailing it.
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
                    <VoiceInputProvenance />
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
        {hasVoiceOrigin && firstTextKey === null && <VoiceInputProvenance />}
        {role === "assistant" && message.metadata?.stopped && (
          <div className={stoppedNoteStyle}>Response stopped</div>
        )}
      </div>
    );
  },
);
AiAssistantMessage.displayName = "AiAssistantMessage";

export const AiAssistantContents = ({
  additionalTab,
  clearMessagesDisabled = false,
  composerControl,
  composerFocusRequest = 0,
  error,
  input,
  inputMode = "text",
  interactiveTools = EMPTY_INTERACTIVE_TOOLS,
  isOpen = true,
  messages,
  onClearMessages,
  onClose,
  onCollapsedVoiceEnd,
  onInputModeChange,
  onInputChange,
  onInteractiveToolSubmit,
  onSelectToolTarget,
  onSendPrompt,
  onStop,
  onSubmit,
  onVoiceDockCollapsedChange,
  promptChips,
  status,
  stopped = false,
  voiceHandoffPending = false,
  voiceDockCollapsed = false,
  voiceMode,
  voiceModeAvailable = false,
}: AiAssistantContentsProps) => {
  const panelId = useId();
  const aiTabId = `${panelId}-ai`;
  const hostTabId = `${panelId}-host`;
  const [hostTabSelected, setHostTabSelected] = useState(false);
  const showingHostTab = additionalTab !== undefined && hostTabSelected;
  const { addNotification } = use(NotificationsContext);
  const voiceSessionPhase = useVoiceSessionPhase();
  const voiceSessionErrorMessage = useVoiceSessionErrorMessage();
  const isVoiceSessionLive = voiceSessionPhase !== null;
  const isBusy = status === "submitted" || status === "streaming";
  const hasInput = input.trim().length > 0;
  const canSubmit = hasInput && !isBusy && !voiceHandoffPending;

  const composerAction: {
    disabled: boolean;
    glyph: "arrowUp" | "stopFilled" | "voice";
    isSubmit: boolean;
    label: string;
    onClick?: () => void;
    tone: "brand" | "neutral";
    type: "button" | "submit";
    variant: "solid" | "subtle";
  } = isBusy
    ? {
        disabled: false,
        glyph: "stopFilled",
        isSubmit: false,
        label: "Stop AI response",
        onClick: onStop,
        tone: "neutral",
        type: "button",
        variant: "subtle",
      }
    : canSubmit
      ? {
          disabled: false,
          glyph: "arrowUp",
          isSubmit: true,
          label: "Send message",
          tone: "brand",
          type: "submit",
          variant: "solid",
        }
      : !hasInput && voiceModeAvailable && onInputModeChange
        ? {
            disabled: false,
            glyph: "voice",
            isSubmit: false,
            label: "Start voice mode",
            onClick: () => onInputModeChange("voice"),
            tone: "brand",
            type: "button",
            variant: "solid",
          }
        : {
            disabled: true,
            glyph: "arrowUp",
            isSubmit: false,
            label: "Send message",
            tone: "brand",
            type: "submit",
            variant: "solid",
          };

  const isVoiceDockCollapsed =
    voiceDockCollapsed && (isVoiceSessionLive || inputMode === "voice");

  const {
    aiAssistantPlacement,
    aiAssistantWidth: assistantWidth,
    isPanelAnimating,
    setAiAssistantPlacement,
    setAiAssistantWidth: setAssistantWidth,
  } = use(EditorContext);

  const isFloating = aiAssistantPlacement === "floating";
  const {
    panelRef,
    anchorForResize,
    isDragging,
    handleProps,
    style: floatingPositionStyle,
  } = useFloatingPosition(assistantWidth);
  const panelWidth = `min(${assistantWidth}px, 100cqw)`;
  const placementLabel = isFloating
    ? "Dock AI assistant"
    : "Float AI assistant";

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
    addNotification(errorNotification("AI assistant error", error.message));
  }, [addNotification, error]);

  // Voice failures (microphone denied, connection dropped) are reported by the
  // host rather than thrown, and get the same treatment: a toast, with the
  // recovery action left on the session's own controls.
  const notifiedVoiceErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (voiceSessionPhase !== "error") {
      notifiedVoiceErrorRef.current = null;
      return;
    }
    if (
      voiceSessionErrorMessage === null ||
      notifiedVoiceErrorRef.current === voiceSessionErrorMessage
    ) {
      return;
    }

    notifiedVoiceErrorRef.current = voiceSessionErrorMessage;
    addNotification(errorNotification(voiceSessionErrorMessage));
  }, [addNotification, voiceSessionErrorMessage, voiceSessionPhase]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const distanceFromEndRef = useRef(0);

  const recordDistanceFromEnd = () => {
    const node = messagesRef.current;
    if (node === null) {
      return;
    }
    distanceFromEndRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight;
  };

  useLayoutEffect(() => {
    const node = messagesRef.current;
    if (node === null) {
      return;
    }
    node.scrollTop =
      node.scrollHeight - node.clientHeight - distanceFromEndRef.current;
  }, [isVoiceSessionLive]);

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

  useEffect(() => {
    if (isOpen) {
      const target = inputRef.current;
      if (target && !target.disabled && !isVoiceDockCollapsed) {
        target.focus({ preventScroll: true });
      } else {
        panelRef.current?.focus({ preventScroll: true });
      }
    }
  }, [composerFocusRequest, isOpen, isVoiceDockCollapsed, panelRef]);

  // Auto-grow the composer to fit its content (up to `composerMaxHeight`,
  // after which it scrolls internally). Resetting to `auto` before measuring
  // `scrollHeight` lets the box shrink again when text is removed; both writes
  // happen synchronously so the browser only paints the final height and the
  // CSS `height` transition animates the change. `scrollHeight` is a rounded
  // integer, so the height it yields can land a fraction of a pixel under the
  // real content and raise a scrollbar on a box that visibly fits; scrolling
  // is therefore only allowed once the content genuinely passes the cap.
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, composerMaxHeight)}px`;
    textarea.style.overflowY =
      contentHeight > composerMaxHeight ? "auto" : "hidden";
  }, [input, isOpen]);

  const hasScrolledOnceRef = useRef(false);

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
      <div
        aria-hidden="true"
        className={dockSpaceStyle}
        data-animating={isPanelAnimating && !isDragging}
        style={{
          width:
            isOpen && !isFloating && !isVoiceDockCollapsed ? panelWidth : 0,
        }}
      />
      <aside
        ref={panelRef}
        aria-hidden={!isOpen ? true : undefined}
        aria-label="AI assistant"
        tabIndex={-1}
        inert={!isOpen}
        className={shellStyle({
          collapsed: isVoiceDockCollapsed,
          open: isOpen,
          floating: isFloating,
        })}
        data-placement={aiAssistantPlacement}
        data-animating={isPanelAnimating && !isDragging}
        style={{
          width: panelWidth,
          ...(isFloating && !isVoiceDockCollapsed ? floatingPositionStyle : {}),
        }}
      >
        <div
          className={`${resizeAnchorStyle} ${panelContentStyle({
            visible: !isVoiceDockCollapsed,
          })}`}
        >
          <ResizeHandle
            edge="left"
            appearance="line"
            size={assistantWidth}
            onResize={(width) => {
              if (isFloating) {
                anchorForResize();
              }
              setAssistantWidth(width);
            }}
            minSize={320}
            maxSize={720}
            label="Resize AI assistant"
          />
        </div>
        <div
          className={cardStyle({
            floating: isFloating || isVoiceDockCollapsed,
          })}
          data-animating={isPanelAnimating && !isDragging}
          data-input-mode={inputMode}
        >
          <div
            className={`${headerStyle} ${panelContentStyle({
              visible: !isVoiceDockCollapsed,
            })}`}
          >
            <button
              type="button"
              className={headerLabelStyle}
              style={additionalTab ? { flex: "0 0 auto" } : undefined}
              disabled={!isFloating}
              aria-label={isFloating ? "Move AI assistant" : undefined}
              title={
                isFloating ? "Drag to move, or use the arrow keys" : undefined
              }
              {...(isFloating ? handleProps : {})}
            >
              <AiAssistantIcon size={16} />
              {!additionalTab && <span>AI</span>}
            </button>
            {additionalTab && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <HorizontalTabsHeader
                  subViews={[
                    { id: aiTabId, title: "AI" },
                    { id: hostTabId, title: additionalTab.label },
                  ]}
                  activeTabId={showingHostTab ? hostTabId : aiTabId}
                  onTabChange={(tabId) =>
                    setHostTabSelected(tabId === hostTabId)
                  }
                />
              </div>
            )}
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label={placementLabel}
              onClick={() =>
                setAiAssistantPlacement(isFloating ? "docked" : "floating")
              }
              iconName={isFloating ? "sidebar" : "externalLink"}
              tooltip={placementLabel}
            />
            <Button
              size="xs"
              variant="ghost"
              tone="error"
              className={headerButtonStyle}
              aria-label="Clear AI chat"
              disabled={clearMessagesDisabled || messages.length === 0}
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

          <div
            id={additionalTab ? `tabpanel-${aiTabId}` : undefined}
            role={additionalTab ? "tabpanel" : undefined}
            aria-labelledby={additionalTab ? `tab-${aiTabId}` : undefined}
            hidden={showingHostTab}
            className={`${messagesStyle} ${panelContentStyle({
              visible: !isVoiceDockCollapsed && !showingHostTab,
            })}`}
            data-testid="ai-transcript"
            onScroll={recordDistanceFromEnd}
            ref={messagesRef}
          >
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
                interactiveTools={interactiveTools}
                key={message.id}
                message={message}
                handlersRef={handlersRef}
              />
            ))}
            {stopped && !error && !messages.at(-1)?.metadata?.stopped && (
              <div className={stoppedNoteStyle}>Response stopped</div>
            )}
          </div>

          {additionalTab && (
            <div
              id={`tabpanel-${hostTabId}`}
              role="tabpanel"
              aria-labelledby={`tab-${hostTabId}`}
              hidden={!showingHostTab}
              className={`${messagesStyle} ${panelContentStyle({
                visible: !isVoiceDockCollapsed && showingHostTab,
              })}`}
            >
              {additionalTab.content}
            </div>
          )}

          {voiceMode && (
            <div
              className={`${voiceModeStyle} ${panelContentStyle({
                visible: !isVoiceDockCollapsed || !isVoiceSessionLive,
              })}`}
              data-testid="ai-voice-mode"
            >
              {voiceMode}
            </div>
          )}

          {isVoiceSessionLive ? (
            <div>
              <LiveVoiceDock
                collapsed={isVoiceDockCollapsed}
                onCollapsedEnd={onCollapsedVoiceEnd}
                onCollapsedToggle={() =>
                  onVoiceDockCollapsedChange?.(!isVoiceDockCollapsed)
                }
              />
            </div>
          ) : (
            <>
              {isVoiceDockCollapsed && (
                <div>
                  <VoiceDock
                    actions={null}
                    canReadFullResponse={false}
                    canRepeatQuestion={false}
                    canTakeTurn={false}
                    collapsed
                    indicator={<AiVoiceModeIcon size={16} />}
                    microphoneMuted={false}
                    notice={voiceSetupLabels.status}
                    onCollapsedToggle={() =>
                      onVoiceDockCollapsedChange?.(false)
                    }
                    phase="connecting"
                    purpose="setup"
                  />
                </div>
              )}
              <div
                className={`${composerWrapStyle} ${panelContentStyle({
                  visible: !isVoiceDockCollapsed,
                })}`}
              >
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
                    const submitter = (event.nativeEvent as SubmitEvent)
                      .submitter;
                    if (
                      canSubmit &&
                      submitter?.hasAttribute("data-ai-assistant-submit")
                    ) {
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
                      onChange={(event) =>
                        onInputChange(event.currentTarget.value)
                      }
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
                        messages.length === 0
                          ? "Describe the process you want to create"
                          : "Continue iterating..."
                      }
                      aria-label="Message AI assistant"
                      disabled={voiceHandoffPending}
                    />
                    {composerControl}
                    <Button
                      aria-label={composerAction.label}
                      data-ai-assistant-submit={
                        composerAction.isSubmit || undefined
                      }
                      disabled={composerAction.disabled}
                      onClick={composerAction.onClick}
                      prefix={
                        <span
                          className={composerActionGlyphStyle}
                          key={composerAction.glyph}
                        >
                          {composerAction.glyph === "voice" ? (
                            <AiVoiceModeIcon size={16} />
                          ) : (
                            <Icon name={composerAction.glyph} size="sm" />
                          )}
                        </span>
                      }
                      size="sm"
                      tone={composerAction.tone}
                      tooltip={composerAction.label}
                      type={composerAction.type}
                      variant={composerAction.variant}
                    />
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
