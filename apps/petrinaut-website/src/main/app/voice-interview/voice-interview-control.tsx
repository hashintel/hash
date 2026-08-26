import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa6";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { selectCanonicalSpeechSegments } from "./canonical-speech";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { SpeechPlaybackController } from "./speech-playback-controller";
import {
  VoiceTurnController,
  type VoiceTurnSnapshot,
} from "./voice-turn-controller";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

export interface OpenAIVoiceConfig {
  readonly available: true;
  readonly connectionTimeoutMs: number;
}

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

const controlStyle = css({
  position: "relative",
  flexShrink: "0",
});

const panelStyle = css({
  position: "absolute",
  right: "0",
  bottom: "[calc(100% + 8px)]",
  zIndex: "overlay",
  display: "flex",
  width: "[280px]",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
  boxShadow: "lg",
});

const statusStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "relaxed",
});

const disclosureStyle = css({
  color: "neutral.s70",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const liveRegionStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "0",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0, 0, 0, 0)]",
  whiteSpace: "nowrap",
  borderWidth: "0",
});

const partialStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  borderRadius: "md",
  backgroundColor: "neutral.s10",
  color: "neutral.s100",
  fontSize: "sm",
});

const partialLabelStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
});

const correctionFormStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const correctionInputStyle = css({
  width: "full",
  paddingX: "2",
  paddingY: "1.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s100",
  fontSize: "sm",
  _focusVisible: {
    borderColor: "blue.a70",
    outline: "2px solid",
    outlineColor: "blue.a30",
    outlineOffset: "[1px]",
  },
});

const panelActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  gap: "2",
});

const statusText = (snapshot: VoiceTurnSnapshot): string => {
  switch (snapshot.phase) {
    case "idle":
      return "Voice input is off.";
    case "connecting":
      return "Microphone off. Connecting voice input.";
    case "listening":
      return "Microphone on. Listening.";
    case "transcribing":
      return "Microphone off. Finalizing the transcript.";
    case "delivering":
      return "Microphone off. Sending the finalized transcript to Brunch.";
    case "waiting":
      return "Microphone off. Waiting for Brunch.";
    case "synthesizing":
      return "Microphone off. Creating AI-generated speech.";
    case "playing":
      return "Microphone off. Playing AI-generated speech.";
    case "recoverable-error":
      return `Microphone off. ${snapshot.errorMessage}`;
  }
};

interface VoiceInterviewControlViewProps {
  readonly correction: string;
  readonly onCorrectionChange: (value: string) => void;
  readonly onEnd: () => void;
  readonly onReconnect: () => void;
  readonly onStart: () => void;
  readonly onSubmitCorrection: () => void;
  readonly snapshot: VoiceTurnSnapshot;
}

