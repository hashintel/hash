import {
  createPayloadColor,
  pendingColor,
  stepFailureColor,
} from "./colors.js";
import { createPlace } from "./net-elements.js";

import type { ValueShape } from "./flow-steps.js";
import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

/**
 * The root net as it's built: its places, transitions, colours and subnet instances, in the order they're added.
 */
export type NetBuilder = ReturnType<typeof createNetBuilder>;

export const createNetBuilder = () => {
  const colors = new Map<string, Color>(
    [pendingColor, stepFailureColor].map((color) => [color.id, color]),
  );

  const places: Place[] = [];
  const transitions: Transition[] = [];
  const componentInstances: ComponentInstance[] = [];

  /** Transition id → the input ports it feeds that nothing is connected to. */
  const absentInputPorts = new Map<string, Set<string>>();

  const registerColor = (color: Color) => {
    colors.set(color.id, color);
    return color.id;
  };

  return {
    colors,
    places,
    transitions,
    componentInstances,
    registerColor,
    registerPayloadColor: ({ payloadKind, array }: ValueShape) =>
      registerColor(createPayloadColor(payloadKind, array)),
    addPlace: (place: Parameters<typeof createPlace>[0]) => {
      places.push(createPlace(place));
      return place.id;
    },
    addTransitions: (...newTransitions: Transition[]) => {
      transitions.push(...newTransitions);
    },
    addComponentInstance: (instance: ComponentInstance) => {
      componentInstances.push(instance);
    },
    /** Records the input ports a transition feeds that nothing is connected to, which it gives absent tokens. */
    markAbsentInputPorts: (transitionId: string, portIds: string[]) => {
      absentInputPorts.set(transitionId, new Set(portIds));
    },
    isAbsentInputPort: (transitionId: string, endpoint: ArcEndpoint) =>
      endpoint.kind === "componentPort" &&
      (absentInputPorts.get(transitionId)?.has(endpoint.portPlaceId) ?? false),
  };
};
