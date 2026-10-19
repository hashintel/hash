import {
  componentPortArcEndpoint,
  placeArcEndpoint,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import type {
  ArcEndpoint,
  InputArc,
  InputArcType,
  OutputArc,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

/**
 * What a transition does in a flow net, for the executor that runs it and for anyone reading the net.
 *
 * - `startRun`: starts a run, seeding the flow's inputs and its top-level steps' `Pending` tokens.
 * - `startStep`: starts an action step once its inputs are available, feeding every input port of its instance.
 * - `startForEach`: starts a `forEach` step once its array is available, turning it into an iterator.
 * - `copyOutput`: takes an output from a step's output port, and puts it where each of its readers and consumers takes it from. Only added when more than one place needs the value.
 * - `recordStepFailure`: moves a step's token from its instance's "gave up" port into `FailedStepRuns`, failing the run.
 * - `startItem` / `startCollecting`: start each item of a `forEach` step, then hand over to counting them as they finish.
 * - `collectItem` / `finishCollecting`: collect each item's output, and complete the `forEach` step once all are in.
 * - `startAttempt` / `succeedAttempt` / `failAttempt` / `retryAttempt` / `giveUp`: an action's lifecycle, inside its
 *   subnet. `succeedAttempt` and `failAttempt` fire when the action's activity completes; every other transition fires
 *   as soon as it's enabled.
 */
export type TransitionRole =
  | "startRun"
  | "startStep"
  | "startForEach"
  | "copyOutput"
  | "recordStepFailure"
  | "startItem"
  | "startCollecting"
  | "collectItem"
  | "finishCollecting"
  | "startAttempt"
  | "succeedAttempt"
  | "failAttempt"
  | "retryAttempt"
  | "giveUp";

export const createPlace = ({
  id,
  name,
  description,
  colorId,
  isPort = false,
}: {
  id: string;
  name: string;
  description: string;
  colorId: string;
  isPort?: boolean;
}): Place => ({
  id,
  name,
  description,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  ...(isPort ? { isPort: true } : {}),
  x: 0,
  y: 0,
});

/**
 * A transition with no simulation behaviour: the flow executor interprets it by its `role` (see
 * {@link TransitionRole}).
 *
 * @todo guards and kernels, so that the net simulates too: correlating `run_id` / `item_path` across input
 *   tokens, and the iterator and accumulator conditions of `forEach` steps.
 */
export const createTransition = ({
  id,
  name,
  description,
  role,
  metadata = {},
  inputArcs,
  outputArcs,
}: {
  id: string;
  name: string;
  description: string;
  role: TransitionRole;
  metadata?: Transition["metadata"];
  inputArcs: InputArc[];
  outputArcs: OutputArc[];
}): Transition => ({
  id,
  name,
  description,
  metadata: { role, ...metadata },
  inputArcs,
  outputArcs,
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

export const placeEndpoint = (placeId: string): ArcEndpoint =>
  placeArcEndpoint(placeId);

export const portEndpoint = (
  componentInstanceId: string,
  portPlaceId: string,
): ArcEndpoint =>
  componentPortArcEndpoint({ componentInstanceId, portPlaceId });

/**
 * An endpoint with its ids converted to Petrinaut ids, as `canonicalizePetrinautIds` converts the endpoints of
 * arcs, for an endpoint held in metadata, which it leaves as it is.
 */
export const toPetrinautEndpoint = (endpoint: ArcEndpoint): ArcEndpoint =>
  endpoint.kind === "place"
    ? placeEndpoint(toPetrinautId(endpoint.placeId))
    : portEndpoint(
        toPetrinautId(endpoint.componentInstanceId),
        toPetrinautId(endpoint.portPlaceId),
      );

export const inputArc = (
  endpoint: ArcEndpoint,
  type: InputArcType = "standard",
): InputArc => ({ endpoint, weight: 1, type });

export const outputArc = (endpoint: ArcEndpoint): OutputArc => ({
  endpoint,
  weight: 1,
});
