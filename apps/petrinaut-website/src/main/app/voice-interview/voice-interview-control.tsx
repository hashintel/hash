import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FaArrowRotateLeft,
  FaCheck,
  FaCircleCheck,
  FaCircleNotch,
  FaKeyboard,
  FaMicrophone,
  FaMicrophoneSlash,
  FaMinus,
  FaPause,
  FaPen,
  FaPlay,
  FaRotate,
  FaTriangleExclamation,
  FaVolumeHigh,
  FaXmark,
} from "react-icons/fa6";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { reportVoiceDiagnostic } from "../../../voice-diagnostics";
import { selectCanonicalSpeechSegments } from "./canonical-speech";
import {
  type InterviewCoverage,
  selectInterviewCoverage,
} from "./interview-coverage";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { SpeechPlaybackController } from "./speech-playback-controller";
import {
  VoiceTurnController,
  type VoiceLatencyEvent,
  type VoiceTurnPhase,
  type VoiceTurnSnapshot,
} from "./voice-turn-controller";

import type { PetrinautAiInterviewStageContext } from "@hashintel/petrinaut/ui";

export interface OpenAIVoiceConfig {
  readonly available: true;
  readonly connectionTimeoutMs: number;
}

export const VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY =
  "petrinaut:voice-interview-disclosure:v1";
const VOICE_INTERVIEW_DISCLOSURE_ACKNOWLEDGED = "acknowledged";

const getVoiceInterviewDisclosureStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isVoiceInterviewDisclosureAcknowledged = (
  storage: Pick<
    Storage,
    "getItem"
  > | null = getVoiceInterviewDisclosureStorage(),
): boolean => {
  try {
    return (
      storage?.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY) ===
      VOICE_INTERVIEW_DISCLOSURE_ACKNOWLEDGED
    );
  } catch {
    return false;
  }
};

export const acknowledgeVoiceInterviewDisclosure = (
  storage: Pick<
    Storage,
    "setItem"
  > | null = getVoiceInterviewDisclosureStorage(),
): void => {
  try {
    storage?.setItem(
      VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
      VOICE_INTERVIEW_DISCLOSURE_ACKNOWLEDGED,
    );
  } catch {
    // Storage is optional; the disclosure will appear again next time.
  }
};

type Presentation = "start" | "full" | "mini";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const loadOpenAIVoiceConfig = async (
  fetch: typeof globalThis.fetch,
  signal: AbortSignal = new AbortController().signal,
): Promise<OpenAIVoiceConfig | null> => {
  try {
    const response = await fetch("/api/voice/config", {
      cache: "no-store",
      method: "GET",
      signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      body.available !== true ||
      !Number.isInteger(body.connectionTimeoutMs) ||
      (body.connectionTimeoutMs as number) < 1_000 ||
      (body.connectionTimeoutMs as number) > 60_000
    ) {
      return null;
    }
    return {
      available: true,
      connectionTimeoutMs: body.connectionTimeoutMs as number,
    };
  } catch {
    return null;
  }
};

const rootStyle = cva({
  base: {
    zIndex: "overlay",
    pointerEvents: "auto",
  },
  variants: {
    presentation: {
      start: {
        position: "absolute",
        right: "0",
        bottom: "[-2px]",
        width: "full",
      },
      full: {
        position: "relative",
        width: "full",
      },
      mini: {
        position: "relative",
        width: "full",
      },
      detached: {
        position: "fixed",
        "--voice-interview-right": "0px",
        "--voice-interview-bottom": "0px",
        "--voice-interview-left": "0px",
        "--voice-interview-width": "100%",
        right: "[var(--voice-interview-right)]",
        bottom: "[var(--voice-interview-bottom)]",
        left: "[var(--voice-interview-left)]",
        width: "[var(--voice-interview-width)]",
        "@media (min-width: 768px)": {
          "--voice-interview-right": "var(--spacing-4)",
          "--voice-interview-bottom": "var(--spacing-4)",
          "--voice-interview-left": "auto",
          "--voice-interview-width": "440px",
        },
      },
    },
  },
});

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  padding: "4",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderTopLeftRadius: "xl",
  borderTopRightRadius: "xl",
  borderBottomRightRadius: "xl",
  borderBottomLeftRadius: "xl",
  backgroundColor: "neutral.s00",
  boxShadow: "xl",
});

