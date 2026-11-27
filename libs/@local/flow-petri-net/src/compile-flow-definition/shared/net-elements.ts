import {
  componentPortArcEndpoint,
  placeArcEndpoint,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import type { TransitionMetadata } from "../../flow-net-metadata.js";
import type {
  ArcEndpoint,
  ComponentPortArcEndpoint,
  InputArc,
  InputArcType,
  OutputArc,
  Place,
  PlaceArcEndpoint,
  PortDirection,
  Transition,
} from "@hashintel/petrinaut-core";

export const createPlace = ({
  id,
  name,
  description,
  colorId,
  portDirection,
}: {
  id: string;
  name: string;
  description: string;
  colorId: string;
  /** Makes the place a port of its subnet, which the subnet only consumes from (`in`) or only produces into (`out`). */
  portDirection?: Exclude<PortDirection, "inout">;
}): Place => ({
  id,
  name,
  description,
  colorId,
  dynamicsEnabled: false,
  ...(portDirection ? { isPort: true, portDirection } : {}),
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

export const placeEndpoint = (placeId: string): PlaceArcEndpoint =>
  placeArcEndpoint(placeId);

export const portEndpoint = (
  componentInstanceId: string,
  portPlaceId: string,
): ComponentPortArcEndpoint =>
  componentPortArcEndpoint({ componentInstanceId, portPlaceId });

/**
 * A place's endpoint with its id converted to a Petrinaut id, as `canonicalizePetrinautIds` converts the endpoints
 * of arcs, for an endpoint held in metadata, which it leaves as it is.
 */
export const toPetrinautEndpoint = (
  endpoint: PlaceArcEndpoint,
): PlaceArcEndpoint => placeEndpoint(toPetrinautId(endpoint.placeId));

/** An arc into a transition. Unlike a Petrinaut `InputArc`, its `endpoint` is always set. */
export const inputArc = <Endpoint extends ArcEndpoint>(
  endpoint: Endpoint,
  type: InputArcType = "standard",
): InputArc & { endpoint: Endpoint } => ({ endpoint, weight: 1, type });

export const outputArc = (endpoint: ArcEndpoint): OutputArc => ({
  endpoint,
  weight: 1,
});
