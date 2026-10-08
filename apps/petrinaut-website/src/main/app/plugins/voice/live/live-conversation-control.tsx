import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";

import { voiceWrapUpResponseSchema } from "../../../../../shared/voice-mediation";
import { VoiceMediationHistory } from "../history/voice-mediation-history";
import { VoiceAudioSettings } from "../session/voice-audio-settings";
import {
  VoiceInterviewDisclosure,
  VoiceInterviewRetry,
} from "../session/voice-interview-disclosure";
import { selectCanonicalSpeech } from "./canonical-speech";
import { LiveBrunchBridge } from "./live-brunch-bridge";
import {
  createLiveConversation,
  type LiveConversationState,
} from "./live-conversation";
import { LiveSpeechCaptions } from "./live-speech-captions";

import type { VoiceInterviewControl } from "../session/voice-interview-control";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

type LiveControlsContext = PetrinautAiVoiceModeContext &
  Required<
    Pick<PetrinautAiVoiceModeContext, "registerVoiceModeSessionControls">
  > &
  Pick<
    Parameters<typeof VoiceInterviewControl>[0],
    | "resolveResponseSubmission"
    | "settlements"
    | "snapshot"
    | "subscribeToResponseMessageStarted"
    | "subscribeToResponseMessageCompleted"
    | "subscribeToStopRequested"
    | "toolApprovalState"
  > & {
    readonly mediationHistory?: VoiceMediationHistory;
    readonly acknowledgeDisclosure: () => void;
    readonly submit: ConstructorParameters<
      typeof LiveBrunchBridge
    >[0]["submit"];
    readonly connectionTimeoutMs: number;
    readonly isDisclosureAcknowledged: () => boolean;
  };

const prepareVoice = async (
  kind: "brief" | "wrap-up",
  text: string,
  signal: AbortSignal,
): Promise<unknown> => {
  const response = await fetch("/api/voice/mediation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, text }),
    signal,
  });
  if (!response.ok) throw new Error("Voice preparation failed");
  return response.json();
};

type LiveMediation = ConstructorParameters<
  typeof LiveBrunchBridge
>[0]["mediation"];

// Kept outside the component: React Compiler cannot compile an object getter.
const createLiveMediation = (
  readHistory: () => VoiceMediationHistory,
  offered: LiveMediation["offered"],
): LiveMediation => ({
  get history() {
    return readHistory();
  },
  prepare: async (text, signal) =>
    z
      .object({ fields: z.record(z.string(), z.string()) })
      .parse(await prepareVoice("brief", text, signal)).fields,
  summarize: async (text, signal) =>
    voiceWrapUpResponseSchema.parse(await prepareVoice("wrap-up", text, signal))
      .text,
  offered,
});

