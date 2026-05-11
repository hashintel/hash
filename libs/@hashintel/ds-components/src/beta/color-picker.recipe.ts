import { colorPickerAnatomy } from "@ark-ui/react/anatomy";
import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const colorPickerSlotRecipeDefinition = {
  className: "color-picker",
  slots: colorPickerAnatomy.keys(),
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: "1.5",
    },
    label: {
      color: "fg.default",
      fontWeight: "medium",
      textStyle: "sm",
    },
    control: {
      display: "flex",
      flexDirection: "row",
      gap: "2",
    },
    content: {
      background: "gray.surface.bg",
      borderRadius: "l3",
      boxShadow: "lg",
      display: "flex",
      flexDirection: "column",
      maxWidth: "sm",
      p: "4",
      zIndex: "dropdown",
      _open: {
        animation: "fadeIn 0.25s ease-out",
      },
      _closed: {
        animation: "fadeOut 0.2s ease-out",
      },
      _hidden: {
        display: "none",
      },
    },
    area: {
      height: "36",
      borderRadius: "l2",
      overflow: "hidden",
    },
    areaThumb: {
      borderRadius: "full",
      height: "2.5",
      width: "2.5",
      boxShadow: "white 0px 0px 0px 2px, black 0px 0px 2px 1px",
      outline: "none",
    },
    areaBackground: {
      height: "full",
    },
    channelSlider: {
      borderRadius: "l2",
    },
    channelSliderTrack: {
      height: "3",
      borderRadius: "l2",
    },
    swatchGroup: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "2",
      background: "gray.surface.bg",
    },
    swatch: {
      height: "6",
      width: "6",
      borderRadius: "l2",
      boxShadow:
        "0 0 0 1px var(--colors-border-emphasized), 0 0 0 2px var(--colors-bg-default) inset",
    },
    channelSliderThumb: {
      borderRadius: "full",
      height: "2.5",
      width: "2.5",
      boxShadow: "white 0px 0px 0px 2px, black 0px 0px 2px 1px",
      transform: "translate(-50%, -50%)",
      outline: "none",
    },
    transparencyGrid: {
      borderRadius: "l2",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const colorPickerSlotRecipe = sva(colorPickerSlotRecipeDefinition);

export type ColorPickerSlotRecipeProps = RecipeVariantProps<
  typeof colorPickerSlotRecipe
>;
