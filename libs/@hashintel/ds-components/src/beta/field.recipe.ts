import { fieldAnatomy } from "@ark-ui/react/anatomy";
import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const fieldSlotRecipeDefinition = {
  className: "field",
  slots: fieldAnatomy.keys(),
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: "1.5",
    },
    label: {
      alignItems: "center",
      color: "fg.default",
      display: "flex",
      gap: "0.5",
      textAlign: "start",
      userSelect: "none",
      textStyle: "label",
      _disabled: {
        layerStyle: "disabled",
      },
    },
    requiredIndicator: {
      color: "colorPalette.solid",
    },
    helperText: {
      color: "fg.muted",
      textStyle: "sm",
      _disabled: {
        layerStyle: "disabled",
      },
    },
    errorText: {
      color: "error",
      textStyle: "sm",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const fieldSlotRecipe = sva(fieldSlotRecipeDefinition);

export type FieldSlotRecipeProps = RecipeVariantProps<typeof fieldSlotRecipe>;
