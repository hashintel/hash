import { use } from "react";
import { TbPlus, TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { TokenTypeIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

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
 * TypesSectionHeaderAction renders the add button for the types section header.
 */
export const TypesSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types },
    addType,
  } = use(SDCPNContext);
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <IconButton
      aria-label="Add token type"
      size="xs"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
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
    >
      <TbPlus />
    </IconButton>
  );
};

const TypeRowMenu: React.FC<{ item: { id: string } }> = ({ item }) => {
  const { removeType } = use(SDCPNContext);
  const isReadOnly = useIsReadOnly();

  return (
    <RowMenu
      items={[
        {
          id: "delete",
          label: "Delete",
          icon: <TbTrash />,
          destructive: true,
          disabled: isReadOnly,
          onClick: () => removeType(item.id),
        },
      ]}
    />
  );
};

/**
 * SubView definition for Token Types list.
 */
export const typesListSubView: SubView = createFilterableListSubView({
  id: "token-types-list",
  title: "Token Types",
  tooltip: "Manage data types which can be assigned to tokens in a place.",
  defaultCollapsed: false,
  resizable: {
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 600,
  },
  useItems: () => {
    const {
      petriNetDefinition: { types },
    } = use(SDCPNContext);
    return types.map((type) => ({
      ...type,
      icon: TokenTypeIcon,
      iconColor: type.displayColor,
    }));
  },
  getSelectionItem: (type) => ({ type: "type", id: type.id }),
  renderItem: (type) => type.name,
  renderRowMenu: TypeRowMenu,
  emptyMessage: "No token types yet",
  renderHeaderAction: () => <TypesSectionHeaderAction />,
});
