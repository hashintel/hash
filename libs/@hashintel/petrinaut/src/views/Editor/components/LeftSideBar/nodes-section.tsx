import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaCircle,
  FaSquare,
} from "react-icons/fa6";

import { InfoIconTooltip } from "../../../../components/tooltip";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";

const sectionContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
  flex: "[1]",
  minHeight: "[0]",
});

const sectionToggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontWeight: 600,
  fontSize: "[13px]",
  color: "[#333]",
  cursor: "pointer",
  background: "[transparent]",
  border: "none",
  padding: "spacing.1",
  borderRadius: "radius.4",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  overflowY: "auto",
  flex: "[1]",
});

const nodeRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[6px]",
    padding: "[4px 9px]",
    borderRadius: "radius.4",
    cursor: "default",
    transition: "[all 0.15s ease]",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "core.blue.20",
        _hover: {
          backgroundColor: "core.blue.30",
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
        fontWeight: 500,
      },
      false: {
        color: "[#374151]",
        fontWeight: 400,
      },
    },
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
  padding: "spacing.4",
  textAlign: "center",
});

// --- Component ---

export const NodesSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const {
    petriNetDefinition: { places, transitions },
  } = useSDCPNContext();
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  const handleLayerClick = (id: string) => {
    // Single select: replace selection
    setSelectedResourceId(id);
  };

  return (
    <div className={sectionContainerStyle}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={sectionToggleButtonStyle}
      >
        {isExpanded ? (
          <FaChevronDown size={10} />
        ) : (
          <FaChevronRight size={10} />
        )}
        <span>
          Nodes
          <InfoIconTooltip tooltip="Manage nodes in the net, including places and transitions. Places represent states in the net, and transitions represent events which change the state of the net." />
        </span>
      </button>

      {/* Nodes List */}
      {isExpanded && (
        <div className={listContainerStyle}>
          {/* Places */}
          {places.map((place) => {
            const isSelected = selectedResourceId === place.id;
            return (
              <div
                key={place.id}
                role="button"
                tabIndex={0}
                onClick={() => handleLayerClick(place.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleLayerClick(place.id);
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
            const isSelected = selectedResourceId === transition.id;
            return (
              <div
                key={transition.id}
                role="button"
                tabIndex={0}
                onClick={() => handleLayerClick(transition.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleLayerClick(transition.id);
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
      )}
    </div>
  );
};
