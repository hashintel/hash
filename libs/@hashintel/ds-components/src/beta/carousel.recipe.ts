import { carouselAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const carouselSlotRecipeDefinition = {
  className: "carousel",
  slots: carouselAnatomy.keys(),
  base: {
    root: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "2",
      _vertical: {
        flexDirection: "row",
      },
    },
    control: {
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: "l2",
      display: "flex",
      _vertical: {
        flexDirection: "column",
      },
    },
    itemGroup: {
      flex: "1",
    },
    indicatorGroup: {
      display: "flex",
      _vertical: {
        flexDirection: "column",
      },
    },
    indicator: {
      borderRadius: "full",
      background: "gray.subtle.bg",
      cursor: "pointer",
      _current: {
        background: "colorPalette.solid.bg",
      },
      focusVisibleRing: "outside",
    },
  },
  defaultVariants: {
    size: "md",
  },
  variants: {
    inline: {
      true: {
        control: {
          background: { _light: "white.a11", _dark: "black.a11" },
          bottom: "3",
          left: "50%",
          p: "1",
          position: "absolute",
          transform: "translateX(-50%)",
        },
      },
    },
    size: {
      md: {
        control: {
          gap: "3",
        },
        indicatorGroup: {
          gap: "3",
        },
        indicator: {
          boxSize: "2.5",
        },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const carouselSlotRecipe = sva(carouselSlotRecipeDefinition);

export type CarouselSlotRecipeProps = RecipeVariantProps<typeof carouselSlotRecipe>;
