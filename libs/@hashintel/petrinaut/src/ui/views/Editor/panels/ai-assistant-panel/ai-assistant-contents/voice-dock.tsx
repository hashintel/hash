import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionActions,
  useVoiceSessionCaption,
  useVoiceSessionHasCanvasControls,
  useVoiceSessionPhase,
} from "../../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../../../components/voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
} from "../../../components/voice-session-labels";
import { useThrottledAnnouncement } from "./voice-dock/use-throttled-announcement";

import type { VoiceSessionActions } from "../../../../../../react/voice-session/store";
import type { PetrinautAiVoiceSessionPhase } from "../../../../../types/ai-assistant-composer-control";
import type { ReactNode } from "react";

const dockStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  padding: "[10px 12px 12px]",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.s00",
});

// Held at a constant height so the panel doesn't jump between a silent turn
// and a spoken one.
const captionStyle = css({
  display: "flex",
  minHeight: "[40px]",
  alignItems: "flex-end",
  justifyContent: "center",
  paddingX: "2",
  paddingBottom: "2",
  textAlign: "center",
});

const captionTextStyle = css({
  // Two lines is enough to read a sentence in flight; the rest scrolls past.
  lineClamp: "2",
  overflow: "hidden",
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "snug",
  opacity: "[0]",
  transform: "[translateY(4px)]",
  transition: "[opacity 200ms ease, transform 200ms ease, color 200ms ease]",
  "&[data-visible='true']": {
    opacity: "[1]",
    transform: "[none]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
});

const rowStyle = css({
  display: "flex",
  minHeight: "[32px]",
  alignItems: "center",
  justifyContent: "center",
  gap: "[10px]",
});

const statusStyle = css({
  color: "neutral.s100",
  fontSize: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const actionsStyle = css({
  position: "absolute",
  right: "3",
  display: "flex",
  alignItems: "center",
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
  caption: string;
  /** Rendered instead of the live indicator when the caller supplies one. */
  indicator?: ReactNode;
  phase: PetrinautAiVoiceSessionPhase;
  /**
   * The canvas toolbar owns these buttons whenever it is on screen; the dock
   * only carries them for surfaces rendered without it.
   */
  showActions: boolean;
};

/**
 * The live Voice surface inside the assistant panel: an ephemeral caption over
 * one indicator, standing in for the composer while a session runs. Finalized
 * turns reach the transcript through the conversation, never from here.
 */
export const VoiceDock = ({
  actions,
  caption,
  indicator,
  phase,
  showActions,
}: VoiceDockProps) => {
  const announcement = useThrottledAnnouncement(caption);

  return (
    <section
      aria-label="Voice session"
      className={dockStyle}
      data-phase={phase}
      data-testid="ai-voice-dock"
    >
      <div className={captionStyle}>
        <span
          className={captionTextStyle}
          data-testid="ai-voice-caption"
          data-visible={caption === "" ? undefined : "true"}
        >
          {caption}
        </span>
      </div>

      <div className={rowStyle}>
        {indicator ?? <LiveVoiceSessionIndicator />}
        <span className={statusStyle}>{voiceSessionStatusLabel(phase)}</span>

        {showActions && actions !== null && (
          <span className={actionsStyle}>
            {phase === "error" ? (
              <Button
                aria-label={voiceSessionActionLabels.reconnect}
                iconName="rotate"
                onClick={actions.reconnect}
                size="xs"
                tooltip="Reconnect"
                type="button"
                variant="ghost"
              />
            ) : phase === "paused" ? (
              <Button
                aria-label={voiceSessionActionLabels.resume}
                iconName="play"
                onClick={actions.resume}
                size="xs"
                tooltip="Resume"
                type="button"
                variant="ghost"
              />
            ) : (
              <Button
                aria-label={voiceSessionActionLabels.pause}
                iconName="pause"
                onClick={actions.pause}
                size="xs"
                tooltip="Pause"
                type="button"
                variant="ghost"
              />
            )}
            <Button
              aria-label={voiceSessionActionLabels.end}
              iconName="close"
              onClick={actions.end}
              size="xs"
              tone="error"
              tooltip="End voice mode"
              type="button"
              variant="ghost"
            />
          </span>
        )}
      </div>

      <span
        aria-atomic="true"
        aria-label="Voice status"
        aria-live="polite"
        className={visuallyHiddenStyle}
        role="status"
      >
        {`Voice status: ${voiceSessionStatusLabel(phase)}`}
      </span>
      <span
        aria-atomic="true"
        aria-label="Voice transcript"
        aria-live="polite"
        className={visuallyHiddenStyle}
        role="status"
      >
        {announcement}
      </span>
    </section>
  );
};

/** Reads the session straight from the store so the panel re-renders less. */
export const LiveVoiceDock = () => {
  const actions = useVoiceSessionActions();
  const caption = useVoiceSessionCaption();
  const hasCanvasControls = useVoiceSessionHasCanvasControls();
  const phase = useVoiceSessionPhase();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceDock
      actions={actions}
      caption={caption}
      phase={phase}
      showActions={!hasCanvasControls}
    />
  );
};
