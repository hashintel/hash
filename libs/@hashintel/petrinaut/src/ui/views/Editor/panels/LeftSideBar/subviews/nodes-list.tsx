import { use } from "react";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { PlaceFilledIcon, TransitionFilledIcon } from "../../../../../constants/entity-icons";
import { createFilterableListSubView } from "./filterable-list-sub-view";

import type { SubView } from "../../../../../components/sub-view/types";

interface NodeItem {
  id: string;
  name: string;
  kind: "place" | "transition";
}

/**
 * SubView definition for Nodes list.
 */
export const nodesListSubView: SubView = createFilterableListSubView<NodeItem>({
  id: "nodes-list",
  title: "Nodes",
  tooltip:
    "Manage nodes in the net, including places and transitions. Places represent states in the net, and transitions represent events which change the state of the net.",
  resizable: {
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 600,
  },
  useItems: () => {
    const {
      petriNetDefinition: { places, transitions },
    } = use(SDCPNContext);

    return [
      ...places.map((place) => ({
        id: place.id,
        name: place.name || `Place ${place.id}`,
        kind: "place" as const,
        icon: PlaceFilledIcon,
      })),
      ...transitions.map((transition) => ({
        id: transition.id,
        name: transition.name || `Transition ${transition.id}`,
        kind: "transition" as const,
        icon: TransitionFilledIcon,
      })),
    ];
  },
  getSelectionItem: (node) => ({ type: node.kind, id: node.id }),
  renderItem: (node) => node.name,
  emptyMessage: "No nodes yet",
});
