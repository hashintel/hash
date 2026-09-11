import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { selectCanonicalSpeech } from "./canonical-speech";
import { LiveBrunchBridge } from "./live-brunch-bridge";
import {
  createLiveConversation,
  type LiveConversationState,
} from "./live-conversation";
import { VoiceInterviewDisclosure } from "./voice-interview-disclosure";

import type { VoiceInterviewControl } from "./voice-interview-control";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

type LiveControlsContext = PetrinautAiVoiceModeContext &
  Pick<
    Parameters<typeof VoiceInterviewControl>[0],
    | "resolveResponseSubmission"
    | "settlements"
    | "snapshot"
    | "subscribeToResponseMessageStarted"
    | "subscribeToResponseMessageCompleted"
    | "subscribeToStopRequested"
  > & {
    readonly submit: ConstructorParameters<
      typeof LiveBrunchBridge
    >[0]["submit"];
    readonly connectionTimeoutMs: number;
  };

export const LiveConversationControl = ({
  inputMode,
  isAiAssistantOpen,
  registerVoiceModeControls,
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
  const [consented, setConsented] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState<LiveConversationState>({
    phase: "idle",
    message: null,
  });
  const { phase, activity } = state;
  const session = useRef<ReturnType<typeof createLiveConversation> | null>(
    null,
  );
  const bridge = useRef<LiveBrunchBridge | null>(null);
  const latest = useRef({
    submit,
    chat: {
      status,
      stopped,
      canAcceptVoiceInput,
      segments: selectCanonicalSpeech(messages).segments,
      settlements: settlements ?? [],
      snapshot,
    },
  });
  useLayoutEffect(() => {
    const segments = selectCanonicalSpeech(messages).segments.map(
      (segment) => ({
        ...segment,
        submissionIds: resolveResponseSubmission?.(segment.messageId),
      }),
    );
    latest.current = {
      submit,
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
    const closing = session.current?.stop();
    setVoiceActive(false);
    setConsented(false);
    await closing;
  }, [setVoiceActive]);
  useEffect(
    () =>
      subscribeToStopRequested?.(() => {
        void end();
      }),
    [end, subscribeToStopRequested],
  );

  useEffect(() => {
    if (stopped || inputMode !== "voice" || !isAiAssistantOpen) {
      bridge.current?.stop();
      void session.current?.stop();
    }
  }, [stopped, inputMode, isAiAssistantOpen]);

  useEffect(
    () =>
      registerVoiceModeControls({
        end,
        // Closing the panel ends Live. Reopening requires consent and a new session.
        pause: () => {
          void end();
        },
      }),
    [end, registerVoiceModeControls],
  );

  useEffect(() => {
    reportVoiceSessionState(
      inputMode === "voice" &&
        isAiAssistantOpen &&
        (phase === "connecting" || phase === "connected" || phase === "error")
        ? {
            phase:
              phase === "error"
                ? "error"
                : phase === "connecting"
                  ? "connecting"
                  : activity?.outputActive
                    ? "speaking"
                    : "listening",
            microphoneLevel:
              phase === "error" ? 0 : (activity?.microphoneLevel ?? 0),
            microphoneMuted: phase === "error",
            errorMessage: phase === "error" ? state.message : null,
            notice,
          }
        : null,
    );
  }, [
    inputMode,
    isAiAssistantOpen,
    phase,
    state.message,
    activity,
    notice,
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
      bridge.current?.stop();
      void current?.stop();
      setVoiceActive(false);
      reportVoiceSessionState(null);
    };
  }, [reportVoiceSessionState, setVoiceActive]);

  if (inputMode !== "voice" || phase === "connecting" || phase === "connected")
    return null;
  return (
    <VoiceInterviewDisclosure
      experimental
      consented={consented}
      onConsentChange={setConsented}
      startDisabled={phase === "stopping"}
      microphoneCheck={state.message ?? ""}
      onStart={() => {
        if (!consented || phase === "stopping") return;
        setConsented(false);
        setNotice(null);
        setState({ phase: "connecting", message: null });
        const next = createLiveConversation(
          (nextState) => {
            if (session.current !== next) return;
            if (
              nextState.phase === "error" ||
              nextState.phase === "ended" ||
              nextState.phase === "stopping"
            )
              bridge.current?.stop();
            setState(nextState);
            setVoiceActive(
              nextState.phase === "connecting" ||
                nextState.phase === "connected",
            );
          },
          connectionTimeoutMs,
          (input) => {
            if (session.current === next) void bridge.current?.accept(input);
          },
        );
        bridge.current = new LiveBrunchBridge({
          submit: (input) => latest.current.submit(input),
          appendCommentary: next.appendCommentary,
          notice: setNotice,
        });
        bridge.current.update(latest.current.chat);
        session.current = next;
        setVoiceActive(true);
        void next.start();
      }}
      onExit={() => {
        void end();
        setInputMode("text");
      }}
    />
  );
};
