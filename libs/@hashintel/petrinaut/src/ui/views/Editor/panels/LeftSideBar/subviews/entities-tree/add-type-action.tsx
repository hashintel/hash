import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { generatePetrinautId, nextTypeColor } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";

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
        const nextColor = nextTypeColor(existingColors);

        const id = generatePetrinautId();
        const newType = {
          id,
          name: `Type ${nextNumber}`,
          iconSlug: "circle",
          displayColor: nextColor,
          elements: [
            {
              elementId: generatePetrinautId(),
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
