/**
 * The harness behind the SimulateView stories that run real simulations: the
 * provider stack around a real example model, the settings a story pins, and
 * a sweep created with its study once the stack is mounted, as the Create
 * Experiment drawer's Optimize does.
 */
import { use, useEffect, useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautOptimizationDirection,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { ExperimentsProvider } from "../../../../../react/experiments/provider";
import { useLatest } from "../../../../../react/hooks/use-latest";
import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { PetrinautNavigationProvider } from "../../../../../react/navigation";
import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { OptimizationsProvider } from "../../../../../react/optimizations/provider";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../../../../react/state/sdcpn-context";
import {
  type UserSettings,
  UserSettingsContext,
} from "../../../../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../../../../react/state/user-settings-provider";
import { MonacoProvider } from "../../../../monaco/provider";
import { SimulationCreationDrawer } from "../../simulation-creation-drawer";
import { useCreateOptimizedExperiment } from "./experiments/create-experiment-drawer/create-optimized-experiment";
import { FakeEditorProvider } from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";

import type {
  CreateExperimentInput,
  ExperimentComputeBackend,
} from "../../../../../react/experiments/context";
import type { SimulateViewMode } from "../../../../../react/state/editor-context";
import type { PetrinautOptimizationSource } from "@hashintel/petrinaut-core/optimization";
import type { PropsWithChildren } from "react";

export type StoryExample = {
  title: string;
  petriNetDefinition: SDCPN;
};

const rootStyle = css({
  position: "relative",
  width: "full",
  height: "[100vh]",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
});

// Covers the story, so presses fall through to it — but the portalled
// surfaces themselves are this layer's children and have to stay clickable.
const portalContainerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "modal",
  pointerEvents: "none",
  "& > *": {
    pointerEvents: "auto",
  },
});

export const createSdcpnContextValue = ({
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

/** Pins user settings over the persisted ones for everything below. */
export const WithUserSettings = ({
  overrides,
  children,
}: PropsWithChildren<{ overrides: Partial<UserSettings> }>) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext value={{ ...value, ...overrides }}>
      {children}
    </UserSettingsContext>
  );
};

/**
 * The full-height stage every SimulateView story renders into: the view, its
 * creation drawer, and the layer portalled surfaces mount in.
 */
export const SimulateViewStoryStage = ({ children }: PropsWithChildren) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <div className={`${rootStyle} petrinaut-root`}>
        <div ref={portalContainerRef} className={portalContainerStyle} />
        <SimulateView />
        <SimulationCreationDrawer />
        {children}
      </div>
    </PortalContainerContext>
  );
};

const defaultRunnableSettings: Partial<UserSettings> = {
  enableParameterSweeps: true,
  enableInBrowserOptimization: true,
};

/**
 * SimulateView over a real example model with the real experiments and
 * optimizations providers, so the stories run simulations for real. Children
 * mount inside the providers; an `optimization` source becomes the host's.
 */
export const RunnableSimulateViewStory = ({
  example,
  initialSimulateViewMode = "experiments",
  optimization = null,
  settings,
  children,
}: PropsWithChildren<{
  example: StoryExample;
  initialSimulateViewMode?: SimulateViewMode;
  optimization?: PetrinautOptimizationSource | null;
  /** Settings pinned on top of the In-browser optimization setting. */
  settings?: Partial<UserSettings>;
}>) => {
  const sdcpnContextValue = createSdcpnContextValue(example);

  const story = (
    <SDCPNContext value={sdcpnContextValue}>
      <PetrinautNavigationProvider
        initialState={{
          mode: "simulate",
          simulateView: initialSimulateViewMode,
        }}
      >
        <LanguageClientProvider>
          <MonacoProvider>
            <NotificationsProvider>
              <UserSettingsProvider>
                <WithUserSettings
                  overrides={{ ...defaultRunnableSettings, ...settings }}
                >
                  <FakeEditorProvider
                    initialSimulateViewMode={initialSimulateViewMode}
                  >
                    <ExperimentsProvider>
                      <OptimizationsProvider>
                        <SimulateViewStoryStage>
                          {children}
                        </SimulateViewStoryStage>
                      </OptimizationsProvider>
                    </ExperimentsProvider>
                  </FakeEditorProvider>
                </WithUserSettings>
              </UserSettingsProvider>
            </NotificationsProvider>
          </MonacoProvider>
        </LanguageClientProvider>
      </PetrinautNavigationProvider>
    </SDCPNContext>
  );

  return optimization ? (
    <PetrinautOptimizationContext value={optimization}>
      {story}
    </PetrinautOptimizationContext>
  ) : (
    story
  );
};

