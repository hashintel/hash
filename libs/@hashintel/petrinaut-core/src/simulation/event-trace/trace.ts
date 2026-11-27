import { SOLVER_ERROR_DIAGNOSTIC } from "../steppers/run-stepper";

import type { SimulationCompletionReason } from "../engine/compute-next-frame";

export { SOLVER_ERROR_DIAGNOSTIC };

export type EventSimulationCompleteEvent = {
  type: "complete";
  reason: SimulationCompletionReason;
  /** Simulation time the run stopped at. */
  time: number;
};

export type EventSimulationErrorEvent = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type EventSimulationEvent =
  | EventSimulationCompleteEvent
  | EventSimulationErrorEvent;