const stageStyle = css({
  display: "flex",
  maxHeight: "[72vh]",
  flexDirection: "column",
  gap: "3",
  padding: "3",
  overflowY: "auto",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  backgroundColor: "neutral.s00",
  boxShadow: "[0 -8px 24px rgba(0,0,0,0.06)]",
  borderRadius: "lg",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
});

const startHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const titleStyle = css({
  flex: "1",
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "semibold",
});

const subtitleStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "snug",
});

const questionStyle = css({
  color: "neutral.s110",
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "snug",
});

const contextStyle = css({
  display: "block",
  overflow: "hidden",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "snug",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const miniTextStyle = css({
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
});

const focalAreaStyle = css({
  display: "flex",
  minHeight: "[150px]",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "3",
});

const focalCircleStyle = cva({
  base: {
    position: "relative",
    display: "flex",
    width: "[108px]",
    height: "[108px]",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2",
    borderWidth: "thin",
    borderStyle: "solid",
    borderRadius: "full",
    _before: {
      content: '""',
      position: "absolute",
      inset: "[-10px]",
      borderWidth: "thin",
      borderStyle: "solid",
      borderColor: "blue.a20",
      borderRadius: "full",
    },
  },
  variants: {
    tone: {
      active: {
        borderColor: "blue.a30",
        backgroundColor: "blue.a10",
        color: "blue.s90",
        boxShadow: "[0 14px 30px rgba(35,125,181,0.14)]",
      },
      idle: {
        borderColor: "neutral.a20",
        backgroundColor: "neutral.s20",
        color: "neutral.s80",
      },
      success: {
        borderColor: "green.a30",
        backgroundColor: "green.a10",
        color: "green.s90",
      },
      error: {
        borderColor: "red.a30",
        backgroundColor: "red.a10",
        color: "red.s90",
      },
    },
  },
});

const shortStateStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "semibold",
});

const recordingDotStyle = css({
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  backgroundColor: "green.s70",
  boxShadow: "[0 0 0 4px rgba(24,168,120,0.10)]",
});

const transcriptHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});

const recordingTranscriptDotStyle = css({
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  backgroundColor: "red.s70",
});

const transcriptActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  gap: "1",
});

const transcriptStateStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    fontSize: "xs",
    fontWeight: "semibold",
  },
  variants: {
    state: {
      recording: { color: "red.s80" },
      sending: { color: "neutral.s80" },
      sent: { color: "green.s90" },
      unsent: { color: "red.s90" },
    },
  },
});

const meterStyle = css({
  display: "flex",
  height: "[34px]",
  alignItems: "center",
  gap: "1",
  _motionReduce: { visibility: "hidden" },
});

const meterBarStyle = css({
  width: "[5px]",
  minHeight: "[4px]",
  borderRadius: "full",
  backgroundColor: "blue.s70",
  transition: "[height 80ms linear]",
  _motionReduce: { transition: "[none]" },
});

const statusStyle = css({
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
});

const transcriptStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2.5",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  color: "neutral.s100",
  fontSize: "sm",
});

const labelStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "semibold",
});

const recoveryStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2.5",
  borderRadius: "lg",
  backgroundColor: "red.a10",
  color: "neutral.s100",
  fontSize: "sm",
});

const secondaryDetailsStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  _open: { color: "neutral.s90" },
});

const actionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});

const inputStyle = css({
  width: "full",
  paddingX: "2",
  paddingY: "1.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s100",
  fontSize: "sm",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "blue.a40",
    outlineOffset: "[1px]",
  },
});

const miniStyle = css({
  display: "flex",
  minHeight: "[60px]",
  alignItems: "center",
  gap: "2",
  padding: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderTopLeftRadius: "lg",
  borderTopRightRadius: "lg",
  borderBottomRightRadius: "lg",
  borderBottomLeftRadius: "lg",
  backgroundColor: "neutral.s00",
  boxShadow: "lg",
});

const miniExpandStyle = css({
  display: "flex",
  minWidth: "0",
  flex: "1",
  alignItems: "center",
  gap: "2",
  padding: "2",
  color: "neutral.s100",
  textAlign: "left",
  background: "[transparent]",
  border: "none",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "blue.a50" },
});

const liveRegionStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "0",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0,0,0,0)]",
  whiteSpace: "nowrap",
  borderWidth: "0",
});

