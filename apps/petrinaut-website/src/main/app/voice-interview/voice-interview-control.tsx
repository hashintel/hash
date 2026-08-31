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
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import {
  VoiceInterviewControlView,
  type VoiceInterviewControlViewProps,
} from "./voice-interview-inline-view";
import {
  VoiceTurnController,
  type VoiceLatencyEvent,
  type VoiceTurnSnapshot,
} from "./voice-turn-controller";

import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

export {
  VoiceInterviewControlView,
  type VoiceInterviewControlViewProps,
} from "./voice-interview-inline-view";

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

type PendingVoiceInputRepresentation = {
  readonly baselineToolCallIds: ReadonlySet<string>;
  readonly messageId: string | undefined;
};

const representedVoiceToolCallIds = (
  messages: PetrinautAiVoiceModeContext["messages"],
): Set<string> => {
  const toolCallIds = new Set<string>();
  for (const message of messages) {
    const toolCallId = message.metadata?.toolCallId;
    if (
      message.metadata?.source === "voice" &&
      toolCallId !== undefined &&
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === toolCallId &&
          part.state === "output-available",
      )
    ) {
      toolCallIds.add(toolCallId);
    }
  }
  return toolCallIds;
};

export const isVoiceInputRepresented = (
  messages: PetrinautAiVoiceModeContext["messages"],
  pendingInput: PendingVoiceInputRepresentation,
): boolean => {
  if (
    pendingInput.messageId !== undefined &&
    messages.some(
      (message) =>
        message.id === pendingInput.messageId &&
        message.role === "user" &&
        message.metadata?.source === "voice",
    )
  ) {
    return true;
  }

  return [...representedVoiceToolCallIds(messages)].some(
    (toolCallId) => !pendingInput.baselineToolCallIds.has(toolCallId),
  );
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

  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  const [pendingVoiceInput, setPendingVoiceInput] =
    useState<PendingVoiceInputRepresentation | null>(null);
  /* eslint-disable react-hooks-js/refs -- The bridge callback reads the ref
     only when Realtime submits an answer, never during render. */
  const [store] = useState(() => {
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
      submitInterviewAnswer: (input) => {
        const currentContext = contextRef.current;
        setPendingVoiceInput({
          baselineToolCallIds: representedVoiceToolCallIds(
            currentContext.messages,
          ),
          messageId: input.id,
        });
        return currentContext.submitVoiceInput(input);
      },
    });
    const controller = new VoiceTurnController({
      bridge,
      onLatencyEvent: recordLatency,
      session,
      submitText: context.submitVoiceInput,
    });
    return {
      controller,
      getSnapshot: () => controller.getSnapshot(),
      subscribe: (listener: (snapshot: VoiceTurnSnapshot) => void) =>
        controller.subscribe(listener),
    };
  });
  /* eslint-enable react-hooks-js/refs */
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
    setVoiceActive,
  } = context;

  useLayoutEffect(() => {
    store.controller.updateChat({
      canAcceptInterviewAnswer: context.canAcceptVoiceInput,
      canonicalSegments: selectCanonicalSpeechSegments(context.messages),
      status: context.status,
    });
  }, [context.canAcceptVoiceInput, context.messages, context.status, store]);

  const active = snapshot.connection !== "idle";

  useEffect(
    () =>
      registerVoiceModeControls({
        end: () => store.controller.end(),
        pause: () => store.controller.pause(),
      }),
    [registerVoiceModeControls, store],
  );

  useEffect(() => {
    setVoiceActive(active);
  }, [active, setVoiceActive]);

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

  const end = () => {
    context.setVoiceActive(false);
    context.setInputMode("text");
    void store.controller.end();
  };

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

  const viewProps: VoiceInterviewControlViewProps = {
    committedTextRepresented:
      pendingVoiceInput !== null &&
      isVoiceInputRepresented(context.messages, pendingVoiceInput),
    onEnd: end,
    onPause: () => store.controller.pause(),
    onReconnect: () => {
      void store.controller.reconnect();
    },
    onResume: () => store.controller.resume(),
    snapshot,
  };

  return <VoiceInterviewControlView {...viewProps} />;
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
