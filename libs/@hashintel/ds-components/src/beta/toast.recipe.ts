import { toastAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const toastSlotRecipeDefinition = {
  className: "toast",
  slots: toastAnatomy.keys(),
  base: {
    root: {
      alignItems: "start",
      background: "gray.surface.bg",
      borderRadius: "l3",
      boxShadow: "lg",
      display: "flex",
      gap: "4",
      height: "var(--height)",
      minWidth: "sm",
      opacity: "var(--opacity)",
      overflowWrap: "anywhere",
      p: "4",
      position: "relative",
      scale: "var(--scale)",
      transitionDuration: "slow",
      transitionProperty: "translate, scale, opacity, height",
      transitionTimingFunction: "default",
      translate: "var(--x) var(--y)",
      width: "full",
      willChange: "translate, opacity, scale",
      zIndex: "var(--z-index)",
    },
    title: {
      color: "fg.default",
      fontWeight: "medium",
      textStyle: "sm",
    },
    description: {
      color: "fg.muted",
      textStyle: "sm",
    },
    actionTrigger: {
      color: "colorPalette.plain.fg",
      cursor: "pointer",
      fontWeight: "semibold",
      textStyle: "sm",
    },
    closeTrigger: {
      position: "absolute",
      top: "2",
      insetEnd: "2",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const toastSlotRecipe = sva(toastSlotRecipeDefinition);

export type ToastSlotRecipeProps = RecipeVariantProps<typeof toastSlotRecipe>;
