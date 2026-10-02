import {
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button, Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { NotificationsContext } from "../../../../../react/notifications/context";
import { EditorContext } from "../../../../../react/state/editor-context";
import {
  useVoiceSessionErrorMessage,
  useVoiceSessionPhase,
  useVoiceSessionWarningMessage,
} from "../../../../../react/voice-session/use-voice-session";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { HorizontalTabsHeader } from "../../../../components/sub-view/horizontal/horizontal-tabs-container";
import {
  ExperimentalIcon,
  useExperimentalIconMotionAllowed,
} from "../../../../experimental-icons";
import { ResizeHandle } from "../../../../resize/resize-handle";
import { AiVoiceModeIcon } from "../../components/ai-voice-mode-button";
import { FloatingResizeHandles } from "../../shared/floating-resize-handles";
import { useFloatingPanel } from "../../shared/use-floating-panel";
import { BrunchResponseStatus } from "./ai-assistant-contents/brunch-response-status";
import { BrunchTranscript } from "./ai-assistant-contents/brunch-transcript";
import { ChatTabMark } from "./ai-assistant-contents/chat-tab-mark";
import { AiAssistantComposer } from "./ai-assistant-contents/composer";
import { aiFooterMinHeight } from "./ai-assistant-contents/footer-height";
import {
  PromptChips,
  type PromptChip,
} from "./ai-assistant-contents/prompt-chips";
import { errorNotification } from "./ai-assistant-contents/shared/error-notification";
import { StockTranscript } from "./ai-assistant-contents/stock-transcript";
import { VoiceAlerts } from "./ai-assistant-contents/voice-alerts";
import { LiveVoiceDock, VoiceDock } from "./ai-assistant-contents/voice-dock";
import { getInteractiveTool } from "./interactive-tools/registry";

import type { PetrinautAiAssistant } from "../../../../petrinaut";
import type { PetrinautAiInputMode } from "../../../../types/ai-assistant-composer-control";
import type { PetrinautAiInteractiveTool } from "../../../../types/ai-interactive-tool";
import type { AiExperimentState } from "./ai-assistant-contents/experiment-card";
import type { OnInteractiveToolSubmit } from "./ai-assistant-contents/tool-list";
import type { AiToolTarget } from "./tool-summaries";
import type { PetrinautAiMessage } from "./types";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

const EMPTY_INTERACTIVE_TOOLS: readonly PetrinautAiInteractiveTool[] = [];

export type AiAssistantContentsProps = {
  additionalTab?: PetrinautAiAssistant["additionalTab"];
  attentionAnnouncement?: string;
  hostAttentionCount?: number;
  hostTabSelected?: boolean;
  onHostTabSelectedChange?: (selected: boolean) => void;
  primaryAttention?: boolean;
  primaryLabel?: string;
  presentation?: PetrinautAiAssistant["presentation"];
  resolveToolPresentation?: PetrinautAiAssistant["resolveToolPresentation"];
  hiddenToolNames?: ReadonlySet<string>;
  workingLabel?: string;
  clearMessagesDisabled?: boolean;
  composerControl?: ReactNode;
  composerFocusRequest?: number;
  error?: Error;
  experimentStates?: Record<string, AiExperimentState>;
  hostExperimentRunning?: boolean;
  onCancelExperiment?: (toolCallId: string) => void;
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
  onRetryPrompt?: (prompt: string) => void;
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
    borderLeft: "[1px solid {colors.neutral.s40}]",
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
    setupOverlay: {
      true: { overflow: "visible" },
    },
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

const voiceModeStyle = cva({
  base: {
    position: "relative",
    zIndex: "[2]",
    flexShrink: "0",
    overflow: "visible",
    pointerEvents: "auto",
  },
  variants: {
    setupOverlay: {
      true: {
        position: "absolute",
        bottom: "[calc(100% + 8px)]",
        width: "full",
        maxHeight: "[calc(100dvh - 120px)]",
        overflowY: "auto",
        borderRadius: "[12px]",
      },
    },
  },
});

const headerStyle = css({
  position: "relative",
  userSelect: "none",
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
  position: "absolute",
  inset: "[0]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  color: "neutral.fg.heading",
  fontSize: "sm",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  border: "none",
  padding: "[0 12px]",
  backgroundColor: "[transparent]",
  textAlign: "left",
  _enabled: {
    cursor: "grab",
    touchAction: "none",
    _active: { cursor: "grabbing" },
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
  '&[data-icon-motion="true"] > svg': {
    transition: "[transform 180ms ease-out]",
  },
  '&[data-icon-motion="true"]:is(:hover, :focus-visible) > svg': {
    transform: "[rotate(8deg) scale(1.06)]",
  },
  '&[data-icon-motion="true"]:active > svg': {
    transform: "[rotate(-8deg) scale(0.94)]",
  },
});

const headerTabsStyle = css({
  position: "relative",
  flex: "[1]",
  minWidth: "[0]",
  marginLeft: "[28px]",
  pointerEvents: "none",
  "& button": { pointerEvents: "auto" },
});

const headerButtonStyle = css({
  position: "relative",
  color: "neutral.s90",
  _hover: {
    color: "neutral.s110",
  },
});

const messagesStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "3",
    flex: "[1]",
    minHeight: "[0]",
    overflowY: "auto",
    padding: "3",
    overscrollBehavior: "contain",
  },
  variants: {
    presentation: {
      stock: {},
      brunch: { paddingBottom: "4" },
    },
  },
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

const workingStatusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  alignSelf: "flex-start",
  paddingX: "2",
  color: "neutral.s80",
  fontSize: "sm",
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

const getPartScrollSignature = (
  part: PetrinautAiMessage["parts"][number],
): string => {
  if (part.type === "text" || part.type === "reasoning") {
    return `${part.type}:${part.state ?? ""}:${part.text.length}`;
  }
  if ("data" in part && typeof part.data === "object" && part.data !== null) {
    const { state, text, fields } = part.data as Record<string, unknown>;
    const size =
      typeof text === "string"
        ? text.length
        : typeof fields === "object" && fields !== null
          ? JSON.stringify(fields).length
          : 0;
    return `${part.type}:${typeof state === "string" ? state : ""}:${size}`;
  }
  return "state" in part ? `${part.type}:${part.state}` : part.type;
};

// The scroll effect only needs to know when *anything* changed — it doesn't
// need to capture every byte of every part. Look only at the last message:
// its last part, plus its data parts, because Voice lines and briefs grow in
// place wherever they sit. This runs on every render during streaming, so
// concatenating every part's full text would burn meaningful CPU once
// transcripts get long.
const getMessagesScrollKey = (messages: PetrinautAiMessage[]): string => {
  if (messages.length === 0) {
    return "0";
  }
  const last = messages[messages.length - 1]!;
  const lastPart = last.parts[last.parts.length - 1];
  const partSignature = lastPart ? getPartScrollSignature(lastPart) : "";
  const dataSignature = last.parts
    .filter((part) => part !== lastPart && part.type.startsWith("data-"))
    .map(getPartScrollSignature)
    .join(",");
  return `${messages.length}:${last.id}:${last.parts.length}:${partSignature}:${dataSignature}`;
};

export const getTranscriptLabel = (
  primaryLabel: string | undefined,
  inputMode: PetrinautAiInputMode,
  presentation: NonNullable<PetrinautAiAssistant["presentation"]> = "stock",
) =>
  presentation === "brunch" && inputMode === "voice"
    ? "Voice"
    : (primaryLabel ?? "AI");

export const AiAssistantContents = ({
  additionalTab,
  attentionAnnouncement,
  experimentStates,
  hostExperimentRunning = false,
  onCancelExperiment,
  clearMessagesDisabled = false,
  composerControl,
  composerFocusRequest = 0,
  error,
  input,
  inputMode = "text",
  interactiveTools = EMPTY_INTERACTIVE_TOOLS,
  isOpen = true,
  hostAttentionCount = 0,
  hostTabSelected: controlledHostTabSelected,
  hiddenToolNames,
  messages,
  onClearMessages,
  onClose,
  onCollapsedVoiceEnd,
  onInputModeChange,
  onInputChange,
  onHostTabSelectedChange,
  onInteractiveToolSubmit,
  onSelectToolTarget,
  onSendPrompt,
  onRetryPrompt,
  onStop,
  onSubmit,
  onVoiceDockCollapsedChange,
  promptChips,
  primaryLabel,
  presentation = "stock",
  primaryAttention = false,
  status,
  stopped = false,
  voiceHandoffPending = false,
  voiceDockCollapsed = false,
  voiceMode,
  voiceModeAvailable = false,
  resolveToolPresentation,
  workingLabel,
}: AiAssistantContentsProps) => {
  const panelId = useId();
  const aiTabId = `${panelId}-ai`;
  const hostTabId = `${panelId}-host`;
  const [internalHostTabSelected, setInternalHostTabSelected] = useState(false);
  const hostTabSelected = controlledHostTabSelected ?? internalHostTabSelected;
  const showingHostTab = additionalTab !== undefined && hostTabSelected;
  const { addNotification } = use(NotificationsContext);
  const voiceSessionPhase = useVoiceSessionPhase();
  const voiceSessionErrorMessage = useVoiceSessionErrorMessage();
  const voiceSessionWarningMessage = useVoiceSessionWarningMessage();
  const isVoiceSessionLive = voiceSessionPhase !== null;
  const isBusy = status === "submitted" || status === "streaming";
  const isBrunchChat = presentation === "brunch";
  const transcriptLabel = getTranscriptLabel(
    primaryLabel,
    inputMode,
    presentation,
  );
  const awaitingDecision =
    !stopped &&
    messages.some((message) =>
      message.parts.some((part) => {
        if (part.type !== "dynamic-tool" || part.state !== "input-available")
          return false;
        const tool = getInteractiveTool(part, interactiveTools);
        return tool !== undefined && tool.placement !== "card";
      }),
    );
  const experimentRunning =
    hostExperimentRunning ||
    Object.values(experimentStates ?? {}).some(
      (experimentState) => experimentState.active,
    );
  const composerHint = isBrunchChat
    ? awaitingDecision
      ? "Waiting for your decision"
      : experimentRunning
        ? "Experiment running"
        : undefined
    : undefined;

  const isVoiceDockCollapsed =
    voiceDockCollapsed && (isVoiceSessionLive || inputMode === "voice");

  const {
    aiAssistantPlacement,
    aiAssistantWidth: assistantWidth,
    isPanelAnimating,
    setAiAssistantPlacement,
    setAiAssistantWidth: setAssistantWidth,
    setAiAssistantDockHeight,
  } = use(EditorContext);

  const isFloating = aiAssistantPlacement === "floating";
  const voiceDockRef = useRef<HTMLDivElement>(null);
  const HeaderLabel = isFloating ? "button" : "div";
  const iconMotionAllowed = useExperimentalIconMotionAllowed();
  const {
    panelRef,
    isInteracting,
    handleProps,
    getResizeHandleProps,
    style: floatingPositionStyle,
  } = useFloatingPanel({
    width: assistantWidth,
    onWidthChange: setAssistantWidth,
  });
  const panelWidth = `min(${assistantWidth}px, 100cqw)`;
  const placementLabel = isFloating
    ? "Dock AI assistant"
    : "Float AI assistant";

  const reportDockHeight = useEffectEvent((height: number | null) => {
    setAiAssistantDockHeight(height);
  });
  useLayoutEffect(() => {
    const shell = panelRef.current;
    if (!isOpen || !isVoiceDockCollapsed || !shell) {
      return;
    }
    const measure = () =>
      reportDockHeight(shell.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => {
      observer.disconnect();
      reportDockHeight(null);
    };
  }, [isOpen, isVoiceDockCollapsed, panelRef]);

  const [chipsDismissed, setChipsDismissed] = useState(false);

  const [voiceAlerts, setVoiceAlerts] = useState<string[]>([]);
  const recordVoiceAlert = useEffectEvent((message: string) => {
    setVoiceAlerts((previous) =>
      previous.includes(message) ? previous : [...previous, message],
    );
  });
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

  // Keep host-reported Voice failures and recovery notices on the session
  // controls; unrelated Petrinaut notifications are untouched.
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
    recordVoiceAlert(voiceSessionErrorMessage);
  }, [voiceSessionErrorMessage, voiceSessionPhase]);

  // Host-designated recoverable issues need the same on-demand details even
  // while Voice remains connected or listening.
  useEffect(() => {
    if (voiceSessionWarningMessage) {
      recordVoiceAlert(voiceSessionWarningMessage);
    }
  }, [voiceSessionWarningMessage]);

  const voiceAlertIndicator =
    isOpen && voiceAlerts.length > 0 ? (
      <VoiceAlerts
        alerts={voiceAlerts}
        onDismiss={() => setVoiceAlerts([])}
        docked={isVoiceDockCollapsed || isVoiceSessionLive}
        dockRef={voiceDockRef}
      />
    ) : null;

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const distanceFromEndRef = useRef(0);
  const shouldAutoFollowRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  const recordDistanceFromEnd = () => {
    const node = messagesRef.current;
    if (node === null) {
      return;
    }
    distanceFromEndRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    // The stock transcript always follows new output.
    if (!isBrunchChat) return;
    // The smooth follow scroll only moves down, and can trail an end that
    // grows mid-animation; only the reader moving up stops following.
    if (distanceFromEndRef.current <= 96) {
      shouldAutoFollowRef.current = true;
    } else if (node.scrollTop < lastScrollTopRef.current) {
      shouldAutoFollowRef.current = false;
    }
    lastScrollTopRef.current = node.scrollTop;
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
  const suppressChips =
    isBrunchChat && (isBusy || experimentRunning || awaitingDecision);

  const onRetryMessage = (messageId: string) => {
    if (isBusy || voiceHandoffPending) return;
    const index = messages.findIndex((message) => message.id === messageId);
    const userMessage = messages
      .slice(0, index)
      .findLast((message) => message.role === "user");
    const prompt = userMessage?.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n");
    if (prompt) onRetryPrompt?.(prompt);
  };
  // Stable container for the per-render callbacks so the memoised transcript
  // messages don't see identity churn from the panel's inline arrow functions
  // on every render. The ref itself is stable across renders, so memoised
  // children never re-render due to handler changes — but we refresh
  // `.current` in an effect so any new closure capture is picked up by the
  // next event.
  const handlersRef = useRef({
    onInteractiveToolSubmit,
    onSelectToolTarget,
    onRetryMessage,
  });
  useEffect(() => {
    handlersRef.current = {
      onInteractiveToolSubmit,
      onSelectToolTarget,
      onRetryMessage,
    };
  });
  const transcriptProps = {
    experimentStates,
    handlersRef,
    hiddenToolNames,
    interactiveTools,
    messages,
    onCancelExperiment,
    resolveToolPresentation,
  };

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

  const hasScrolledOnceRef = useRef(false);

  useEffect(() => {
    if (!shouldAutoFollowRef.current) {
      return;
    }
    const isFirstScroll = !hasScrolledOnceRef.current;
    hasScrolledOnceRef.current = true;
    const scrollToEnd = () => {
      if (!shouldAutoFollowRef.current) return;
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
        data-animating={isPanelAnimating && !isInteracting}
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
          floating: isFloating && !isVoiceDockCollapsed,
        })}
        data-placement={aiAssistantPlacement}
        data-animating={isPanelAnimating && !isInteracting}
        style={{
          width: panelWidth,
          ...(isFloating && !isVoiceDockCollapsed ? floatingPositionStyle : {}),
        }}
      >
        {isFloating && !isVoiceDockCollapsed ? (
          <FloatingResizeHandles
            label="AI assistant"
            getHandleProps={getResizeHandleProps}
          />
        ) : (
          <div
            className={`${resizeAnchorStyle} ${panelContentStyle({
              visible: !isVoiceDockCollapsed,
            })}`}
          >
            <ResizeHandle
              edge="left"
              appearance="hidden"
              size={assistantWidth}
              onResize={setAssistantWidth}
              minSize={320}
              maxSize={720}
              label="Resize AI assistant"
            />
          </div>
        )}
        <div
          className={cardStyle({
            floating: isFloating || isVoiceDockCollapsed,
            setupOverlay: isVoiceDockCollapsed && !isVoiceSessionLive,
          })}
          data-animating={isPanelAnimating && !isInteracting}
          data-input-mode={inputMode}
        >
          <div
            className={`${headerStyle} ${panelContentStyle({
              visible: !isVoiceDockCollapsed,
            })}`}
          >
            <HeaderLabel
              type={isFloating ? "button" : undefined}
              className={headerLabelStyle}
              data-icon-motion={iconMotionAllowed}
              aria-label={isFloating ? "Move AI assistant" : undefined}
              title={
                isFloating ? "Drag to move, or use the arrow keys" : undefined
              }
              {...(isFloating ? handleProps : {})}
            >
              <AiAssistantIcon size={16} />
              {!additionalTab && <span>{transcriptLabel}</span>}
            </HeaderLabel>
            <div className={headerTabsStyle}>
              {additionalTab && (
                <HorizontalTabsHeader
                  subViews={[
                    {
                      id: aiTabId,
                      title: transcriptLabel,
                      mark: isBrunchChat ? (
                        inputMode === "voice" ? (
                          <AiVoiceModeIcon size={12} />
                        ) : (
                          <ChatTabMark />
                        )
                      ) : undefined,
                      attention: { marker: primaryAttention },
                    },
                    {
                      id: hostTabId,
                      title: additionalTab.label,
                      mark: isBrunchChat ? (
                        <Icon name="bars" size="xs" />
                      ) : undefined,
                      attention: { count: hostAttentionCount },
                    },
                  ]}
                  activeTabId={showingHostTab ? hostTabId : aiTabId}
                  announcement={attentionAnnouncement}
                  styleVariant={presentation}
                  onTabChange={(tabId) => {
                    const selected = tabId === hostTabId;
                    setInternalHostTabSelected(selected);
                    onHostTabSelectedChange?.(selected);
                  }}
                />
              )}
            </div>
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label={placementLabel}
              onClick={() =>
                setAiAssistantPlacement(isFloating ? "docked" : "floating")
              }
              prefix={
                <ExperimentalIcon
                  name={isFloating ? "sidebar" : "externalLink"}
                  size={14}
                />
              }
              tooltip={placementLabel}
            />
            {!isVoiceDockCollapsed &&
              !isVoiceSessionLive &&
              voiceAlertIndicator}
            {messages.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                tone="error"
                className={headerButtonStyle}
                aria-label="Clear AI chat"
                disabled={clearMessagesDisabled}
                onClick={() => {
                  setVoiceAlerts([]);
                  onClearMessages?.();
                }}
                prefix={<ExperimentalIcon name="trash" size={14} />}
                tooltip="Clear AI chat"
              />
            )}
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label="Close AI assistant"
              onClick={onClose}
              prefix={<ExperimentalIcon name="close" size={14} />}
              tooltip="Close AI assistant"
            />
          </div>

          <div
            id={additionalTab ? `tabpanel-${aiTabId}` : undefined}
            role={additionalTab ? "tabpanel" : undefined}
            aria-labelledby={additionalTab ? `tab-${aiTabId}` : undefined}
            hidden={showingHostTab}
            className={`${messagesStyle({ presentation })} ${panelContentStyle({
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
            {isBrunchChat ? (
              <BrunchTranscript
                {...transcriptProps}
                stopped={stopped}
                busy={isBusy}
                canRetry={
                  onRetryPrompt !== undefined && !isBusy && !voiceHandoffPending
                }
                voice={inputMode === "voice"}
              />
            ) : (
              <StockTranscript
                {...transcriptProps}
                stopped={stopped && !error}
                busy={isBusy}
              />
            )}
          </div>

          {additionalTab && (
            <div
              id={`tabpanel-${hostTabId}`}
              role="tabpanel"
              aria-labelledby={`tab-${hostTabId}`}
              hidden={!showingHostTab}
              className={`${messagesStyle({ presentation })} ${panelContentStyle(
                {
                  visible: !isVoiceDockCollapsed && showingHostTab,
                },
              )}`}
            >
              {additionalTab.content}
            </div>
          )}

          {isBrunchChat && showingHostTab && (
            <BrunchResponseStatus
              busy={isBusy}
              className={panelContentStyle({ visible: !isVoiceDockCollapsed })}
              workingLabel={workingLabel}
            />
          )}

          {!isBrunchChat && isBusy && workingLabel && (
            <div
              className={`${workingStatusStyle} ${panelContentStyle({
                visible: !isVoiceDockCollapsed,
              })}`}
              role="status"
              aria-live="polite"
              data-testid="ai-working-status"
            >
              <LoadingSpinner aria-hidden="true" size="xs" variant="bars" />
              <span>{workingLabel}</span>
            </div>
          )}

          {voiceMode && (
            <div
              className={`${voiceModeStyle({
                setupOverlay: isVoiceDockCollapsed && !isVoiceSessionLive,
              })} ${panelContentStyle({
                visible: !isVoiceDockCollapsed || !isVoiceSessionLive,
              })}`}
              data-testid="ai-voice-mode"
            >
              {voiceMode}
            </div>
          )}

          {isVoiceSessionLive ? (
            <div ref={voiceDockRef}>
              <LiveVoiceDock
                assistantBusy={isBusy}
                collapsed={isVoiceDockCollapsed}
                errorIndicator={voiceAlertIndicator}
                onCollapsedEnd={onCollapsedVoiceEnd}
                onStop={onStop}
                onCollapsedToggle={() =>
                  onVoiceDockCollapsedChange?.(!isVoiceDockCollapsed)
                }
              />
            </div>
          ) : (
            <>
              {isVoiceDockCollapsed && (
                <div
                  ref={voiceDockRef}
                  className={css({
                    borderRadius: "[inherit]",
                    overflow: "hidden",
                  })}
                >
                  <VoiceDock
                    actions={null}
                    canReadFullResponse={false}
                    canRepeatQuestion={false}
                    canTakeTurn={false}
                    collapsed
                    errorIndicator={voiceAlertIndicator}
                    indicator={<AiVoiceModeIcon size={16} />}
                    microphoneMuted={false}
                    onCollapsedToggle={() =>
                      onVoiceDockCollapsedChange?.(false)
                    }
                    phase="connecting"
                    purpose="setup"
                    speakerMuted={false}
                    speakerVolume={1}
                  />
                </div>
              )}
              <div
                className={`${composerWrapStyle} ${panelContentStyle({
                  visible: !isVoiceDockCollapsed,
                })}`}
              >
                {showChips && (
                  <div
                    className={css({
                      display: "contents",
                      '&[data-brunch="true"]': { display: "block" },
                      '&[data-suppressed="true"]': { visibility: "hidden" },
                    })}
                    data-brunch={isBrunchChat || undefined}
                    data-suppressed={suppressChips || undefined}
                    aria-hidden={suppressChips || undefined}
                    inert={suppressChips}
                  >
                    <PromptChips
                      chips={promptChips}
                      disabled={isBusy}
                      onDismiss={() => setChipsDismissed(true)}
                      onSelect={(prompt) => onSendPrompt(prompt)}
                      presentation={presentation}
                    />
                  </div>
                )}
                <AiAssistantComposer
                  busy={isBusy}
                  control={composerControl}
                  disabled={voiceHandoffPending}
                  hasHistory={messages.length > 0}
                  hint={composerHint}
                  input={input}
                  inputRef={inputRef}
                  isOpen={isOpen}
                  onInputChange={onInputChange}
                  onInputModeChange={onInputModeChange}
                  onStop={onStop}
                  onSubmit={onSubmit}
                  presentation={presentation}
                  voiceModeAvailable={voiceModeAvailable}
                />
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
