import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiChevronDown,
  FiMessageSquare,
  FiMic,
  FiSquare,
  FiTool,
} from "react-icons/fi";

import { css } from "@hashintel/ds-helpers/css";

import {
  type VoiceExperiment as VoiceExperimentName,
  voiceExperimentLabel,
} from "./voice-experiment/voice-experiment-selection";

import type { VoiceExperimentAdapter } from "./voice-experiment/voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment/voice-experiment-events";

const dockStyle = css({
  position: "fixed",
  zIndex: "popover",
  bottom: "[76px]",
  left: "[50%]",
  width: "[calc(100vw - 32px)]",
  maxWidth: "[600px]",
  transform: "translateX(-50%)",
  pointerEvents: "none",
});

const panelStyle = css({
  position: "relative",
  display: "flex",
  width: "full",
  maxHeight: "[calc(100vh - 108px)]",
  flexDirection: "column",
  gap: "3.5",
  padding: "[18px]",
  overflow: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "2xl",
  backgroundColor: "neutral.s05",
  boxShadow:
    "[0 24px 72px rgb(15 23 42 / 0.22), 0 2px 8px rgb(15 23 42 / 0.08)]",
  transformOrigin: "bottom center",
  transition:
    "[opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 180ms]",
});

const collapsedPanelStyle = css({
  visibility: "hidden",
  opacity: "0",
  pointerEvents: "none",
  transform: "translateY(14px) scale(0.965)",
});

const expandedPanelStyle = css({
  visibility: "visible",
  opacity: "1",
  pointerEvents: "auto",
  transform: "translateY(0) scale(1)",
  transition:
    "[opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s]",
});

const launcherButtonStyle = css({
  position: "absolute",
  bottom: "0",
  left: "[50%]",
  display: "inline-flex",
  width: "12",
  height: "12",
  transform: "translateX(-50%)",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  pointerEvents: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "blue.a100",
  borderRadius: "full",
  backgroundColor: "blue.s100",
  color: "white",
  cursor: "pointer",
  isolation: "isolate",
  boxShadow:
    "[0 8px 22px rgb(42 128 200 / 0.28), inset 0 1px 0 rgb(255 255 255 / 0.25)]",
  transition:
    "[opacity 150ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease, box-shadow 150ms ease]",
  _hover: {
    transform: "translateX(-50%) translateY(-2px) scale(1.04)",
    boxShadow:
      "[0 11px 26px rgb(42 128 200 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.28)]",
  },
  _focusVisible: {
    outline: "3px solid",
    outlineColor: "blue.a40",
    outlineOffset: "[3px]",
  },
});

const hiddenLauncherButtonStyle = css({
  visibility: "hidden",
  opacity: "0",
  pointerEvents: "none",
  transform: "translateX(-50%) translateY(8px) scale(0.78)",
  transition:
    "[opacity 150ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease, box-shadow 150ms ease, visibility 0s linear 150ms]",
});

const activeLauncherButtonStyle = css({
  borderColor: "red.s100",
  backgroundColor: "red.s100",
  boxShadow:
    "[0 8px 24px rgb(211 47 47 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.22)]",
  _hover: {
    backgroundColor: "red.s110",
    boxShadow:
      "[0 11px 28px rgb(211 47 47 / 0.40), inset 0 1px 0 rgb(255 255 255 / 0.24)]",
  },
});

const launcherStatusStyle = css({
  position: "absolute",
  top: "[-1px]",
  right: "[-1px]",
  width: "2.5",
  height: "2.5",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "neutral.s00",
  borderRadius: "full",
  backgroundColor: "neutral.s55",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
  paddingBottom: "3",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.a20",
});

const headerIdentityStyle = css({
  display: "flex",
  minWidth: "0",
  alignItems: "center",
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
});

