import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { selectCanonicalSpeech } from "./canonical-speech";
import { LiveBrunchBridge } from "./live-brunch-bridge";
import {
  createLiveConversation,
  type LiveConversationState,
} from "./live-conversation";
import { createUtteranceJudgmentRequester } from "./request-utterance-judgment";
import { VoiceAudioSettings } from "./voice-audio-settings";
import {
  VoiceInterviewDisclosure,
  VoiceInterviewRetry,
} from "./voice-interview-disclosure";

import type { UtteranceJudgmentMode } from "../../../shared/live-utterance-judgment";
import type { WithheldUtterance } from "./live-utterance-gate";
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
    readonly acknowledgeDisclosure: () => void;
    readonly submit: ConstructorParameters<
      typeof LiveBrunchBridge
    >[0]["submit"];
    readonly connectionTimeoutMs: number;
    readonly isDisclosureAcknowledged: () => boolean;
    readonly utteranceJudgment?: Exclude<UtteranceJudgmentMode, "off">;
  };

export const LiveConversationControl = ({
  acknowledgeDisclosure,
  inputMode,
  isAiAssistantOpen,
  isDisclosureAcknowledged,
  registerVoiceModeSessionControls,
  reportVoiceSessionState,
  setVoiceActive,
  setInputMode,
  connectionTimeoutMs,
  utteranceJudgment,
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
  const [withheld, setWithheld] = useState<readonly WithheldUtterance[]>([]);
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
    chat: {
      status,
      stopped,
      canAcceptVoiceInput,
      currentInterviewQuestion:
        selectCanonicalSpeech(messages).questionSegment?.text ?? null,
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
    const speech = selectCanonicalSpeech(messages);
    const segments = speech.segments.map((segment) => ({
      ...segment,
      submissionIds: resolveResponseSubmission?.(segment.messageId),
    }));
    latest.current = {
      submit,
      chat: {
        status,
        stopped,
        canAcceptVoiceInput,
        currentInterviewQuestion: speech.questionSegment?.text ?? null,
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
    const next = createLiveConversation(
      (nextState) => {
        if (session.current !== next) return;
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
        if (session.current === next) void bridge.current?.accept(input);
      },
      (delegationId) => {
        if (session.current === next)
          bridge.current?.acceptDelegation(delegationId);
      },
      (result) => {
        if (session.current !== next) return;
        // Every successful local send starts as unknown. Neither waiting
        // for acceptance nor acceptance itself is an error or resolves a
        // failure from another append.
        if (result.status === "unknown" || result.status === "accepted") return;
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
    );
    next.setMicrophoneMuted(false);
    next.setSpeakerMuted(false);
    next.setSpeakerVolume(1);
    bridge.current = new LiveBrunchBridge({
      submit: (input) => latest.current.submit(input),
      appendCommentary: next.appendCommentary,
      appendInstructions: next.appendInstructions,
      notice: setWarningMessage,
      enforce: utteranceJudgment === "enforce",
      withheldChanged: setWithheld,
      judge:
        utteranceJudgment === "log" || utteranceJudgment === "enforce"
          ? createUtteranceJudgmentRequester(globalThis.fetch.bind(globalThis))
          : undefined,
    });
    bridge.current.update(latest.current.chat);
    session.current = next;
    setVoiceActive(true);
    void next.start();
    return true;
  }, [
    audioSettingsStore,
    connectionTimeoutMs,
    phase,
    setVoiceActive,
    utteranceJudgment,
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

  if (inputMode === "voice" && phase === "connected" && withheld.length > 0) {
    return (
      <details
        className={css({
          width: "full",
          padding: "3",
          borderTopWidth: "thin",
          borderTopStyle: "solid",
          borderTopColor: "neutral.a20",
          backgroundColor: "neutral.bg.subtle",
          color: "neutral.s100",
          fontSize: "sm",
        })}
      >
        <summary className={css({ cursor: "pointer", fontWeight: "medium" })}>
          Not sent to Brunch ({withheld.length})
        </summary>
        <p
          className={css({
            color: "neutral.s80",
            fontSize: "xs",
            marginTop: "2",
          })}
        >
          Held by the experimental filter. Send an answer it missed. This list
          clears when voice ends.
        </p>
        <ul
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
            maxHeight: "[200px]",
            overflowY: "auto",
            marginTop: "2",
          })}
        >
          {withheld.map((input) => (
            <li
              key={input.id}
              className={css({
                display: "flex",
                flexDirection: "column",
                alignItems: "start",
                gap: "2",
                padding: "2",
                borderRadius: "lg",
                backgroundColor: "neutral.s00",
              })}
            >
              <p
                className={css({
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  width: "full",
                })}
              >
                {input.text}
              </p>
              <Button
                size="xs"
                variant="subtle"
                type="button"
                onClick={() => bridge.current?.release(input.id)}
              >
                Send to Brunch
              </Button>
            </li>
          ))}
        </ul>
      </details>
    );
  }
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
