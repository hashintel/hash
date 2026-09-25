import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";

import {
  PetrinautInstanceContext,
  useCurrentViewedFrame,
  usePlaybackActions,
  usePlaybackState,
} from "@hashintel/petrinaut/react";

import { validateVoiceWrapUp } from "../../../shared/voice-mediation";
import { sessionDraftsFor } from "../shared/brunch-draft-experiment-drafts";
import { selectCanonicalSpeech } from "./canonical-speech";
import { LiveBrunchBridge } from "./live-brunch-bridge";
import {
  createLiveConversation,
  type LiveConversationState,
} from "./live-conversation";
import { ExperimentVoiceRelay } from "./live-conversation-control/experiment-voice-relay";
import { describePlaybackChange } from "./live-conversation-control/playback-voice-note";
import { LiveSpeechCaptions } from "./live-speech-captions";
import { VoiceAudioSettings } from "./voice-audio-settings";
import {
  VoiceInterviewDisclosure,
  VoiceInterviewRetry,
} from "./voice-interview-disclosure";
import { VoiceMediationHistory } from "./voice-mediation-history";

import type { VoiceInterviewControl } from "./voice-interview-control";
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
  > & {
    readonly mediationHistory?: VoiceMediationHistory;
    readonly acknowledgeDisclosure: () => void;
    readonly submit: ConstructorParameters<
      typeof LiveBrunchBridge
    >[0]["submit"];
    readonly connectionTimeoutMs: number;
    readonly isDisclosureAcknowledged: () => boolean;
  };

