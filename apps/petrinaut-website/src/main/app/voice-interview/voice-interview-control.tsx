import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FaCheck,
  FaKeyboard,
  FaMicrophone,
  FaMicrophoneSlash,
  FaMinus,
  FaPause,
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
  storage: Pick<Storage, "getItem"> | null =
    getVoiceInterviewDisclosureStorage(),
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
  storage: Pick<Storage, "setItem"> | null =
    getVoiceInterviewDisclosureStorage(),
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

type Presentation = "trigger" | "start" | "full" | "mini";

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
      trigger: {
        position: "absolute",
        right: "[44px]",
        bottom: "[-44px]",
      },
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

const listeningStyle = css({
  display: "flex",
  minHeight: "[84px]",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  borderRadius: "lg",
  backgroundColor: "blue.a10",
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

const phaseStyle = css({
  color: "blue.s80",
  fontSize: "xs",
  fontWeight: "semibold",
});

const technicalDetailsStyle = css({
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
      <div className={meterStyle} aria-hidden="true">
        {[0.7, 1, 0.8, 1.15, 0.65].map((factor) => (
          <span
            className={meterBarStyle}
            key={factor}
            style={{ height: `${4 + Math.round(level * factor * 26)}px` }}
          />
        ))}
      </div>
      <span className={labelStyle}>
        {`Microphone input level: ${inputLevelText(level)}`}
      </span>
    </>
  );
};

const Coverage = ({ coverage }: { coverage: InterviewCoverage | null }) => {
  if (!coverage) return null;
  return (
    <details>
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
  readonly onShowStart: () => void;
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
  onShowStart,
  onStart,
  onSubmitCorrection,
  onTypeInstead,
  placement,
  presentation,
  snapshot,
}: VoiceInterviewControlViewProps) => {
  if (presentation === "trigger") {
    return placement === "sidebar" ? (
      <div className={rootStyle({ presentation: "trigger" })}>
        <Button
          aria-label="Start voice interview"
          prefix={<FaMicrophone aria-hidden="true" />}
          shape="round"
          size="sm"
          tooltip="Start voice interview"
          type="button"
          variant="subtle"
          onClick={onShowStart}
        />
      </div>
    ) : null;
  }

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
            <Button size="xs" type="button" variant="ghost" onClick={onTypeInstead}>
              Use text
            </Button>
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
            aria-label={`Expand voice interview. ${status}`}
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
              <span>{status}</span>
              {snapshot.currentQuestion && (
                <span className={contextStyle}>{snapshot.currentQuestion}</span>
              )}
            </span>
          </button>
          {isSpeaking ? (
            <Button size="xs" type="button" onClick={onInterrupt}>
              Interrupt and speak
            </Button>
          ) : snapshot.phase === "paused" ? (
            <Button size="xs" type="button" onClick={onResume}>
              Resume
            </Button>
          ) : (
            <Button
              disabled={!snapshot.microphoneEnabled}
              prefix={<FaPause aria-hidden="true" />}
              size="xs"
              type="button"
              variant="subtle"
              onClick={onPause}
            >
              Pause
            </Button>
          )}
          <Button
            aria-label="Type an interview answer"
            prefix={<FaKeyboard aria-hidden="true" />}
            shape="round"
            size="xs"
            tooltip="Type an interview answer"
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
        <span className={liveRegionStyle} role="status" aria-live="polite">
          {status}
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
          <span className={titleStyle}>Voice interview</span>
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

        <div className={listeningStyle}>
          {snapshot.microphoneEnabled ? (
            <FaMicrophone aria-hidden="true" />
          ) : (
            <FaMicrophoneSlash aria-hidden="true" />
          )}
          {snapshot.microphoneEnabled && <Meter snapshot={snapshot} />}
          <span className={phaseStyle}>{status}</span>
        </div>

        {snapshot.phase === "recoverable-error" && (
          <div className={transcriptStyle}>
            <strong>We couldn’t connect</strong>
            <span>{snapshot.errorMessage}</span>
            {(snapshot.errorCode || snapshot.errorRequestId) && (
              <details className={technicalDetailsStyle}>
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

        {snapshot.partialText && (
          <div className={transcriptStyle}>
            <span className={labelStyle}>
              What we’re hearing · Not sent yet
            </span>
            <span>{snapshot.partialText}</span>
          </div>
        )}
        {!snapshot.partialText && snapshot.lastCommittedText && (
          <div className={transcriptStyle}>
            <span className={labelStyle}>Answer recorded</span>
            <span>{snapshot.lastCommittedText}</span>
          </div>
        )}

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
          {isSpeaking && (
            <Button type="button" onClick={onInterrupt}>
              Interrupt and speak
            </Button>
          )}
          {snapshot.phase === "listening" && (
            <>
              <Button
                aria-label="Done speaking"
                prefix={<FaCheck aria-hidden="true" />}
                type="button"
                onClick={onDoneSpeaking}
              >
                Done speaking
              </Button>
              <Button
                aria-label="Pause"
                prefix={<FaPause aria-hidden="true" />}
                type="button"
                variant="subtle"
                onClick={onPause}
              >
                Pause
              </Button>
            </>
          )}
          {snapshot.phase === "paused" && (
            <Button type="button" onClick={onResume}>
              Resume listening
            </Button>
          )}
          {snapshot.phase === "recoverable-error" && (
            <Button type="button" onClick={onReconnect}>
              Reconnect
            </Button>
          )}
          {snapshot.lastCommittedText && !snapshot.partialText && (
            <>
              <Button
                disabled={!snapshot.canReviseLastAnswer}
                type="button"
                variant="subtle"
                onClick={onRedo}
              >
                Redo answer
              </Button>
              <Button
                disabled={!snapshot.canReviseLastAnswer}
                type="button"
                variant="ghost"
                onClick={onEdit}
              >
                Edit text
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" onClick={onTypeInstead}>
            Type instead
          </Button>
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

const recordLatency = (event: VoiceLatencyEvent): void => {
  performance.measure(`voice-interview:${event.name}`, {
    detail: { questionId: event.questionId },
    duration: event.elapsedMs,
    start: 0,
  });
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
  const [presentation, setPresentation] = useState<Presentation>("trigger");
  const [previousPlacement, setPreviousPlacement] = useState(context.placement);
  const [consented, setConsented] = useState(false);
  const [microphoneCheck, setMicrophoneCheck] = useState("");
  const [correction, setCorrection] = useState("");
  const [editing, setEditing] = useState(false);
  const { openSidebar, setActive } = context;
  const openSidebarRef = useRef(openSidebar);
  const coverage = selectInterviewCoverage(context.messages);

  if (previousPlacement !== context.placement) {
    setPreviousPlacement(context.placement);
    if (context.placement === "detached" && snapshot.phase !== "idle") {
      setPresentation("mini");
    }
  }

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

  const active = snapshot.phase !== "idle";

  useEffect(() => {
    setActive(active);
  }, [active, setActive]);

  useEffect(() => {
    openSidebarRef.current = openSidebar;
  }, [openSidebar]);

  useEffect(() => {
    if (snapshot.phase === "recoverable-error") {
      openSidebarRef.current();
    }
  }, [snapshot.phase]);

  useEffect(
    () => () => {
      void store.controller.end();
    },
    [store],
  );

  const end = () => {
    setPresentation("trigger");
    setEditing(false);
    context.setActive(false);
    void store.controller.end();
  };

  const startInterview = () => {
    setPresentation("full");
    context.setActive(true);
    void store.controller.start();
  };

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
      onExpand={() => {
        context.openSidebar();
        setPresentation("full");
      }}
      onInterrupt={() => store.controller.interruptAndSpeak()}
      onMinimize={() => setPresentation("mini")}
      onPause={() => store.controller.pause()}
      onReconnect={() => {
        setPresentation("full");
        void store.controller.reconnect();
      }}
      onRedo={() => store.controller.redoAnswer()}
      onResume={() => store.controller.resume()}
      onShowStart={() => {
        if (isVoiceInterviewDisclosureAcknowledged()) {
          startInterview();
        } else {
          setPresentation("start");
        }
      }}
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
      onTypeInstead={() => {
        if (snapshot.phase === "idle") setPresentation("trigger");
        context.focusComposer();
      }}
      placement={context.placement}
      presentation={
        snapshot.phase === "recoverable-error" ? "full" : presentation
      }
      snapshot={snapshot}
    />
  );
};

export const VoiceInterviewControl = (
  context: PetrinautAiInterviewStageContext,
) => {
  const [config, setConfig] = useState<OpenAIVoiceConfig | null>();

  useEffect(() => {
    const abortController = new AbortController();
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((loadedConfig) => {
      if (!abortController.signal.aborted) setConfig(loadedConfig);
    });
    return () => abortController.abort();
  }, []);

  if (!config || !context.conversationId) return null;
  return (
    <AvailableVoiceInterviewControl
      key={context.conversationId}
      config={config}
      context={{ ...context, conversationId: context.conversationId }}
    />
  );
};