/** The interval one scenario parameter is swept over. */
export type AutoSweepRange = { min: number; max: number };

/**
 * A sweep and the study that drives it, described by the names in the
 * example's definition; unlisted scenario parameters stay fixed at their
 * defaults.
 */
export type AutoSweepStudyDescription = {
  scenarioName: string;
  name: string;
  /** Optimizer steps: one sweep point each. */
  steps: number;
  /** The sweep's run budget per point; a step computes the ladder's first rung of it. */
  runCount: number;
  dt: number;
  maxTime: number;
  sweep: Readonly<Record<string, AutoSweepRange>>;
  objective: {
    metricName: string;
    direction: PetrinautOptimizationDirection;
  };
};

const findByName = <T extends { name: string }>(
  kind: string,
  candidates: readonly T[] | undefined,
  name: string,
): T => {
  const match = candidates?.find((candidate) => candidate.name === name);
  if (!match) {
    const known = (candidates ?? [])
      .map((candidate) => `"${candidate.name}"`)
      .join(", ");
    throw new Error(
      `Unknown ${kind} "${name}"; the example defines ${known || "none"}`,
    );
  }
  return match;
};

/** The id the sweep's objective metric runs under. */
const AUTO_SWEEP_OBJECTIVE_ID = "objective";

/** Resolves a description against the example, as the create form would. */
export const buildAutoSweepExperimentInput = (
  { petriNetDefinition }: StoryExample,
  study: AutoSweepStudyDescription,
  computeBackend: ExperimentComputeBackend,
): CreateExperimentInput => {
  const scenario = findByName(
    "scenario",
    petriNetDefinition.scenarios,
    study.scenarioName,
  );
  const metric = findByName(
    "metric",
    petriNetDefinition.metrics,
    study.objective.metricName,
  );
  const identifiers = scenario.scenarioParameters.map(
    (parameter) => parameter.identifier,
  );
  for (const identifier of Object.keys(study.sweep)) {
    if (!identifiers.includes(identifier)) {
      throw new Error(
        `Scenario "${scenario.name}" has no parameter "${identifier}"; it defines ${identifiers.join(", ")}`,
      );
    }
  }
  return {
    name: study.name,
    scenarioId: scenario.id,
    scenarioParameterValues: Object.fromEntries(
      scenario.scenarioParameters.map((parameter) => {
        const range = study.sweep[parameter.identifier];
        return [
          parameter.identifier,
          range === undefined
            ? { mode: "fixed", value: String(parameter.default) }
            : { mode: "range", min: range.min, max: range.max },
        ];
      }),
    ),
    runCount: study.runCount,
    seed: Math.floor(Math.random() * 1_000_000),
    dt: study.dt,
    maxTime: study.maxTime,
    metricSpecs: [
      {
        kind: "expression",
        id: AUTO_SWEEP_OBJECTIVE_ID,
        label: metric.name,
        code: metric.code,
        sampleRuns: "all",
        runOutput: { type: "distribution" },
      },
    ],
    computeBackend,
  };
};

/**
 * Creates the described sweep once through the enclosing providers with the
 * study that drives it, and selects it so its drawer opens already
 * optimizing — the Create Experiment drawer's Optimize, without the form.
 * Renders nothing.
 */
export const AutoSweepStudy = ({
  study,
  computeBackend = "cpu",
}: {
  study: AutoSweepStudyDescription;
  computeBackend?: ExperimentComputeBackend;
}) => {
  const { petriNetDefinition, title } = use(SDCPNContext);
  const createOptimizedExperiment = useCreateOptimizedExperiment();
  const startRef = useLatest(() =>
    createOptimizedExperiment(
      buildAutoSweepExperimentInput(
        { title, petriNetDefinition },
        study,
        computeBackend,
      ),
      {
        metricId: AUTO_SWEEP_OBJECTIVE_ID,
        direction: study.objective.direction,
        steps: study.steps,
      },
    ),
  );
  const startedRef = useRef(false);

  useEffect(() => {
    // The language client provider re-parents its children once the client
    // lands, which remounts everything below it in the same task. A start
    // deferred by a tick is cleared with the first tree and runs in the one
    // that stays, so the sweep is created once and its selection survives.
    const timer = window.setTimeout(() => {
      if (startedRef.current) {
        return;
      }
      startedRef.current = true;
      void startRef.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startRef]);

  return null;
};
