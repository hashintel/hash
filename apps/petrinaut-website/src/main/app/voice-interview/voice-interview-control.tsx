import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";
import { Button, Checkbox } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { reportVoiceDiagnostic } from "../../../voice-diagnostics";
import { selectCanonicalSpeech } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import {
  RealtimeBrunchBridge,
  type RealtimeBrunchAdmissionTarget,
  type VoiceSubmissionSettlement,
} from "./realtime-brunch-bridge";
import { toVoiceSessionState } from "./voice-session-state";
import {
  VoiceTurnController,
  type VoiceLatencyEvent,
  type VoiceTurnSnapshot,
} from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

type ResolveSubmission = (
  messageId: string,
) => AgentSendResult["submissionId"] | undefined;
type ResolveSubmissions = (
  messageId: string,
) => readonly AgentSendResult["submissionId"][] | undefined;
type SubscribeToAdmission = (
  target: RealtimeBrunchAdmissionTarget,
  listener: (submissionId: AgentSendResult["submissionId"]) => void,
) => () => void;
type SubscribeToAdmissionFailure = (
  target: RealtimeBrunchAdmissionTarget,
  listener: (error: FlueChatAdmissionError) => void,
) => () => void;
type SubmitInterviewAnswer = ConstructorParameters<
  typeof RealtimeBrunchBridge
>[0]["submitInterviewAnswer"];
type SubmitInterviewAnswerInput = Parameters<SubmitInterviewAnswer>[0];
type SubmitInterviewAnswerResult = Awaited<ReturnType<SubmitInterviewAnswer>>;

export const submitVoiceInputWithAdmission = async ({
  input,
  resolveInputSubmission,
  submitVoiceInput,
  subscribeToAdmission,
  subscribeToAdmissionFailure,
}: {
  readonly input: SubmitInterviewAnswerInput;
  readonly resolveInputSubmission?: ResolveSubmission;
  readonly submitVoiceInput: PetrinautAiVoiceModeContext["submitVoiceInput"];
  readonly subscribeToAdmission?: SubscribeToAdmission;
  readonly subscribeToAdmissionFailure?: SubscribeToAdmissionFailure;
}): Promise<SubmitInterviewAnswerResult> => {
  let unsubscribe = () => {};
  let unsubscribeFromFailure = () => {};
  let removeAbortListener = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = () =>
      reject(new FlueChatAdmissionError({ kind: "aborted" }));
    if (input.signal.aborted) {
      rejectForAbort();
      return;
    }
    input.signal.addEventListener("abort", rejectForAbort, { once: true });
    removeAbortListener = () =>
      input.signal.removeEventListener("abort", rejectForAbort);
  });
  const admissionObserved =
    subscribeToAdmission === undefined &&
    subscribeToAdmissionFailure === undefined
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          if (subscribeToAdmission !== undefined) {
            unsubscribe = subscribeToAdmission(
              input.admissionTarget,
              (submissionId) => {
                input.onAdmission(submissionId);
                resolve();
              },
            );
          }
          if (subscribeToAdmissionFailure !== undefined) {
            unsubscribeFromFailure = subscribeToAdmissionFailure(
              input.admissionTarget,
              reject,
            );
          }
        });
  try {
    const [result] = await Promise.race([
      Promise.all([submitVoiceInput(input), admissionObserved]),
      cancelled,
    ]);
    if (result.kind !== "message") return result;
    const submissionId = resolveInputSubmission?.(result.messageId);
    if (resolveInputSubmission !== undefined && submissionId === undefined) {
      throw new Error("The Flue admission could not be correlated.");
    }
    return {
      ...result,
      ...(submissionId === undefined ? {} : { submissionId }),
    };
  } finally {
    removeAbortListener();
    unsubscribe();
    unsubscribeFromFailure();
  }
};

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
    if (!response.ok) {
      return null;
    }
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

const VoiceModeIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 20 20"
    width="16"
  >
    <path
      d="M3 8.5v3M6.5 5.5v9M10 3v14M13.5 6v8M17 8.5v3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

const disclosureFrameStyle = css({
  width: "full",
  padding: "2",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.bg.subtle",
  color: "neutral.s100",
  _focus: { outline: "none" },
});

const disclosureCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.03), 0px 8px 16px -12px rgba(0,0,0,0.18)]",
});

const disclosureHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const disclosureIconStyle = css({
  display: "inline-flex",
  width: "7",
  height: "7",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "lg",
  backgroundColor: "blue.a20",
  color: "blue.s90",
});

const disclosureTitleStyle = css({
  display: "flex",
  minWidth: "[0]",
  flexDirection: "column",
  gap: "0.5",
});

const disclosureHeadingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "tight",
});

const disclosureSubtitleStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
});

const disclosureCopyStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const disclosureConsentStyle = css({
  width: "full",
  padding: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.a10",
  color: "neutral.s100",
});

const disclosureActionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});

const disclosureStatusStyle = css({
  minHeight: "[18px]",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const VoiceInterviewDisclosure = ({
  checkingMicrophone,
  consented,
  microphoneCheck,
  onCheckMicrophone,
  onConsentChange,
  onStart,
}: {
  readonly checkingMicrophone: boolean;
  readonly consented: boolean;
  readonly microphoneCheck: string;
  readonly onCheckMicrophone: () => void;
  readonly onConsentChange: (consented: boolean) => void;
  readonly onStart: () => void;
}) => {
  const disclosureRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    disclosureRef.current?.focus();
  }, []);

  return (
    <section
      aria-label="Voice mode consent"
      className={disclosureFrameStyle}
      ref={disclosureRef}
      tabIndex={-1}
    >
      <div className={disclosureCardStyle}>
        <div className={disclosureHeaderStyle}>
          <span className={disclosureIconStyle}>
            <VoiceModeIcon />
          </span>
          <div className={disclosureTitleStyle}>
            <strong className={disclosureHeadingStyle}>
              Start a voice conversation
            </strong>
            <span className={disclosureSubtitleStyle}>
              Talk through your process with AI
            </span>
          </div>
        </div>
        <p className={disclosureCopyStyle}>
          OpenAI processes live audio and speaks the interviewer’s words.
          Petrinaut saves finalized answers—not audio.
        </p>
        <Checkbox
          className={disclosureConsentStyle}
          label="I understand how voice data is handled."
          onChange={onConsentChange}
          size="xs"
          tone="brand"
          value={consented}
        />
        <div className={disclosureActionsStyle}>
          <Button
            disabled={!consented}
            onClick={onStart}
            size="xs"
            tone="brand"
            type="button"
          >
            Start voice
          </Button>
          <Button
            aria-describedby="voice-microphone-check-status"
            loading={checkingMicrophone}
            onClick={onCheckMicrophone}
            size="xs"
            type="button"
            variant="subtle"
          >
            Test microphone
          </Button>
        </div>
        <div
          aria-atomic="true"
          aria-live="polite"
          className={disclosureStatusStyle}
          id="voice-microphone-check-status"
        >
          {microphoneCheck}
        </div>
      </div>
    </section>
  );
};

