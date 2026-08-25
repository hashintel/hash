import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiMaximize2,
  FiMessageSquare,
  FiMic,
  FiMinimize2,
  FiSquare,
  FiTool,
} from "react-icons/fi";

import { css } from "@hashintel/ds-helpers/css";

import {
  getTranscriptEntries,
  type TranscriptEntry,
} from "./voice-experiment/transcript-entries";
import {
  getVoiceExperimentLabel,
  type VoiceExperimentSelection,
} from "./voice-experiment/voice-experiment-selection";

import type { FinalizeInterviewInput } from "./voice-experiment/interview-draft";
import type { VoiceExperimentAdapter } from "./voice-experiment/voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment/voice-experiment-events";

const dockStyle = css({
  position: "fixed",
  zIndex: "popover",
  bottom: "[76px]",
  left: "0",
  width: "full",
  maxWidth: "[none]",
  backgroundColor: "[transparent]",
  pointerEvents: "none",
});

const fullscreenDockStyle = css({
  zIndex: "[1600]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4",
  backgroundColor: "[rgb(15 23 42 / 0.62)]",
  backdropFilter: "[blur(5px)]",
  pointerEvents: "auto",
});

const panelStyle = css({
  position: "relative",
  display: "flex",
  width: "full",
  maxWidth: "[600px]",
  maxHeight: "[calc(100vh - 108px)]",
  marginX: "auto",
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
  pointerEvents: "auto",
});

const fullscreenPanelStyle = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a35",
  borderRadius: "2xl",
  boxShadow: "[0 32px 96px rgb(15 23 42 / 0.42)]",
});

const launcherButtonStyle = css({
  position: "absolute",
  right: "[16px]",
  bottom: "[-52px]",
  display: "inline-flex",
  width: "12",
  height: "12",
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
    transform: "translateY(-2px) scale(1.04)",
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
  transform: "translateY(8px) scale(0.78)",
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

const sectionHeaderMetaStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const sectionActionsStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});

const sectionActionButtonStyle = css({
  display: "inline-flex",
  width: "7",
  height: "7",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "md",
  backgroundColor: "white",
  color: "neutral.s65",
  cursor: "pointer",
  transition:
    "[background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease]",
  _hover: {
    borderColor: "blue.a35",
    backgroundColor: "blue.a10",
    color: "blue.a95",
    transform: "translateY(-1px)",
  },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "blue.a35",
    outlineOffset: "[2px]",
  },
});

const copiedSectionActionButtonStyle = css({
  borderColor: "green.a35",
  backgroundColor: "green.a10",
  color: "green.a95",
});

const fullscreenSectionStyle = css({
  flex: "1",
  minHeight: "0",
});

const fullscreenContentStyle = css({
  flex: "1",
  maxHeight: "[none]",
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
  flexDirection: "column",
  gap: "2",
  justifyContent: "center",
  paddingY: "1",
});

const conversationControlLabelStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "semibold",
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
  minHeight: "20",
  maxHeight: "36",
  flexDirection: "column",
  gap: "1.5",
  padding: "2",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.a10",
});

const logsSectionStyle = css({
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  gap: "2",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  paddingTop: "2",
});

const logsHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "1",
});

const eventRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(0, 1fr) auto]",
  alignItems: "start",
  gap: "2",
  padding: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a15",
  borderRadius: "lg",
  backgroundColor: "white",
});

const eventSequenceStyle = css({
  display: "inline-flex",
  minWidth: "7",
  height: "6",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "md",
  backgroundColor: "neutral.a15",
  color: "neutral.s60",
  fontFamily: "mono",
  fontSize: "[11px]",
  fontWeight: "semibold",
});

const eventBodyStyle = css({
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
  gap: "0.5",
});

const eventTypeStyle = css({
  color: "blue.a85",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "semibold",
  overflowWrap: "anywhere",
});

const eventSummaryStyle = css({
  color: "neutral.s75",
  fontSize: "xs",
  lineHeight: "relaxed",
  overflowWrap: "anywhere",
});

const eventTimeStyle = css({
  color: "neutral.s50",
  fontFamily: "mono",
  fontSize: "[11px]",
  whiteSpace: "nowrap",
});

