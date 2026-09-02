import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionActions,
  useVoiceSessionCanReadFullResponse,
  useVoiceSessionCanRepeatQuestion,
  useVoiceSessionCanTakeTurn,
  useVoiceSessionMicrophoneMuted,
  useVoiceSessionPhase,
} from "../../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../../../components/voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
} from "../../../components/voice-session-labels";
import { aiFooterMinHeight } from "./footer-height";
import { MicrophoneIcon } from "./voice-dock/microphone-icon";
import { VoicePlaybackMenu } from "./voice-dock/playback-menu";
import { TranscriptionIcon } from "./voice-dock/transcription-icon";

import type { VoiceSessionActions } from "../../../../../../react/voice-session/store";
import type { PetrinautAiVoiceSessionPhase } from "../../../../../types/ai-assistant-composer-control";
import type { ReactNode } from "react";

const dockStyle = css({
  display: "flex",
  flexShrink: 0,
  boxSizing: "border-box",
  minHeight: `[${aiFooterMinHeight}px]`,
  alignItems: "center",
  gap: "2",
  padding: "[10px 12px]",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.s00",
  animationName: "[petrinautVoiceSwap]",
  animationDuration: "[200ms]",
  animationTimingFunction: "[ease-out]",
  "@media (prefers-reduced-motion: reduce)": {
    animationName: "[none]",
  },
});

// Equal flexible sides keep the ribbon on the panel's centre line however wide
// the phase label or the action cluster turn out to be.
const sideStyle = css({
  display: "flex",
  flex: "1",
  minWidth: "[0]",
  alignItems: "center",
});

const centerStyle = css({
  display: "flex",
  minWidth: "[0]",
  alignItems: "center",
  gap: "2",
});

const statusStyle = cva({
  base: {
    fontSize: "xs",
    fontWeight: "medium",
    overflow: "hidden",
    letterSpacing: "[0.04em]",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    transition: "[color 260ms ease]",
  },
  variants: {
    phase: {
      connecting: { color: "neutral.s90" },
      error: { color: "neutral.s100" },
      listening: { color: "blue.s90" },
      muted: { color: "neutral.s100" },
      paused: { color: "neutral.s90" },
      speaking: { color: "neutral.s115" },
      thinking: { color: "neutral.s90" },
    },
  },
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1",
});

const visuallyHiddenStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "[0]",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0, 0, 0, 0)]",
  whiteSpace: "nowrap",
  borderWidth: "[0]",
});

export type VoiceDockProps = {
  actions: VoiceSessionActions | null;
  canReadFullResponse: boolean;
  canRepeatQuestion: boolean;
  canTakeTurn: boolean;
  /** Rendered instead of the live indicator when the caller supplies one. */
  indicator?: ReactNode;
  microphoneMuted: boolean;
  onTranscriptionToggle: () => void;
  phase: PetrinautAiVoiceSessionPhase;
  /** Whether spoken turns are currently written into the conversation live. */
  transcriptionShown: boolean;
};

/**
 * The live Voice surface inside the assistant panel: one ribbon and the
 * session's controls, standing in for the composer while a session runs. Words
 * belong to the conversation above, which the transcription action shows or
 * holds back until the session ends.
 */
export const VoiceDock = ({
  actions,
  canReadFullResponse,
  canRepeatQuestion,
  canTakeTurn,
  indicator,
  microphoneMuted,
  onTranscriptionToggle,
  phase,
  transcriptionShown,
}: VoiceDockProps) => {
  const transcriptionLabel = transcriptionShown
    ? "Hide transcription in chat"
    : "Show transcription in chat";
  const microphoneLabel = microphoneMuted
    ? voiceSessionActionLabels.unmute
    : voiceSessionActionLabels.mute;

  return (
    <section
      aria-label="Voice session"
      className={dockStyle}
      data-phase={phase}
      data-testid="ai-voice-dock"
    >
      <span className={sideStyle}>
        {actions !== null && (
          <>
            <Button
              aria-label={transcriptionLabel}
              onClick={onTranscriptionToggle}
              prefix={<TranscriptionIcon />}
              pressed={transcriptionShown}
              size="sm"
              tooltip={transcriptionLabel}
              type="button"
              variant="ghost"
            />
            <VoicePlaybackMenu
              actions={actions}
              canReadFullResponse={canReadFullResponse}
              canRepeatQuestion={canRepeatQuestion}
            />
          </>
        )}
      </span>

      <div className={centerStyle}>
        {indicator ?? <LiveVoiceSessionIndicator />}
        <span className={statusStyle({ phase })}>
          {voiceSessionStatusLabel(phase)}
        </span>
      </div>

      <span className={`${sideStyle} ${actionsStyle}`}>
        {actions !== null && (
          <>
            {canTakeTurn && actions.takeTurn && (
              <Button
                onClick={() => void actions.takeTurn?.()}
                size="sm"
                type="button"
                variant="subtle"
              >
                {voiceSessionActionLabels.takeTurn}
              </Button>
            )}
            {phase === "error" ? (
              <Button
                aria-label={voiceSessionActionLabels.reconnect}
                iconName="rotate"
                onClick={actions.reconnect}
                size="sm"
                tooltip="Reconnect"
                type="button"
                variant="ghost"
              />
            ) : phase === "paused" ? (
              <Button
                aria-label={voiceSessionActionLabels.resume}
                iconName="play"
                onClick={actions.resume}
                size="sm"
                tooltip="Resume"
                type="button"
                variant="ghost"
              />
            ) : (
              <Button
                aria-label={microphoneLabel}
                disabled={phase === "connecting"}
                onClick={() => actions.setMicrophoneMuted(!microphoneMuted)}
                prefix={<MicrophoneIcon muted={microphoneMuted} />}
                pressed={microphoneMuted}
                size="sm"
                tooltip={microphoneLabel}
                type="button"
                variant="ghost"
              />
            )}
            <Button
              aria-label={voiceSessionActionLabels.end}
              iconName="close"
              onClick={actions.end}
              size="sm"
              tone="error"
              tooltip="End voice mode"
              type="button"
              variant="ghost"
            />
          </>
        )}
      </span>

      <span
        aria-atomic="true"
        aria-label="Voice status"
        aria-live="polite"
        className={visuallyHiddenStyle}
        role="status"
      >
        {`Voice status: ${voiceSessionStatusLabel(phase)}`}
      </span>
    </section>
  );
};

/** Reads the session straight from the store so the panel re-renders less. */
export const LiveVoiceDock = ({
  onTranscriptionToggle,
  transcriptionShown,
}: {
  onTranscriptionToggle: () => void;
  transcriptionShown: boolean;
}) => {
  const actions = useVoiceSessionActions();
  const canReadFullResponse = useVoiceSessionCanReadFullResponse();
  const canRepeatQuestion = useVoiceSessionCanRepeatQuestion();
  const canTakeTurn = useVoiceSessionCanTakeTurn();
  const microphoneMuted = useVoiceSessionMicrophoneMuted();
  const phase = useVoiceSessionPhase();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceDock
      actions={actions}
      canReadFullResponse={canReadFullResponse}
      canRepeatQuestion={canRepeatQuestion}
      canTakeTurn={canTakeTurn}
      microphoneMuted={microphoneMuted}
      onTranscriptionToggle={onTranscriptionToggle}
      phase={phase}
      transcriptionShown={transcriptionShown}
    />
  );
};
