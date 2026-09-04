import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { reportVoiceDiagnostic } from "../../../voice-diagnostics";
import { selectCanonicalSpeechSegments } from "./canonical-speech";
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

import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

type ResolveSubmission = (
  messageId: string,
) => AgentSendResult["submissionId"] | undefined;
type SubscribeToAdmission = (
  target: RealtimeBrunchAdmissionTarget,
  listener: (submissionId: AgentSendResult["submissionId"]) => void,
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
}: {
  readonly input: SubmitInterviewAnswerInput;
  readonly resolveInputSubmission?: ResolveSubmission;
  readonly submitVoiceInput: PetrinautAiVoiceModeContext["submitVoiceInput"];
  readonly subscribeToAdmission?: SubscribeToAdmission;
}): Promise<SubmitInterviewAnswerResult> => {
  let unsubscribe = () => {};
  let removeAbortListener = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = () =>
      reject(new DOMException("Voice admission cancelled", "AbortError"));
    if (input.signal.aborted) {
      rejectForAbort();
      return;
    }
    input.signal.addEventListener("abort", rejectForAbort, { once: true });
    removeAbortListener = () =>
      input.signal.removeEventListener("abort", rejectForAbort);
  });
  const admissionObserved =
    subscribeToAdmission === undefined
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          unsubscribe = subscribeToAdmission(
            input.admissionTarget,
            (submissionId) => {
              input.onAdmission(submissionId);
              resolve();
            },
          );
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

const disclosureStyle = css({
  display: "flex",
  width: "full",
  flexDirection: "column",
  gap: "2",
  paddingX: "2",
  paddingY: "2",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  color: "neutral.s100",
});

const disclosureTitleStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  fontSize: "sm",
  fontWeight: "semibold",
});

const disclosureSubtitleStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "normal",
});

const disclosureCopyStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const disclosureActionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});

const VoiceInterviewDisclosure = ({
  consented,
  microphoneCheck,
  onCheckMicrophone,
  onConsentChange,
  onStart,
}: {
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
      className={disclosureStyle}
      ref={disclosureRef}
      tabIndex={-1}
    >
      <div className={disclosureTitleStyle}>
        <strong>Voice mode</strong>
        <span className={disclosureSubtitleStyle}>
          Talk through your process with AI
        </span>
      </div>
      <p className={disclosureCopyStyle}>
        OpenAI processes live audio and speaks the interviewer’s words.
        Petrinaut keeps finalized answers in this conversation, not the audio.
      </p>
      <label className={disclosureCopyStyle}>
        <input
          checked={consented}
          type="checkbox"
          onChange={(event) => onConsentChange(event.currentTarget.checked)}
        />{" "}
        I understand how speech and transcripts are handled.
      </label>
      {microphoneCheck && (
        <p aria-live="polite" className={disclosureCopyStyle}>
          {microphoneCheck}
        </p>
      )}
      <div className={disclosureActionsStyle}>
        <Button disabled={!consented} type="button" onClick={onStart}>
          Start voice mode
        </Button>
        <Button type="button" variant="subtle" onClick={onCheckMicrophone}>
          Check microphone
        </Button>
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
}: {
  config: OpenAIVoiceConfig;
  context: PetrinautAiVoiceModeContext;
  resolveInputSubmission?: ResolveSubmission;
  resolveResponseSubmission?: ResolveSubmission;
  settlements?: readonly VoiceSubmissionSettlement[];
  subscribeToAdmission?: SubscribeToAdmission;
}) => {
  "use no memo";

  const [store] = useState(() => {
    // Realtime submits an answer long after the render that created the
    // bridge, so these callbacks read what the layout effect below installs
    // rather than what was captured here.
    let latestSubmitVoiceInput = context.submitVoiceInput;
    let latestResolveInputSubmission = resolveInputSubmission;
    let latestSubscribeToAdmission = subscribeToAdmission;
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
      ) => {
        latestSubmitVoiceInput = nextSubmitVoiceInput;
        latestResolveInputSubmission = nextResolveInputSubmission;
        latestSubscribeToAdmission = nextSubscribeToAdmission;
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
    );
    store.controller.updateChat({
      canAcceptInterviewAnswer: context.canAcceptVoiceInput,
      canonicalSegments: selectCanonicalSpeechSegments(context.messages).map(
        (segment) => {
          const submissionId = resolveResponseSubmission?.(segment.messageId);
          return submissionId === undefined
            ? segment
            : { ...segment, submissionId };
        },
      ),
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
    store,
  ]);

  const active = snapshot.connection !== "idle";

  useEffect(
    () =>
      registerVoiceModeControls({
        end: () => store.controller.end(),
        pause: () => store.controller.pause(),
        reconnect: () => {
          void store.controller.reconnect();
        },
        resume: () => store.controller.resume(),
        setMicrophoneMuted: (muted) =>
          store.controller.setMicrophoneMuted(muted),
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
        consented={consented}
        microphoneCheck={microphoneCheck}
        onCheckMicrophone={() => {
          setMicrophoneCheck("Checking microphone…");
          void navigator.mediaDevices.getUserMedia({ audio: true }).then(
            (stream) => {
              for (const track of stream.getTracks()) {
                track.stop();
              }
              setMicrophoneCheck("Microphone ready.");
            },
            () => setMicrophoneCheck("Microphone access was not available."),
          );
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
  ...context
}: PetrinautAiVoiceModeContext & {
  readonly config: OpenAIVoiceConfig;
  readonly resolveInputSubmission?: ResolveSubmission;
  readonly resolveResponseSubmission?: ResolveSubmission;
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly subscribeToAdmission?: SubscribeToAdmission;
}) => (
  <AvailableVoiceInterviewControl
    key={context.conversationId}
    config={config}
    context={context}
    resolveInputSubmission={resolveInputSubmission}
    resolveResponseSubmission={resolveResponseSubmission}
    settlements={settlements}
    subscribeToAdmission={subscribeToAdmission}
  />
);
