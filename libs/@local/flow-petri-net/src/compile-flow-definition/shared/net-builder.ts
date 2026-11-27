import { generateFusionKey } from "../../flow-net-keys.js";
import {
  createPayloadColor,
  pendingColor,
  stepFailureColor,
} from "./colors.js";
import { createPlace, placeEndpoint } from "./net-elements.js";

import type { ValueShape } from "./flow-steps.js";
import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  ComponentPortArcEndpoint,
  Fusion,
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
  const fusions: Fusion[] = [];

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
    fusions,
    registerColor,
    registerPayloadColor: ({ payloadKind, array }: ValueShape) =>
      registerColor(createPayloadColor(payloadKind, array)),
    addPlace: (place: Parameters<typeof createPlace>[0]) => {
      const created = createPlace(place);
      places.push(created);
      return created;
    },
    addTransitions: (...newTransitions: Transition[]) => {
      transitions.push(...newTransitions);
    },
    addComponentInstance: (instance: ComponentInstance) => {
      componentInstances.push(instance);
    },
    /**
     * Fuses ports of steps' instances with a place of the root net, which anchors the fusion. The fused place takes
     * the fusion's name, so the fusion is named after its anchor, which kernels address it by.
     */
    addFusion: (anchor: Place, ports: ComponentPortArcEndpoint[]) => {
      fusions.push({
        id: generateFusionKey(anchor.id),
        name: anchor.name,
        members: [placeEndpoint(anchor.id), ...ports],
      });
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
