import { use } from "react";

import { Button } from "@hashintel/ds-components";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react/hooks/use-petrinaut-mutations";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
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

/** The Add button of a group's header. A read-only document disables it and says why. */
const AddEntityButton: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => {
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label={label}
      size="xs"
      variant="ghost"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : label}
      iconName="plus"
      onClick={onClick}
    />
  );
};

/** Adds a token type from the tree's Token Types group header. */
export const AddTypeAction: React.FC = () => {
  const {
    activeNet: { types },
  } = use(ActiveNetContext);
  const { addType } = usePetrinautMutations();
  const { selectItem } = useEditorActions();

  return (
    <AddEntityButton
      label="Add token type"
      onClick={() => {
        const id = generatePetrinautId();
        addType({
          id,
          name: `Type ${getNextTypeNumber(types.map((type) => type.name))}`,
          iconSlug: "circle",
          displayColor: getNextAvailableColor(
            types.map((type) => type.displayColor),
          ),
          elements: [
            {
              elementId: generatePetrinautId(),
              name: "dimension_1",
              type: "real",
            },
          ],
        });
        selectItem({ type: "type", id });
      }}
    />
  );
};

/** Adds a differential equation from the tree's Differential Equations group header. */
export const AddDifferentialEquationAction: React.FC = () => {
  const {
    activeNet: { types, differentialEquations },
  } = use(ActiveNetContext);
  const { addDifferentialEquation } = usePetrinautMutations();
  const { selectItem } = useEditorActions();

  return (
    <AddEntityButton
      label="Add differential equation"
      onClick={() => {
        const id = generatePetrinautId();
        addDifferentialEquation({
          id,
          name: `Equation ${differentialEquations.length + 1}`,
          colorId: types.length > 0 ? types[0]!.id : null,
          code: DEFAULT_DIFFERENTIAL_EQUATION_CODE,
          arity: 1,
        });
        selectItem({ type: "differentialEquation", id });
      }}
    />
  );
};

/** Adds a global parameter from the tree's Parameters group header. */
export const AddParameterAction: React.FC = () => {
  const {
    activeNet: { parameters },
  } = use(ActiveNetContext);
  const { addParameter } = usePetrinautMutations();
  const { selectItem } = useEditorActions();

  return (
    <AddEntityButton
      label="Add parameter"
      onClick={() => {
        const id = generatePetrinautId();
        addParameter({
          id,
          name: `Parameter ${parameters.length + 1}`,
          variableName: `param${parameters.length + 1}`,
          type: "real",
          defaultValue: "0",
        });
        selectItem({ type: "parameter", id });
      }}
    />
  );
};
