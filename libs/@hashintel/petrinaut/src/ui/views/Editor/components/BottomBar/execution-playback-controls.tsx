import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { PlaybackIcon } from "@hashintel/ds-icons";
import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
} from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { useStoreSelector } from "../../../../../react/shared/use-store";
import { CollapsibleGroup } from "./collapsible-group";
import { EventTimeControls } from "./event-time-controls";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

const speedLabelStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
});

/**
 * The bottom bar's playback controls over an execution the host reports:
 * the same player and the same position controls as a simulated run, with
 * nothing to start, reset or compute. Playing at the end of an execution
 * that is still going follows it; anywhere else it plays it back.
 */
export const ExecutionPlaybackControls: React.FC = () => {
  const {
    eventCount,
    playbackState,
    playbackSpeed,
    playbackStore,
    play,
    pause,
    setPlaybackSpeed,
  } = use(EventPlaybackContext);
  const isFollowing = useStoreSelector(
    playbackStore,
    (snapshot) => snapshot.following,
  );
  const isPlaying = playbackState === "Playing";
  const playTooltip = isFollowing
    ? "Following the execution - Pause"
    : isPlaying
      ? "Pause Playback"
      : "Play";
  const nextSpeed =
    PLAYBACK_SPEEDS[
      (PLAYBACK_SPEEDS.indexOf(playbackSpeed) + 1) % PLAYBACK_SPEEDS.length
    ] ?? 1;

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  };

  if (eventCount === 0) {
    return null;
  }

  return (
    <>
      <ToolbarDivider />
      <ToolbarButton
        tooltip={playTooltip}
        onClick={handlePlayPause}
        ariaLabel={playTooltip}
      >
        <PlaybackIcon playing={isPlaying} duration={200} />
      </ToolbarButton>
      <CollapsibleGroup>
        <EventTimeControls disabled={false} />
        <ToolbarButton
          tooltip={`Playback speed - switch to ${formatPlaybackSpeed(nextSpeed)}`}
          onClick={() => setPlaybackSpeed(nextSpeed)}
          ariaLabel={`Playback speed ${formatPlaybackSpeed(playbackSpeed)}`}
        >
          <span className={speedLabelStyle}>
            {formatPlaybackSpeed(playbackSpeed)}
          </span>
        </ToolbarButton>
      </CollapsibleGroup>
    </>
  );
};
