import { computeDerivatives } from "../derivatives";
import { engineFrameFromRunFrame, touchedPlaceIndices } from "./run-frame";

import type { SimulationCompletionReason } from "../../engine/compute-next-frame";
import type { TraceEvent, TraceEventKind } from "../trace";
import type { RunStepper } from "./run-stepper";

export type TraceRecording = {
  /** The event the advance produced, if it produced one. */
  event: TraceEvent | null;
  /** Simulation time after the advance. */
  time: number;
  completion: SimulationCompletionReason | null;
  /** The engine's error message when the advance failed; the run is over. */
  error: string | null;
};

/** A run as the events it records, whichever stepper advances it. */
export interface TraceRecorder {
  /** The state the run starts from. */
  readonly initialEvent: TraceEvent;
  /** Simulation time the run has reached. */
  readonly time: number;
  /**
   * Advances the stepper once and encodes the state it stopped at, when the
   * stepper wants it kept. `stopAt` is passed through to the stepper.
   */
  next(stopAt?: number): TraceRecording;
}

/**
 * Turns a stepper's advances into trace events: the state in the engine
 * frame format, each token's derivative, the places the firings touched and
 * whatever the stepper publishes about itself.
 *
 * The encoding is the same for every stepper, so it lives here and a
 * stepper only says when a state is worth it.
 */
export function createTraceRecorder(stepper: RunStepper): TraceRecorder {
  const { run } = stepper;
  const layout = run.simulation.frameLayout;
  let eventCount = 0;

  const record = (
    kind: TraceEventKind,
    fired: readonly string[],
  ): TraceEvent => {
    const diagnostics = stepper.diagnostics?.();
    return {
      index: eventCount++,
      time: stepper.time,
      kind,
      firedTransitionIds: fired,
      touchedPlaceIndices: touchedPlaceIndices(run, fired),
      frame: engineFrameFromRunFrame(layout, run.currentFrame),
      derivatives: computeDerivatives(
        layout,
        run.simulation.differentialEquationFns,
        run.currentFrame,
      ),
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
  };

  const initialEvent = record("initial", []);

  return {
    initialEvent,
    get time() {
      return stepper.time;
    },
    next(stopAt) {
      const advance = stepper.advance(stopAt);
      return {
        event:
          advance.kind === "stopped"
            ? null
            : record(advance.kind, advance.firedTransitionIds),
        time: advance.time,
        completion: advance.completion,
        error: advance.error,
      };
    },
  };
}