const statusText = (snapshot: VoiceTurnSnapshot): string => {
  switch (snapshot.phase) {
    case "idle":
      return "Microphone off · Interview not started";
    case "connecting":
      return "Microphone off · Joining the interview";
    case "listening":
      return "Microphone on · Listening";
    case "paused":
      return "Microphone off · Paused";
    case "transcribing":
      return "Microphone off · Finishing your answer";
    case "delivering":
      return "Microphone off · Answer recorded";
    case "waiting":
      return "Microphone off · Writing that down";
    case "synthesizing":
      return "Microphone off · Preparing the next question";
    case "playing":
      return "Microphone off · Interviewer speaking";
    case "recoverable-error": {
      return `Microphone off · ${snapshot.errorMessage}`;
    }
  }
};

type RecoveryErrorFamily = "connection" | "interview" | "microphone";

const recoveryErrorFamily = (
  errorCode: VoiceTurnSnapshot["errorCode"],
): RecoveryErrorFamily => {
  switch (errorCode) {
    case "microphone-permission":
    case "microphone-device":
      return "microphone";
    case "network":
    case "timeout":
    case "request-aborted":
      return "connection";
    default:
      return "interview";
  }
};

const shortStatusText = (snapshot: VoiceTurnSnapshot): string => {
  switch (snapshot.phase) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting";
    case "listening":
      return "Listening";
    case "paused":
      return "Paused";
    case "transcribing":
      return "Finishing answer";
    case "delivering":
      return "Answer recorded";
    case "waiting":
      return "Writing that down";
    case "synthesizing":
      return "Preparing next question";
    case "playing":
      return "Interviewer speaking";
    case "recoverable-error": {
      switch (recoveryErrorFamily(snapshot.errorCode)) {
        case "microphone":
          return "Microphone unavailable";
        case "connection":
          return "Connection paused";
        case "interview":
          return "Interview paused";
      }
    }
  }
};

const inputLevelText = (level: number): string =>
  level >= 0.35
    ? "High"
    : level >= 0.12
      ? "Medium"
      : level > 0
        ? "Low"
        : "Quiet";

const Meter = ({ snapshot }: { snapshot: VoiceTurnSnapshot }) => {
  const level = snapshot.microphoneLevel;
  return (
    <>
      <div
        aria-hidden="true"
        className={meterStyle}
        data-testid="voice-waveform"
      >
        {[0.7, 1, 0.8, 1.15, 0.65].map((factor) => (
          <span
            className={meterBarStyle}
            key={factor}
            style={{ height: `${4 + Math.round(level * factor * 26)}px` }}
          />
        ))}
      </div>
      <span className={liveRegionStyle}>
        {`Microphone input level: ${inputLevelText(level)}`}
      </span>
    </>
  );
};

const focalIcon = (phase: VoiceTurnPhase): ReactNode => {
  switch (phase) {
    case "listening":
      return <FaMicrophone aria-hidden="true" />;
    case "paused":
      return <FaMicrophoneSlash aria-hidden="true" />;
    case "playing":
      return <FaVolumeHigh aria-hidden="true" />;
    case "delivering":
      return <FaCircleCheck aria-hidden="true" />;
    case "recoverable-error":
      return <FaTriangleExclamation aria-hidden="true" />;
    case "idle":
    case "connecting":
    case "transcribing":
    case "waiting":
    case "synthesizing":
      return <FaCircleNotch aria-hidden="true" />;
  }
};

const focalTone = (phase: VoiceTurnPhase) => {
  switch (phase) {
    case "recoverable-error":
      return "error";
    case "delivering":
      return "success";
    case "listening":
      return "active";
    default:
      return "idle";
  }
};

const VoiceFocal = ({ snapshot }: { snapshot: VoiceTurnSnapshot }) => {
  const active = snapshot.phase === "listening";
  const tone = focalTone(snapshot.phase);
  const icon = focalIcon(snapshot.phase);

  return (
    <div className={focalAreaStyle}>
      <div
        className={focalCircleStyle({ tone })}
        data-testid="voice-microphone-focal"
      >
        {icon}
        {active && <Meter snapshot={snapshot} />}
      </div>
      <span className={shortStateStyle}>
        {active && <span className={recordingDotStyle} />}
        {shortStatusText(snapshot)}
      </span>
    </div>
  );
};

