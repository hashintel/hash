import {
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
} from "../arc-endpoints";
import { generateArcId } from "../arc-id";

import type { Transition } from "../types/sdcpn";
import type { SelectionMap } from "../types/selection";

/**
 * Given a list of transitions and a set of selected item IDs,
 * returns a {@link SelectionMap} of all items (places, transitions, arcs)
 * that are directly connected to any selected item via an arc.
 *
 * An item is included if it shares an arc with a selected item:
 * - A selected place includes its connected transitions and arcs.
 * - A selected transition includes its connected places and arcs.
 * - A selected arc includes its source and target nodes.
 */
export function getNodeConnections(
  transitions: readonly Transition[],
  selectedIds: ReadonlySet<string>,
): SelectionMap {
  const connections: SelectionMap = new Map();

  for (const transition of transitions) {
    const transitionSelected = selectedIds.has(transition.id);

    for (const inputArc of transition.inputArcs) {
      const endpoint = getArcEndpoint(inputArc);
      const nodeId = getArcEndpointNodeId(endpoint);
      const endpointType =
        endpoint.kind === "place" ? "place" : "componentInstance";
      const arcId = generateArcId({
        inputId: getArcEndpointKey(endpoint),
        outputId: transition.id,
      });
      const endpointSelected = selectedIds.has(nodeId);
      const arcSelected = selectedIds.has(arcId);

      if (transitionSelected || endpointSelected || arcSelected) {
        connections.set(nodeId, {
          type: endpointType,
          id: nodeId,
        });
        connections.set(transition.id, {
          type: "transition",
          id: transition.id,
        });
        connections.set(arcId, { type: "arc", id: arcId });
      }
    }

    for (const outputArc of transition.outputArcs) {
      const endpoint = getArcEndpoint(outputArc);
      const nodeId = getArcEndpointNodeId(endpoint);
      const endpointType =
        endpoint.kind === "place" ? "place" : "componentInstance";
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: getArcEndpointKey(endpoint),
      });
      const endpointSelected = selectedIds.has(nodeId);
      const arcSelected = selectedIds.has(arcId);

      if (transitionSelected || endpointSelected || arcSelected) {
        connections.set(nodeId, {
          type: endpointType,
          id: nodeId,
        });
        connections.set(transition.id, {
          type: "transition",
          id: transition.id,
        });
        connections.set(arcId, { type: "arc", id: arcId });
      }
    }
  }

  // The logic above adds items even if they are selected, so we now remove all selected items from the
  // connected map. I suspect this approach is also faster than adding extra conditions to build the list
  selectedIds.forEach((id) => connections.delete(id));

  return connections;
}
