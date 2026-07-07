import { toggleGroupAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const toggleGroupSlotRecipeDefinition = {
  className: "toggle-group",
  slots: toggleGroupAnatomy.keys(),
  base: {
    root: {},
  },
  variants: {
    variant: {
      outline: {
        root: {
          borderRadius: "l3",
          borderWidth: "1px",
          gap: "1",
          p: "1",
        },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const toggleGroupSlotRecipe = sva(toggleGroupSlotRecipeDefinition);

export type ToggleGroupSlotRecipeProps = RecipeVariantProps<
  typeof toggleGroupSlotRecipe
>;
