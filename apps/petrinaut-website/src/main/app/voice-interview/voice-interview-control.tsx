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
import { selectInterviewSpeech } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import {
  acknowledgeVoiceInterviewDisclosure,
  isVoiceInterviewDisclosureAcknowledged,
} from "./voice-interview-disclosure";
import { toVoiceSessionState } from "./voice-session-state";
import {
  VoiceTurnController,
  type VoiceLatencyEvent,
  type VoiceTurnSnapshot,
} from "./voice-turn-controller";

import type { OpenAIVoiceConfig } from "./load-openai-voice-config";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

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
  context: PetrinautAiVoiceModeContext;
}) => {
  "use no memo";

  const [store] = useState(() => {
    // Realtime submits an answer long after the render that created the
    // bridge, so these callbacks read what the layout effect below installs
    // rather than what was captured here.
    let latestSubmitVoiceInput = context.submitVoiceInput;
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
      submitInterviewAnswer: (input) => latestSubmitVoiceInput(input),
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
      ) => {
        latestSubmitVoiceInput = nextSubmitVoiceInput;
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
    store.updateSubmissionContext(context.submitVoiceInput);
    const speechSelection = selectInterviewSpeech(context.messages);
    store.controller.updateChat({
      automaticSource: speechSelection.automaticSource,
      canAcceptInterviewAnswer: context.canAcceptVoiceInput,
      canonicalSegments: [...speechSelection.canonicalSegments],
      status: context.status,
    });
  }, [
    context.canAcceptVoiceInput,
    context.messages,
    context.status,
    context.submitVoiceInput,
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
  ...context
}: PetrinautAiVoiceModeContext & {
  readonly config: OpenAIVoiceConfig;
}) => (
  <AvailableVoiceInterviewControl
    key={context.conversationId}
    config={config}
    context={context}
  />
);