const minimizeButtonStyle = css({
  display: "inline-flex",
  width: "8",
  height: "8",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "lg",
  backgroundColor: "white",
  color: "neutral.s75",
  cursor: "pointer",
  transition:
    "[background-color 140ms ease, color 140ms ease, transform 140ms ease]",
  _hover: {
    backgroundColor: "neutral.a10",
    color: "neutral.s100",
    transform: "translateY(1px)",
  },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "blue.a35",
    outlineOffset: "[2px]",
  },
});

const titleCopyStyle = css({
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});

const headingStyle = css({
  color: "neutral.s115",
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "tight",
});

const experimentBadgeStyle = css({
  paddingX: "2",
  paddingY: "0.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "full",
  backgroundColor: "white",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
});

const sectionLabelStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "semibold",
  letterSpacing: "wide",
  textTransform: "uppercase",
});

const transcriptStyle = css({
  display: "flex",
  minHeight: "28",
  maxHeight: "64",
  flexDirection: "column",
  gap: "2.5",
  padding: "3",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a25",
  borderRadius: "xl",
  backgroundColor: "white",
  color: "neutral.s80",
  boxShadow: "[inset 0 1px 0 rgb(255 255 255 / 0.85)]",
  fontSize: "sm",
  lineHeight: "relaxed",
  scrollBehavior: "smooth",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "blue.a30",
    outlineOffset: "[2px]",
  },
});

const transcriptSectionStyle = css({
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  gap: "2",
});

const transcriptHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "1",
});

const sectionHeadingStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  color: "neutral.s80",
});

const transcriptCountStyle = css({
  paddingX: "2",
  paddingY: "0.5",
  borderRadius: "full",
  backgroundColor: "neutral.a15",
  color: "neutral.s70",
  fontSize: "xs",
});

const transcriptEntryStyle = css({
  display: "flex",
  width: "[88%]",
  flexDirection: "column",
  gap: "0.5",
});

const expertTranscriptEntryStyle = css({
  marginLeft: "auto",
  alignItems: "flex-end",
});

const transcriptSpeakerStyle = css({
  color: "neutral.s65",
  fontSize: "xs",
  fontWeight: "medium",
});

const transcriptBubbleStyle = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "xl",
  backgroundColor: "neutral.a15",
  color: "neutral.s95",
});

const expertTranscriptBubbleStyle = css({
  backgroundColor: "blue.a20",
});

const partialTranscriptStyle = css({
  opacity: "0.7",
});

const transcriptPlaceholderStyle = css({
  margin: "auto",
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s65",
  textAlign: "center",
});

const statusIndicatorStyle = css({
  width: "2.5",
  height: "2.5",
  flexShrink: "0",
  borderRadius: "full",
  backgroundColor: "neutral.a50",
});

const connectedStatusIndicatorStyle = css({
  backgroundColor: "green.a85",
  boxShadow: "[0 0 0 4px {colors.green.a10}]",
});

const pendingStatusIndicatorStyle = css({
  backgroundColor: "yellow.a85",
  boxShadow: "[0 0 0 4px {colors.yellow.a10}]",
});

const errorStatusIndicatorStyle = css({
  backgroundColor: "red.a85",
  boxShadow: "[0 0 0 4px {colors.red.a10}]",
});

const conversationControlStyle = css({
  display: "flex",
  width: "full",
  minHeight: "24",
  alignItems: "center",
  justifyContent: "center",
  paddingY: "1",
});

const microphoneButtonStyle = css({
  position: "relative",
  display: "inline-flex",
  width: "[68px]",
  height: "[68px]",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "blue.a100",
  borderRadius: "full",
  backgroundColor: "blue.a100",
  color: "white",
  cursor: "pointer",
  isolation: "isolate",
  boxShadow:
    "[0 10px 26px rgb(42 128 200 / 0.30), inset 0 1px 0 rgb(255 255 255 / 0.22)]",
  transition:
    "[transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease]",
  _hover: {
    backgroundColor: "blue.a110",
    transform: "translateY(-2px) scale(1.03)",
    boxShadow:
      "[0 14px 30px rgb(42 128 200 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.24)]",
  },
  _focusVisible: {
    outline: "3px solid",
    outlineColor: "blue.a40",
    outlineOffset: "[4px]",
  },
  _disabled: {
    cursor: "not-allowed",
    opacity: "0.52",
    transform: "none",
  },
});

