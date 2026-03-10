import { cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { FaCircle, FaSquare } from "react-icons/fa6";

import type { SubView } from "../../../../../components/sub-view/types";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { createFilterableListSubView } from "./filterable-list-sub-view";

const nodeIconStyle = cva({
  base: {
    flexShrink: 0,
  },
  variants: {
    isSelected: {
      true: {
        color: "[#3b82f6]",
      },
      false: {
        color: "[#9ca3af]",
      },
    },
  },
});

const nodeNameStyle = cva({
  base: {
    fontSize: "sm",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variants: {
    isSelected: {
      true: {
        color: "[#1e40af]",
      },
      false: {
        color: "neutral.s105",
      },
    },
  },
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
      })),
      ...transitions.map((transition) => ({
        id: transition.id,
        name: transition.name || `Transition ${transition.id}`,
        kind: "transition" as const,
      })),
    ];
  },
  getSelectionItem: (node) => ({ type: node.kind, id: node.id }),
  renderItem: (node, isSelected) => (
    <>
      {node.kind === "place" ? (
        <FaCircle size={12} className={nodeIconStyle({ isSelected })} />
      ) : (
        <FaSquare size={12} className={nodeIconStyle({ isSelected })} />
      )}
      <span className={nodeNameStyle({ isSelected })}>{node.name}</span>
    </>
  ),
  emptyMessage: "No nodes yet",
});
