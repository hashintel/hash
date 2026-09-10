import { use } from "react";

import { Button } from "@hashintel/ds-components";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";

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
    const match = name.match(/Type\s+(\d+)/iu);
    if (match) {
      const typeNumber = Number.parseInt(match[1]!, 10);
      if (typeNumber > maxNumber) {
        maxNumber = typeNumber;
      }
    }
  }
  return maxNumber + 1;
};

/** Adds a token type from the tree's Token Types group header. */
export const AddTypeAction: React.FC = () => {
  const {
    activeNet: { types },
  } = use(ActiveNetContext);
  const { extensions } = use(SDCPNContext);
  const { addType } = usePetrinautMutations();
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  const isDisabled = isReadOnly || !extensions.colors;
  let tooltip = "Add token type";
  if (isReadOnly) {
    tooltip = UI_MESSAGES.READ_ONLY_MODE;
  } else if (!extensions.colors) {
    tooltip = UI_MESSAGES.EXTENSION_UNAVAILABLE;
  }

  return (
    <Button
      aria-label="Add token type"
      size="xs"
      variant="ghost"
      disabled={isDisabled}
      tooltip={tooltip}
      iconName="plus"
      onClick={() => {
        const existingColors = types.map((type) => type.displayColor);
        const existingNames = types.map((type) => type.name);
        const nextNumber = getNextTypeNumber(existingNames);
        const nextColor = getNextAvailableColor(existingColors);

        const id = `type__${Date.now()}`;
        const newType = {
          id,
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
        selectItem({ type: "type", id });
      }}
    />
  );
};
