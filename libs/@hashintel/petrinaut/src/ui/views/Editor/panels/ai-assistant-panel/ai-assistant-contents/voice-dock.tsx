import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionActions,
  useVoiceSessionPhase,
} from "../../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../../../components/voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
} from "../../../components/voice-session-labels";
import { MicrophoneIcon } from "./voice-dock/microphone-icon";

import type { VoiceSessionActions } from "../../../../../../react/voice-session/store";
import type { PetrinautAiVoiceSessionPhase } from "../../../../../types/ai-assistant-composer-control";
import type { ReactNode } from "react";

const dockStyle = css({
  display: "flex",
  flexShrink: 0,
  minHeight: "[64px]",
  alignItems: "center",
  gap: "2",
  padding: "[10px 12px]",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.s00",
  animationName: "[petrinautVoiceReveal]",
  animationDuration: "[240ms]",
  animationTimingFunction: "[cubic-bezier(0.2, 0.9, 0.3, 1)]",
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
  /** Rendered instead of the live indicator when the caller supplies one. */
  indicator?: ReactNode;
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
  indicator,
  onTranscriptionToggle,
  phase,
  transcriptionShown,
}: VoiceDockProps) => {
  const transcriptionLabel = transcriptionShown
    ? "Hide transcription in chat"
    : "Show transcription in chat";
  const muted = phase === "muted";
  const microphoneLabel = muted
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
          <Button
            aria-label={transcriptionLabel}
            iconName="text"
            onClick={onTranscriptionToggle}
            pressed={transcriptionShown}
            size="xs"
            tooltip={transcriptionLabel}
            type="button"
            variant="ghost"
          />
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
            {phase === "error" ? (
              <Button
                aria-label={voiceSessionActionLabels.reconnect}
                iconName="rotate"
                onClick={actions.reconnect}
                shape="round"
                size="md"
                tooltip="Reconnect"
                type="button"
                variant="subtle"
              />
            ) : phase === "paused" ? (
              <Button
                aria-label={voiceSessionActionLabels.resume}
                iconName="play"
                onClick={actions.resume}
                shape="round"
                size="md"
                tooltip="Resume"
                type="button"
                variant="subtle"
              />
            ) : (
              <Button
                aria-label={microphoneLabel}
                disabled={phase === "connecting"}
                onClick={() => actions.setMicrophoneMuted(!muted)}
                prefix={<MicrophoneIcon muted={muted} />}
                pressed={muted}
                shape="round"
                size="md"
                tone={muted ? "error" : undefined}
                tooltip={microphoneLabel}
                type="button"
                variant="subtle"
              />
            )}
            <Button
              aria-label={voiceSessionActionLabels.end}
              iconName="stopFilled"
              onClick={actions.end}
              shape="round"
              size="md"
              tone="error"
              tooltip="End voice mode"
              type="button"
              variant="subtle"
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
  const phase = useVoiceSessionPhase();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceDock
      actions={actions}
      onTranscriptionToggle={onTranscriptionToggle}
      phase={phase}
      transcriptionShown={transcriptionShown}
    />
  );
};
