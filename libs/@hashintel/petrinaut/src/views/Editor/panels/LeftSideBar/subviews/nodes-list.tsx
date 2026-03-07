import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { FaCircle, FaSquare } from "react-icons/fa6";

import type { SubView } from "../../../../../components/sub-view/types";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import type { SelectionItem } from "../../../../../state/selection";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
});

const nodeRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[6px]",
    px: "2",
    py: "1",
    borderRadius: "md",
    cursor: "default",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "blue.s20",
        _hover: {
          backgroundColor: "blue.s30",
        },
      },
      false: {
        backgroundColor: "[transparent]",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
  },
});

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
    fontSize: "[13px]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variants: {
    isSelected: {
      true: {
        color: "[#1e40af]",
        fontWeight: "medium",
      },
      false: {
        color: "[#374151]",
        fontWeight: "normal",
      },
    },
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
});

/**
 * NodesSectionContent displays the list of places and transitions.
 * This is the content portion without the collapsible header.
 */
const NodesSectionContent: React.FC = () => {
  const {
    petriNetDefinition: { places, transitions },
  } = use(SDCPNContext);
  const { selection, selectItem, toggleItem, focusNode } = use(EditorContext);

  const handleLayerClick = (event: React.MouseEvent, item: SelectionItem) => {
    if (event.metaKey || event.ctrlKey) {
      toggleItem(item);
    } else {
      selectItem(item);
    }
    // Pan to node for places and transitions
    if (item.type === "place" || item.type === "transition") {
      focusNode(item.id);
    }
  };

  return (
    <div className={listContainerStyle}>
      {/* Places */}
      {places.map((place) => {
        const isSelected = selection.has(place.id);
        const item: SelectionItem = { type: "place", id: place.id };
        return (
          <div
            key={place.id}
            role="button"
            tabIndex={0}
            onClick={(event) => handleLayerClick(event, item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectItem(item);
                focusNode(place.id);
              }
            }}
            className={nodeRowStyle({ isSelected })}
          >
            <FaCircle size={12} className={nodeIconStyle({ isSelected })} />
            <span className={nodeNameStyle({ isSelected })}>
              {place.name || `Place ${place.id}`}
            </span>
          </div>
        );
      })}

      {/* Transitions */}
      {transitions.map((transition) => {
        const isSelected = selection.has(transition.id);
        const item: SelectionItem = {
          type: "transition",
          id: transition.id,
        };
        return (
          <div
            key={transition.id}
            role="button"
            tabIndex={0}
            onClick={(event) => handleLayerClick(event, item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectItem(item);
                focusNode(transition.id);
              }
            }}
            className={nodeRowStyle({ isSelected })}
          >
            <FaSquare size={12} className={nodeIconStyle({ isSelected })} />
            <span className={nodeNameStyle({ isSelected })}>
              {transition.name || `Transition ${transition.id}`}
            </span>
          </div>
        );
      })}

      {/* Empty state */}
      {places.length === 0 && transitions.length === 0 && (
        <div className={emptyMessageStyle}>No nodes yet</div>
      )}
    </div>
  );
};

/**
 * SubView definition for Nodes list.
 */
export const nodesListSubView: SubView = {
  id: "nodes-list",
  title: "Nodes",
  tooltip:
    "Manage nodes in the net, including places and transitions. Places represent states in the net, and transitions represent events which change the state of the net.",
  component: NodesSectionContent,
  resizable: {
    defaultHeight: 150,
    minHeight: 80,
    maxHeight: 400,
  },
};
