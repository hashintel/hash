import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";

const linkRecipeDefinition = {
  className: "link",
  base: {
    alignItems: "center",
    borderRadius: "l1",
    cursor: "pointer",
    display: "inline-flex",
    focusVisibleRing: "outside",
    fontWeight: "medium",
    gap: "1.5",
    outline: "none",
    textDecorationLine: "underline",
    textDecorationThickness: "0.1em",
    textUnderlineOffset: "0.125em",
    transitionDuration: "normal",
    transitionProperty: "text-decoration-color",
    _icon: {
      boxSize: "1em",
    },
  },
  defaultVariants: {
    variant: "underline",
  },
  variants: {
    variant: {
      underline: {
        textDecorationColor: "colorPalette.surface.fg/60",
        _hover: {
          textDecorationColor: "colorPalette.surface.fg",
        },
      },
      plain: {
        textDecorationColor: "transparent",
        _hover: {
          textDecorationColor: "colorPalette.surface.fg",
        },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const linkRecipe = cva(linkRecipeDefinition);

export type LinkRecipeProps = RecipeVariantProps<typeof linkRecipe>;
