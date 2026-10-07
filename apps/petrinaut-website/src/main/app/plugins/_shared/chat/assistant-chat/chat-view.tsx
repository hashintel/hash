import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  AiAssistantIcon,
  ExperimentalIcon,
  PetrinautAssistantWindow,
  usePetrinautAssistantWindow,
} from "@hashintel/petrinaut/ui";

import { AiVoiceModeIcon } from "../ai-voice-mode-icon";
import { useAssistantChatApi } from "./chat-api";
import { BrunchResponseStatus } from "./chat-view/brunch-response-status";
import { BrunchTranscript } from "./chat-view/brunch-transcript";
import { ChatTabMark } from "./chat-view/chat-tab-mark";
import { AiAssistantComposer } from "./chat-view/composer";
import { aiFooterMinHeight } from "./chat-view/footer-height";
import { PromptChips, type PromptChip } from "./chat-view/prompt-chips";
import { errorNotification } from "./chat-view/shared/error-notification";
import { StockTranscript } from "./chat-view/stock-transcript";
import { VoiceAlerts } from "./chat-view/voice-alerts";
import { LiveVoiceDock, VoiceDock } from "./chat-view/voice-dock";
import { getInteractiveTool } from "./interactive-tools/registry";
import {
  useVoiceSessionErrorMessage,
  useVoiceSessionPhase,
  useVoiceSessionWarningMessage,
} from "./voice-session";

import type { PetrinautAiMessage } from "../ai-message";
import type { PetrinautAiInputMode } from "../composer-control";
import type { PetrinautAiInteractiveTool } from "../interactive-tool";
import type { PetrinautAiAssistant } from "../petrinaut-ai-assistant";
import type { AiExperimentState } from "./chat-view/experiment-card";
import type { OnInteractiveToolSubmit } from "./chat-view/tool-list";
import type { AiToolTarget } from "./tool-summaries";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

const EMPTY_INTERACTIVE_TOOLS: readonly PetrinautAiInteractiveTool[] = [];

export type ChatViewProps = {
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
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  /** Called when the window's Close button closes it. */
  onClose?: () => void;
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

const getTranscriptLabel = (
  primaryLabel: string | undefined,
  inputMode: PetrinautAiInputMode,
  presentation: NonNullable<PetrinautAiAssistant["presentation"]> = "stock",
) =>
  presentation === "brunch" && inputMode === "voice"
    ? "Voice"
    : (primaryLabel ?? "AI");

export const ChatView = ({
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
  hiddenToolNames,
  messages,
  onClearMessages,
  onClose,
  onCollapsedVoiceEnd,
  onInputModeChange,
  onInputChange,
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
  status,
  stopped = false,
  voiceHandoffPending = false,
  voiceDockCollapsed = false,
  voiceMode,
  voiceModeAvailable = false,
  resolveToolPresentation,
  workingLabel,
}: ChatViewProps) => {
  const { isOpen, isChatTabShown } = usePetrinautAssistantWindow();
  const showingHostTab = !isChatTabShown;
  const { notifications } = useAssistantChatApi();
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

  const voiceDockRef = useRef<HTMLDivElement>(null);
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
    notifications.add(errorNotification("AI assistant error", error.message));
  }, [notifications, error]);

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
    <PetrinautAssistantWindow
      label={transcriptLabel}
      mark={
        isBrunchChat ? (
          inputMode === "voice" ? (
            <AiVoiceModeIcon size={12} />
          ) : (
            <ChatTabMark />
          )
        ) : undefined
      }
      busy={isBusy}
      appearance={isBrunchChat ? "pill" : "default"}
      compact={
        isVoiceDockCollapsed ? (isVoiceSessionLive ? true : "overflow") : false
      }
      focusTargetRef={inputRef}
      focusRequest={composerFocusRequest}
      onClose={onClose}
      headerActions={
        <>
          {!isVoiceDockCollapsed && !isVoiceSessionLive && voiceAlertIndicator}
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
        </>
      }
      footer={
        <>
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
        </>
      }
    >
      <div
        className={messagesStyle({ presentation })}
        data-testid="ai-transcript"
        onScroll={recordDistanceFromEnd}
        ref={messagesRef}
      >
        {messages.length === 0 && (
          <div className={emptyStyle}>
            <AiAssistantIcon size={28} />
            <div>
              Ask AI to create a Petri net, explain or revise the current model.
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
    </PetrinautAssistantWindow>
  );
};
