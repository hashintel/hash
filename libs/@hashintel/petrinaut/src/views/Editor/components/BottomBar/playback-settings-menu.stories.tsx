import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  PlaybackContext,
  type PlaybackSpeed,
  type PlayMode,
} from "../../../../playback/context";
import { SimulationContext } from "../../../../simulation/context";
import { PlaybackSettingsMenu } from "./playback-settings-menu";

const meta = {
  title: "BottomBar / PlaybackSettingsMenu",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Interactive wrapper that provides mock context values
 * so the PlaybackSettingsMenu is fully functional in stories.
 */
const PlaybackSettingsMenuStory = ({
  simulationState = "NotRun",
  initialMaxTime = null,
  initialSpeed = 1 as PlaybackSpeed,
  initialPlayMode = "computeMax" as PlayMode,
  isViewOnlyAvailable = false,
  isComputeAvailable = true,
}: {
  simulationState?: "NotRun" | "Running" | "Complete" | "Error" | "Paused";
  initialMaxTime?: number | null;
  initialSpeed?: PlaybackSpeed;
  initialPlayMode?: PlayMode;
  isViewOnlyAvailable?: boolean;
  isComputeAvailable?: boolean;
}) => {
  const [maxTime, setMaxTime] = useState(initialMaxTime);
  const [speed, setSpeed] = useState<PlaybackSpeed>(initialSpeed);
  const [playMode, setPlayMode] = useState<PlayMode>(initialPlayMode);

  return (
    <SimulationContext
      value={{
        state: simulationState,
        error: null,
        errorItemId: null,
        parameterValues: {},
        initialMarking: new Map(),
        selectedScenarioId: null,
        scenarioParameterValues: {},
        compiledScenarioResult: null,
        dt: 0.01,
        maxTime,
        totalFrames: simulationState === "NotRun" ? 0 : 100,
        getFrame: () => Promise.resolve(null),
        getAllFrames: () => Promise.resolve([]),
        getFramesInRange: () => Promise.resolve([]),
        setSelectedScenarioId: () => {},
        setScenarioParameterValue: () => {},
        setInitialMarking: () => {},
        setParameterValue: () => {},
        setDt: () => {},
        setMaxTime,
        initialize: () => Promise.resolve(),
        run: () => {},
        pause: () => {},
        reset: () => {},
        setBackpressure: () => {},
        ack: () => {},
      }}
    >
      <PlaybackContext
        value={{
          currentFrame: null,
          currentViewedFrame: null,
          playbackState: "Stopped",
          currentFrameIndex: 0,
          totalFrames: 0,
          playbackSpeed: speed,
          playMode,
          isViewOnlyAvailable,
          isComputeAvailable,
          setCurrentViewedFrame: () => {},
          play: () => Promise.resolve(),
          pause: () => {},
          stop: () => {},
          setPlaybackSpeed: setSpeed,
          setPlayMode,
        }}
      >
        <PlaybackSettingsMenu />
      </PlaybackContext>
    </SimulationContext>
  );
};

export const Default: Story = {
  name: "Default (not run)",
  render: () => <PlaybackSettingsMenuStory />,
};

export const WithFixedTime: Story = {
  name: "Fixed stopping time",
  render: () => <PlaybackSettingsMenuStory initialMaxTime={10} />,
};

export const FastSpeed: Story = {
  name: "Fast playback speed",
  render: () => <PlaybackSettingsMenuStory initialSpeed={30} />,
};

export const SimulationRunning: Story = {
  name: "Simulation running",
  render: () => (
    <PlaybackSettingsMenuStory
      simulationState="Running"
      isViewOnlyAvailable
      isComputeAvailable
      initialPlayMode="computeBuffer"
    />
  ),
};

export const SimulationComplete: Story = {
  name: "Simulation complete",
  render: () => (
    <PlaybackSettingsMenuStory
      simulationState="Complete"
      isViewOnlyAvailable
      isComputeAvailable={false}
      initialPlayMode="viewOnly"
    />
  ),
};
