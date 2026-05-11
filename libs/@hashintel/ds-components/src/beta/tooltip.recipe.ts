import { tooltipAnatomy } from "@ark-ui/react/anatomy";
import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const tooltipSlotRecipeDefinition = {
  className: "tooltip",
  slots: tooltipAnatomy.keys(),
  base: {
    content: {
      "--tooltip-bg": "colors.gray.solid.bg",
      bg: "var(--tooltip-bg)",
      color: "gray.solid.fg",
      borderRadius: "l2",
      boxShadow: "sm",
      fontWeight: "semibold",
      px: "2",
      py: "1.5",
      textStyle: "xs",
      maxWidth: "xs",
      _open: {
        animationStyle: "scale-fade-in",
        animationDuration: "fast",
      },
      _closed: {
        animationStyle: "scale-fade-out",
        animationDuration: "faster",
      },
    },
    arrow: {
      "--arrow-size": "sizes.2",
      "--arrow-background": "var(--tooltip-bg)",
    },
    arrowTip: {
      borderTopWidth: "1px",
      borderInlineStartWidth: "1px",
      borderColor: "var(--tooltip-bg)",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const tooltipSlotRecipe = sva(tooltipSlotRecipeDefinition);

export type TooltipSlotRecipeProps = RecipeVariantProps<
  typeof tooltipSlotRecipe
>;
