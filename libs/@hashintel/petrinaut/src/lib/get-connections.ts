import type { Transition } from "../core/types/sdcpn";
import { generateArcId } from "../state/sdcpn-context";
import type { SelectionMap } from "../state/selection";

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
      const arcId = generateArcId({
        inputId: inputArc.placeId,
        outputId: transition.id,
      });
      const placeSelected = selectedIds.has(inputArc.placeId);
      const arcSelected = selectedIds.has(arcId);

      if (transitionSelected || placeSelected || arcSelected) {
        connections.set(inputArc.placeId, {
          type: "place",
          id: inputArc.placeId,
        });
        connections.set(transition.id, {
          type: "transition",
          id: transition.id,
        });
        connections.set(arcId, { type: "arc", id: arcId });
      }
    }

    for (const outputArc of transition.outputArcs) {
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: outputArc.placeId,
      });
      const placeSelected = selectedIds.has(outputArc.placeId);
      const arcSelected = selectedIds.has(arcId);

      if (transitionSelected || placeSelected || arcSelected) {
        connections.set(outputArc.placeId, {
          type: "place",
          id: outputArc.placeId,
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
