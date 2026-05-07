import { splitterAnatomy } from "@ark-ui/react/anatomy";
import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const splitterSlotRecipeDefinition = {
  className: "splitter",
  slots: splitterAnatomy.keys(),
  base: {
    root: {
      display: "flex",
      gap: "2",
    },
    panel: {
      borderRadius: "l3",
      display: "flex",
      background: "gray.surface.bg",
      borderWidth: "1px",
      p: "4",
    },
    resizeTrigger: {
      borderRadius: "l3",
      transition: "common",
      outline: "0",
      background: "gray.subtle.bg",
      _horizontal: {
        minWidth: "1.5",
      },
      _vertical: {
        minHeight: "1.5",
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const splitterSlotRecipe = sva(splitterSlotRecipeDefinition);

export type SplitterSlotRecipeProps = RecipeVariantProps<
  typeof splitterSlotRecipe
>;
