import { clipboardAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const clipboardSlotRecipeDefinition = {
  className: "clipboard",
  slots: clipboardAnatomy.keys(),
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1.5",
    },
    label: {
      fontWeight: "medium",
      textStyle: "sm",
      color: "fg.default",
      gap: "0.5",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const clipboardSlotRecipe = sva(clipboardSlotRecipeDefinition);

export type ClipboardSlotRecipeProps = RecipeVariantProps<typeof clipboardSlotRecipe>;
