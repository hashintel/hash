import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";

import type { SubView } from "../../../components/sub-view/types";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNContext } from "../../../state/sdcpn-provider";
import { SimulationContext } from "../../../state/simulation-provider";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
});

const typeRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    padding: "[4px 2px 4px 8px]",
    borderRadius: "[4px]",
    cursor: "pointer",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.15)]",
        _hover: {
          backgroundColor: "[rgba(59, 130, 246, 0.2)]",
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

const colorDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const typeNameStyle = css({
  flex: "[1]",
  fontSize: "[13px]",
  color: "[#374151]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1",
  borderRadius: "md.2",
  cursor: "pointer",
  fontSize: "[14px]",
  color: "gray.40",
  background: "[transparent]",
  border: "none",
  width: "[20px]",
  height: "[20px]",
  _hover: {
    backgroundColor: "[rgba(239, 68, 68, 0.1)]",
    color: "red.60",
  },
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.3]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "gray.40",
    },
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
  padding: "4",
  textAlign: "center",
});

const addButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "md.1",
  cursor: "pointer",
  fontSize: "[16px]",
  color: "gray.60",
  background: "[transparent]",
  border: "none",
  width: "[20px]",
  height: "[20px]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
    color: "gray.90",
  },
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.4]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "gray.60",
    },
  },
});

// Pool of 10 well-differentiated colors for types
const TYPE_COLOR_POOL = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#10b981", // Green
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#84cc16", // Lime
];

/**
 * Get the next available color from the pool that's not currently in use.
 * If all colors are in use, cycle back to the beginning.
 */
function getNextAvailableColor(existingColors: string[]): string {
  const unusedColor = TYPE_COLOR_POOL.find(
    (color) => !existingColors.includes(color),
  );
  return unusedColor ?? TYPE_COLOR_POOL[0]!;
}

/**
 * Extract the highest type number from existing type names.
 * Looks for patterns like "Type 1", "Type 2", "New Type 3", etc.
 */
function getNextTypeNumber(existingNames: string[]): number {
  let maxNumber = 0;
  for (const name of existingNames) {
    // Match patterns like "Type 1", "New Type 2", etc.
    const match = name.match(/Type\s+(\d+)/i);
    if (match) {
      const num = Number.parseInt(match[1]!, 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }
  return maxNumber + 1;
}

/**
 * TypesSectionContent displays the list of token types.
 * This is the content portion without the collapsible header.
 */
const TypesSectionContent: React.FC = () => {
  const {
    petriNetDefinition: { types },
    removeType,
  } = useSDCPNContext();

  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  // Check if simulation is running or paused
  const { state: simulationState } = use(SimulationContext);
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div className={listContainerStyle}>
      {types.map((type) => {
        const isSelected = selectedResourceId === type.id;

        return (
          <div
            key={type.id}
            onClick={(event) => {
              // Don't trigger selection if clicking the delete button
              if (
                event.target instanceof HTMLElement &&
                event.target.closest("button[aria-label^='Delete']")
              ) {
                return;
              }
              setSelectedResourceId(type.id);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setSelectedResourceId(type.id);
              }
            }}
            className={typeRowStyle({ isSelected })}
          >
            <div
              className={colorDotStyle}
              style={{ backgroundColor: type.displayColor }}
            />
            <span className={typeNameStyle}>{type.name}</span>
            <button
              type="button"
              disabled={isSimulationActive}
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Delete token type "${type.name}"? All places using this type will have their type set to null.`,
                  )
                ) {
                  removeType(type.id);
                }
              }}
              className={deleteButtonStyle}
              aria-label={`Delete token type ${type.name}`}
            >
              ×
            </button>
          </div>
        );
      })}
      {types.length === 0 && (
        <div className={emptyMessageStyle}>No token types yet</div>
      )}
    </div>
  );
};

/**
 * TypesSectionHeaderAction renders the add button for the types section header.
 */
const TypesSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types },
    addType,
  } = useSDCPNContext();

  // Check if simulation is running or paused
  const { state: simulationState } = use(SimulationContext);
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <button
      type="button"
      disabled={isSimulationActive}
      onClick={() => {
        const existingColors = types.map((type) => type.displayColor);
        const existingNames = types.map((type) => type.name);
        const nextNumber = getNextTypeNumber(existingNames);
        const nextColor = getNextAvailableColor(existingColors);

        const newType = {
          id: `type__${Date.now()}`,
          name: `Type ${nextNumber}`,
          iconSlug: "circle",
          displayColor: nextColor,
          elements: [
            {
              elementId: `element__${Date.now()}`,
              name: "dimension_1",
              type: "real" as const,
            },
          ],
        };
        addType(newType);
      }}
      className={addButtonStyle}
      aria-label="Add token type"
    >
      +
    </button>
  );
};

/**
 * SubView definition for Token Types list.
 */
export const typesListSubView: SubView = {
  id: "token-types-list",
  title: "Token Types",
  tooltip: "Manage data types which can be assigned to tokens in a place.",
  component: TypesSectionContent,
  renderHeaderAction: () => <TypesSectionHeaderAction />,
  resizable: {
    defaultHeight: 120,
    minHeight: 60,
    maxHeight: 300,
  },
};