const activeMicrophoneButtonStyle = css({
  borderColor: "red.s100",
  backgroundColor: "red.s100",
  boxShadow:
    "[0 10px 28px rgb(211 47 47 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.20)]",
  _hover: {
    backgroundColor: "red.s110",
    boxShadow:
      "[0 14px 32px rgb(211 47 47 / 0.38), inset 0 1px 0 rgb(255 255 255 / 0.22)]",
  },
});

const eventLogStyle = css({
  display: "flex",
  maxHeight: "28",
  marginTop: "2",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a15",
  borderRadius: "md",
  backgroundColor: "neutral.a05",
  color: "neutral.s70",
  fontFamily: "mono",
  fontSize: "xs",
});

const technicalDetailsStyle = css({
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  paddingTop: "2",
});

const technicalSummaryStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "neutral.s75",
  cursor: "pointer",
  fontSize: "xs",
  fontWeight: "medium",
});

const technicalSummaryLabelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});

const eventCountStyle = css({
  color: "neutral.s65",
  fontWeight: "normal",
});

const eventRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
});

const emptyLogStyle = css({
  color: "neutral.s50",
  fontFamily: "body",
});

const toolDiagnosticsSectionStyle = css({
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  gap: "2",
});

const toolDiagnosticsHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "1",
});

const toolDiagnosticsLogStyle = css({
  display: "flex",
  maxHeight: "36",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a15",
  borderRadius: "xl",
  backgroundColor: "neutral.a10",
});

const toolDiagnosticEmptyStyle = css({
  display: "flex",
  minHeight: "14",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  color: "neutral.s65",
  fontSize: "sm",
});

const toolDiagnosticCardStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  gap: "1.5",
  paddingX: "2.5",
  paddingY: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "lg",
  backgroundColor: "white",
});

const toolDiagnosticNameStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "blue.a85",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "semibold",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const toolDiagnosticTurnStyle = css({
  color: "neutral.s50",
  fontFamily: "mono",
  fontSize: "xs",
  whiteSpace: "nowrap",
});

const toolDiagnosticSummaryStyle = css({
  gridColumn: "[1 / -1]",
  color: "neutral.s75",
  fontSize: "sm",
  lineHeight: "relaxed",
  overflowWrap: "anywhere",
});

const toolDiagnosticCallStyle = css({
  gridColumn: "[1 / -1]",
  color: "neutral.s45",
  fontFamily: "mono",
  fontSize: "xs",
  overflowWrap: "anywhere",
});

type SessionState =
  | "ready"
  | "connecting"
  | "connected"
  | "responding"
  | "ending"
  | "ended"
  | "error";

type LoggedEvent = {
  event: VoiceExperimentEvent;
  sequence: number;
};

type TranscriptEntry = {
  id: number;
  isPartial: boolean;
  speaker: "assistant" | "expert";
  transcript: string;
  turnId: number;
};

const getTranscriptEntries = (events: LoggedEvent[]): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];
  const partialEntryIndexes = new Map<string, number>();

  for (const { event, sequence } of events) {
    if (
      event.type === "partial-transcript" ||
      event.type === "final-transcript"
    ) {
      const partialKey = `${event.turnId}:${event.speaker}`;
      const partialEntryIndex = partialEntryIndexes.get(partialKey);
      const entry: TranscriptEntry = {
        id:
          partialEntryIndex === undefined
            ? sequence
            : (entries[partialEntryIndex]?.id ?? sequence),
        isPartial: event.type === "partial-transcript",
        speaker: event.speaker,
        transcript: event.transcript,
        turnId: event.turnId,
      };

      if (partialEntryIndex === undefined) {
        if (event.type === "partial-transcript") {
          partialEntryIndexes.set(partialKey, entries.length);
        }
        entries.push(entry);
      } else {
        entries[partialEntryIndex] = entry;
        if (event.type === "final-transcript") {
          partialEntryIndexes.delete(partialKey);
        }
      }
    }
  }

  return entries;
};

