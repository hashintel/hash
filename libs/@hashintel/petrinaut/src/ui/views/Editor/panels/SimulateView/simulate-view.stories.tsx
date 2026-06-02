import { useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  probabilisticSatellitesSDCPN,
  sirModel,
} from "@hashintel/petrinaut-core/examples";

import { ExperimentsProvider } from "../../../../../react/experiments/provider";
import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { UserSettingsProvider } from "../../../../../react/state/user-settings-provider";
import { MonacoProvider } from "../../../../monaco/provider";
import {
  FakeEditorProvider,
  FakeExperimentsProvider,
  makeExperiment,
  makeProgress,
  multipleExperiments,
  oneExperiment,
  sirSdcpnContextValue,
} from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";

import type { SDCPNContextValue } from "../../../../../react/state/sdcpn-context";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Experiments / SimulateView",
  component: SimulateView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SimulateView>;

export default meta;

type Story = StoryObj<typeof meta>;

const rootStyle = css({
  position: "relative",
  width: "full",
  height: "[100vh]",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
});

const portalContainerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "99999",
  pointerEvents: "none",
});

type StoryExample = {
  title: string;
  petriNetDefinition: SDCPN;
};

const createSdcpnContextValue = ({
  petriNetDefinition,
  title,
}: StoryExample): SDCPNContextValue => ({
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-story-net`,
  petriNetDefinition,
  readonly: false,
  setTitle: () => {},
  title,
  getItemType: (id) => {
    if (petriNetDefinition.places.some((place) => place.id === id)) {
      return "place";
    }
    if (
      petriNetDefinition.transitions.some((transition) => transition.id === id)
    ) {
      return "transition";
    }
    if (petriNetDefinition.types.some((type) => type.id === id)) {
      return "type";
    }
    if (
      petriNetDefinition.differentialEquations.some(
        (differentialEquation) => differentialEquation.id === id,
      )
    ) {
      return "differentialEquation";
    }
    if (
      petriNetDefinition.parameters.some((parameter) => parameter.id === id)
    ) {
      return "parameter";
    }
    return null;
  },
});

const SimulateViewStory = ({
  experiments,
}: {
  experiments: Parameters<
    typeof FakeExperimentsProvider
  >[0]["initialExperiments"];
}) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <SDCPNContext value={sirSdcpnContextValue}>
        <LanguageClientProvider>
          <MonacoProvider>
            <FakeEditorProvider>
              <FakeExperimentsProvider initialExperiments={experiments}>
                <div className={`${rootStyle} petrinaut-root`}>
                  <div
                    ref={portalContainerRef}
                    className={portalContainerStyle}
                  />
                  <SimulateView />
                </div>
              </FakeExperimentsProvider>
            </FakeEditorProvider>
          </MonacoProvider>
        </LanguageClientProvider>
      </SDCPNContext>
    </PortalContainerContext>
  );
};

const RunnableSimulateViewStory = ({ example }: { example: StoryExample }) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const sdcpnContextValue = createSdcpnContextValue(example);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <SDCPNContext value={sdcpnContextValue}>
        <LanguageClientProvider>
          <MonacoProvider>
            <NotificationsProvider>
              <UserSettingsProvider>
                <FakeEditorProvider>
                  <ExperimentsProvider>
                    <div className={`${rootStyle} petrinaut-root`}>
                      <div
                        ref={portalContainerRef}
                        className={portalContainerStyle}
                      />
                      <SimulateView />
                    </div>
                  </ExperimentsProvider>
                </FakeEditorProvider>
              </UserSettingsProvider>
            </NotificationsProvider>
          </MonacoProvider>
        </LanguageClientProvider>
      </SDCPNContext>
    </PortalContainerContext>
  );
};

export const None: Story = {
  render: () => <SimulateViewStory experiments={[]} />,
};

export const One: Story = {
  render: () => <SimulateViewStory experiments={[oneExperiment]} />,
};

export const Multiple: Story = {
  render: () => <SimulateViewStory experiments={multipleExperiments} />,
};

export const Initializing: Story = {
  render: () => (
    <SimulateViewStory
      experiments={[
        makeExperiment(1, { status: "initializing", progress: null }),
      ]}
    />
  ),
};

export const InProgress: Story = {
  name: "In progress",
  render: () => (
    <SimulateViewStory
      experiments={[
        makeExperiment(1, {
          status: "running",
          progress: makeProgress({
            activeRuns: 420,
            completedRuns: 580,
            frameNumber: 96,
            time: 96,
          }),
        }),
      ]}
    />
  ),
};

export const Complete: Story = {
  render: () => (
    <SimulateViewStory
      experiments={[makeExperiment(1, { status: "complete" })]}
    />
  ),
};

export const RunSIRExperiment: Story = {
  name: "Run SIR experiment",
  render: () => <RunnableSimulateViewStory example={sirModel} />,
};

export const RunSatellitesLauncherExperiment: Story = {
  name: "Run Satellites Launcher experiment",
  render: () => (
    <RunnableSimulateViewStory example={probabilisticSatellitesSDCPN} />
  ),
};
