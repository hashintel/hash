/**
 * The full sweep drawer — Parameters, Surface, Metrics — against the real
 * experiments provider, so real workers stream while the surface samples.
 * This is the view the app shows for an experiment with parameter sweeps,
 * and the fixture the sweep-view performance numbers are measured on: the
 * split fixtures (navigator-only real compute, drawer-only fake compute)
 * each exercise half of what the user actually sees.
 */
import { use, useEffect, useRef, useState } from "react";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { ExperimentsProvider } from "../../../../../../react/experiments/provider";
import { LanguageClientProvider } from "../../../../../../react/lsp/provider";
import { NotificationsProvider } from "../../../../../../react/notifications/provider";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { MonacoProvider } from "../../../../../monaco/provider";
import { sirSdcpnContextValue } from "./experiments-story-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { ExperimentComputeBackend } from "../../../../../../react/experiments/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Bench / SweepDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const SCENARIO_ID = "scenario__bench_rate_sweep";

/** SIR with both transition rates driven by swept scenario parameters. */
const benchDefinition: SDCPN = {
  ...sirModel.petriNetDefinition,
  scenarios: [
    ...(sirModel.petriNetDefinition.scenarios ?? []),
    {
      id: SCENARIO_ID,
      name: "Rate sweep",
      description: "Bench scenario: swept rates drive the transitions.",
      scenarioParameters: [
        { type: "real", identifier: "transmission_rate", default: 1.5 },
        { type: "real", identifier: "recovery_rate", default: 0.8 },
      ],
      parameterOverrides: {
        param__infection_rate: "scenario.transmission_rate",
        param__recovery_rate: "scenario.recovery_rate",
      },
      initialState: {
        type: "per_place",
        content: {
          place__susceptible: "190",
          place__infected: "10",
          place__recovered: "0",
        },
      },
    },
  ],
};

const contextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: benchDefinition,
};

const Session = ({
  computeBackend,
  runCount,
}: {
  computeBackend: ExperimentComputeBackend;
  runCount: number;
}) => {
  const { experiments, createExperiment } = use(ExperimentsContext);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Once per story lifetime, surviving StrictMode's double-invoked mount.
    if (started.current) {
      return;
    }
    started.current = true;
    createExperiment({
      name: "Bench rate sweep",
      scenarioId: SCENARIO_ID,
      scenarioParameterValues: {
        transmission_rate: { mode: "range", min: 0.5, max: 4 },
        recovery_rate: { mode: "range", min: 0.2, max: 1.5 },
      },
      runCount,
      seed: 42,
      dt: 0.5,
      maxTime: 60,
      metricSpecs: [
        {
          kind: "placeTokenCountMean",
          id: "infected",
          label: "Infected",
          placeId: "place__infected",
          runOutput: { type: "distribution", binning: "exact" },
        },
        {
          kind: "placeTokenCountMean",
          id: "susceptible",
          label: "Susceptible",
          placeId: "place__susceptible",
          runOutput: { type: "distribution", binning: "exact" },
        },
      ],
      computeBackend,
    }).catch((cause: unknown) => setError(String(cause)));
  }, [computeBackend, createExperiment, runCount]);

  const experiment = experiments.find((candidate) => candidate.sweep !== null);
  if (error) {
    return <p style={{ color: "#b91c1c" }}>{error}</p>;
  }
  if (!experiment) {
    return <p>Compiling…</p>;
  }
  return (
    <ViewExperimentDrawer open onClose={() => {}} experiment={experiment} />
  );
};

const Wrapper = (props: {
  computeBackend: ExperimentComputeBackend;
  runCount: number;
}) => (
  <SDCPNContext value={contextValue}>
    <LanguageClientProvider>
      <MonacoProvider>
        <NotificationsProvider>
          <UserSettingsProvider>
            <ExperimentsProvider>
              <Session {...props} />
            </ExperimentsProvider>
          </UserSettingsProvider>
        </NotificationsProvider>
      </MonacoProvider>
    </LanguageClientProvider>
  </SDCPNContext>
);

export const Cpu: Story = {
  render: () => <Wrapper computeBackend="cpu" runCount={1000} />,
};

export const Gpu: Story = {
  render: () => <Wrapper computeBackend="webgpu" runCount={1000} />,
};
