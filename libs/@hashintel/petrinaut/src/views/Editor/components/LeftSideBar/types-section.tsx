import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../../../../components/tooltip";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNStore } from "../../../../state/sdcpn-provider";

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
const getNextAvailableColor = (existingColors: string[]): string => {
  const unusedColor = TYPE_COLOR_POOL.find(
    (color) => !existingColors.includes(color),
  );
  return unusedColor ?? TYPE_COLOR_POOL[0]!;
};

/**
 * Extract the highest type number from existing type names.
 * Looks for patterns like "Type 1", "Type 2", "New Type 3", etc.
 */
const getNextTypeNumber = (existingNames: string[]): number => {
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
};

export const TypesSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const types = useSDCPNStore((state) => state.sdcpn.types);
  const addType = useSDCPNStore((state) => state.addType);
  const removeType = useSDCPNStore((state) => state.removeType);
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingBottom: 16,
        borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
            Token Types
            <InfoIconTooltip tooltip="Manage data types which can be assigned to tokens in a place." />
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            const existingColors = types.map((type) => type.displayColor);
            const existingNames = types.map((type) => type.name);
            const nextNumber = getNextTypeNumber(existingNames);
            const nextColor = getNextAvailableColor(existingColors);

            const newType = {
              id: `type__${Date.now()}`,
              name: `Type ${nextNumber}`,
              iconId: "circle",
              colorCode: nextColor,
              elements: [
                {
                  id: `element__${Date.now()}`,
                  name: "dimension_1",
                  type: "real" as const,
                },
              ],
            };
            addType(newType);
          }}
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "spacing.1",
            borderRadius: "radius.2",
            cursor: "pointer",
            fontSize: "[18px]",
            color: "core.gray.60",
            _hover: {
              backgroundColor: "[rgba(0, 0, 0, 0.05)]",
              color: "core.gray.90",
            },
          })}
          style={{ width: 24, height: 24 }}
          aria-label="Add token type"
        >
          +
        </button>
      </div>

      {isExpanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 2px 4px 8px",
                  borderRadius: 4,
                  backgroundColor: isSelected
                    ? "rgba(59, 130, 246, 0.15)"
                    : "transparent",
                  cursor: "pointer",
                }}
                className={css({
                  _hover: {
                    backgroundColor: isSelected
                      ? "[rgba(59, 130, 246, 0.2)]"
                      : "[rgba(0, 0, 0, 0.05)]",
                  },
                })}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: type.displayColor,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: "#374151",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {type.name}
                </span>
                <button
                  type="button"
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
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "spacing.1",
                    borderRadius: "radius.2",
                    cursor: "pointer",
                    fontSize: "[14px]",
                    color: "core.gray.40",
                    _hover: {
                      backgroundColor: "[rgba(239, 68, 68, 0.1)]",
                      color: "core.red.60",
                    },
                  })}
                  style={{ width: 20, height: 20 }}
                  aria-label={`Delete token type ${type.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
          {types.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "spacing.4",
                textAlign: "center",
              }}
            >
              No token types yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