export const VoiceInterviewControlView = ({
  correction,
  onCorrectionChange,
  onEnd,
  onReconnect,
  onStart,
  onSubmitCorrection,
  snapshot,
}: VoiceInterviewControlViewProps) => {
  const isIdle = snapshot.phase === "idle";
  const isConnecting = snapshot.phase === "connecting";
  const hasError = snapshot.phase === "recoverable-error";
  const canCorrect =
    snapshot.phase === "listening" && snapshot.lastCommittedText.length > 0;

  const submitCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitCorrection();
  };

  return (
    <div className={controlStyle}>
      {isIdle ? (
        <Button
          aria-label="Start voice input"
          prefix={<FaMicrophone aria-hidden="true" />}
          shape="round"
          size="sm"
          tooltip="Start voice input"
          type="button"
          variant="subtle"
          onClick={onStart}
        />
      ) : (
        <Button
          aria-label={hasError ? "Reconnect voice input" : "End voice input"}
          disabled={isConnecting}
          prefix={<FaMicrophoneSlash aria-hidden="true" />}
          shape="round"
          size="sm"
          tooltip={hasError ? "Reconnect voice input" : "End voice input"}
          type="button"
          variant="subtle"
          onClick={hasError ? onReconnect : onEnd}
        />
      )}

      <span
        className={liveRegionStyle}
        role="status"
        aria-atomic="true"
        aria-live="polite"
      >
        {statusText(snapshot)}
        {snapshot.partialText &&
          ` Live transcript (not sent): ${snapshot.partialText}`}
      </span>

      {!isIdle && (
        <section className={panelStyle} aria-label="Voice input status">
          <p className={statusStyle}>{statusText(snapshot)}</p>
          <p className={disclosureStyle}>
            Spoken responses use an AI-generated OpenAI voice.
          </p>
          {snapshot.partialText && (
            <p className={partialStyle}>
              <span className={partialLabelStyle}>
                Live transcript (not sent)
              </span>
              {snapshot.partialText}
            </p>
          )}
          {canCorrect && (
            <form className={correctionFormStyle} onSubmit={submitCorrection}>
              <label className={partialLabelStyle} htmlFor="voice-correction">
                Correct last voice answer
              </label>
              <input
                className={correctionInputStyle}
                id="voice-correction"
                onChange={(event) => onCorrectionChange(event.target.value)}
                placeholder="Enter the corrected answer"
                value={correction}
              />
              <Button
                disabled={!correction.trim()}
                size="xs"
                type="submit"
                variant="subtle"
              >
                Send correction
              </Button>
            </form>
          )}
          <div className={panelActionsStyle}>
            {hasError ? (
              <Button
                size="xs"
                type="button"
                variant="subtle"
                onClick={onReconnect}
              >
                Reconnect voice input
              </Button>
            ) : (
              <Button
                disabled={isConnecting}
                size="xs"
                type="button"
                variant="subtle"
                onClick={onEnd}
              >
                End voice input
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

const AvailableVoiceInterviewControl = ({
  config,
  context,
}: {
  config: OpenAIVoiceConfig;
  context: PetrinautAiComposerControlContext & { conversationId: string };
}) => {
  const [store] = useState(() => {
    const session = new OpenAIRealtimeSession({
      connectionTimeoutMs: config.connectionTimeoutMs,
      createPeerConnection: () => new RTCPeerConnection(),
      fetch: globalThis.fetch.bind(globalThis),
      getUserMedia: (constraints) =>
        navigator.mediaDevices.getUserMedia(constraints),
    });
    const playback = new SpeechPlaybackController({
      createAudio: (source) => new Audio(source),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      fetch: globalThis.fetch.bind(globalThis),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });
    const controller = new VoiceTurnController({
      conversationId: context.conversationId,
      playback,
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
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [correction, setCorrection] = useState("");

  useLayoutEffect(() => {
    store.controller.updateChat({
      canonicalSegments: selectCanonicalSpeechSegments(context.messages),
      status: context.status,
    });
  }, [context.messages, context.status, store]);

  useEffect(
    () => () => {
      void store.controller.end();
    },
    [store],
  );

  return (
    <VoiceInterviewControlView
      correction={correction}
      onCorrectionChange={setCorrection}
      onEnd={() => void store.controller.end()}
      onReconnect={() => void store.controller.reconnect()}
      onStart={() => void store.controller.start()}
      onSubmitCorrection={() => {
        const value = correction;
        setCorrection("");
        void store.controller.submitCorrection(value);
      }}
      snapshot={snapshot}
    />
  );
};

export const VoiceInterviewControl = (
  context: PetrinautAiComposerControlContext,
) => {
  const [config, setConfig] = useState<OpenAIVoiceConfig | null>();

  useEffect(() => {
    const abortController = new AbortController();
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((loadedConfig) => {
      if (!abortController.signal.aborted) {
        setConfig(loadedConfig);
      }
    });
    return () => abortController.abort();
  }, []);

  if (!config || !context.conversationId) {
    return null;
  }

  return (
    <AvailableVoiceInterviewControl
      key={context.conversationId}
      config={config}
      context={{ ...context, conversationId: context.conversationId }}
    />
  );
};
