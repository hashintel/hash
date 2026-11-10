import { use } from "react";

import { Icon } from "@hashintel/ds-components";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { useStoreSelector } from "../../../../../react/use-store";
import {
  PlaybackIcon,
  useExperimentalIconPackEnabled,
} from "../../../../experimental-icons";
import { CollapsibleGroup } from "./collapsible-group";
import { EventTimeControls } from "./event-time-controls";
import { PlaybackSettingsMenu } from "./playback-settings-menu";
import { StochasticRunStatus } from "./stochastic-run-status";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

import type { PlaybackSpeed } from "../../../../../react/playback/context";

export interface EventSimulationControlsProps {
  disabled?: boolean;
  inSubnet?: boolean;
  allowedPlaybackSpeeds?: readonly PlaybackSpeed[];
}

/**
 * The bottom bar's playback controls over an event-driven run: the frame
 * controls' counterpart, scrubbing a continuous time and stepping between
 * events rather than frames. The viewed time itself is shown by
 * `EventTimeControls`; this shell renders once per change of play state.
 */
export const EventSimulationControls: React.FC<
  EventSimulationControlsProps
> = ({ disabled = false, inSubnet = false, allowedPlaybackSpeeds }) => {
  const experimentalIcons = useExperimentalIconPackEnabled();
  const {
    state: simulationState,
    reset,
    mode,
    stochasticRun,
  } = use(SimulationContext);
  const playback = use(EventPlaybackContext);
  const { coveredTime, playbackState, playbackStore, play, pause } = playback;
  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const hasSimulation = simulationState !== "NotRun";
  const isSimulationOver =
    simulationState === "Complete" || simulationState === "Error";
  const isPlaying = playbackState === "Playing";
  // Read at frame rate as a boolean, so the bar re-renders when the viewed
  // time reaches the end of a finished run, not on every frame.
  const isAtEnd = useStoreSelector(
    playbackStore,
    (snapshot) => isSimulationOver && snapshot.time >= coveredTime,
  );
  const isPlayDisabled = disabled || inSubnet || isAtEnd;

  const playTooltip = inSubnet
    ? "Return to the root net to run simulation"
    : disabled
      ? "Fix errors to run simulation"
      : isAtEnd
        ? "Playback finished - Reset to run again"
        : !hasSimulation
          ? "Start Simulation"
          : isPlaying
            ? "Pause Playback"
            : "Play";

  const handlePlayPause = () => {
    if (disabled && !inSubnet) {
      setActiveBottomPanelTab("diagnostics");
      setBottomPanelOpen(true);
      return;
    }
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  };

  return (
    <>
      {hasSimulation && (
        <CollapsibleGroup animateEntry>
          <ToolbarButton
            tooltip="Stop simulation"
            onClick={reset}
            disabled={disabled}
            ariaLabel="Reset simulation"
          >
            <Icon name="rotateLeft" />
          </ToolbarButton>
          <ToolbarDivider />
        </CollapsibleGroup>
      )}

      <ToolbarButton
        tooltip={playTooltip}
        onClick={handlePlayPause}
        disabled={isPlayDisabled}
        ariaLabel={playTooltip}
      >
        {experimentalIcons ? (
          <PlaybackIcon playing={isPlaying} duration={200} />
        ) : isPlaying ? (
          <Icon name="pauseFilled" />
        ) : (
          <Icon name="playFilled" />
        )}
      </ToolbarButton>

      <CollapsibleGroup>
        {hasSimulation && (
          <EventTimeControls
            disabled={disabled}
            showEventSteppers={mode !== "stochastic"}
          />
        )}
        {stochasticRun ? <StochasticRunStatus run={stochasticRun} /> : null}
        <PlaybackSettingsMenu
          allowedSpeeds={allowedPlaybackSpeeds}
          playback={playback}
        />
      </CollapsibleGroup>
    </>
  );
};
