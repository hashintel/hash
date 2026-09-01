import { use, useEffect } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import { useVoiceSessionActions } from "../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
} from "../voice-session-labels";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

import type { PetrinautAiVoiceSessionPhase } from "../../../../types/ai-assistant-composer-control";

const segmentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  paddingLeft: "2",
});

const statusStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s105",
  fontSize: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

/**
 * Session controls as a native toolbar segment, so ending or pausing a
 * conversation stays a canvas control rather than something buried in the
 * assistant panel. Mounted only while a session runs.
 */
export const VoiceSessionSegment = ({
  phase,
}: {
  phase: PetrinautAiVoiceSessionPhase;
}) => {
  const actions = useVoiceSessionActions();
  const store = use(VoiceSessionContext);

  // Tells the assistant dock to leave these buttons out while they are here.
  useEffect(() => {
    store.setCanvasControlsMounted(true);

    return () => store.setCanvasControlsMounted(false);
  }, [store]);

  if (actions === null) {
    return null;
  }

  return (
    <div className={segmentStyle} data-testid="voice-session-segment">
      <span className={statusStyle}>
        <LiveVoiceSessionIndicator size="compact" />
        {voiceSessionStatusLabel(phase)}
      </span>

      <ToolbarDivider />

      {phase === "error" ? (
        <ToolbarButton
          ariaLabel={voiceSessionActionLabels.reconnect}
          onClick={actions.reconnect}
          tooltip="Reconnect"
        >
          <Icon name="rotate" size="sm" />
        </ToolbarButton>
      ) : phase === "paused" ? (
        <ToolbarButton
          ariaLabel={voiceSessionActionLabels.resume}
          onClick={actions.resume}
          tooltip="Resume"
        >
          <Icon name="play" size="sm" />
        </ToolbarButton>
      ) : (
        <ToolbarButton
          ariaLabel={voiceSessionActionLabels.pause}
          onClick={actions.pause}
          tooltip="Pause"
        >
          <Icon name="pause" size="sm" />
        </ToolbarButton>
      )}

      <ToolbarButton
        ariaLabel={voiceSessionActionLabels.end}
        onClick={actions.end}
        tone="danger"
        tooltip="End voice mode"
      >
        <Icon name="close" size="sm" />
      </ToolbarButton>
    </div>
  );
};
