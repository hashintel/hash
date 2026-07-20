import { useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  type AbortSignalLike,
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationParameterBinding,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  probabilisticSatellitesSDCPN,
  sirModel,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";

import { ExperimentsProvider } from "../../../../../react/experiments/provider";
import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { OptimizationsProvider } from "../../../../../react/optimizations/provider";
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
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PropsWithChildren } from "react";

const meta = {
  title: "Simulate / SimulateView",
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
  zIndex: "modal",
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
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
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

const wait = (durationMs: number, signal?: AbortSignalLike) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let timeout: number | undefined;
    const handleAbort = () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      resolve();
    };
    timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

const sampleBinding = (
  binding: Extract<PetrinautOptimizationParameterBinding, { kind: "optimize" }>,
  trial: number,
  requestedTrials: number,
): number | boolean => {
  const fraction = requestedTrials <= 1 ? 0.5 : trial / (requestedTrials - 1);

  switch (binding.domain.kind) {
    case "continuous":
      if (binding.domain.scale === "log") {
        const lower = Math.log(binding.domain.minimum);
        const upper = Math.log(binding.domain.maximum);
        return Math.exp(lower + (upper - lower) * fraction);
      }
      return (
        binding.domain.minimum +
        (binding.domain.maximum - binding.domain.minimum) * fraction
      );
    case "integer": {
      const slots =
        Math.floor(
          (binding.domain.maximum - binding.domain.minimum) /
            binding.domain.step,
        ) + 1;
      return (
        binding.domain.minimum +
        (trial % Math.max(1, slots)) * binding.domain.step
      );
    }
    case "boolean":
      return trial % 2 === 0;
  }
};

type FakeTrialState = Extract<
  PetrinautOptimizationEvent,
  { type: "trial" }
>["state"];

const getFakeTrialState = (trial: number, seed: number): FakeTrialState => {
  // A deterministic weighted roll keeps stories reproducible while producing
  // approximately 82% complete, 12% pruned, and 6% failed steps.
  const roll = (((trial * 73 + seed) % 100) + 100) % 100;
  return roll < 82 ? "complete" : roll < 94 ? "pruned" : "failed";
};

const fakeOptimization: PetrinautOptimization = {
  async *optimize(input, options) {
    const requestedTrials = input.study.trials;
    let completedTrials = 0;
    let prunedTrials = 0;
    let failedTrials = 0;
    let best: NonNullable<
      Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
    > | null = null;

    yield { type: "started", requestedTrials };

    for (let trial = 0; trial < requestedTrials; trial += 1) {
      await wait(250, options?.signal);
      if (options?.signal?.aborted) {
        return;
      }

      const parameters = Object.fromEntries(
        Object.entries(input.scenario.parameterBindings).flatMap(
          ([identifier, binding]) =>
            binding.kind === "optimize"
              ? [
                  [
                    identifier,
                    sampleBinding(binding, trial, requestedTrials),
                  ] as const,
                ]
              : [],
        ),
      );
      const state = getFakeTrialState(trial, input.execution.seed);
      const candidateObjective =
        input.objective.direction === "maximize"
          ? trial + 1 / (trial + 1)
          : requestedTrials - trial + 1 / (trial + 1);
      const objective = state === "complete" ? candidateObjective : null;

      if (state === "complete") {
        completedTrials += 1;
        const isBetter =
          best === null ||
          (input.objective.direction === "maximize"
            ? candidateObjective > best.objective
            : candidateObjective < best.objective);
        if (isBetter) {
          best = { trial, parameters, objective: candidateObjective };
        }
      } else if (state === "pruned") {
        prunedTrials += 1;
      } else {
        failedTrials += 1;
      }

      yield {
        type: "trial",
        trial,
        parameters,
        objective,
        state,
        best,
      };
    }

    yield {
      type: "complete",
      requestedTrials,
      completedTrials,
      prunedTrials,
      failedTrials,
      best,
    };
  },
};

const FakeOptimizationProvider = ({ children }: PropsWithChildren) => (
  <PetrinautOptimizationContext value={fakeOptimization}>
    {children}
  </PetrinautOptimizationContext>
);

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

const RunnableSimulateViewStory = ({
  example,
  initialSimulateViewMode = "experiments",
  withOptimization = false,
}: {
  example: StoryExample;
  initialSimulateViewMode?: Parameters<
    typeof FakeEditorProvider
  >[0]["initialSimulateViewMode"];
  withOptimization?: boolean;
}) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const sdcpnContextValue = createSdcpnContextValue(example);

  const story = (
    <PortalContainerContext value={portalContainerRef}>
      <SDCPNContext value={sdcpnContextValue}>
        <LanguageClientProvider>
          <MonacoProvider>
            <NotificationsProvider>
              <UserSettingsProvider>
                <FakeEditorProvider
                  initialSimulateViewMode={initialSimulateViewMode}
                >
                  <ExperimentsProvider>
                    <OptimizationsProvider>
                      <div className={`${rootStyle} petrinaut-root`}>
                        <div
                          ref={portalContainerRef}
                          className={portalContainerStyle}
                        />
                        <SimulateView />
                      </div>
                    </OptimizationsProvider>
                  </ExperimentsProvider>
                </FakeEditorProvider>
              </UserSettingsProvider>
            </NotificationsProvider>
          </MonacoProvider>
        </LanguageClientProvider>
      </SDCPNContext>
    </PortalContainerContext>
  );

  return withOptimization ? (
    <FakeOptimizationProvider>{story}</FakeOptimizationProvider>
  ) : (
    story
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

export const RunSupplyChainOptimization: Story = {
  name: "Run Supply Chain optimization",
  render: () => (
    <RunnableSimulateViewStory
      example={supplyChainProfit}
      initialSimulateViewMode="optimizations"
      withOptimization
    />
  ),
};
