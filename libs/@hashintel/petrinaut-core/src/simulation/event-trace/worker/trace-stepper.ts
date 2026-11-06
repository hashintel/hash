import { advanceRun } from "../../monte-carlo/advance-run";
import { createRunState } from "../../monte-carlo/run-state";
import { getFrameTime } from "../../monte-carlo/time";
import { computeDerivatives } from "../derivatives";
import { engineFrameFromRunFrame, touchedPlaceIndices } from "./run-frame";

import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type { SimulationCompletionReason } from "../../engine/compute-next-frame";
import type { StringPool } from "../../engine/string-pool";
import type { MonteCarloRunState } from "../../monte-carlo/internal-types";
import type { TraceEvent, TraceEventKind } from "../trace";

/**
 * The engine step the event-driven run advances by. Small enough that a
 * firing lands close to its true time and at most a few transitions share
 * one step; the events are what the run keeps, so the step's cost is only
 * compute.
 */
export const DEFAULT_EVENT_STEP_DT = 0.0001;

/** Simulated seconds between two recorded frames when nothing fires. */
export const DEFAULT_REFERENCE_INTERVAL = 0.1;

export type TraceStepperConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  maxTime: number | null;
  hirArtifacts?: HirArtifacts;
  stepDt: number;
  referenceInterval: number;
};

export type TraceStepResult = {
  /** The event this step produced, if it produced one. */
  event: TraceEvent | null;
  /** Simulation time after the step. */
  time: number;
  completion: SimulationCompletionReason | null;
  /** The engine's error message when the step failed; the run is over. */
  error: string | null;
};

export interface TraceStepper {
  readonly initialEvent: TraceEvent;
  /** The run's string pool, for the worker's pool deltas. */
  readonly stringPool: StringPool;
  /** Simulation time the run has reached. */
  readonly time: number;
  /** Advances the engine by one step. */
  step(): TraceStepResult;
}

const firedTransitionIds = (run: MonteCarloRunState): string[] => {
  const { transitionIds } = run.simulation.frameLayout;
  const fired: string[] = [];
  for (const [index, flag] of run.currentFrame.transitionFiredFlags.entries()) {
    if (flag === 1) {
      fired.push(transitionIds[index]!);
    }
  }
  return fired;
};

/**
 * Steps a single run of the fixed-step engine and turns the steps where
 * something happened into events: a firing event for every step with at
 * least one firing, a reference event when `referenceInterval` of simulated
 * time has passed since the last event, and one for the run's last state.
 *
 * The run is a one-run Monte Carlo experiment, so it keeps two frame
 * buffers whatever the step count; its seed derives from `seed` as a
 * one-run experiment's would.
 */
export function createTraceStepper(config: TraceStepperConfig): TraceStepper {
  const { stepDt, referenceInterval } = config;
  const run = createRunState(
    {
      sdcpn: config.sdcpn,
      ...(config.extensions === undefined
        ? {}
        : { extensions: config.extensions }),
      ...(config.hirArtifacts === undefined
        ? {}
        : { hirArtifacts: config.hirArtifacts }),
      runCount: 1,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: stepDt,
      maxTime: config.maxTime ?? Number.POSITIVE_INFINITY,
    },
    undefined,
    0,
  );
  const layout = run.simulation.frameLayout;
  const stepsPerReference = Math.max(1, Math.round(referenceInterval / stepDt));
  let eventCount = 0;
  let lastEventFrame = 0;

  const recordEvent = (
    kind: TraceEventKind,
    fired: readonly string[],
  ): TraceEvent => {
    lastEventFrame = run.frameNumber;
    return {
      index: eventCount++,
      time: getFrameTime(run.frameNumber, stepDt),
      kind,
      firedTransitionIds: fired,
      touchedPlaceIndices: touchedPlaceIndices(run, fired),
      frame: engineFrameFromRunFrame(layout, run.currentFrame),
      derivatives: computeDerivatives(
        layout,
        run.simulation.differentialEquationFns,
        run.currentFrame,
      ),
    };
  };

  const initialEvent = recordEvent("initial", []);

  return {
    initialEvent,
    stringPool: run.simulation.stringPool,
    get time() {
      return getFrameTime(run.frameNumber, stepDt);
    },
    step() {
      const time = () => getFrameTime(run.frameNumber, stepDt);
      if (run.status === "complete" || run.status === "error") {
        return {
          event: null,
          time: time(),
          completion: run.completionReason,
          error: run.error,
        };
      }

      advanceRun(run);
      if (run.error !== null) {
        return {
          event: null,
          time: time(),
          completion: null,
          error: run.error,
        };
      }

      const fired = firedTransitionIds(run);
      const isOver = run.completionReason !== null;
      let event: TraceEvent | null = null;
      if (fired.length > 0) {
        event = recordEvent("firing", fired);
      } else if (
        run.frameNumber - lastEventFrame >= stepsPerReference ||
        (isOver && run.frameNumber !== lastEventFrame)
      ) {
        event = recordEvent("reference", []);
      }

      return {
        event,
        time: time(),
        completion: run.completionReason,
        error: null,
      };
    },
  };
}
