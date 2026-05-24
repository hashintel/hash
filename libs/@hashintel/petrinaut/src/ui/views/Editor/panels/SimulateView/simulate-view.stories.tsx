import { useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { PortalContainerContext } from "../../../../../react/state/portal-container-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
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

const SimulateViewStory = ({
  experiments,
}: {
  experiments: Parameters<typeof FakeExperimentsProvider>[0]["initialExperiments"];
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
                  <div ref={portalContainerRef} className={portalContainerStyle} />
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
      experiments={[makeExperiment(1, { status: "initializing", progress: null })]}
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
  render: () => <SimulateViewStory experiments={[makeExperiment(1, { status: "complete" })]} />,
};
