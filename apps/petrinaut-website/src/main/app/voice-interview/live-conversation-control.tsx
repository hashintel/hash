import { useCallback, useEffect, useRef, useState } from "react";

import {
  createLiveConversation,
  type LiveConversationState,
} from "./live-conversation";
import { VoiceInterviewDisclosure } from "./voice-interview-disclosure";

import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

// No canonical messages, submission, settlement, or tools cross this boundary.
type LiveControlsContext = Pick<
  PetrinautAiVoiceModeContext,
  | "inputMode"
  | "isAiAssistantOpen"
  | "registerVoiceModeControls"
  | "reportVoiceSessionState"
  | "setVoiceActive"
  | "setInputMode"
>;

export const LiveConversationControl = ({
  inputMode,
  isAiAssistantOpen,
  registerVoiceModeControls,
  reportVoiceSessionState,
  setVoiceActive,
  setInputMode,
  connectionTimeoutMs,
}: LiveControlsContext & { readonly connectionTimeoutMs: number }) => {
  const [consented, setConsented] = useState(false);
  const [state, setState] = useState<LiveConversationState>({
    phase: "idle",
    message: null,
  });
  const { phase, activity } = state;
  const session = useRef<ReturnType<typeof createLiveConversation> | null>(
    null,
  );
  const end = useCallback(async () => {
    const closing = session.current?.stop();
    setVoiceActive(false);
    setConsented(false);
    await closing;
  }, [setVoiceActive]);

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
        (phase === "connecting" || phase === "connected")
        ? {
            phase:
              phase === "connecting"
                ? "connecting"
                : activity?.outputActive
                  ? "speaking"
                  : "listening",
            microphoneLevel: activity?.microphoneLevel ?? 0,
            microphoneMuted: false,
            errorMessage: null,
            notice: null,
          }
        : null,
    );
  }, [inputMode, isAiAssistantOpen, phase, activity, reportVoiceSessionState]);

  useEffect(() => {
    if (inputMode !== "voice" || !isAiAssistantOpen)
      void session.current?.stop();
  }, [inputMode, isAiAssistantOpen]);
  useEffect(() => {
    const leave = () => {
      void session.current?.stop();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      const current = session.current;
      session.current = null;
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
      microphoneCheck={
        phase === "error"
          ? "Connection error. Check microphone and server configuration."
          : phase === "stopping"
            ? "Disconnecting…"
            : ""
      }
      onStart={() => {
        if (!consented || phase === "stopping") return;
        setConsented(false);
        setState({ phase: "connecting", message: null });
        const next = createLiveConversation((nextState) => {
          if (session.current !== next) return;
          setState(nextState);
          setVoiceActive(
            nextState.phase === "connecting" || nextState.phase === "connected",
          );
        }, connectionTimeoutMs);
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