const noDrafts: ReturnType<ReturnType<typeof sessionDraftsFor>["get"]> = {
  currentToolCallId: null,
  drafts: new Map(),
};
const subscribeToNothing = () => () => {};
const getNoDrafts = () => noDrafts;

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
}: LiveControlsContext) => {
  const [localHistory] = useState(() => new VoiceMediationHistory("session"));
  const history = mediationHistory ?? localHistory;
  const [audioSettingsStore] = useState(
    () => new VoiceAudioSettings("live", navigator.mediaDevices),
  );
  const audioSettings = useSyncExternalStore(
    audioSettingsStore.subscribe,
    audioSettingsStore.getSnapshot,
    audioSettingsStore.getSnapshot,
  );
  const [consented, setConsented] = useState(false);
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
  const bridge = useRef<LiveBrunchBridge | null>(null);
  const latest = useRef({
    submit,
    messages,
    chat: {
      status,
      stopped,
      canAcceptVoiceInput,
      segments: selectCanonicalSpeech(messages).segments,
      settlements: settlements ?? [],
      snapshot,
    },
  });
  // Inside a Petrinaut editor the canvas and the experiment card are in view,
  // so the voice is told what they do. Standalone there is no instance and
  // every utterance is a Brunch turn.
  const instance = use(PetrinautInstanceContext);
  const playbackActions = usePlaybackActions();
  const playbackState = usePlaybackState();
  const viewedFrame = useCurrentViewedFrame();
  const drafts = instance ? sessionDraftsFor(instance.definition) : null;
  const draftsState = useSyncExternalStore(
    drafts?.subscribe ?? subscribeToNothing,
    drafts?.get ?? getNoDrafts,
    drafts?.get ?? getNoDrafts,
  );
  const relay = useRef<ExperimentVoiceRelay | null>(null);
  const latestDrafts = useRef(draftsState);
  const latestPlayback = useRef(playbackActions);
  useLayoutEffect(() => {
    latestPlayback.current = playbackActions;
  }, [playbackActions]);
  useLayoutEffect(() => {
    latestDrafts.current = draftsState;
    relay.current?.update(draftsState);
  }, [draftsState]);
  const previousPlaybackState = useRef(playbackState);
  useEffect(() => {
    const previous = previousPlaybackState.current;
    previousPlaybackState.current = playbackState;
    if (previous === playbackState || phase !== "connected" || !instance)
      return;
    const note = describePlaybackChange({
      previous,
      next: playbackState,
      frame: viewedFrame,
      definition: instance.definition.get(),
    });
    // Best effort, like every quiet note: a transition that fails to send is
    // not replayed, since the canvas has moved on.
    if (note) session.current?.appendThinking(note, null);
  }, [playbackState, phase, instance, viewedFrame]);
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
      chat: {
        status,
        stopped,
        canAcceptVoiceInput,
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
    relay.current?.stop();
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
    let connected = false;
    const captions = new LiveSpeechCaptions(history.caption);
    let offeredInput: string | undefined;
    const appendInputs = new Map<string, string>();
    const next = createLiveConversation(
      (nextState) => {
        if (session.current !== next) return;
        if (nextState.phase === "connected" && !connected) {
          connected = true;
          // The Live channel was closed when the bridge first saw the chat, so
          // any quiet context it tried to offer then failed locally. Re-offer.
          bridge.current?.update(latest.current.chat);
          relay.current?.update(latestDrafts.current);
        }
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
        ) {
          bridge.current?.stop();
          relay.current?.stop();
        }
        setState(nextState);
        setVoiceActive(
          nextState.phase === "connecting" || nextState.phase === "connected",
        );
      },
      connectionTimeoutMs,
      (input) => {
        if (session.current !== next) return;
        void bridge.current?.accept(input);
        if (!input.superseded) captions.begin(input.id);
      },
      (delegationId) => {
        if (session.current === next)
          bridge.current?.acceptDelegation(delegationId);
      },
      (result) => {
        if (session.current !== next) return;
        if (result.kind === "commentary") {
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
        // Quiet context is best effort: nothing the person heard depends on
        // it, and the bridge offers it again on the next conversation update.
        if (result.kind === "thinking") return;
        const label =
          result.kind === "commentary" ? "answer" : "continuation instruction";
        const outcome =
          result.status === "local-failure"
            ? "could not be sent to Live locally"
            : "was rejected by Live";
        setWarningMessage(
          `The ${label} ${outcome}. Check the conversation; no automatic retry or replay was made. Acceptance does not confirm playback.`,
        );
      },
      audioSettingsStore,
      {
        started: () => {
          captions.speechStarted();
          bridge.current?.speechStarted();
          relay.current?.interrupt();
          offeredInput = undefined;
          appendInputs.clear();
        },
        input: (fragment) => captions.input(fragment),
        output: (fragment) => captions.output(fragment),
        closed: () => captions.close(),
      },
    );
    next.setMicrophoneMuted(false);
    next.setSpeakerMuted(false);
    next.setSpeakerVolume(1);
    bridge.current = new LiveBrunchBridge({
      submit: (input) => latest.current.submit(input),
      mediation: {
        history,
        prepare: async (text, signal) =>
          z
            .object({ fields: z.record(z.string(), z.string()) })
            .parse(await prepareVoice("brief", text, signal)).fields,
        summarize: async (text, signal) =>
          validateVoiceWrapUp(
            z
              .object({ text: z.string() })
              .parse(await prepareVoice("wrap-up", text, signal)).text,
          ),
        offered: (inputId) => {
          offeredInput = inputId;
        },
      },
      appendCommentary: next.appendCommentary,
      appendInstructions: next.appendInstructions,
      appendThinking: next.appendThinking,
      notice: setWarningMessage,
      ...(instance
        ? {
            playback: {
              play: () => latestPlayback.current.play(),
              pause: () => latestPlayback.current.pause(),
              stop: () => latestPlayback.current.stop(),
            },
          }
        : {}),
    });
    bridge.current.update(latest.current.chat);
    relay.current = new ExperimentVoiceRelay({
      appendThinking: next.appendThinking,
      appendCommentary: next.appendCommentary,
      resultReady: (toolCallId, source) => {
        const responseIds = latest.current.messages
          .filter((entry) =>
            entry.parts.some(
              (part) => "toolCallId" in part && part.toolCallId === toolCallId,
            ),
          )
          .map((entry) => entry.id);
        bridge.current?.offerResult(
          `voice-result:${toolCallId}`,
          source,
          responseIds,
        );
      },
    });
    relay.current.update(latestDrafts.current);
    session.current = next;
    setVoiceActive(true);
    void next.start();
    return true;
  }, [
    audioSettingsStore,
    connectionTimeoutMs,
    history,
    instance,
    phase,
    setVoiceActive,
  ]);
  useLayoutEffect(() => {
    if (inputMode !== "voice" || !isAiAssistantOpen) {
      handledVoiceSelection.current = false;
      return;
    }
    if (handledVoiceSelection.current) return;
    if (!disclosureAcknowledged) {
      handledVoiceSelection.current = true;
      return;
    }
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- input mode synchronizes persisted disclosure state with the Live session
    handledVoiceSelection.current = tryStartLiveConversation();
  }, [
    disclosureAcknowledged,
    inputMode,
    isAiAssistantOpen,
    tryStartLiveConversation,
  ]);
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
      relay.current?.stop();
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
        (phase === "connecting" || phase === "connected" || phase === "error")
        ? {
            audioSettings,
            phase:
              phase === "error"
                ? "error"
                : phase === "connecting"
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
      relay.current?.stop();
      void session.current?.stop();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      const current = session.current;
      session.current = null;
      sessionActive.current = false;
      bridge.current?.stop();
      relay.current?.stop();
      void current?.stop();
      setVoiceActive(false);
      reportVoiceSessionState(null);
    };
  }, [reportVoiceSessionState, setVoiceActive]);

  if (inputMode !== "voice" || phase === "connecting" || phase === "connected")
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
      startDisabled={phase === "stopping"}
      microphoneCheck={phase === "error" ? (state.message ?? "") : ""}
      onStart={() => {
        if (!consented) return;
        acknowledgeDisclosure();
        setDisclosureAcknowledged(true);
        tryStartLiveConversation();
      }}
      onExit={exitVoiceMode}
    />
  );
};
