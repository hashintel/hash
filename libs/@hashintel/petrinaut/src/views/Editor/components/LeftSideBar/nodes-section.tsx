import { css } from "@hashintel/ds-helpers/css";
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1,
        minHeight: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={css({
          display: "flex",
          alignItems: "center",
          fontWeight: 600,
          fontSize: "[13px]",
          color: "[#333]",
          paddingBottom: "[4px]",
          cursor: "pointer",
          background: "[transparent]",
          border: "none",
          padding: "spacing.1",
          borderRadius: "radius.4",
          _hover: {
            backgroundColor: "[rgba(0, 0, 0, 0.05)]",
          },
        })}
        style={{ gap: 6 }}
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflowY: "auto",
            flex: 1,
          }}
        >
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
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "spacing.2",
                  padding: "spacing.2",
                  paddingX: "spacing.3",
                  borderRadius: "radius.4",
                  cursor: "default",
                  transition: "[all 0.15s ease]",
                  backgroundColor: isSelected
                    ? "core.blue.20"
                    : "[transparent]",
                  _hover: {
                    backgroundColor: isSelected
                      ? "core.blue.30"
                      : "[rgba(0, 0, 0, 0.05)]",
                  },
                })}
                style={{ padding: "4px 9px", gap: 6 }}
              >
                <FaCircle
                  size={12}
                  style={{
                    color: isSelected ? "#3b82f6" : "#9ca3af",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: isSelected ? "#1e40af" : "#374151",
                    fontWeight: isSelected ? 500 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
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
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "spacing.2",
                  borderRadius: "radius.4",
                  cursor: "default",
                  transition: "[all 0.15s ease]",
                  backgroundColor: isSelected
                    ? "core.blue.20"
                    : "[transparent]",
                  _hover: {
                    backgroundColor: isSelected
                      ? "core.blue.30"
                      : "[rgba(0, 0, 0, 0.05)]",
                  },
                })}
                style={{ padding: "4px 9px", gap: 6 }}
              >
                <FaSquare
                  size={12}
                  style={{
                    color: isSelected ? "#3b82f6" : "#9ca3af",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: isSelected ? "#1e40af" : "#374151",
                    fontWeight: isSelected ? 500 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {transition.name || `Transition ${transition.id}`}
                </span>
              </div>
            );
          })}

          {/* Empty state */}
          {places.length === 0 && transitions.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "spacing.4",
                textAlign: "center",
              }}
            >
              No nodes yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
