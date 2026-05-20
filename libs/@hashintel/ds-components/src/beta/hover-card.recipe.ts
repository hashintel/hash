import { hoverCardAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const hoverCardSlotRecipeDefinition = {
  className: "hover-card",
  slots: hoverCardAnatomy.keys(),
  base: {
    content: {
      "--hovercard-bg": "colors.gray.surface.bg",

      bg: "var(--hovercard-bg)",
      borderRadius: "l3",
      boxShadow: "lg",
      display: "flex",
      flexDirection: "column",
      maxWidth: "80",
      outline: "0",
      padding: "4",
      position: "relative",
      textStyle: "sm",
      transformOrigin: "var(--transform-origin)",
      zIndex: "popover",
      _open: {
        animationStyle: "slide-fade-in",
        animationDuration: "fast",
      },
      _closed: {
        animationStyle: "slide-fade-out",
        animationDuration: "faster",
      },
    },
    arrow: {
      "--arrow-size": "sizes.3",
      "--arrow-background": "var(--hovercard-bg)",
    },
    arrowTip: {
      borderTopWidth: "0.5px",
      borderInlineStartWidth: "0.5px",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const hoverCardSlotRecipe = sva(hoverCardSlotRecipeDefinition);

export type HoverCardSlotRecipeProps = RecipeVariantProps<
  typeof hoverCardSlotRecipe
>;