const recordLatency = (event: VoiceLatencyEvent): void => {
  try {
    performance.measure(`voice-interview:${event.name}`, {
      detail: { correlationId: event.correlationId },
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
  resolveInputSubmission,
  resolveResponseSubmission,
  settlements,
  subscribeToAdmission,
  subscribeToAdmissionFailure,
}: {
  config: OpenAIVoiceConfig;
  context: PetrinautAiVoiceModeContext;
  resolveInputSubmission?: ResolveSubmission;
  resolveResponseSubmission?: ResolveSubmissions;
  settlements?: readonly VoiceSubmissionSettlement[];
  subscribeToAdmission?: SubscribeToAdmission;
  subscribeToAdmissionFailure?: SubscribeToAdmissionFailure;
}) => {
  "use no memo";

  const [store] = useState(() => {
    // Realtime submits an answer long after the render that created the
    // bridge, so these callbacks read what the layout effect below installs
    // rather than what was captured here.
    let latestSubmitVoiceInput = context.submitVoiceInput;
    let latestResolveInputSubmission = resolveInputSubmission;
    let latestSubscribeToAdmission = subscribeToAdmission;
    let latestSubscribeToAdmissionFailure = subscribeToAdmissionFailure;
    const session = new OpenAIRealtimeSession({
      cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
      connectionTimeoutMs: config.connectionTimeoutMs,
      createAudioContext: () => new AudioContext(),
      createRemoteAudio: () => new Audio(),
      createPeerConnection: () => new RTCPeerConnection(),
      fetch: globalThis.fetch.bind(globalThis),
      getUserMedia: (constraints) =>
        navigator.mediaDevices.getUserMedia(constraints),
      reportDiagnostic: reportVoiceDiagnostic,
      requestAnimationFrame: (callback) =>
        globalThis.requestAnimationFrame(callback),
    });
    const bridge = new RealtimeBrunchBridge({
      session,
      submitInterviewAnswer: (input) =>
        submitVoiceInputWithAdmission({
          input,
          resolveInputSubmission: latestResolveInputSubmission,
          submitVoiceInput: latestSubmitVoiceInput,
          subscribeToAdmission: latestSubscribeToAdmission,
          subscribeToAdmissionFailure: latestSubscribeToAdmissionFailure,
        }),
    });
    const controller = new VoiceTurnController({
      bridge,
      onLatencyEvent: recordLatency,
      session,
      submitText: (input) => latestSubmitVoiceInput(input),
    });
    return {
      controller,
      getSnapshot: () => controller.getSnapshot(),
      subscribe: (listener: (snapshot: VoiceTurnSnapshot) => void) =>
        controller.subscribe(listener),
      updateSubmissionContext: (
        nextSubmitVoiceInput: PetrinautAiVoiceModeContext["submitVoiceInput"],
        nextResolveInputSubmission:
          | ((messageId: string) => string | undefined)
          | undefined,
        nextSubscribeToAdmission: SubscribeToAdmission | undefined,
        nextSubscribeToAdmissionFailure:
          | SubscribeToAdmissionFailure
          | undefined,
      ) => {
        latestSubmitVoiceInput = nextSubmitVoiceInput;
        latestResolveInputSubmission = nextResolveInputSubmission;
        latestSubscribeToAdmission = nextSubscribeToAdmission;
        latestSubscribeToAdmissionFailure = nextSubscribeToAdmissionFailure;
      },
    };
  });
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [consented, setConsented] = useState(false);
  const [microphoneCheck, setMicrophoneCheck] = useState("");
  const [checkingMicrophone, setCheckingMicrophone] = useState(false);
  const handledVoiceSelectionRef = useRef(false);
  const {
    inputMode,
    isAiAssistantOpen,
    registerVoiceModeControls,
    reportVoiceSessionState,
    setVoiceActive,
  } = context;

  useLayoutEffect(() => {
    store.updateSubmissionContext(
      context.submitVoiceInput,
      resolveInputSubmission,
      subscribeToAdmission,
      subscribeToAdmissionFailure,
    );
    const canonicalSpeech = selectCanonicalSpeech(context.messages);
    const correlateSegment = (segment: CanonicalSpeechSegment) => {
      const submissionIds = resolveResponseSubmission?.(segment.messageId);
      return submissionIds === undefined || submissionIds.length === 0
        ? segment
        : { ...segment, submissionIds };
    };
    store.controller.updateChat({
      canAcceptInterviewAnswer: context.canAcceptVoiceInput,
      canonicalSegments: canonicalSpeech.segments.map(correlateSegment),
      ...(canonicalSpeech.questionSegment
        ? { questionSegment: correlateSegment(canonicalSpeech.questionSegment) }
        : {}),
      settlements,
      status: context.status,
    });
  }, [
    context.canAcceptVoiceInput,
    context.messages,
    context.status,
    context.submitVoiceInput,
    resolveInputSubmission,
    resolveResponseSubmission,
    settlements,
    subscribeToAdmission,
    subscribeToAdmissionFailure,
    store,
  ]);

  const active = snapshot.connection !== "idle";

  useEffect(
    () =>
      registerVoiceModeControls({
        end: () => store.controller.end(),
        pause: () => store.controller.pause(),
        readFullResponse: () => store.controller.readFullResponse(),
        reconnect: () => {
          void store.controller.reconnect();
        },
        repeatQuestion: () => store.controller.repeatQuestion(),
        resume: () => {
          void store.controller.resume();
        },
        setMicrophoneMuted: (muted) =>
          store.controller.setMicrophoneMuted(muted),
        takeTurn: () => store.controller.takeTurn(),
      }),
    [registerVoiceModeControls, store],
  );

  useEffect(() => {
    setVoiceActive(inputMode === "voice" && active);
  }, [active, inputMode, setVoiceActive]);

  useLayoutEffect(() => {
    if (
      !isAiAssistantOpen &&
      (snapshot.connection === "connecting" ||
        (snapshot.connection === "connected" && snapshot.input !== "paused"))
    ) {
      store.controller.pause();
    }
  }, [isAiAssistantOpen, snapshot.connection, snapshot.input, store]);

  useEffect(() => {
    if (inputMode === "text") {
      handledVoiceSelectionRef.current = false;
      if (!active) {
        setShowDisclosure(false);
      }
      return;
    }
    if (active || handledVoiceSelectionRef.current) {
      return;
    }

    handledVoiceSelectionRef.current = true;
    if (isVoiceInterviewDisclosureAcknowledged()) {
      setVoiceActive(true);
      void store.controller.start();
    } else {
      setShowDisclosure(true);
    }
  }, [active, inputMode, setVoiceActive, store]);

  useEffect(
    () => () => {
      void store.controller.end();
    },
    [store],
  );

  // Petrinaut owns every live Voice surface, so this control only reports the
  // session's state and keeps the consent step to itself.
  useEffect(() => {
    reportVoiceSessionState(toVoiceSessionState({ snapshot }));
  }, [reportVoiceSessionState, snapshot]);

  useEffect(
    () => () => {
      reportVoiceSessionState(null);
    },
    [reportVoiceSessionState],
  );

  if (!active) {
    if (!showDisclosure || inputMode !== "voice") {
      return null;
    }

    return (
      <VoiceInterviewDisclosure
        checkingMicrophone={checkingMicrophone}
        consented={consented}
        microphoneCheck={microphoneCheck}
        onCheckMicrophone={() => {
          if (checkingMicrophone) {
            return;
          }
          setCheckingMicrophone(true);
          setMicrophoneCheck("");
          let microphoneCheckPromise: Promise<MediaStream>;
          try {
            const { mediaDevices } = navigator as {
              readonly mediaDevices?: MediaDevices;
            };
            microphoneCheckPromise =
              mediaDevices === undefined
                ? Promise.reject(new Error("Microphone access is unavailable."))
                : mediaDevices.getUserMedia({ audio: true });
          } catch (error) {
            microphoneCheckPromise = Promise.reject(error);
          }
          void microphoneCheckPromise
            .then((stream) => {
              for (const track of stream.getTracks()) {
                track.stop();
              }
              setMicrophoneCheck("Microphone ready.");
            })
            .catch(() =>
              setMicrophoneCheck("Microphone access was not available."),
            )
            .finally(() => setCheckingMicrophone(false));
        }}
        onConsentChange={setConsented}
        onStart={() => {
          acknowledgeVoiceInterviewDisclosure();
          setShowDisclosure(false);
          context.setVoiceActive(true);
          void store.controller.start();
        }}
      />
    );
  }

  return null;
};

export const VoiceInterviewControl = ({
  config,
  resolveInputSubmission,
  resolveResponseSubmission,
  settlements,
  subscribeToAdmission,
  subscribeToAdmissionFailure,
  ...context
}: PetrinautAiVoiceModeContext & {
  readonly config: OpenAIVoiceConfig;
  readonly resolveInputSubmission?: ResolveSubmission;
  readonly resolveResponseSubmission?: ResolveSubmissions;
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly subscribeToAdmission?: SubscribeToAdmission;
  readonly subscribeToAdmissionFailure?: SubscribeToAdmissionFailure;
}) => (
  <AvailableVoiceInterviewControl
    key={context.conversationId}
    config={config}
    context={context}
    resolveInputSubmission={resolveInputSubmission}
    resolveResponseSubmission={resolveResponseSubmission}
    settlements={settlements}
    subscribeToAdmission={subscribeToAdmission}
    subscribeToAdmissionFailure={subscribeToAdmissionFailure}
  />
);