/**
 * Recoverable errors cover far more than microphone access, so the heading
 * names the family the error code belongs to rather than always blaming the
 * microphone. The message below it stays the actionable guidance.
 */
const recoveryHeading = (errorCode: VoiceTurnSnapshot["errorCode"]): string => {
  switch (recoveryErrorFamily(errorCode)) {
    case "microphone":
      return "We couldn’t reconnect the microphone";
    case "connection":
      return "We lost the voice connection";
    case "interview":
      return "The interview couldn’t continue";
  }
};

const deliveryStatus = (
  delivery: VoiceTurnSnapshot["lastAnswerDelivery"],
): { icon: ReactNode; label: string; state: "sending" | "sent" | "unsent" } => {
  switch (delivery) {
    case "delivered":
      return {
        icon: <FaCircleCheck aria-hidden="true" />,
        label: "Sent",
        state: "sent",
      };
    case "pending":
      return {
        icon: <FaCircleNotch aria-hidden="true" />,
        label: "Sending",
        state: "sending",
      };
    default:
      return {
        icon: <FaTriangleExclamation aria-hidden="true" />,
        label: "Not sent",
        state: "unsent",
      };
  }
};

const TranscriptStrip = ({
  onEdit,
  onRedo,
  snapshot,
}: {
  onEdit: () => void;
  onRedo: () => void;
  snapshot: VoiceTurnSnapshot;
}) => {
  const recording = Boolean(snapshot.partialText);
  const text = snapshot.partialText || snapshot.lastCommittedText;
  if (!text) return null;

  const delivery = deliveryStatus(snapshot.lastAnswerDelivery);

  return (
    <div className={transcriptStyle}>
      <div className={transcriptHeaderStyle}>
        <span className={labelStyle}>
          {recording ? "Live transcript" : "Your answer"}
        </span>
        {recording ? (
          <span className={transcriptStateStyle({ state: "recording" })}>
            <span className={recordingTranscriptDotStyle} />
            Recording
          </span>
        ) : (
          <span className={transcriptStateStyle({ state: delivery.state })}>
            {delivery.icon}
            {delivery.label}
          </span>
        )}
      </div>
      <span>{text}</span>
      {!recording && (
        <div className={transcriptActionsStyle}>
          <Button
            aria-label="Redo answer"
            disabled={!snapshot.canReviseLastAnswer}
            prefix={<FaArrowRotateLeft aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="Redo answer"
            type="button"
            variant="ghost"
            onClick={onRedo}
          />
          <Button
            aria-label="Edit text"
            disabled={!snapshot.canReviseLastAnswer}
            prefix={<FaPen aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="Edit text"
            type="button"
            variant="ghost"
            onClick={onEdit}
          />
        </div>
      )}
    </div>
  );
};

const Coverage = ({ coverage }: { coverage: InterviewCoverage | null }) => {
  if (!coverage) return null;
  return (
    <details className={secondaryDetailsStyle}>
      <summary className={labelStyle}>
        {coverage.complete ? "Coverage complete" : "Interview coverage"}
      </summary>
      {coverage.covered.length > 0 && (
        <div>
          <strong className={labelStyle}>Covered</strong>
          <ul>
            {coverage.covered.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {coverage.stillExploring.length > 0 && (
        <div>
          <strong className={labelStyle}>Still exploring</strong>
          <ul>
            {coverage.stillExploring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
};

export interface VoiceInterviewControlViewProps {
  readonly consented: boolean;
  readonly correction: string;
  readonly coverage: InterviewCoverage | null;
  readonly editing: boolean;
  readonly microphoneCheck: string;
  readonly onCheckMicrophone: () => void;
  readonly onConsentChange: (consented: boolean) => void;
  readonly onCorrectionChange: (value: string) => void;
  readonly onDoneSpeaking: () => void;
  readonly onEdit: () => void;
  readonly onEnd: () => void;
  readonly onExpand: () => void;
  readonly onInterrupt: () => void;
  readonly onMinimize: () => void;
  readonly onPause: () => void;
  readonly onReconnect: () => void;
  readonly onRedo: () => void;
  readonly onResume: () => void;
  readonly onStart: () => void;
  readonly onSubmitCorrection: () => void;
  readonly onTypeInstead: () => void;
  readonly placement: "sidebar" | "detached";
  readonly presentation: Presentation;
  readonly snapshot: VoiceTurnSnapshot;
}

export const VoiceInterviewControlView = ({
  consented,
  correction,
  coverage,
  editing,
  microphoneCheck,
  onCheckMicrophone,
  onConsentChange,
  onCorrectionChange,
  onDoneSpeaking,
  onEdit,
  onEnd,
  onExpand,
  onInterrupt,
  onMinimize,
  onPause,
  onReconnect,
  onRedo,
  onResume,
  onStart,
  onSubmitCorrection,
  onTypeInstead,
  placement,
  presentation,
  snapshot,
}: VoiceInterviewControlViewProps) => {
  if (presentation === "start") {
    if (placement === "detached") return null;
    return (
      <section
        aria-label="Start voice interview"
        className={rootStyle({ presentation: "start" })}
      >
        <div className={cardStyle}>
          <header className={startHeaderStyle}>
            <div className={titleStyle}>
              <strong>Voice interview</strong>
              <span className={subtitleStyle}>
                Talk through your process with AI
              </span>
            </div>
            <Button
              aria-label="Use text instead"
              prefix={<FaKeyboard aria-hidden="true" />}
              shape="round"
              size="xs"
              tooltip="Use text instead"
              type="button"
              variant="ghost"
              onClick={onTypeInstead}
            />
          </header>
          <p className={statusStyle}>
            Your speech is transcribed by OpenAI. Petrinaut keeps finalized
            answers in this conversation, not the audio.
          </p>
          <label className={statusStyle}>
            <input
              checked={consented}
              type="checkbox"
              onChange={(event) => onConsentChange(event.currentTarget.checked)}
            />{" "}
            I understand how speech and transcripts are handled.
          </label>
          {microphoneCheck && <p className={labelStyle}>{microphoneCheck}</p>}
          <div className={actionsStyle}>
            <Button disabled={!consented} type="button" onClick={onStart}>
              Start interview
            </Button>
            <Button type="button" variant="subtle" onClick={onCheckMicrophone}>
              Check microphone
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const effectivePresentation =
    placement === "detached" ? "detached" : presentation;
  const status = statusText(snapshot);
  const isSpeaking =
    snapshot.phase === "playing" || snapshot.phase === "synthesizing";
  const compactQuestionContext = snapshot.currentQuestion
    ? ` Question: ${snapshot.currentQuestion}`
    : "";
  const compactLiveOutput = `${status}.${compactQuestionContext}${
    snapshot.partialText ? ` Not sent yet: ${snapshot.partialText}` : ""
  }`;

  if (
    effectivePresentation === "mini" ||
    effectivePresentation === "detached"
  ) {
    return (
      <section
        aria-label="Voice interview mini bar"
        className={rootStyle({ presentation: effectivePresentation })}
      >
        <div className={miniStyle}>
          <button
            aria-label={`Expand voice interview. ${status}.${compactQuestionContext}`}
            className={miniExpandStyle}
            type="button"
            onClick={onExpand}
          >
            {snapshot.microphoneEnabled ? (
              <FaMicrophone aria-hidden="true" />
            ) : (
              <FaMicrophoneSlash aria-hidden="true" />
            )}
            <span className={miniTextStyle}>
              <span>{shortStatusText(snapshot)}</span>
              {snapshot.currentQuestion && (
                <span className={contextStyle}>{snapshot.currentQuestion}</span>
              )}
            </span>
          </button>
          {snapshot.phase === "listening" && (
            <>
              <Button
                aria-label="Done speaking"
                prefix={<FaCheck aria-hidden="true" />}
                shape="round"
                size="xs"
                tooltip="Done speaking"
                type="button"
                onClick={onDoneSpeaking}
              />
              <Button
                aria-label="Pause"
                disabled={!snapshot.microphoneEnabled}
                prefix={<FaPause aria-hidden="true" />}
                shape="round"
                size="xs"
                tooltip="Pause"
                type="button"
                variant="subtle"
                onClick={onPause}
              />
            </>
          )}
          {snapshot.phase === "paused" && (
            <Button
              aria-label="Resume listening"
              prefix={<FaPlay aria-hidden="true" />}
              shape="round"
              size="xs"
              tooltip="Resume listening"
              type="button"
              onClick={onResume}
            />
          )}
          {(snapshot.phase === "synthesizing" ||
            snapshot.phase === "playing") && (
            <Button
              aria-label="Interrupt and speak"
              prefix={<FaMicrophone aria-hidden="true" />}
              shape="round"
              size="xs"
              tooltip="Interrupt and speak"
              type="button"
              onClick={onInterrupt}
            />
          )}
          {snapshot.phase === "recoverable-error" && (
            <Button
              aria-label="Reconnect"
              prefix={<FaRotate aria-hidden="true" />}
              shape="round"
              size="xs"
              tooltip="Reconnect"
              type="button"
              onClick={onReconnect}
            />
          )}
          <Button
            aria-label="Use text instead"
            prefix={<FaKeyboard aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="Use text instead"
            type="button"
            variant="ghost"
            onClick={onTypeInstead}
          />
          <Button
            aria-label="End interview"
            prefix={<FaXmark aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="End interview"
            type="button"
            variant="ghost"
            onClick={onEnd}
          />
        </div>
        <span
          className={liveRegionStyle}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {compactLiveOutput}
        </span>
      </section>
    );
  }

  const submitCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitCorrection();
  };

  return (
    <section
      aria-label="Voice interview stage"
      className={rootStyle({ presentation: "full" })}
    >
      <div className={stageStyle}>
        <header className={headerStyle}>
          <Button
            aria-label="Minimize voice interview"
            prefix={<FaMinus aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="Minimize"
            type="button"
            variant="ghost"
            onClick={onMinimize}
          />
          <Button
            aria-label="End interview"
            prefix={<FaXmark aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="End interview"
            type="button"
            variant="ghost"
            onClick={onEnd}
          />
        </header>

        <p className={questionStyle}>
          {snapshot.currentQuestion || "The next question will appear here."}
        </p>

        <VoiceFocal snapshot={snapshot} />

        {snapshot.phase === "recoverable-error" && (
          <div className={recoveryStyle}>
            <strong>{recoveryHeading(snapshot.errorCode)}</strong>
            <span>{snapshot.errorMessage}</span>
            {(snapshot.errorCode || snapshot.errorRequestId) && (
              <details className={secondaryDetailsStyle}>
                <summary>Technical details</summary>
                {snapshot.errorCode && (
                  <div>Error code: {snapshot.errorCode}</div>
                )}
                {snapshot.errorRequestId && (
                  <div>Diagnostic reference: {snapshot.errorRequestId}</div>
                )}
              </details>
            )}
          </div>
        )}

        <TranscriptStrip onEdit={onEdit} onRedo={onRedo} snapshot={snapshot} />

        {editing && (
          <form className={actionsStyle} onSubmit={submitCorrection}>
            <label className={labelStyle} htmlFor="voice-answer-correction">
              Correct the recorded answer
            </label>
            <input
              className={inputStyle}
              disabled={!snapshot.canReviseLastAnswer}
              id="voice-answer-correction"
              value={correction}
              onChange={(event) =>
                onCorrectionChange(event.currentTarget.value)
              }
            />
            <Button
              disabled={!snapshot.canReviseLastAnswer || !correction.trim()}
              size="xs"
              type="submit"
            >
              Send correction
            </Button>
          </form>
        )}

        <div className={actionsStyle}>
          {snapshot.phase === "recoverable-error" && (
            <Button
              aria-label="Reconnect"
              prefix={<FaRotate aria-hidden="true" />}
              type="button"
              onClick={onReconnect}
            >
              Reconnect
            </Button>
          )}
          <Button
            aria-label="Use text instead"
            prefix={<FaKeyboard aria-hidden="true" />}
            shape="round"
            size="sm"
            tooltip="Use text instead"
            type="button"
            variant="ghost"
            onClick={onTypeInstead}
          />
          {isSpeaking && (
            <Button
              aria-label="Interrupt and speak"
              prefix={<FaMicrophone aria-hidden="true" />}
              shape="round"
              size="md"
              tooltip="Interrupt and speak"
              type="button"
              onClick={onInterrupt}
            />
          )}
          {snapshot.phase === "listening" && (
            <>
              <Button
                aria-label="Done speaking"
                prefix={<FaCheck aria-hidden="true" />}
                shape="round"
                size="md"
                tooltip="Done speaking"
                type="button"
                onClick={onDoneSpeaking}
              />
              <Button
                aria-label="Pause"
                prefix={<FaPause aria-hidden="true" />}
                shape="round"
                size="sm"
                tooltip="Pause"
                type="button"
                variant="subtle"
                onClick={onPause}
              />
            </>
          )}
          {snapshot.phase === "paused" && (
            <Button
              aria-label="Resume listening"
              prefix={<FaPlay aria-hidden="true" />}
              shape="round"
              size="md"
              tooltip="Resume listening"
              type="button"
              onClick={onResume}
            />
          )}
        </div>

        <Coverage coverage={coverage} />
      </div>
      <span
        className={liveRegionStyle}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status}
        {snapshot.partialText && ` Not sent yet: ${snapshot.partialText}`}
      </span>
    </section>
  );
};

/**
 * Recovery always stays visible, a detached or Chat-mode host only keeps an
 * active session as the compact bar, and Interview mode shows whichever stage
 * the user last chose.
 */
const selectVisiblePresentation = ({
  active,
  interactionMode,
  phase,
  placement,
  presentation,
}: {
  readonly active: boolean;
  readonly interactionMode: PetrinautAiInterviewStageContext["interactionMode"];
  readonly phase: VoiceTurnPhase;
  readonly placement: PetrinautAiInterviewStageContext["placement"];
  readonly presentation: Presentation;
}): Presentation | null => {
  if (phase === "recoverable-error") {
    return interactionMode === "chat" ? "mini" : "full";
  }
  if (placement === "detached" || interactionMode === "chat") {
    return active ? "mini" : null;
  }
  return presentation;
};

const recordLatency = (event: VoiceLatencyEvent): void => {
  try {
    performance.measure(`voice-interview:${event.name}`, {
      detail: { questionId: event.questionId },
      duration: event.elapsedMs,
      start: 0,
    });
  } catch {
    // Performance measurement is optional and must not interrupt the interview.
  }
};

const AvailableVoiceInterviewControl = ({
  config,
  context,
}: {
  config: OpenAIVoiceConfig;
  context: PetrinautAiInterviewStageContext & { conversationId: string };
}) => {
  const [store] = useState(() => {
    const session = new OpenAIRealtimeSession({
      cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
      connectionTimeoutMs: config.connectionTimeoutMs,
      createAudioContext: () => new AudioContext(),
      createPeerConnection: () => new RTCPeerConnection(),
      fetch: globalThis.fetch.bind(globalThis),
      getUserMedia: (constraints) =>
        navigator.mediaDevices.getUserMedia(constraints),
      reportDiagnostic: reportVoiceDiagnostic,
      requestAnimationFrame: (callback) =>
        globalThis.requestAnimationFrame(callback),
    });
    const playback = new SpeechPlaybackController({
      createAudio: (source) => new Audio(source),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      fetch: globalThis.fetch.bind(globalThis),
      reportDiagnostic: reportVoiceDiagnostic,
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });
    const controller = new VoiceTurnController({
      conversationId: context.conversationId,
      onLatencyEvent: recordLatency,
      playback,
      session,
      submitText: context.submitInterviewAnswer,
    });
    return {
      controller,
      getSnapshot: () => controller.getSnapshot(),
      subscribe: (listener: (snapshot: VoiceTurnSnapshot) => void) =>
        controller.subscribe(listener),
    };
  });
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [presentation, setPresentation] = useState<Presentation>("start");
  const [consented, setConsented] = useState(false);
  const [microphoneCheck, setMicrophoneCheck] = useState("");
  const [correction, setCorrection] = useState("");
  const [editing, setEditing] = useState(false);
  const [endRequested, setEndRequested] = useState(false);
  const { interactionMode, openSidebar, setActive, setInteractionMode } =
    context;
  const openSidebarRef = useRef(openSidebar);
  const handledInterviewSelectionRef = useRef(false);
  // Microphone level updates re-render this component many times per answer;
  // the coverage scan only changes when the conversation does.
  const coverage = useMemo(
    () => selectInterviewCoverage(context.messages),
    [context.messages],
  );

  useLayoutEffect(() => {
    store.controller.updateChat({
      canAcceptInterviewAnswer: context.canAcceptInterviewAnswer,
      canonicalSegments: selectCanonicalSpeechSegments(context.messages),
      status: context.status,
    });
  }, [
    context.canAcceptInterviewAnswer,
    context.messages,
    context.status,
    store,
  ]);

  const active = !endRequested && snapshot.phase !== "idle";

  useEffect(() => {
    setActive(active);
  }, [active, setActive]);

  useEffect(() => {
    openSidebarRef.current = openSidebar;
  }, [openSidebar]);

  useEffect(() => {
    if (interactionMode === "chat") {
      handledInterviewSelectionRef.current = false;
      return;
    }
    if (active || endRequested || handledInterviewSelectionRef.current) {
      return;
    }

    handledInterviewSelectionRef.current = true;
    if (isVoiceInterviewDisclosureAcknowledged()) {
      // eslint-disable-next-line react-hooks-js/set-state-in-effect -- Mode selection intentionally drives the host presentation.
      setPresentation("full");
      setActive(true);
      void store.controller.start();
    } else {
      setPresentation("start");
    }
  }, [active, endRequested, interactionMode, setActive, store]);

  useEffect(() => {
    if (snapshot.phase === "recoverable-error") {
      setInteractionMode("interview");
      openSidebarRef.current();
    }
  }, [setInteractionMode, snapshot.phase]);

  useEffect(() => {
    if (!snapshot.lastCommittedText) {
      // eslint-disable-next-line react-hooks-js/set-state-in-effect -- A new question invalidates any correction for the previous answer.
      setCorrection("");
      setEditing(false);
    }
  }, [snapshot.lastCommittedText]);

  useEffect(
    () => () => {
      void store.controller.end();
    },
    [store],
  );

  const end = () => {
    setEndRequested(true);
    setCorrection("");
    setEditing(false);
    context.setActive(false);
    context.setInteractionMode("chat");
    void store.controller.end().then(
      () => setEndRequested(false),
      () => setEndRequested(false),
    );
  };

  const minimize = () => context.setInteractionMode("chat");

  const expand = () => {
    context.openSidebar();
    context.setInteractionMode("interview");
  };

  const useTextInstead = () => {
    context.setInteractionMode("chat");
    context.focusComposer();
  };

  const startInterview = () => {
    setPresentation("full");
    context.setActive(true);
    void store.controller.start();
  };

  const visiblePresentation = selectVisiblePresentation({
    active,
    interactionMode: context.interactionMode,
    phase: snapshot.phase,
    placement: context.placement,
    presentation,
  });

  if (visiblePresentation === null) {
    return null;
  }

  return (
    <VoiceInterviewControlView
      consented={consented}
      correction={correction}
      coverage={coverage}
      editing={editing}
      microphoneCheck={microphoneCheck}
      onCheckMicrophone={() => {
        setMicrophoneCheck("Checking microphone…");
        void navigator.mediaDevices.getUserMedia({ audio: true }).then(
          (stream) => {
            for (const track of stream.getTracks()) track.stop();
            setMicrophoneCheck("Microphone ready.");
          },
          () => setMicrophoneCheck("Microphone access was not available."),
        );
      }}
      onConsentChange={setConsented}
      onCorrectionChange={setCorrection}
      onDoneSpeaking={() => store.controller.doneSpeaking()}
      onEdit={() => setEditing(true)}
      onEnd={end}
      onExpand={expand}
      onInterrupt={() => store.controller.interruptAndSpeak()}
      onMinimize={minimize}
      onPause={() => store.controller.pause()}
      onReconnect={() => {
        setPresentation("full");
        void store.controller.reconnect();
      }}
      onRedo={() => store.controller.redoAnswer()}
      onResume={() => store.controller.resume()}
      onStart={() => {
        acknowledgeVoiceInterviewDisclosure();
        startInterview();
      }}
      onSubmitCorrection={() => {
        const value = correction;
        void store.controller.submitCorrection(value).then((accepted) => {
          if (accepted) {
            setCorrection("");
            setEditing(false);
          }
        });
      }}
      onTypeInstead={useTextInstead}
      placement={context.placement}
      presentation={visiblePresentation}
      snapshot={snapshot}
    />
  );
};

export const VoiceInterviewControl = ({
  config,
  ...context
}: PetrinautAiInterviewStageContext & {
  readonly config: OpenAIVoiceConfig;
}) => {
  return (
    <AvailableVoiceInterviewControl
      key={context.conversationId}
      config={config}
      context={context}
    />
  );
};
