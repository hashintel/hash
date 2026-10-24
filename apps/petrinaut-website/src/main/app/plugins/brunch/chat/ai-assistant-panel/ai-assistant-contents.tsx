import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button, Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { ExperimentalIcon } from "@hashintel/petrinaut/ui";
import { AssistantPanelTitle } from "@hashintel/petrinaut/ui/plugin";

import { AiVoiceModeIcon } from "../ai-voice-mode-button";
import {
  useVoiceSessionErrorMessage,
  useVoiceSessionPhase,
  useVoiceSessionWarningMessage,
} from "../voice-session/use-voice-session";
import { AiAssistantIcon } from "./ai-assistant-contents/ai-assistant-icon";
import { BrunchResponseStatus } from "./ai-assistant-contents/brunch-response-status";
import { BrunchTranscript } from "./ai-assistant-contents/brunch-transcript";
import { ChatTabMark } from "./ai-assistant-contents/chat-tab-mark";
import { AiAssistantComposer } from "./ai-assistant-contents/composer";
import { aiFooterMinHeight } from "./ai-assistant-contents/footer-height";
import { HorizontalTabsHeader } from "./ai-assistant-contents/horizontal-tabs-container";
import {
  PromptChips,
  type PromptChip,
} from "./ai-assistant-contents/prompt-chips";
import { errorNotification } from "./ai-assistant-contents/shared/error-notification";
import { StockTranscript } from "./ai-assistant-contents/stock-transcript";
import { VoiceAlerts } from "./ai-assistant-contents/voice-alerts";
import { LiveVoiceDock, VoiceDock } from "./ai-assistant-contents/voice-dock";
import { useAiAssistantEditorApi } from "./editor-api";
import { getInteractiveTool } from "./interactive-tools/registry";

import type { PetrinautAiInputMode } from "../ai-assistant-composer-control";
import type { PetrinautAiInteractiveTool } from "../ai-interactive-tool";
import type { PetrinautAiAssistant } from "../petrinaut";
import type { AiExperimentState } from "./ai-assistant-contents/experiment-card";
import type { OnInteractiveToolSubmit } from "./ai-assistant-contents/tool-list";
import type { AiToolTarget } from "./tool-summaries";
import type { PetrinautAiMessage } from "./types";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

const EMPTY_INTERACTIVE_TOOLS: readonly PetrinautAiInteractiveTool[] = [];

export type AiAssistantContentsProps = {
  additionalTab?: PetrinautAiAssistant["additionalTab"];
  headerActions?: PetrinautAiAssistant["headerActions"];
  actionsInputMode?: PetrinautAiAssistant["actionsInputMode"];
  attentionAnnouncement?: string;
  hostAttentionCount?: number;
  hostTabSelected?: boolean;
  onHostTabSelectedChange?: (selected: boolean) => void;
  primaryAttention?: boolean;
  primaryLabel?: string;
  presentation?: PetrinautAiAssistant["presentation"];
  resolveToolPresentation?: PetrinautAiAssistant["resolveToolPresentation"];
  renderSystemMessage?: PetrinautAiAssistant["renderSystemMessage"];
  hiddenToolNames?: ReadonlySet<string>;
  workingLabel?: string;
  clearMessagesDisabled?: boolean;
  composerControl?: ReactNode;
  composerStatus?: ReactNode;
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
  /** Ending Voice from the collapsed dock also closes the panel. */
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
  /** Voice shows only its dock, with the panel shrunk to fit it. */
  voiceDockCollapsed?: boolean;
  voiceMode?: ReactNode;
  voiceModeAvailable?: boolean;
};

// Everything below the panel's title bar: the shell around it, with its
// placement, resizing and title bar, is the plugin panel's.
const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
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
    // Voice setup sits above the collapsed dock, over the canvas.
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

