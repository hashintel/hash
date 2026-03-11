import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { FaCircle, FaSquare } from "react-icons/fa6";

import type { SubView } from "../../../../../components/sub-view/types";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import {
  createFilterableListSubView,
  listItemNameStyle,
} from "./filterable-list-sub-view";

const nodeIconStyle = css({
  flexShrink: 0,
  color: "[#9ca3af]",
});

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
    defaultHeight: 150,
    minHeight: 80,
    maxHeight: 400,
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
        icon: <FaCircle size={12} className={nodeIconStyle} />,
      })),
      ...transitions.map((transition) => ({
        id: transition.id,
        name: transition.name || `Transition ${transition.id}`,
        kind: "transition" as const,
        icon: <FaSquare size={12} className={nodeIconStyle} />,
      })),
    ];
  },
  getSelectionItem: (node) => ({ type: node.kind, id: node.id }),
  renderItem: (node) => <span className={listItemNameStyle}>{node.name}</span>,
  emptyMessage: "No nodes yet",
});
