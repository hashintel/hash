import { collapsibleAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

export const collapsibleSlotRecipe = sva({
  className: "collapsible",
  slots: collapsibleAnatomy.keys(),
  base: {
    content: {
      overflow: "hidden",
      _open: {
        animation: "expand 250ms, fadeIn 250ms",
      },
      _closed: {
        animation: "collapse 200ms, fadeOut 200ms",
      },
    },
  },
});

export type CollapsibleSlotRecipeProps = RecipeVariantProps<
  typeof collapsibleSlotRecipe
>;