const emptyLogStyle = css({
  padding: "3",
  color: "neutral.s50",
  fontSize: "sm",
  textAlign: "center",
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
  | "start-error"
  | "error";

type LoggedEvent = {
  event: VoiceExperimentEvent;
  sequence: number;
};

type DetailSection = "logs" | "tools" | "transcript";

const PROJECTION_DEBOUNCE_MS = 300;

const createInterviewInput = (
  events: readonly LoggedEvent[],
  conversationId: string,
  readiness: FinalizeInterviewInput["readiness"],
  revision: number,
): FinalizeInterviewInput => ({
  captures: events.flatMap(({ event }) =>
    event.type === "tool-called" && event.capture ? [event.capture] : [],
  ),
  conversationId,
  readiness,
  revision,
  transcript: getTranscriptEntries(events)
    .filter((entry) => !entry.isPartial)
    .map(({ speaker, transcript, turnId }) => ({
      speaker,
      transcript,
      turnId,
    })),
});

const getEventSummary = (event: VoiceExperimentEvent) => {
  if (event.type === "partial-transcript") {
    return `${event.speaker} · ${event.transcript}`;
  }
  if (event.type === "final-transcript") {
    return `${event.speaker} · ${event.transcript}`;
  }
  if (event.type === "tool-called") {
    return `${event.toolName} · turn ${event.turnId} · call ${event.callId}`;
  }
  if (event.type === "projection-updated") {
    return `Draft updated to revision ${event.revision}`;
  }
  if (event.type === "projection-error") {
    return `Revision ${event.revision} · ${event.message}`;
  }
  if (event.type === "projection-ready") {
    return `Applied sweep ${event.callId}`;
  }
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "recording-started") {
    return `Expert microphone opened for turn ${event.turnId}`;
  }
  if (event.type === "response-started") {
    return `Interviewer response started for turn ${event.turnId}`;
  }
  if (event.type === "response-completed") {
    return event.responseText
      ? `Interviewer response completed · ${event.responseText}`
      : `Interviewer response completed for turn ${event.turnId}`;
  }
  return event.conversationId
    ? `Provider connected · ${event.conversationId}`
    : "Provider connected";
};

const formatTranscriptOutput = (
  transcriptEntries: readonly TranscriptEntry[],
): string =>
  transcriptEntries
    .map(
      (entry) =>
        `${entry.speaker === "expert" ? "Expert" : "Interviewer"}${
          entry.isPartial ? " (partial)" : ""
        }: ${entry.transcript}`,
    )
    .join("\n\n");

const formatToolOutput = (events: readonly LoggedEvent[]): string =>
  events
    .flatMap(({ event }) =>
      event.type === "tool-called"
        ? [
            [
              `[Turn ${event.turnId}] ${event.toolName}`,
              event.argumentSummary,
              `Call ${event.callId}`,
              ...(event.capture
                ? [`Capture ${JSON.stringify(event.capture.input)}`]
                : []),
            ].join("\n"),
          ]
        : [],
    )
    .join("\n\n");

const formatLogOutput = (events: readonly LoggedEvent[]): string =>
  events
    .map(
      ({ event, sequence }) =>
        `${new Date(event.timestampMs).toISOString()}  #${String(
          sequence,
        ).padStart(2, "0")}  ${event.type}  ${getEventSummary(event)}`,
    )
    .join("\n");

const writeTextToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

const createErrorEvent = (error: unknown): VoiceExperimentEvent => ({
  message: error instanceof Error ? error.message : "Voice experiment failed.",
  timestampMs: Date.now(),
  type: "error",
});

const DetailSectionActions = ({
  copied,
  isFullscreen,
  label,
  onCopy,
  onToggleFullscreen,
}: {
  copied: boolean;
  isFullscreen: boolean;
  label: string;
  onCopy: () => void;
  onToggleFullscreen: () => void;
}) => (
  <div className={sectionActionsStyle}>
    <button
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className={[
        sectionActionButtonStyle,
        copied ? copiedSectionActionButtonStyle : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onCopy}
      title={copied ? "Copied" : `Copy ${label}`}
      type="button"
    >
      {copied ? (
        <FiCheck aria-hidden="true" size={14} />
      ) : (
        <FiCopy aria-hidden="true" size={14} />
      )}
    </button>
    <button
      aria-label={`${isFullscreen ? "Exit fullscreen" : "Show fullscreen"} ${label}`}
      aria-pressed={isFullscreen}
      className={sectionActionButtonStyle}
      onClick={onToggleFullscreen}
      title={`${isFullscreen ? "Exit fullscreen" : "Show fullscreen"} ${label}`}
      type="button"
    >
      {isFullscreen ? (
        <FiMinimize2 aria-hidden="true" size={14} />
      ) : (
        <FiMaximize2 aria-hidden="true" size={14} />
      )}
    </button>
  </div>
);

export const VoiceExperiment = ({
  adapter,
  conversationId,
  experiment,
  onFinalize,
  onProject,
}: {
  adapter?: VoiceExperimentAdapter;
  conversationId: string;
  experiment: VoiceExperimentSelection;
  onFinalize?: (input: FinalizeInterviewInput) => Promise<void> | void;
  onProject?: (input: FinalizeInterviewInput) => boolean | Promise<boolean>;
}) => {
  const [copiedSection, setCopiedSection] = useState<DetailSection | null>(
    null,
  );
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [fullscreenSection, setFullscreenSection] =
    useState<DetailSection | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [projectionRequestRevision, setProjectionRequestRevision] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("ready");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const hasToggledPanelRef = useRef(false);
  const copiedResetTimeoutRef = useRef<number | null>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const sequenceRef = useRef(0);
  const finalizationConversationIdRef = useRef(conversationId);
  const finalizationEventsRef = useRef<LoggedEvent[]>([]);
  const onProjectRef = useRef(onProject);
  const projectionReadinessRef =
    useRef<FinalizeInterviewInput["readiness"]>("captures");
  const projectionRevisionRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollTranscriptRef = useRef(true);

  const appendEvent = useCallback(
    (event: VoiceExperimentEvent) => {
      const loggedEvent = { event, sequence: ++sequenceRef.current };
      if (
        event.type === "partial-transcript" ||
        event.type === "final-transcript" ||
        event.type === "tool-called"
      ) {
        finalizationEventsRef.current.push(loggedEvent);
      }
      if (
        (event.type === "tool-called" && event.capture) ||
        event.type === "projection-ready"
      ) {
        projectionReadinessRef.current =
          event.type === "projection-ready" ? "elicitor" : "captures";
        projectionRevisionRef.current += 1;
        setProjectionRequestRevision(projectionRevisionRef.current);
      }
      setEvents((previous) => [...previous.slice(-49), loggedEvent]);

      if (event.type === "connected") {
        finalizationConversationIdRef.current =
          event.conversationId ?? conversationId;
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
    },
    [conversationId],
  );

  useEffect(() => adapter?.subscribe(appendEvent), [adapter, appendEvent]);

  useEffect(() => {
    onProjectRef.current = onProject;
  }, [onProject]);

  useEffect(
    () => () => {
      if (copiedResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!fullscreenSection) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenSection(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenSection]);

  useEffect(() => {
    if (projectionRequestRevision < 1) {
      return;
    }
    const timeout = window.setTimeout(() => {
      const project = onProjectRef.current;
      if (!project) {
        return;
      }
      const input = createInterviewInput(
        finalizationEventsRef.current,
        finalizationConversationIdRef.current,
        projectionReadinessRef.current,
        projectionRequestRevision,
      );
      void Promise.resolve(project(input))
        .then((updated) => {
          if (updated) {
            appendEvent({
              revision: projectionRequestRevision,
              timestampMs: Date.now(),
              type: "projection-updated",
            });
          }
        })
        .catch((error: unknown) => {
          appendEvent({
            message:
              error instanceof Error
                ? error.message
                : "Live projection failed.",
            revision: projectionRequestRevision,
            timestampMs: Date.now(),
            type: "projection-error",
          });
        });
    }, PROJECTION_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [appendEvent, projectionRequestRevision]);

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
    if (
      !adapter ||
      (sessionState !== "ready" && sessionState !== "start-error")
    ) {
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
      setSessionState("start-error");
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
      if (onFinalize) {
        await onFinalize(
          createInterviewInput(
            finalizationEventsRef.current,
            finalizationConversationIdRef.current,
            "finalize",
            projectionRevisionRef.current + 1,
          ),
        );
      }
      setSessionState("ended");
    } catch (error) {
      appendEvent(createErrorEvent(error));
    }
  };

  const openVoiceInterview = () => {
    hasToggledPanelRef.current = true;
    setIsExpanded(true);

    if (sessionState === "ready") {
      void startConversation();
    }
  };

  const minimizeVoiceInterview = () => {
    hasToggledPanelRef.current = true;
    setFullscreenSection(null);
    setIsExpanded(false);
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
  const copySectionOutput = async (section: DetailSection) => {
    const output =
      section === "transcript"
        ? formatTranscriptOutput(transcriptEntries)
        : section === "tools"
          ? formatToolOutput(events)
          : formatLogOutput(events);
    try {
      await writeTextToClipboard(output || `No ${section} output.`);
    } catch {
      return;
    }
    setCopiedSection(section);
    if (copiedResetTimeoutRef.current !== null) {
      window.clearTimeout(copiedResetTimeoutRef.current);
    }
    copiedResetTimeoutRef.current = window.setTimeout(() => {
      setCopiedSection(null);
      copiedResetTimeoutRef.current = null;
    }, 1_500);
  };
  const toggleFullscreenSection = (section: DetailSection) => {
    setFullscreenSection((current) => (current === section ? null : section));
  };
  const showTranscript =
    fullscreenSection === null || fullscreenSection === "transcript";
  const showTools = fullscreenSection === null || fullscreenSection === "tools";
  const showLogs = fullscreenSection === null || fullscreenSection === "logs";
  const isConnected =
    sessionState === "connected" || sessionState === "responding";
  const isPending = sessionState === "connecting" || sessionState === "ending";
  const canToggleConversation =
    Boolean(adapter) &&
    !isPending &&
    (sessionState === "ready" ||
      sessionState === "start-error" ||
      isConversationActive);
  const latestEvent = events.at(-1)?.event;
  const statusLabel = !adapter
    ? "Unavailable"
    : sessionState === "ready"
      ? "Ready"
      : sessionState === "start-error"
        ? "Ready to retry"
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
    ? onFinalize
      ? "Finish and create net"
      : "Stop conversation"
    : sessionState === "connecting"
      ? "Starting…"
      : sessionState === "ending"
        ? onFinalize
          ? "Creating draft…"
          : "Stopping…"
        : sessionState === "ended"
          ? "Conversation ended"
          : sessionState === "start-error"
            ? "Retry conversation"
            : sessionState === "error"
              ? "Unavailable"
              : "Start conversation";

  return (
    <div
      className={[
        dockStyle,
        fullscreenSection ? fullscreenDockStyle : "",
        "petrinaut-root",
      ]
        .filter(Boolean)
        .join(" ")}
      data-ai-cta-dismiss-exempt=""
      style={
        fullscreenSection
          ? {
              inset: 0,
              height: "100dvh",
              maxWidth: "none",
              transform: "none",
              width: "100vw",
            }
          : undefined
      }
    >
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
        onClick={openVoiceInterview}
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

      {isExpanded && (
        <aside
          aria-label="Voice experiment"
          className={[
            panelStyle,
            fullscreenSection ? fullscreenPanelStyle : "",
            "voice-experiment-panel",
          ]
            .filter(Boolean)
            .join(" ")}
          id="voice-experiment-panel"
          role={fullscreenSection ? "dialog" : undefined}
          style={
            fullscreenSection
              ? {
                  height: "min(56rem, calc(100dvh - 48px))",
                  maxHeight: "none",
                  maxWidth: "none",
                  width: "min(72rem, 100%)",
                }
              : undefined
          }
        >
          <header className={headerStyle}>
            <div className={headerIdentityStyle}>
              <div className={titleCopyStyle}>
                <strong className={headingStyle}>Voice interview</strong>
                <span className={experimentBadgeStyle}>
                  {getVoiceExperimentLabel(experiment)}
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
                onClick={minimizeVoiceInterview}
                title="Minimize voice interview"
                type="button"
              >
                <FiChevronDown aria-hidden="true" size={17} />
              </button>
            </div>
          </header>

          {fullscreenSection === null && (
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
              <span className={conversationControlLabelStyle}>
                {controlLabel}
              </span>
            </div>
          )}

          {showTranscript && (
            <section
              className={[
                transcriptSectionStyle,
                fullscreenSection === "transcript"
                  ? fullscreenSectionStyle
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={transcriptHeaderStyle}>
                <span className={sectionHeadingStyle}>
                  <FiMessageSquare aria-hidden="true" size={14} />
                  <span className={sectionLabelStyle}>Transcript</span>
                </span>
                <div className={sectionHeaderMetaStyle}>
                  <span className={transcriptCountStyle}>
                    {transcriptEntries.length}{" "}
                    {transcriptEntries.length === 1 ? "message" : "messages"}
                  </span>
                  <DetailSectionActions
                    copied={copiedSection === "transcript"}
                    isFullscreen={fullscreenSection === "transcript"}
                    label="transcript"
                    onCopy={() => void copySectionOutput("transcript")}
                    onToggleFullscreen={() =>
                      toggleFullscreenSection("transcript")
                    }
                  />
                </div>
              </div>
              <div
                aria-label="Conversation transcript"
                aria-live="polite"
                className={[
                  transcriptStyle,
                  fullscreenSection === "transcript"
                    ? fullscreenContentStyle
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
          )}

          {showTools && (
            <section
              aria-labelledby="voice-tool-diagnostics-heading"
              className={[
                toolDiagnosticsSectionStyle,
                fullscreenSection === "tools" ? fullscreenSectionStyle : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
                <div className={sectionHeaderMetaStyle}>
                  <span className={transcriptCountStyle}>
                    {toolDiagnostics.length}
                  </span>
                  <DetailSectionActions
                    copied={copiedSection === "tools"}
                    isFullscreen={fullscreenSection === "tools"}
                    label="tool calls"
                    onCopy={() => void copySectionOutput("tools")}
                    onToggleFullscreen={() => toggleFullscreenSection("tools")}
                  />
                </div>
              </div>
              <div
                aria-label="Tool call diagnostics"
                aria-live="polite"
                className={[
                  toolDiagnosticsLogStyle,
                  fullscreenSection === "tools" ? fullscreenContentStyle : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
          )}

          {showLogs && (
            <section
              aria-labelledby="voice-event-log-heading"
              className={[
                logsSectionStyle,
                fullscreenSection === "logs" ? fullscreenSectionStyle : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={logsHeaderStyle}>
                <span className={sectionHeadingStyle}>
                  <FiActivity aria-hidden="true" size={14} />
                  <span
                    className={sectionLabelStyle}
                    id="voice-event-log-heading"
                  >
                    Logs
                  </span>
                </span>
                <div className={sectionHeaderMetaStyle}>
                  <span className={transcriptCountStyle}>
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                  <DetailSectionActions
                    copied={copiedSection === "logs"}
                    isFullscreen={fullscreenSection === "logs"}
                    label="logs"
                    onCopy={() => void copySectionOutput("logs")}
                    onToggleFullscreen={() => toggleFullscreenSection("logs")}
                  />
                </div>
              </div>
              <div
                aria-label="Voice event log"
                aria-live="polite"
                className={[
                  eventLogStyle,
                  fullscreenSection === "logs" ? fullscreenContentStyle : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="log"
              >
                {events.length === 0 ? (
                  <span className={emptyLogStyle}>
                    No events · conversation {conversationId.slice(0, 8)}
                  </span>
                ) : (
                  events.map(({ event, sequence }) => (
                    <article className={eventRowStyle} key={sequence}>
                      <span className={eventSequenceStyle}>
                        {String(sequence).padStart(2, "0")}
                      </span>
                      <div className={eventBodyStyle}>
                        <strong className={eventTypeStyle}>{event.type}</strong>
                        <span className={eventSummaryStyle}>
                          {getEventSummary(event)}
                        </span>
                      </div>
                      <time
                        className={eventTimeStyle}
                        dateTime={new Date(event.timestampMs).toISOString()}
                      >
                        {new Date(event.timestampMs).toLocaleTimeString()}
                      </time>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}
        </aside>
      )}
    </div>
  );
};