const collapsedDockStyle = css({
  borderRadius: "[inherit]",
  overflow: "hidden",
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
  const trailing = messages[messages.length - 1]!;
  // Host system notes can trail the turn they annotate while it streams.
  const last =
    messages.findLast((message) => message.role !== "system") ?? trailing;
  const lastPart = last.parts[last.parts.length - 1];
  const partSignature = lastPart ? getPartScrollSignature(lastPart) : "";
  const dataSignature = last.parts
    .filter((part) => part !== lastPart && part.type.startsWith("data-"))
    .map(getPartScrollSignature)
    .join(",");
  return `${messages.length}:${trailing.id}:${last.id}:${last.parts.length}:${partSignature}:${dataSignature}`;
};

export const getTranscriptLabel = (
  primaryLabel: string | undefined,
  inputMode: PetrinautAiInputMode,
  presentation: NonNullable<PetrinautAiAssistant["presentation"]> = "stock",
) =>
  presentation === "brunch" && inputMode === "voice"
    ? "Voice"
    : (primaryLabel ?? "AI");

/** `alerts` with `message` appended, unless it is already there. */
const withVoiceAlert = (alerts: string[], message: string): string[] =>
  alerts.includes(message) ? alerts : [...alerts, message];

export const AiAssistantContents = ({
  additionalTab,
  headerActions,
  actionsInputMode,
  attentionAnnouncement,
  experimentStates,
  hostExperimentRunning = false,
  onCancelExperiment,
  clearMessagesDisabled = false,
  composerControl,
  composerStatus,
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
  renderSystemMessage,
  workingLabel,
}: AiAssistantContentsProps) => {
  const panelId = useId();
  const aiTabId = `${panelId}-ai`;
  const hostTabId = `${panelId}-host`;
  const [internalHostTabSelected, setInternalHostTabSelected] = useState(false);
  const hostTabSelected = controlledHostTabSelected ?? internalHostTabSelected;
  const showingHostTab = additionalTab !== undefined && hostTabSelected;
  const { notifications } = useAiAssistantEditorApi();
  const voiceSessionPhase = useVoiceSessionPhase();
  const voiceSessionErrorMessage = useVoiceSessionErrorMessage();
  const voiceSessionWarningMessage = useVoiceSessionWarningMessage();
  const isVoiceSessionLive = voiceSessionPhase !== null;
  const isVoiceDockCollapsed =
    voiceDockCollapsed && (isVoiceSessionLive || inputMode === "voice");
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

  const voiceDockRef = useRef<HTMLDivElement>(null);
  // The plugin panel owns placement, width and resizing.
  const contentRef = useRef<HTMLDivElement>(null);

  const [chipsDismissed, setChipsDismissed] = useState(false);

  const [voiceAlerts, setVoiceAlerts] = useState<string[]>([]);
  const recordVoiceAlert = useEffectEvent((message: string) => {
    setVoiceAlerts((previous) => withVoiceAlert(previous, message));
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
  // while Voice remains connected or listening. Each new warning is recorded
  // during render, the way state adjusts to a changed value.
  const [lastWarningMessage, setLastWarningMessage] = useState<string | null>(
    null,
  );
  if (voiceSessionWarningMessage !== lastWarningMessage) {
    setLastWarningMessage(voiceSessionWarningMessage);
    if (voiceSessionWarningMessage) {
      setVoiceAlerts((previous) =>
        withVoiceAlert(previous, voiceSessionWarningMessage),
      );
    }
  }

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
  const showHostActions =
    actionsInputMode === undefined || actionsInputMode === inputMode;
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
    if (isOpen && !isVoiceDockCollapsed) {
      const target = inputRef.current;
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
      } else {
        // TEMPORARY (FE-2046): the panel API has no focus target. This
        // ancestor lookup preserves disabled-composer focus fallback; revisit
        // it when agreeing the shell's layout/focus contract.
        contentRef.current
          ?.closest<HTMLElement>("aside")
          ?.focus({ preventScroll: true });
      }
    }
  }, [composerFocusRequest, isOpen, isVoiceDockCollapsed]);

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
      {/* The plugin panel draws the icon, dock toggle and Close. */}
      <AssistantPanelTitle
        actions={
          <>
            {showHostActions && headerActions && (
              <div
                className={css({
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "1",
                })}
              >
                {headerActions}
              </div>
            )}
            {!isVoiceSessionLive && voiceAlertIndicator}
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
      >
        {!additionalTab && <span>{transcriptLabel}</span>}
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
                mark: isBrunchChat ? <Icon name="bars" size="xs" /> : undefined,
                attention: { count: hostAttentionCount },
              },
            ]}
            activeTabId={showingHostTab ? hostTabId : aiTabId}
            announcement={attentionAnnouncement}
            styleVariant={isBrunchChat ? "pill" : "default"}
            onTabChange={(tabId) => {
              const selected = tabId === hostTabId;
              setInternalHostTabSelected(selected);
              onHostTabSelectedChange?.(selected);
            }}
          />
        )}
      </AssistantPanelTitle>
      <div
        ref={contentRef}
        className={contentStyle}
        data-input-mode={inputMode}
      >
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
              renderSystemMessage={renderSystemMessage}
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
            className={`${messagesStyle({ presentation })} ${panelContentStyle({
              visible: !isVoiceDockCollapsed && showingHostTab,
            })}`}
          >
            {additionalTab.content}
          </div>
        )}

        {isBrunchChat && showingHostTab && !isVoiceDockCollapsed && (
          <BrunchResponseStatus busy={isBusy} workingLabel={workingLabel} />
        )}

        {!isBrunchChat && isBusy && workingLabel && (
          <div
            className={workingStatusStyle}
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

        {!isVoiceDockCollapsed && composerStatus}
        {isVoiceSessionLive ? (
          <div
            ref={voiceDockRef}
            className={isVoiceDockCollapsed ? collapsedDockStyle : undefined}
          >
            <LiveVoiceDock
              assistantBusy={isBusy}
              collapsed={isVoiceDockCollapsed}
              composerControl={composerControl}
              errorIndicator={voiceAlertIndicator}
              onCollapsedEnd={onCollapsedVoiceEnd}
              onCollapsedToggle={() =>
                onVoiceDockCollapsedChange?.(!isVoiceDockCollapsed)
              }
              onStop={onStop}
            />
          </div>
        ) : (
          <>
            {isVoiceDockCollapsed && (
              <div ref={voiceDockRef} className={collapsedDockStyle}>
                <VoiceDock
                  actions={null}
                  canReadFullResponse={false}
                  canRepeatQuestion={false}
                  canTakeTurn={false}
                  collapsed
                  errorIndicator={voiceAlertIndicator}
                  indicator={<AiVoiceModeIcon size={16} />}
                  microphoneMuted={false}
                  onCollapsedToggle={() => onVoiceDockCollapsedChange?.(false)}
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
    </>
  );
};