export const LiveConversationControl = ({
  mediationHistory,
  acknowledgeDisclosure,
  inputMode,
  isAiAssistantOpen,
  isDisclosureAcknowledged,
  registerVoiceModeSessionControls,
  reportVoiceSessionState,
  setVoiceActive,
  setInputMode,
  connectionTimeoutMs,
  submit,
  messages,
  status,
  stopped,
  canAcceptVoiceInput,
  resolveResponseSubmission,
  settlements,
  snapshot,
  subscribeToResponseMessageStarted,
  subscribeToResponseMessageCompleted,
  subscribeToStopRequested,
  toolApprovalState,
}: LiveControlsContext) => {
  const [localHistory] = useState(() => new VoiceMediationHistory("session"));
  const history = mediationHistory ?? localHistory;
  // A running session outlives conversation switches; each new write or turn
  // uses the current conversation's history.
  const historyRef = useRef(history);
  useLayoutEffect(() => {
    historyRef.current = history;
  }, [history]);
  const [audioSettingsStore] = useState(
    () => new VoiceAudioSettings("live", navigator.mediaDevices),
  );
  const audioSettings = useSyncExternalStore(
    audioSettingsStore.subscribe,
    audioSettingsStore.getSnapshot,
    audioSettingsStore.getSnapshot,
  );
  const [consented, setConsented] = useState(false);
  const [checkingMicrophone, setCheckingMicrophone] = useState(false);
  const [microphoneCheck, setMicrophoneCheck] = useState("");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [microphoneMuted, setMicrophoneMutedState] = useState(false);
  const [speakerMuted, setSpeakerMutedState] = useState(false);
  const [speakerVolume, setSpeakerVolumeState] = useState(1);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(
    isDisclosureAcknowledged,
  );
  const [state, setState] = useState<LiveConversationState>({
    phase: "idle",
    message: null,
  });
  const { phase, activity, message, playbackBlocked } = state;
  const session = useRef<ReturnType<typeof createLiveConversation> | null>(
    null,
  );
  const sessionActive = useRef(false);
  const handledVoiceSelection = useRef(false);
  const [startAwaitingStop, setStartAwaitingStop] = useState(false);
  const bridge = useRef<LiveBrunchBridge | null>(null);
  const latest = useRef({
    submit,
    messages,
    toolApprovalState,
    chat: {
      status,
      stopped,
      canAcceptVoiceInput,
      messages,
      segments: selectCanonicalSpeech(messages).segments,
      settlements: settlements ?? [],
      snapshot,
    },
  });
  useLayoutEffect(() => {
    audioSettingsStore.setPreviewAvailability({
      connected: phase === "connected",
      microphoneMuted,
      busy:
        !!activity?.outputActive ||
        (!stopped && (status === "submitted" || status === "streaming")),
    });
  }, [
    audioSettingsStore,
    phase,
    microphoneMuted,
    activity?.outputActive,
    status,
    stopped,
  ]);
  useLayoutEffect(() => {
    const segments = selectCanonicalSpeech(messages).segments.map(
      (segment) => ({
        ...segment,
        submissionIds: resolveResponseSubmission?.(segment.messageId),
      }),
    );
    latest.current = {
      submit,
      messages,
      toolApprovalState,
      chat: {
        status,
        stopped,
        canAcceptVoiceInput,
        messages,
        segments,
        settlements: settlements ?? [],
        snapshot,
      },
    };
    bridge.current?.update(latest.current.chat);
  }, [
    submit,
    messages,
    status,
    stopped,
    canAcceptVoiceInput,
    resolveResponseSubmission,
    settlements,
    snapshot,
    toolApprovalState,
  ]);

  useEffect(
    () =>
      subscribeToResponseMessageStarted?.((event) =>
        bridge.current?.responseStarted(event),
      ),
    [subscribeToResponseMessageStarted],
  );
  useEffect(
    () =>
      subscribeToResponseMessageCompleted?.((event) =>
        bridge.current?.responseCompleted(event),
      ),
    [subscribeToResponseMessageCompleted],
  );
  const end = useCallback(async () => {
    bridge.current?.stop();
    sessionActive.current = false;
    const closing = session.current?.stop();
    setVoiceActive(false);
    setConsented(false);
    await closing;
  }, [setVoiceActive]);
  const tryStartLiveConversation = useCallback(() => {
    if (phase === "stopping" || sessionActive.current) return false;
    sessionActive.current = true;
    setConsented(false);
    setMicrophoneMutedState(false);
    setSpeakerMutedState(false);
    setSpeakerVolumeState(1);
    setWarningMessage(null);
    setState({ phase: "connecting", message: null });
    // Like a bridge turn, a preview or caption stays in the history it began in.
    const pinnedHistories = new Map<string, VoiceMediationHistory>();
    const historyFor = (id: string) => {
      const pinned = pinnedHistories.get(id);
      if (pinned) return pinned;
      pinnedHistories.set(id, historyRef.current);
      return historyRef.current;
    };
    const retirePreview = (id: string) => {
      historyFor(id).failed(id);
      pinnedHistories.delete(id);
    };
    const captions = new LiveSpeechCaptions(
      (id, kind, line) => historyFor(id).caption(id, kind, line),
      {
        update: (id, text) => historyFor(id).input(id, text),
        discard: retirePreview,
      },
    );
    let offeredInput: string | undefined;
    const appendInputs = new Map<string, string>();
    // Appends sent before the person last started speaking belong to the
    // interrupted turn; a late acceptance must not caption the new one.
    const turnAppends = new Set<string>();
    const next = createLiveConversation(
      (nextState) => {
        if (session.current !== next) return;
        bridge.current?.liveSpeaking(nextState.activity?.outputActive === true);
        if (
          nextState.phase !== "connected" ||
          nextState.activity?.outputActive
        ) {
          audioSettingsStore.setPreviewAvailability({
            connected: nextState.phase === "connected",
            microphoneMuted: false,
            busy: true,
          });
        }
        if (
          nextState.phase === "stopping" ||
          nextState.phase === "ended" ||
          nextState.phase === "error"
        ) {
          sessionActive.current = false;
        }
        if (
          nextState.phase === "error" ||
          nextState.phase === "ended" ||
          nextState.phase === "stopping"
        )
          bridge.current?.stop();
        setState(nextState);
        setVoiceActive(
          nextState.phase === "connecting" || nextState.phase === "connected",
        );
      },
      connectionTimeoutMs,
      (input) => {
        if (session.current !== next) return;
        historyFor(input.id);
        void bridge.current?.accept(input);
        if (!input.superseded) {
          const previewId = captions.begin(input.id);
          if (previewId) retirePreview(previewId);
        }
      },
      (delegationId) => {
        if (session.current === next)
          bridge.current?.acceptDelegation(delegationId);
      },
      (result) => {
        if (session.current !== next) return;
        if (result.status === "unknown") turnAppends.add(result.eventId);
        // A local failure is reported synchronously, without a prior unknown.
        const currentTurn =
          result.status === "local-failure" || turnAppends.has(result.eventId);
        if (result.status !== "unknown") turnAppends.delete(result.eventId);
        if (currentTurn && result.kind === "commentary" && result.progress) {
          if (result.status === "accepted" && result.startMs !== undefined)
            captions.progress(result.startMs);
        } else if (currentTurn && result.kind === "commentary") {
          if (offeredInput) {
            appendInputs.set(result.eventId, offeredInput);
            offeredInput = undefined;
          }
          const inputId = appendInputs.get(result.eventId);
          if (
            inputId &&
            result.status === "accepted" &&
            result.startMs !== undefined
          )
            captions.wrapUp(inputId, result.startMs);
          if (result.status !== "unknown") appendInputs.delete(result.eventId);
        }
        // Every successful local send starts as unknown. Neither waiting
        // for acceptance nor acceptance itself is an error or resolves a
        // failure from another append.
        if (result.status === "unknown" || result.status === "accepted") return;
        // Quiet interruption context and progress lines are best effort, not
        // an audible answer.
        if (result.kind === "thinking" || result.progress) return;
        setWarningMessage(
          result.kind === "commentary"
            ? "Couldn’t speak the answer. The written answer is in the conversation."
            : "Voice may be out of sync. Check the conversation before relying on what it says.",
        );
      },
      audioSettingsStore,
      {
        started: () => {
          if (session.current !== next) return;
          captions.speechStarted();
          bridge.current?.speechStarted();
          offeredInput = undefined;
          appendInputs.clear();
          turnAppends.clear();
        },
        input: (fragment) => {
          if (session.current === next) captions.input(fragment);
        },
        output: (fragment) => {
          if (session.current === next) captions.output(fragment);
        },
        closed: () => captions.close(),
      },
    );
    next.setMicrophoneMuted(false);
    next.setSpeakerMuted(false);
    next.setSpeakerVolume(1);
    bridge.current = new LiveBrunchBridge({
      submit: (input) => latest.current.submit(input),
      mediation: createLiveMediation(
        () => historyRef.current,
        (inputId) => {
          offeredInput = inputId;
        },
      ),
      appendCommentary: next.appendCommentary,
      appendProgress: next.appendProgress,
      appendInstructions: next.appendInstructions,
      appendThinking: next.appendThinking,
      notice: setWarningMessage,
      speechPending: next.speechPending,
      toolApprovalState: (toolCallId) =>
        latest.current.toolApprovalState?.(toolCallId) ?? null,
    });
    bridge.current.update(latest.current.chat);
    session.current = next;
    setVoiceActive(true);
    void next.start();
    return true;
  }, [audioSettingsStore, connectionTimeoutMs, phase, setVoiceActive]);
  useLayoutEffect(() => {
    if (inputMode !== "voice" || !isAiAssistantOpen) {
      handledVoiceSelection.current = false;
      setStartAwaitingStop(false);
      return;
    }
    if (handledVoiceSelection.current) return;
    if (!disclosureAcknowledged) {
      handledVoiceSelection.current = true;
      return;
    }
    handledVoiceSelection.current = tryStartLiveConversation();
    setStartAwaitingStop(!handledVoiceSelection.current);
  }, [
    disclosureAcknowledged,
    inputMode,
    isAiAssistantOpen,
    tryStartLiveConversation,
  ]);
  // Reopening Voice while the previous session is still closing starts the
  // next one as soon as it ends, so that wait is part of connecting.
  const sessionPhase =
    startAwaitingStop && phase === "stopping" ? "connecting" : phase;
  const setMicrophoneMuted = useCallback((muted: boolean) => {
    if (!sessionActive.current || !session.current) return;
    session.current.setMicrophoneMuted(muted);
    setMicrophoneMutedState(muted);
  }, []);
  const setSpeakerMuted = useCallback((muted: boolean) => {
    if (!sessionActive.current || !session.current) return;
    session.current.setSpeakerMuted(muted);
    setSpeakerMutedState(muted);
  }, []);
  const setSpeakerVolume = useCallback((volume: number) => {
    if (!sessionActive.current || !session.current) return;
    const clampedVolume = Math.min(1, Math.max(0, volume));
    session.current.setSpeakerVolume(clampedVolume);
    setSpeakerVolumeState(clampedVolume);
  }, []);
  useEffect(
    () =>
      subscribeToStopRequested?.(() => {
        bridge.current?.stopResponse();
      }),
    [subscribeToStopRequested],
  );

  useEffect(() => {
    if (inputMode !== "voice" || !isAiAssistantOpen) {
      bridge.current?.stop();
      void session.current?.stop();
    }
  }, [inputMode, isAiAssistantOpen]);

  useEffect(
    () =>
      registerVoiceModeSessionControls({
        audioSettings: audioSettingsStore.actions,
        end,
        // Closing the panel ends Live. Reopening starts a new session after
        // the first disclosure has been acknowledged.
        pause: () => {
          void end();
        },
        retryPlayback: () => {
          void session.current?.retryPlayback();
        },
        setMicrophoneMuted,
        setSpeakerMuted,
        setSpeakerVolume,
      }),
    [
      audioSettingsStore,
      end,
      registerVoiceModeSessionControls,
      setMicrophoneMuted,
      setSpeakerMuted,
      setSpeakerVolume,
    ],
  );

  useEffect(() => {
    reportVoiceSessionState(
      inputMode === "voice" &&
        isAiAssistantOpen &&
        (sessionPhase === "connecting" ||
          sessionPhase === "connected" ||
          sessionPhase === "error")
        ? {
            audioSettings,
            phase:
              sessionPhase === "error"
                ? "error"
                : sessionPhase === "connecting"
                  ? "connecting"
                  : activity?.outputActive
                    ? "speaking"
                    : !stopped &&
                        (status === "submitted" || status === "streaming")
                      ? "thinking"
                      : microphoneMuted
                        ? "muted"
                        : "listening",
            microphoneLevel:
              phase === "error" || microphoneMuted
                ? 0
                : (activity?.microphoneLevel ?? 0),
            microphoneMuted: phase === "error" || microphoneMuted,
            errorMessage: phase === "error" ? message : null,
            notice: playbackBlocked ? message : null,
            speakerMuted,
            speakerVolume,
            warningMessage,
            ...(playbackBlocked ? { canRetryPlayback: true } : {}),
          }
        : null,
    );
  }, [
    audioSettings,
    inputMode,
    isAiAssistantOpen,
    phase,
    sessionPhase,
    message,
    playbackBlocked,
    activity,
    status,
    stopped,
    microphoneMuted,
    speakerMuted,
    speakerVolume,
    warningMessage,
    reportVoiceSessionState,
  ]);

  useEffect(() => {
    const leave = () => {
      bridge.current?.stop();
      void session.current?.stop();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      const current = session.current;
      session.current = null;
      sessionActive.current = false;
      bridge.current?.stop();
      void current?.stop();
      setVoiceActive(false);
      reportVoiceSessionState(null);
    };
  }, [reportVoiceSessionState, setVoiceActive]);

  if (
    inputMode !== "voice" ||
    sessionPhase === "connecting" ||
    sessionPhase === "connected"
  )
    return null;
  const exitVoiceMode = () => {
    void end();
    setInputMode("text");
  };
  if (disclosureAcknowledged) {
    const retryMessage =
      phase === "error"
        ? (state.message ?? "The voice connection was unavailable.")
        : phase === "stopping"
          ? "Finishing the previous voice session."
          : "Start a new Live voice session.";
    return (
      <VoiceInterviewRetry
        message={retryMessage}
        onExit={exitVoiceMode}
        onRetry={tryStartLiveConversation}
        retryDisabled={phase === "stopping"}
      />
    );
  }
  return (
    <VoiceInterviewDisclosure
      experimental
      consented={consented}
      onConsentChange={setConsented}
      checkingMicrophone={checkingMicrophone}
      startDisabled={phase === "stopping" || checkingMicrophone}
      microphoneCheck={
        phase === "error" ? (state.message ?? "") : microphoneCheck
      }
      onCheckMicrophone={() => {
        if (checkingMicrophone) return;
        setCheckingMicrophone(true);
        setMicrophoneCheck("");
        void (async () => {
          try {
            const microphoneId = audioSettings.devices.microphoneId;
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: microphoneId
                ? { deviceId: { exact: microphoneId } }
                : true,
            });
            for (const track of stream.getTracks()) track.stop();
            setMicrophoneCheck("Microphone ready. No audio was sent.");
          } catch {
            setMicrophoneCheck(
              "Couldn’t access the microphone. Check your browser permissions.",
            );
          }
          setCheckingMicrophone(false);
        })();
      }}
      onStart={() => {
        if (!consented || checkingMicrophone) return;
        acknowledgeDisclosure();
        setDisclosureAcknowledged(true);
        tryStartLiveConversation();
      }}
      onExit={exitVoiceMode}
    />
  );
};
