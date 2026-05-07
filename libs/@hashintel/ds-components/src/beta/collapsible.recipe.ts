import { collapsibleAnatomy } from "@ark-ui/react/anatomy";
import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const collapsibleSlotRecipeDefinition = {
  className: "collapsible",
  slots: collapsibleAnatomy.keys(),
  base: {
    content: {
      overflow: "hidden",
      _open: {
        animationName: "expand-height, fade-in",
        animationDuration: "slow",
      },
      _closed: {
        animationName: "collapse-height, fade-out",
        animationDuration: "normal",
      },
    },
  },
} as const;

export const collapsibleSlotRecipe = sva(collapsibleSlotRecipeDefinition);

export type CollapsibleSlotRecipeProps = RecipeVariantProps<
  typeof collapsibleSlotRecipe
>;
