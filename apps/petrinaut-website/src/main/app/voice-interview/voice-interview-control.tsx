import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  FlueChatAdmissionError,
  type FlueChatResponseMessageCompletedEvent,
  type FlueChatResponseMessageStartedEvent,
} from "@hashintel/brunch-agent-transport-aisdk";

import { reportVoiceDiagnostic } from "../../../voice-diagnostics";
import { selectCanonicalSpeech } from "./canonical-speech";
import { LiveConversationControl } from "./live-conversation-control";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import {
  RealtimeBrunchBridge,
  type RealtimeBrunchAdmissionTarget,
  type VoiceSubmissionSettlement,
} from "./realtime-brunch-bridge";
import { VoiceInterviewDisclosure } from "./voice-interview-disclosure";
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
type SubscribeToResponseMessageCompleted = (
  listener: (event: FlueChatResponseMessageCompletedEvent) => void,
) => () => void;
type SubscribeToResponseMessageStarted = (
  listener: (event: FlueChatResponseMessageStartedEvent) => void,
) => () => void;
type SubscribeToStopRequested = (listener: () => void) => () => void;
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
  readonly provider?: "realtime" | "live";
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

const interruptionBySpeakingStorageKey =
  "petrinaut:interruption-by-speaking:v1";

export const readInterruptionBySpeakingPreference = (
  storage: Pick<
    Storage,
    "getItem"
  > | null = getVoiceInterviewDisclosureStorage(),
): boolean => {
  try {
    return storage?.getItem(interruptionBySpeakingStorageKey) !== "false";
  } catch {
    return true;
  }
};

export const saveInterruptionBySpeakingPreference = (
  enabled: boolean,
  storage: Pick<
    Storage,
    "setItem"
  > | null = getVoiceInterviewDisclosureStorage(),
): void => {
  try {
    storage?.setItem(interruptionBySpeakingStorageKey, String(enabled));
  } catch {
    // The preference still applies to this session when storage is unavailable.
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
      (body.provider !== undefined &&
        body.provider !== "realtime" &&
        body.provider !== "live") ||
      !Number.isInteger(body.connectionTimeoutMs) ||
      (body.connectionTimeoutMs as number) < 1_000 ||
      (body.connectionTimeoutMs as number) > 60_000
    ) {
      return null;
    }
    return {
      available: true,
      connectionTimeoutMs: body.connectionTimeoutMs as number,
      ...(body.provider === undefined
        ? {}
        : { provider: body.provider as "realtime" | "live" }),
    };
  } catch {
    return null;
  }
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
  subscribeToResponseMessageCompleted,
  subscribeToResponseMessageStarted,
  subscribeToStopRequested,
}: {
  config: OpenAIVoiceConfig;
  context: PetrinautAiVoiceModeContext;
  resolveInputSubmission?: ResolveSubmission;
  resolveResponseSubmission?: ResolveSubmissions;
  settlements?: readonly VoiceSubmissionSettlement[];
  subscribeToAdmission?: SubscribeToAdmission;
  subscribeToAdmissionFailure?: SubscribeToAdmissionFailure;
  subscribeToResponseMessageCompleted?: SubscribeToResponseMessageCompleted;
  subscribeToResponseMessageStarted?: SubscribeToResponseMessageStarted;
  subscribeToStopRequested?: SubscribeToStopRequested;
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
    controller.setInterruptionBySpeaking(
      readInterruptionBySpeakingPreference(),
    );
    return {
      bridge,
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

  useEffect(
    () =>
      subscribeToResponseMessageCompleted?.((event) =>
        store.bridge.notifyResponseMessageCompleted(event),
      ),
    [store, subscribeToResponseMessageCompleted],
  );
  useEffect(
    () =>
      subscribeToResponseMessageStarted?.((event) =>
        store.bridge.notifyResponseMessageStarted(event),
      ),
    [store, subscribeToResponseMessageStarted],
  );
  useEffect(
    () =>
      subscribeToStopRequested?.(() => store.controller.cancelPendingSpeech()),
    [store, subscribeToStopRequested],
  );

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
      stopped: context.stopped,
      status: context.status,
    });
  }, [
    context.canAcceptVoiceInput,
    context.messages,
    context.status,
    context.stopped,
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
        setInterruptionBySpeaking: (enabled) => {
          store.controller.setInterruptionBySpeaking(enabled);
          saveInterruptionBySpeakingPreference(enabled);
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

const PinnedVoiceInterviewControl = ({
  config,
  resolveInputSubmission,
  resolveResponseSubmission,
  settlements,
  subscribeToAdmission,
  subscribeToAdmissionFailure,
  subscribeToResponseMessageCompleted,
  subscribeToResponseMessageStarted,
  subscribeToStopRequested,
  ...context
}: PetrinautAiVoiceModeContext & {
  readonly config: OpenAIVoiceConfig;
  readonly resolveInputSubmission?: ResolveSubmission;
  readonly resolveResponseSubmission?: ResolveSubmissions;
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly subscribeToAdmission?: SubscribeToAdmission;
  readonly subscribeToAdmissionFailure?: SubscribeToAdmissionFailure;
  readonly subscribeToResponseMessageCompleted?: SubscribeToResponseMessageCompleted;
  readonly subscribeToResponseMessageStarted?: SubscribeToResponseMessageStarted;
  readonly subscribeToStopRequested?: SubscribeToStopRequested;
}) => {
  // Configuration changes only apply after a new conversation mount / page load.
  // Never replace a running provider or resubmit its input.
  const [sessionConfig] = useState(config);
  if (sessionConfig.provider === "live") {
    return (
      <LiveConversationControl
        {...context}
        connectionTimeoutMs={sessionConfig.connectionTimeoutMs}
        resolveResponseSubmission={resolveResponseSubmission}
        settlements={settlements}
        subscribeToResponseMessageStarted={subscribeToResponseMessageStarted}
        subscribeToResponseMessageCompleted={
          subscribeToResponseMessageCompleted
        }
        subscribeToStopRequested={subscribeToStopRequested}
        submit={(input) =>
          submitVoiceInputWithAdmission({
            input,
            resolveInputSubmission,
            subscribeToAdmission,
            subscribeToAdmissionFailure,
            submitVoiceInput: context.submitVoiceInput,
          })
        }
      />
    );
  }
  return (
    <AvailableVoiceInterviewControl
      key={context.conversationId}
      config={sessionConfig}
      context={context}
      resolveInputSubmission={resolveInputSubmission}
      resolveResponseSubmission={resolveResponseSubmission}
      settlements={settlements}
      subscribeToAdmission={subscribeToAdmission}
      subscribeToAdmissionFailure={subscribeToAdmissionFailure}
      subscribeToResponseMessageCompleted={subscribeToResponseMessageCompleted}
      subscribeToResponseMessageStarted={subscribeToResponseMessageStarted}
      subscribeToStopRequested={subscribeToStopRequested}
    />
  );
};

export const VoiceInterviewControl = (
  props: Parameters<typeof PinnedVoiceInterviewControl>[0],
) => <PinnedVoiceInterviewControl key={props.conversationId} {...props} />;
