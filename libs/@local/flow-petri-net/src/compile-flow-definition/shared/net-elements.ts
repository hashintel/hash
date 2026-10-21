import {
  componentPortArcEndpoint,
  placeArcEndpoint,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import type { TransitionMetadata } from "../../flow-net-metadata.js";
import type {
  ArcEndpoint,
  InputArc,
  InputArcType,
  OutputArc,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

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
 * A transition with no simulation behaviour: the flow executor interprets it by the role in its metadata (see
 * `TransitionRole`). Its kernel is added later, as a placeholder (see `withKernel`).
 *
 * @todo guards, so that the net simulates too: correlating `run_id` / `item_path` across input tokens, and the
 *   iterator and accumulator conditions of `forEach` steps.
 */
export const createTransition = ({
  id,
  name,
  description,
  metadata,
  inputArcs,
  outputArcs,
}: {
  id: string;
  name: string;
  description: string;
  metadata: TransitionMetadata;
  inputArcs: InputArc[];
  outputArcs: OutputArc[];
}): Transition => ({
  id,
  name,
  description,
  metadata,
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

/** An arc into a transition. Unlike a Petrinaut `InputArc`, its `endpoint` is always set. */
export const inputArc = (
  endpoint: ArcEndpoint,
  type: InputArcType = "standard",
): InputArc & { endpoint: ArcEndpoint } => ({ endpoint, weight: 1, type });

export const outputArc = (endpoint: ArcEndpoint): OutputArc => ({
  endpoint,
  weight: 1,
});