const getEventSummary = (event: VoiceExperimentEvent) => {
  if (event.type === "partial-transcript") {
    return `${event.type} (${event.speaker}): ${event.transcript}`;
  }
  if (event.type === "final-transcript") {
    return `${event.type} (${event.speaker}): ${event.transcript}`;
  }
  if (event.type === "tool-called") {
    return `${event.type}: ${event.toolName} · turn ${event.turnId} · call ${event.callId}`;
  }
  if (event.type === "error") {
    return `${event.type}: ${event.message}`;
  }
  return event.type;
};

const createErrorEvent = (error: unknown): VoiceExperimentEvent => ({
  message: error instanceof Error ? error.message : "Voice experiment failed.",
  timestampMs: Date.now(),
  type: "error",
});

export const VoiceExperiment = ({
  adapter,
  experiment,
}: {
  adapter?: VoiceExperimentAdapter;
  experiment: VoiceExperimentName;
}) => {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("ready");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const hasToggledPanelRef = useRef(false);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const sequenceRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollTranscriptRef = useRef(true);

  const appendEvent = useCallback((event: VoiceExperimentEvent) => {
    setEvents((previous) => [
      ...previous.slice(-49),
      { event, sequence: ++sequenceRef.current },
    ]);

    if (event.type === "connected") {
      setSessionState("connected");
    } else if (event.type === "recording-started") {
      setIsConversationActive(true);
    } else if (event.type === "response-started") {
      setSessionState("responding");
    } else if (event.type === "response-completed") {
      setSessionState("connected");
    } else if (event.type === "error") {
      setSessionState("error");
    }
  }, []);

  useEffect(() => adapter?.subscribe(appendEvent), [adapter, appendEvent]);

  useEffect(() => {
    if (!hasToggledPanelRef.current) {
      return;
    }

    if (isExpanded) {
      minimizeButtonRef.current?.focus();
    } else {
      launcherButtonRef.current?.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    const dispose = () => {
      void adapter?.dispose();
    };

    window.addEventListener("pagehide", dispose);
    return () => {
      window.removeEventListener("pagehide", dispose);
      dispose();
    };
  }, [adapter]);

  const startConversation = async () => {
    if (!adapter || sessionState !== "ready") {
      return;
    }

    setSessionState("connecting");
    try {
      await adapter.connect();
      await adapter.startTurn();
      setIsConversationActive(true);
      setSessionState("connected");
    } catch (error) {
      setIsConversationActive(false);
      await adapter.dispose().catch(() => undefined);
      appendEvent(createErrorEvent(error));
    }
  };

  const stopConversation = async () => {
    if (!adapter || sessionState === "ready" || sessionState === "ended") {
      return;
    }

    setIsConversationActive(false);
    setSessionState("ending");
    try {
      await adapter.dispose();
      setSessionState("ended");
    } catch (error) {
      appendEvent(createErrorEvent(error));
    }
  };

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && shouldAutoScrollTranscriptRef.current) {
      transcript.scrollTo({ top: transcript.scrollHeight });
    }
  }, [events]);

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current;
    if (transcript) {
      const distanceFromBottom =
        transcript.scrollHeight -
        transcript.scrollTop -
        transcript.clientHeight;
      shouldAutoScrollTranscriptRef.current = distanceFromBottom < 24;
    }
  };

  const transcriptEntries = getTranscriptEntries(events);
  const toolDiagnostics = events.filter(
    (
      entry,
    ): entry is LoggedEvent & {
      event: Extract<VoiceExperimentEvent, { type: "tool-called" }>;
    } => entry.event.type === "tool-called",
  );
  const isConnected =
    sessionState === "connected" || sessionState === "responding";
  const isPending = sessionState === "connecting" || sessionState === "ending";
  const canToggleConversation =
    Boolean(adapter) &&
    !isPending &&
    (sessionState === "ready" || isConversationActive);
  const latestEvent = events.at(-1)?.event;
  const statusLabel = !adapter
    ? "Unavailable"
    : sessionState === "ready"
      ? "Ready"
      : sessionState === "connecting"
        ? "Connecting"
        : sessionState === "connected" || sessionState === "responding"
          ? "Conversation active"
          : sessionState === "ending"
            ? "Stopping"
            : sessionState === "ended"
              ? "Conversation ended"
              : latestEvent?.type === "error"
                ? latestEvent.message
                : "Connection error";
  const controlLabel = isConversationActive
    ? "Stop conversation"
    : sessionState === "connecting"
      ? "Starting…"
      : sessionState === "ending"
        ? "Stopping…"
        : sessionState === "ended"
          ? "Conversation ended"
          : sessionState === "error"
            ? "Unavailable"
            : "Start conversation";

  return (
    <div className={`${dockStyle} petrinaut-root`}>
      <button
        ref={launcherButtonRef}
        aria-controls="voice-experiment-panel"
        aria-expanded={isExpanded}
        aria-hidden={isExpanded}
        aria-label={
          isConversationActive
            ? "Open active voice interview"
            : "Open voice interview"
        }
        className={[
          launcherButtonStyle,
          "voice-experiment-launcher",
          isExpanded ? hiddenLauncherButtonStyle : "",
          isConversationActive ? activeLauncherButtonStyle : "",
          isConversationActive ? "voice-conversation-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          hasToggledPanelRef.current = true;
          setIsExpanded(true);
        }}
        tabIndex={isExpanded ? -1 : 0}
        title={
          isConversationActive
            ? "Open active voice interview"
            : "Open voice interview"
        }
        type="button"
      >
        <FiMic aria-hidden="true" size={19} />
        <span
          aria-hidden="true"
          className={[
            launcherStatusStyle,
            sessionState === "error"
              ? errorStatusIndicatorStyle
              : isPending
                ? pendingStatusIndicatorStyle
                : isConnected
                  ? connectedStatusIndicatorStyle
                  : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>

      <aside
        aria-hidden={!isExpanded}
        aria-label="Voice experiment"
        className={[
          panelStyle,
          "voice-experiment-panel",
          isExpanded ? expandedPanelStyle : collapsedPanelStyle,
        ]
          .filter(Boolean)
          .join(" ")}
        id="voice-experiment-panel"
      >
        <header className={headerStyle}>
          <div className={headerIdentityStyle}>
            <div className={titleCopyStyle}>
              <strong className={headingStyle}>Voice interview</strong>
              <span className={experimentBadgeStyle}>
                {voiceExperimentLabel[experiment]}
              </span>
            </div>
          </div>
          <div className={headerActionsStyle}>
            <span
              aria-label={statusLabel}
              className={[
                statusIndicatorStyle,
                sessionState === "error"
                  ? errorStatusIndicatorStyle
                  : isPending
                    ? pendingStatusIndicatorStyle
                    : isConnected
                      ? connectedStatusIndicatorStyle
                      : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="status"
              title={statusLabel}
            />
            <button
              ref={minimizeButtonRef}
              aria-label="Minimize voice interview"
              className={minimizeButtonStyle}
              onClick={() => {
                hasToggledPanelRef.current = true;
                setIsExpanded(false);
              }}
              title="Minimize voice interview"
              type="button"
            >
              <FiChevronDown aria-hidden="true" size={17} />
            </button>
          </div>
        </header>

        <div className={conversationControlStyle}>
          <button
            aria-label={controlLabel}
            aria-pressed={isConversationActive}
            className={[
              microphoneButtonStyle,
              isConversationActive ? activeMicrophoneButtonStyle : "",
              isConversationActive ? "voice-conversation-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!canToggleConversation}
            onClick={() =>
              void (isConversationActive
                ? stopConversation()
                : startConversation())
            }
            title={controlLabel}
            type="button"
          >
            {isConversationActive ? (
              <FiSquare aria-hidden="true" fill="currentColor" size={22} />
            ) : (
              <FiMic aria-hidden="true" size={26} />
            )}
          </button>
        </div>

        <section className={transcriptSectionStyle}>
          <div className={transcriptHeaderStyle}>
            <span className={sectionHeadingStyle}>
              <FiMessageSquare aria-hidden="true" size={14} />
              <span className={sectionLabelStyle}>Transcript</span>
            </span>
            <span className={transcriptCountStyle}>
              {transcriptEntries.length}{" "}
              {transcriptEntries.length === 1 ? "message" : "messages"}
            </span>
          </div>
          <div
            aria-label="Conversation transcript"
            aria-live="polite"
            className={transcriptStyle}
            onScroll={handleTranscriptScroll}
            ref={transcriptRef}
            role="log"
            // A bounded transcript must be keyboard-focusable to scroll.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
          >
            {transcriptEntries.length === 0 ? (
              <p className={transcriptPlaceholderStyle}>
                <FiMessageSquare aria-hidden="true" size={16} />
                Conversation appears here
              </p>
            ) : (
              transcriptEntries.map((entry) => (
                <div
                  className={[
                    transcriptEntryStyle,
                    entry.speaker === "expert"
                      ? expertTranscriptEntryStyle
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={entry.id}
                >
                  <span className={transcriptSpeakerStyle}>
                    {entry.speaker === "expert" ? "Expert" : "Interviewer"}
                  </span>
                  <p
                    className={[
                      transcriptBubbleStyle,
                      entry.speaker === "expert"
                        ? expertTranscriptBubbleStyle
                        : "",
                      entry.isPartial ? partialTranscriptStyle : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {entry.transcript}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section
          aria-labelledby="voice-tool-diagnostics-heading"
          className={toolDiagnosticsSectionStyle}
        >
          <div className={toolDiagnosticsHeaderStyle}>
            <span className={sectionHeadingStyle}>
              <FiTool aria-hidden="true" size={14} />
              <span
                className={sectionLabelStyle}
                id="voice-tool-diagnostics-heading"
              >
                Tool calls
              </span>
            </span>
            <span className={transcriptCountStyle}>
              {toolDiagnostics.length}
            </span>
          </div>
          <div
            aria-label="Tool call diagnostics"
            aria-live="polite"
            className={toolDiagnosticsLogStyle}
            role="log"
          >
            {toolDiagnostics.length === 0 ? (
              <p className={toolDiagnosticEmptyStyle}>
                <FiTool aria-hidden="true" size={14} />
                Tool calls appear here
              </p>
            ) : (
              toolDiagnostics.map(({ event, sequence }) => (
                <article className={toolDiagnosticCardStyle} key={sequence}>
                  <strong className={toolDiagnosticNameStyle}>
                    {event.toolName}
                  </strong>
                  <span className={toolDiagnosticTurnStyle}>
                    Turn {event.turnId}
                  </span>
                  <p className={toolDiagnosticSummaryStyle}>
                    {event.argumentSummary}
                  </p>
                  <span className={toolDiagnosticCallStyle}>
                    Call {event.callId}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <details className={technicalDetailsStyle}>
          <summary className={technicalSummaryStyle}>
            <span className={technicalSummaryLabelStyle}>
              <FiActivity aria-hidden="true" size={13} />
              Logs
            </span>
            <span className={eventCountStyle}>
              {events.length} {events.length === 1 ? "event" : "events"}
            </span>
          </summary>
          <div className={eventLogStyle}>
            {events.length === 0 ? (
              <span className={emptyLogStyle}>
                No events · conversation {conversationId.slice(0, 8)}
              </span>
            ) : (
              events.map(({ event, sequence }) => (
                <div className={eventRowStyle} key={sequence}>
                  <span>
                    {String(sequence).padStart(2, "0")} ·{" "}
                    {getEventSummary(event)}
                  </span>
                  <time dateTime={new Date(event.timestampMs).toISOString()}>
                    {new Date(event.timestampMs).toLocaleTimeString()}
                  </time>
                </div>
              ))
            )}
          </div>
        </details>
      </aside>
    </div>
  );
};
