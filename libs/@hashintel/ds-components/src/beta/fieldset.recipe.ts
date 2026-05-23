import { fieldsetAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const fieldsetSlotRecipeDefinition = {
  className: "fieldset",
  slots: fieldsetAnatomy.extendWith("content", "control").keys(),
  base: {
    root: {
      display: "flex",
      justifyContent: "space-between",
      width: "full",
      flexDirection: { base: "column", md: "row" },
      gap: { base: "5", md: "8" },
    },
    control: {
      maxW: "xs",
      display: "flex",
      flexDirection: "column",
      width: "full",
      gap: "1",
    },
    content: {
      display: "flex",
      flexDirection: "column",
      width: "full",
      maxW: "2xl",
      gap: "4",
    },
    legend: {
      color: "fg.default",
      fontWeight: "semibold",
    },
    helperText: {
      color: "fg.muted",
      textStyle: "sm",
    },
    errorText: {
      display: "inline-flex",
      alignItems: "center",
      color: "error",
      gap: "2",
      fontWeight: "medium",
      textStyle: "sm",
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const fieldsetSlotRecipe = sva(fieldsetSlotRecipeDefinition);

export type FieldsetSlotRecipeProps = RecipeVariantProps<typeof fieldsetSlotRecipe>;
