import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MdGraphicEq, MdMic } from "react-icons/md";

import { css } from "@hashintel/ds-helpers/css";

import {
  type VoiceExperiment as VoiceExperimentName,
  voiceExperimentLabel,
} from "./voice-experiment/voice-experiment-selection";

import type { VoiceExperimentAdapter } from "./voice-experiment/voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment/voice-experiment-events";

const SCENARIO_SCRIPT =
  "Trace an urgent customer support escalation from first report to resolution.";

const panelStyle = css({
  position: "fixed",
  zIndex: "popover",
  bottom: "4",
  left: "[50%]",
  display: "flex",
  width: "[calc(100vw - 32px)]",
  maxWidth: "[620px]",
  maxHeight: "[calc(100vh - 32px)]",
  transform: "translateX(-50%)",
  flexDirection: "column",
  gap: "3",
  padding: "4",
  overflow: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "xl",
  backgroundColor: "neutral.s00",
  boxShadow: "xl",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
});

const headingStyle = css({
  color: "neutral.s100",
  fontSize: "lg",
  fontWeight: "semibold",
});

const experimentBadgeStyle = css({
  paddingX: "3",
  paddingY: "1.5",
  borderRadius: "full",
  backgroundColor: "blue.a10",
  color: "blue.a85",
  fontSize: "xs",
  fontWeight: "semibold",
});

const scenarioStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "3",
  borderRadius: "lg",
  backgroundColor: "neutral.a10",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const sectionLabelStyle = css({
  color: "blue.a85",
  fontSize: "xs",
  fontWeight: "semibold",
  letterSpacing: "wide",
  textTransform: "uppercase",
});

const transcriptStyle = css({
  display: "flex",
  minHeight: "16",
  maxHeight: "52",
  flexDirection: "column",
  gap: "2.5",
  padding: "3",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "lg",
  backgroundColor: "neutral.a05",
  color: "neutral.s70",
  fontSize: "sm",
  lineHeight: "relaxed",
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
  color: "neutral.s55",
  fontSize: "xs",
  fontWeight: "medium",
});

const transcriptBubbleStyle = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.a10",
  color: "neutral.s80",
});

const expertTranscriptBubbleStyle = css({
  backgroundColor: "blue.a15",
});

const partialTranscriptStyle = css({
  opacity: "0.7",
});

const transcriptPlaceholderStyle = css({
  margin: "auto",
  color: "neutral.s55",
  textAlign: "center",
});

const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const sessionAreaStyle = css({
  display: "flex",
  minWidth: "0",
  flex: "1",
  flexDirection: "column",
  gap: "2",
});

const sessionControlsStyle = css({
  display: "flex",
  width: "full",
  alignItems: "center",
  gap: "2",
});

const sessionButtonStyle = css({
  display: "inline-flex",
  minHeight: "12",
  alignItems: "center",
  justifyContent: "center",
  paddingX: "4",
  paddingY: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderRadius: "lg",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "semibold",
  transition: "[transform 120ms ease, box-shadow 120ms ease]",
  _disabled: {
    cursor: "not-allowed",
    opacity: "0.4",
  },
});

const startSessionButtonStyle = css({
  flex: "[2 1 0%]",
  borderColor: "blue.a100",
  backgroundColor: "blue.a100",
  color: "white",
  boxShadow: "md",
  _hover: {
    transform: "translateY(-1px)",
    boxShadow: "lg",
  },
});

const endSessionButtonStyle = css({
  flex: "1",
  borderColor: "red.a35",
  backgroundColor: "neutral.s00",
  color: "red.a85",
  _hover: {
    backgroundColor: "red.a10",
  },
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s70",
  fontSize: "xs",
});

const statusIndicatorStyle = css({
  width: "2",
  height: "2",
  flexShrink: "0",
  borderRadius: "full",
  backgroundColor: "neutral.a50",
});

const connectedStatusIndicatorStyle = css({
  backgroundColor: "green.a85",
  boxShadow: "[0 0 0 4px {colors.green.a15}]",
});

const liveStatusIndicatorStyle = css({
  backgroundColor: "red.a85",
  boxShadow: "[0 0 0 4px {colors.red.a15}]",
});

const errorStatusIndicatorStyle = css({
  backgroundColor: "red.a85",
});

const microphoneButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "14",
  height: "14",
  flexShrink: "0",
  borderRadius: "full",
  backgroundColor: "blue.a85",
  color: "white",
  cursor: "pointer",
  boxShadow: "md",
  touchAction: "none",
  transition: "[transform 120ms ease, background-color 120ms ease]",
  _hover: {
    backgroundColor: "blue.a100",
  },
  _focusVisible: {
    outline: "3px solid",
    outlineColor: "blue.a30",
    outlineOffset: "[2px]",
  },
  _disabled: {
    backgroundColor: "neutral.a30",
    color: "neutral.s50",
    cursor: "not-allowed",
    boxShadow: "[none]",
  },
});

const activeMicrophoneButtonStyle = css({
  transform: "scale(1.08)",
  backgroundColor: "red.a85",
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
  borderColor: "neutral.a20",
  borderRadius: "md",
  backgroundColor: "neutral.a05",
  color: "neutral.s60",
  fontFamily: "mono",
  fontSize: "xs",
});

const technicalDetailsStyle = css({
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a15",
  paddingTop: "2",
});

const technicalSummaryStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "neutral.s60",
  cursor: "pointer",
  fontSize: "xs",
  fontWeight: "medium",
});

const eventCountStyle = css({
  color: "neutral.s50",
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
  isPartial: boolean;
  speaker: "assistant" | "expert";
  transcript: string;
  turnId: number;
};

const getTranscriptEntries = (events: LoggedEvent[]): TranscriptEntry[] => {
  const entries = new Map<string, TranscriptEntry>();

  for (const { event } of events) {
    if (
      event.type === "partial-transcript" ||
      event.type === "final-transcript"
    ) {
      entries.set(`${event.turnId}:${event.speaker}`, {
        isPartial: event.type === "partial-transcript",
        speaker: event.speaker,
        transcript: event.transcript,
        turnId: event.turnId,
      });
    }
  }

  return [...entries.values()];
};

const getEventSummary = (event: VoiceExperimentEvent) => {
  if (event.type === "partial-transcript") {
    return `${event.type} (${event.speaker}): ${event.transcript}`;
  }
  if (event.type === "final-transcript") {
    return `${event.type} (${event.speaker}): ${event.transcript}`;
  }
  if (event.type === "tool-called") {
    return `${event.type}: ${event.toolName}`;
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
  const [sessionState, setSessionState] = useState<SessionState>("ready");
  const [isTurnActive, setIsTurnActive] = useState(false);
  const sequenceRef = useRef(0);
  const pressedRef = useRef(false);

  const appendEvent = useCallback((event: VoiceExperimentEvent) => {
    setEvents((previous) => [
      ...previous.slice(-49),
      { event, sequence: ++sequenceRef.current },
    ]);

    if (event.type === "connected") {
      setSessionState("connected");
    } else if (event.type === "recording-started") {
      setIsTurnActive(true);
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
    const dispose = () => {
      pressedRef.current = false;
      void adapter?.dispose();
    };

    window.addEventListener("pagehide", dispose);
    return () => {
      window.removeEventListener("pagehide", dispose);
      dispose();
    };
  }, [adapter]);

  const startSession = async () => {
    if (!adapter || sessionState !== "ready") {
      return;
    }

    setSessionState("connecting");
    try {
      await adapter.connect();
      setSessionState("connected");
    } catch (error) {
      appendEvent(createErrorEvent(error));
    }
  };

  const endSession = async () => {
    if (!adapter || sessionState === "ready" || sessionState === "ended") {
      return;
    }

    pressedRef.current = false;
    setIsTurnActive(false);
    setSessionState("ending");
    try {
      await adapter.dispose();
      setSessionState("ended");
    } catch (error) {
      appendEvent(createErrorEvent(error));
    }
  };

  const startTurn = async () => {
    if (
      !adapter ||
      (sessionState !== "connected" && sessionState !== "responding") ||
      pressedRef.current
    ) {
      return;
    }

    pressedRef.current = true;
    setIsTurnActive(true);
    try {
      await adapter.startTurn();
    } catch (error) {
      pressedRef.current = false;
      setIsTurnActive(false);
      appendEvent(createErrorEvent(error));
    }
  };

  const finishTurn = async () => {
    if (!adapter || !pressedRef.current) {
      return;
    }

    pressedRef.current = false;
    setIsTurnActive(false);
    try {
      await adapter.finishTurn();
    } catch (error) {
      appendEvent(createErrorEvent(error));
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void startTurn();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      void startTurn();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      void finishTurn();
    }
  };

  const transcriptEntries = getTranscriptEntries(events);
  const isConnected =
    sessionState === "connected" || sessionState === "responding";
  const isAdapterPending = !adapter;
  const canStartSession = Boolean(adapter) && sessionState === "ready";
  const canEndSession =
    Boolean(adapter) &&
    sessionState !== "ready" &&
    sessionState !== "ending" &&
    sessionState !== "ended";
  const canStartTurn = Boolean(adapter) && isConnected;
  const latestEvent = events.at(-1)?.event;
  const statusMessage = isAdapterPending
    ? "Voice connection unavailable"
    : isTurnActive
      ? "Listening — release to send"
      : sessionState === "ready"
        ? "Ready"
        : sessionState === "connecting"
          ? "Connecting…"
          : sessionState === "connected"
            ? "Connected — hold the microphone to speak"
            : sessionState === "responding"
              ? "Interviewer is responding…"
              : sessionState === "ending"
                ? "Ending…"
                : sessionState === "ended"
                  ? "Session ended"
                  : latestEvent?.type === "error"
                    ? latestEvent.message
                    : "Could not start the voice session";

  return (
    <aside
      aria-label="Voice experiment"
      className={`${panelStyle} petrinaut-root`}
    >
      <header className={headerStyle}>
        <strong className={headingStyle}>Voice interview</strong>
        <span className={experimentBadgeStyle}>
          {voiceExperimentLabel[experiment]}
        </span>
      </header>

      <div className={scenarioStyle}>
        <span className={sectionLabelStyle}>Scenario</span>
        <span>{SCENARIO_SCRIPT}</span>
      </div>

      <div className={controlsStyle}>
        <div className={sessionAreaStyle}>
          <div className={sessionControlsStyle}>
            <button
              className={[sessionButtonStyle, startSessionButtonStyle]
                .filter(Boolean)
                .join(" ")}
              disabled={!canStartSession}
              onClick={() => void startSession()}
              type="button"
            >
              Start session
            </button>
            <button
              className={[sessionButtonStyle, endSessionButtonStyle]
                .filter(Boolean)
                .join(" ")}
              disabled={!canEndSession}
              onClick={() => void endSession()}
              type="button"
            >
              End session
            </button>
          </div>
          <p className={statusStyle}>
            <span
              aria-hidden="true"
              className={[
                statusIndicatorStyle,
                isTurnActive
                  ? liveStatusIndicatorStyle
                  : isConnected
                    ? connectedStatusIndicatorStyle
                    : sessionState === "error"
                      ? errorStatusIndicatorStyle
                      : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
            {statusMessage}
          </p>
        </div>
        {canStartTurn ? (
          <button
            aria-label={
              isTurnActive ? "Release to finish speaking" : "Hold to speak"
            }
            className={[
              microphoneButtonStyle,
              isTurnActive ? activeMicrophoneButtonStyle : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPointerCancel={() => void finishTurn()}
            onPointerDown={handlePointerDown}
            onPointerUp={() => void finishTurn()}
            type="button"
          >
            {isTurnActive ? <MdGraphicEq size={24} /> : <MdMic size={24} />}
          </button>
        ) : null}
      </div>

      <div aria-live="polite" className={transcriptStyle} role="log">
        {transcriptEntries.length === 0 ? (
          <p className={transcriptPlaceholderStyle}>
            The conversation will appear here.
          </p>
        ) : (
          transcriptEntries.map((entry) => (
            <div
              className={[
                transcriptEntryStyle,
                entry.speaker === "expert" ? expertTranscriptEntryStyle : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${entry.turnId}:${entry.speaker}`}
            >
              <span className={transcriptSpeakerStyle}>
                {entry.speaker === "expert" ? "Expert" : "Interviewer"}
              </span>
              <p
                className={[
                  transcriptBubbleStyle,
                  entry.speaker === "expert" ? expertTranscriptBubbleStyle : "",
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

      <details className={technicalDetailsStyle}>
        <summary className={technicalSummaryStyle}>
          <span>Technical details</span>
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
                  {String(sequence).padStart(2, "0")} · {getEventSummary(event)}
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
  );
};
